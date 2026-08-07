import crypto from 'node:crypto';
import http from 'node:http';
import readline from 'node:readline';
import { URL } from 'node:url';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import open from 'open';

/**
 * Local-only default. Spotify requires an exact redirect URI match, and this
 * one is registered in the Spotify app purely so `npm run auth` can complete
 * the authorization-code exchange on a developer machine. The deployed server
 * never uses it and needs no callback URL of its own.
 */
const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:8888/callback';

export interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
}

/**
 * Access tokens live here and nowhere else. Nothing is written to disk: the
 * deployed filesystem is ephemeral, so a persisted token would be silently
 * discarded on every redeploy while looking like it worked.
 */
interface TokenState {
  accessToken?: string;
  expiresAt?: number; // Unix timestamp in milliseconds
}

const tokenState: TokenState = {};

/** Refresh five minutes early so a token cannot expire mid-request. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Reads credentials from the environment.
 *
 * `requireRefreshToken` is false only for `npm run auth`, which runs before a
 * refresh token exists — that script's whole job is to mint one.
 */
export function loadSpotifyConfig({
  requireRefreshToken,
}: { requireRefreshToken?: boolean } = {}): SpotifyConfig {
  const required = requireRefreshToken ?? true;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  const missing: string[] = [];
  if (!clientId) missing.push('SPOTIFY_CLIENT_ID');
  if (!clientSecret) missing.push('SPOTIFY_CLIENT_SECRET');
  if (required && !refreshToken) missing.push('SPOTIFY_REFRESH_TOKEN');

  if (missing.length > 0) {
    // The two callers fail in different places, so point each at the right fix
    // rather than sending a developer running `npm run auth` to the Railway UI.
    const hint = required
      ? 'Set these in the deployment environment (Railway: service > Variables). ' +
        'Obtain SPOTIFY_REFRESH_TOKEN by running "npm run auth" locally.'
      : 'Set these in a local .env file (copy .env.example and fill in the ' +
        'values from your Spotify app dashboard), then load it with: ' +
        'set -a; source .env; set +a';

    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ${hint}`,
    );
  }

  return {
    clientId: clientId as string,
    clientSecret: clientSecret as string,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    refreshToken,
  };
}

let cachedSpotifyApi: SpotifyApi | null = null;

/**
 * Deduplicates concurrent refreshes. claude.ai can dispatch several tool calls
 * at once; without this, each would independently POST to Spotify's token
 * endpoint with the same refresh token and race to overwrite `tokenState`.
 */
let inFlightRefresh: Promise<string> | null = null;

/**
 * Returns a valid access token, refreshing on demand. The single source of
 * truth for both `spotifyFetch` and `createSpotifyApi`.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (
    tokenState.accessToken &&
    tokenState.expiresAt &&
    tokenState.expiresAt > now + REFRESH_BUFFER_MS
  ) {
    return tokenState.accessToken;
  }

  if (inFlightRefresh) return inFlightRefresh;

  const config = loadSpotifyConfig();
  inFlightRefresh = (async () => {
    try {
      const tokens = await refreshAccessToken(config);
      tokenState.accessToken = tokens.access_token;
      tokenState.expiresAt = Date.now() + tokens.expires_in * 1000;
      // Invalidate the SDK client so it is rebuilt with the new token.
      cachedSpotifyApi = null;
      return tokens.access_token;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

/**
 * Direct Spotify Web API fetch helper.
 * Used to bypass @spotify/web-api-ts-sdk methods that hit deprecated endpoints
 * (e.g. /playlists/{id}/tracks which was retired in the March 2026 API migration
 * for new Development Mode apps; replacement is /playlists/{id}/items).
 *
 * Handles token loading and refresh transparently.
 */
export async function spotifyFetch<T = unknown>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    query?: Record<string, string | number | undefined>;
  } = {},
): Promise<T> {
  const { method = 'GET', body, query } = options;
  const accessToken = await getAccessToken();

  // Build URL with query string
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  let url = `https://api.spotify.com/v1/${cleanEndpoint}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.append(k, String(v));
    }
    const qsStr = qs.toString();
    if (qsStr) url += `?${qsStr}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Spotify API ${method} ${url} failed (${response.status}): ${errBody}`,
    );
  }

  // Some endpoints (DELETE, PUT) return empty body
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function createSpotifyApi(): Promise<SpotifyApi> {
  const config = loadSpotifyConfig();

  // Refreshes if needed and clears cachedSpotifyApi when the token changes.
  const accessToken = await getAccessToken();

  if (cachedSpotifyApi) {
    return cachedSpotifyApi;
  }

  const expiresIn = Math.floor(
    ((tokenState.expiresAt ?? Date.now() + 3600000) - Date.now()) / 1000,
  );

  cachedSpotifyApi = SpotifyApi.withAccessToken(config.clientId, {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    refresh_token: config.refreshToken as string,
  });

  return cachedSpotifyApi;
}

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(
        b % 62,
      ),
    )
    .join('');
}

function base64Encode(str: string): string {
  return Buffer.from(str).toString('base64');
}

async function exchangeCodeForToken(
  code: string,
  config: SpotifyConfig,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const tokenUrl = 'https://accounts.spotify.com/api/token';
  const authHeader = `Basic ${base64Encode(`${config.clientId}:${config.clientSecret}`)}`;

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', config.redirectUri);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to exchange code for token: ${errorData}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 3600,
  };
}

async function refreshAccessToken(
  config: SpotifyConfig,
): Promise<{ access_token: string; expires_in: number }> {
  if (!config.refreshToken) {
    throw new Error('No refresh token available');
  }

  const tokenUrl = 'https://accounts.spotify.com/api/token';
  const authHeader = `Basic ${base64Encode(`${config.clientId}:${config.clientSecret}`)}`;

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', config.refreshToken);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const errorData = await response.text();
    let errorCode: string | undefined;
    try {
      errorCode = JSON.parse(errorData).error;
    } catch {
      // Non-JSON error body; treat as a generic, retryable failure.
    }

    // An expired (after 6 months) or revoked refresh token returns
    // invalid_grant. Drop the cached access token; the deployed refresh token
    // itself is in the environment and can only be replaced by redeploying.
    if (errorCode === 'invalid_grant') {
      tokenState.accessToken = undefined;
      tokenState.expiresAt = undefined;
      throw new Error(
        'Spotify refresh token is no longer valid (invalid_grant). Run "npm run auth" locally to mint a new one, then update SPOTIFY_REFRESH_TOKEN in the deployment environment.',
      );
    }

    throw new Error(`Failed to refresh access token: ${errorData}`);
  }

  const data = await response.json();

  // The authorization-code flow used here does not rotate refresh tokens, so
  // this branch should never fire. If Spotify ever changes that, the new token
  // cannot be persisted (config is read-only from the environment) and the
  // deployed one will keep working only until it is revoked — so say so loudly
  // rather than failing silently weeks later.
  if (data.refresh_token && data.refresh_token !== config.refreshToken) {
    console.error(
      '[spotify] WARNING: Spotify returned a rotated refresh token. It cannot ' +
        'be persisted from the deployed environment. Run "npm run auth" locally ' +
        'and update SPOTIFY_REFRESH_TOKEN before the current token is revoked.',
    );
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 3600,
  };
}

/**
 * Prints the freshly minted refresh token for the operator to copy into the
 * deployment environment. Nothing is written to disk: the token is a live
 * credential granting full control of the account, and a file in the working
 * tree is one `git add -f` away from being committed.
 */
function reportRefreshToken(refreshToken: string): void {
  console.log('');
  console.log('='.repeat(72));
  console.log('Authentication successful.');
  console.log('');
  console.log('Set this as SPOTIFY_REFRESH_TOKEN in your deployment');
  console.log('environment (Railway: service > Variables):');
  console.log('');
  console.log(`  ${refreshToken}`);
  console.log('');
  console.log('Treat it like a password. It is not saved anywhere on disk,');
  console.log('so copy it now — re-run "npm run auth" to mint another.');
  console.log('='.repeat(72));
  console.log('');
}

/**
 * Local-only, run via `npm run auth`. Not reachable from the deployed server:
 * it binds a loopback callback listener and opens a browser, neither of which
 * makes sense in a container. The deployed server needs no callback URL.
 */
export async function authorizeSpotify(): Promise<void> {
  const config = loadSpotifyConfig({ requireRefreshToken: false });

  const redirectUri = new URL(config.redirectUri);
  if (
    redirectUri.hostname !== 'localhost' &&
    redirectUri.hostname !== '127.0.0.1'
  ) {
    console.error(
      'Error: Redirect URI must use localhost for automatic token exchange',
    );
    console.error(
      'Set SPOTIFY_REDIRECT_URI to a loopback address, or leave it unset to',
    );
    console.error(`use the default (${DEFAULT_REDIRECT_URI}).`);
    process.exit(1);
  }

  const port = redirectUri.port || '80';
  const callbackPath = redirectUri.pathname || '/callback';

  const state = generateRandomString(16);

  // Deliberately narrow. The refresh token minted here is deployed to a
  // public HTTPS endpoint, so the grant is the real blast radius: anything
  // not listed cannot be done even if a tool call is malformed or injected.
  //
  // Omitted on purpose:
  //   user-library-modify  - would allow deleting from Liked Songs (no undo)
  //   user-read-email      - not needed; leaks account identity
  //   user-read-private    - not needed; leaks profile and country
  const scopes = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-read-playback-position',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-private',
    'playlist-modify-public',
    'user-library-read',
    'user-read-recently-played',
    'user-top-read',
  ];

  const authParams = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    scope: scopes.join(' '),
    state: state,
    show_dialog: 'true',
  });

  const authorizationUrl = `https://accounts.spotify.com/authorize?${authParams.toString()}`;

  const authPromise = new Promise<void>((resolve, reject) => {
    // Create HTTP server to handle the callback
    const server = http.createServer(async (req, res) => {
      if (!req.url) {
        return res.end('No URL provided');
      }

      const reqUrl = new URL(req.url, `http://localhost:${port}`);

      if (reqUrl.pathname === callbackPath) {
        const code = reqUrl.searchParams.get('code');
        const returnedState = reqUrl.searchParams.get('state');
        const error = reqUrl.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html' });

        if (error) {
          console.error(`Authorization error: ${error}`);
          res.end(
            '<html><body><h1>Authentication Failed</h1><p>Please close this window and try again.</p></body></html>',
          );
          server.close();
          reject(new Error(`Authorization failed: ${error}`));
          return;
        }

        if (returnedState !== state) {
          console.error('State mismatch error');
          res.end(
            '<html><body><h1>Authentication Failed</h1><p>State verification failed. Please close this window and try again.</p></body></html>',
          );
          server.close();
          reject(new Error('State mismatch'));
          return;
        }

        if (!code) {
          console.error('No authorization code received');
          res.end(
            '<html><body><h1>Authentication Failed</h1><p>No authorization code received. Please close this window and try again.</p></body></html>',
          );
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }

        try {
          const tokens = await exchangeCodeForToken(code, config);

          res.end(
            '<html><body><h1>Authentication Successful!</h1><p>Return to your terminal to copy the refresh token.</p></body></html>',
          );
          reportRefreshToken(tokens.refresh_token);

          server.close();
          resolve();
        } catch (error) {
          console.error('Token exchange error:', error);
          res.end(
            '<html><body><h1>Authentication Failed</h1><p>Failed to exchange authorization code for tokens. Please close this window and try again.</p></body></html>',
          );
          server.close();
          reject(error);
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(Number.parseInt(port), '127.0.0.1', () => {
      console.log(
        `Listening for Spotify authentication callback on port ${port}`,
      );
      console.log('Opening browser for authorization...');
      console.log('');
      console.log('If no browser opens, visit this URL manually:');
      console.log(authorizationUrl);
      console.log('');

      open(authorizationUrl).catch(async (_error: Error) => {
        console.log('Failed to open browser automatically.');
        console.log('Please visit this URL to authorize:');
        console.log(authorizationUrl);
        console.log('');
        console.log('After authorization, you will be redirected to:');
        console.log(config.redirectUri);
        console.log('Please paste the full redirect URL here:');

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const redirectUrl = await new Promise<string>((resolve) => {
          rl.question('Redirect URL: ', (url) => {
            rl.close();
            resolve(url);
          });
        });

        try {
          const reqUrl = new URL(redirectUrl);
          const code = reqUrl.searchParams.get('code');
          const returnedState = reqUrl.searchParams.get('state');
          const error = reqUrl.searchParams.get('error');

          if (error) {
            throw new Error(`Authorization error: ${error}`);
          }

          if (returnedState !== state) {
            throw new Error('State mismatch');
          }

          if (!code) {
            throw new Error('No authorization code received');
          }

          const tokens = await exchangeCodeForToken(code, config);
          reportRefreshToken(tokens.refresh_token);
          server.close();
          resolve();
        } catch (error) {
          server.close();
          reject(error);
        }
      });
    });

    server.on('error', (error) => {
      console.error(`Server error: ${error.message}`);
      reject(error);
    });
  });

  await authPromise;
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}:${seconds.padStart(2, '0')}`;
}

export async function handleSpotifyRequest<T>(
  action: (spotifyApi: SpotifyApi) => Promise<T>,
): Promise<T> {
  try {
    const spotifyApi = await createSpotifyApi();
    return await action(spotifyApi);
  } catch (error) {
    // Skip JSON parsing errors as these are actually successful operations
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes('Unexpected token') ||
      errorMessage.includes('Unexpected non-whitespace character') ||
      errorMessage.includes('Exponent part is missing a number in JSON')
    ) {
      return undefined as T;
    }
    // Rethrow other errors
    throw error;
  }
}
