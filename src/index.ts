import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { albumTools } from './albums.js';
import { playTools } from './play.js';
import { playlistTools } from './playlist.js';
import { readTools } from './read.js';
import { checkRateLimit, constantTimeEquals, getClientIp } from './security.js';
import { loadSpotifyConfig } from './utils.js';

const tools = [...readTools, ...playTools, ...albumTools, ...playlistTools];

/** Refuse to accept a request body large enough to be a memory-exhaustion attempt. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * The endpoint grants full control of one real Spotify account, so a weak
 * secret is the whole vulnerability. 32 hex chars is the floor; the documented
 * generator (`openssl rand -hex 32`) produces 64.
 */
const MIN_SECRET_LENGTH = 32;

function requireSharedSecret(): string {
  const secret = process.env.MCP_SHARED_SECRET;
  if (!secret) {
    throw new Error(
      'Missing required environment variable: MCP_SHARED_SECRET. ' +
        'Generate one with: openssl rand -hex 32',
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `MCP_SHARED_SECRET is too short (${secret.length} chars, minimum ${MIN_SECRET_LENGTH}). Generate one with: openssl rand -hex 32`,
    );
  }
  return secret;
}

function log(message: string): void {
  // stderr only. stdout was the protocol channel under stdio and writing to it
  // corrupted the stream; keeping everything on stderr means this file is safe
  // to run either way.
  console.error(`[mcp] ${message}`);
}

function deny(res: http.ServerResponse, ip: string, reason: string): void {
  // Deliberately uniform: a 401 with no body, regardless of whether the path
  // secret or the bearer token was wrong. Distinguishing them would tell an
  // attacker which half to keep guessing.
  log(`401 from ${ip} (${reason})`);
  res.writeHead(401).end();
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * A fresh server and transport per request. In stateless mode a transport is
 * bound to the request it is handling, so sharing one instance across
 * concurrent requests would interleave their responses.
 */
async function handleMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let body: unknown;
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : undefined;
  } catch (error) {
    log(
      `400 malformed request body: ${error instanceof Error ? error.message : String(error)}`,
    );
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' },
        id: null,
      }),
    );
    return;
  }

  const server = new McpServer({
    name: 'spotify-controller',
    version: '1.0.0',
  });
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.schema, tool.handler);
  }

  const transport = new StreamableHTTPServerTransport({
    // Stateless: no session affinity, so restarts and redeploys need no sticky
    // routing. There is one user and no cross-request state to keep.
    sessionIdGenerator: undefined,
    // Plain JSON responses rather than an SSE stream. Nothing here streams.
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

function main(): void {
  // Fail fast at boot rather than on the first tool call, so a misconfigured
  // deploy fails its healthcheck instead of looking healthy and erroring later.
  const sharedSecret = requireSharedSecret();
  loadSpotifyConfig();

  const port = Number.parseInt(process.env.PORT ?? '8888', 10);

  const httpServer = http.createServer((req, res) => {
    const ip = getClientIp(req);
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;

    // Unauthenticated and free of Spotify calls, so Railway's healthcheck
    // cannot be broken by an expired token or a Spotify outage.
    if (req.method === 'GET' && pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
      return;
    }

    if (!checkRateLimit(ip)) {
      log(`429 from ${ip} (rate limit)`);
      res.writeHead(429, { 'Retry-After': '60' }).end();
      return;
    }

    // Layer 1: the secret path segment. Works regardless of what the client
    // supports, because the secret rides in the URL.
    const match = /^\/mcp\/(.+)$/.exec(pathname);
    if (!match) {
      res.writeHead(404).end();
      return;
    }

    let pathSecret: string;
    try {
      pathSecret = decodeURIComponent(match[1]);
    } catch {
      deny(res, ip, 'undecodable path segment');
      return;
    }

    if (!constantTimeEquals(pathSecret, sharedSecret)) {
      deny(res, ip, 'bad path secret');
      return;
    }

    // Layer 2: defence in depth. Only enforced when the client actually sends
    // the header — the path segment is the primary gate.
    const authHeader = req.headers.authorization;
    if (authHeader !== undefined) {
      const bearer = /^Bearer (.+)$/.exec(authHeader);
      if (!(bearer && constantTimeEquals(bearer[1], sharedSecret))) {
        deny(res, ip, 'bad bearer token');
        return;
      }
    }

    if (req.method !== 'POST') {
      // Stateless mode has no SSE stream to attach to and no session to delete.
      res.writeHead(405, { Allow: 'POST' }).end();
      return;
    }

    handleMcpRequest(req, res).catch((error) => {
      log(
        `500 handling request: ${error instanceof Error ? error.stack : String(error)}`,
      );
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          }),
        );
      } else {
        res.end();
      }
    });
  });

  httpServer.listen(port, '0.0.0.0', () => {
    log(`listening on 0.0.0.0:${port} with ${tools.length} tools registered`);
    log('endpoint: POST /mcp/<MCP_SHARED_SECRET>  healthcheck: GET /healthz');
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      log(`${signal} received, shutting down`);
      httpServer.close(() => process.exit(0));
    });
  }
}

try {
  main();
} catch (error) {
  log(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
