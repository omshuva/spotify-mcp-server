<div align="center" style="display: flex; align-items: center; justify-content: center; gap: 10px;">
<img src="https://upload.wikimedia.org/wikipedia/commons/8/84/Spotify_icon.svg" width="30" height="30">
<h1>Spotify MCP Server</h1>
</div>

A lightweight [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that enables AI assistants like Cursor & Claude to control Spotify playback and manage playlists.

<details>
<summary>Contents</summary>

- [Example Interactions](#example-interactions)
- [Tools](#tools)
  - [Read Operations](#read-operations)
  - [Album Operations](#album-operations)
  - [Play / Create Operations](#play--create-operations)
  - [Playlist Operations](#playlist-operations)
- [Setup](#setup)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Creating a Spotify Developer Application](#creating-a-spotify-developer-application)
  - [Spotify API Configuration](#spotify-api-configuration)
  - [Authentication Process](#authentication-process)
- [Integrating with Claude Desktop, Cursor, and VsCode (Cline)](#integrating-with-claude-desktop-and-cursor)
</details>

## Example Interactions

- _"Play Elvis's first song"_
- _"Create a Taylor Swift / Slipknot fusion playlist"_
- _"Copy all the techno tracks from my workout playlist to my work playlist"_
- _"Turn the volume down a bit"_

## Tools

### Read Operations

1. **searchSpotify**

   - **Description**: Search for tracks, albums, artists, or playlists on Spotify
   - **Parameters**:
     - `query` (string): The search term
     - `type` (string): Type of item to search for (track, album, artist, playlist)
     - `limit` (number, optional): Maximum number of results to return (1-10, default: 10)
     - `offset` (number, optional): Index of the first result to return (default: 0)
   - **Returns**: List of matching items with their IDs, names, and additional details
   - **Example**: `searchSpotify("bohemian rhapsody", "track", 10)`

2. **getNowPlaying**

   - **Description**: Get information about the currently playing track on Spotify, including device and volume info
   - **Parameters**: None
   - **Returns**: Object containing track name, artist, album, playback progress, duration, playback state, device info, volume, and shuffle/repeat status
   - **Example**: `getNowPlaying()`

3. **getMyPlaylists**

   - **Description**: Get a list of the current user's playlists on Spotify
   - **Parameters**:
     - `limit` (number, optional): Maximum number of playlists to return (default: 20)
     - `offset` (number, optional): Index of the first playlist to return (default: 0)
   - **Returns**: Array of playlists with their IDs, names, track counts, and public status
   - **Example**: `getMyPlaylists(10, 0)`

4. **getPlaylistTracks**

   - **Description**: Get a list of tracks in a specific Spotify playlist
   - **Parameters**:
     - `playlistId` (string): The Spotify ID of the playlist
     - `limit` (number, optional): Maximum number of tracks to return (default: 100)
     - `offset` (number, optional): Index of the first track to return (default: 0)
   - **Returns**: Array of tracks with their IDs, names, artists, album, duration, and added date
   - **Example**: `getPlaylistTracks("37i9dQZEVXcJZyENOWUFo7")`

5. **getRecentlyPlayed**

   - **Description**: Retrieves a list of recently played tracks from Spotify.
   - **Parameters**:
     - `limit` (number, optional): A number specifying the maximum number of tracks to return.
   - **Returns**: If tracks are found it returns a formatted list of recently played tracks else a message stating: "You don't have any recently played tracks on Spotify".
   - **Example**: `getRecentlyPlayed({ limit: 10 })`

6. **getUsersSavedTracks**

   - **Description**: Get a list of tracks saved in the user's "Liked Songs" library
   - **Parameters**:
     - `limit` (number, optional): Maximum number of tracks to return (1-50, default: 50)
     - `offset` (number, optional): Offset for pagination (0-based index, default: 0)
   - **Returns**: Formatted list of saved tracks with track names, artists, duration, track IDs, and when they were added to Liked Songs. Shows pagination info (e.g., "1-20 of 150").
   - **Example**: `getUsersSavedTracks({ limit: 20, offset: 0 })`

7. **getQueue**

   - **Description**: Get the currently playing track and upcoming items in the Spotify queue
   - **Parameters**:
     - `limit` (number, optional): Maximum number of upcoming items to show (1-50, default: 10)
   - **Returns**: Currently playing track and list of upcoming tracks in the queue
   - **Example**: `getQueue({ limit: 20 })`

8. **getAvailableDevices**

   - **Description**: Get information about the user's available Spotify Connect devices
   - **Parameters**: None
   - **Returns**: List of available devices with name, type, active status, volume, and device ID
   - **Example**: `getAvailableDevices()`

### Play / Create Operations

1. **playMusic**

   - **Description**: Start playing a track, album, artist, or playlist on Spotify
   - **Parameters**:
     - `uri` (string, optional): Spotify URI of the item to play (overrides type and id)
     - `type` (string, optional): Type of item to play (track, album, artist, playlist)
     - `id` (string, optional): Spotify ID of the item to play
     - `deviceId` (string, optional): ID of the device to play on
   - **Returns**: Success status
   - **Example**: `playMusic({ uri: "spotify:track:6rqhFgbbKwnb9MLmUQDhG6" })`
   - **Alternative**: `playMusic({ type: "track", id: "6rqhFgbbKwnb9MLmUQDhG6" })`

2. **pausePlayback**

   - **Description**: Pause the currently playing track on Spotify
   - **Parameters**:
     - `deviceId` (string, optional): ID of the device to pause
   - **Returns**: Success status
   - **Example**: `pausePlayback()`

3. **resumePlayback**

   - **Description**: Resume Spotify playback on the active device
   - **Parameters**:
     - `deviceId` (string, optional): ID of the device to resume playback on
   - **Returns**: Success status
   - **Example**: `resumePlayback()`

4. **skipToNext**

   - **Description**: Skip to the next track in the current playback queue
   - **Parameters**:
     - `deviceId` (string, optional): ID of the device
   - **Returns**: Success status
   - **Example**: `skipToNext()`

5. **skipToPrevious**

   - **Description**: Skip to the previous track in the current playback queue
   - **Parameters**:
     - `deviceId` (string, optional): ID of the device
   - **Returns**: Success status
   - **Example**: `skipToPrevious()`

6. **createPlaylist**

   - **Description**: Create a new playlist on Spotify
   - **Parameters**:
     - `name` (string): Name for the new playlist
     - `description` (string, optional): Description for the playlist
     - `public` (boolean, optional): Whether the playlist should be public (default: false)
   - **Returns**: Object with the new playlist's ID and URL
   - **Example**: `createPlaylist({ name: "Workout Mix", description: "Songs to get pumped up", public: false })`

7. **addTracksToPlaylist**

   - **Description**: Add tracks to an existing Spotify playlist
   - **Parameters**:
     - `playlistId` (string): ID of the playlist
     - `trackUris` (array): Array of track URIs or IDs to add
     - `position` (number, optional): Position to insert tracks
   - **Returns**: Success status and snapshot ID
   - **Example**: `addTracksToPlaylist({ playlistId: "3cEYpjA9oz9GiPac4AsH4n", trackUris: ["spotify:track:4iV5W9uYEdYUVa79Axb7Rh"] })`

8. **addToQueue**

   - **Description**: Adds a track, album, artist or playlist to the current playback queue
   - **Parameters**:
     - `uri` (string, optional): Spotify URI of the item to add to queue (overrides type and id)
     - `type` (string, optional): Type of item to queue (track, album, artist, playlist)
     - `id` (string, optional): Spotify ID of the item to queue
     - `deviceId` (string, optional): ID of the device to queue on
   - **Returns**: Success status
   - **Example**: `addToQueue({ uri: "spotify:track:6rqhFgbbKwnb9MLmUQDhG6" })`
   - **Alternative**: `addToQueue({ type: "track", id: "6rqhFgbbKwnb9MLmUQDhG6" })`

9. **setVolume**

   - **Description**: Set the playback volume to a specific percentage (requires Spotify Premium)
   - **Parameters**:
     - `volumePercent` (number): The volume to set (0-100)
     - `deviceId` (string, optional): ID of the device to set volume on
   - **Returns**: Success status with the new volume level
   - **Example**: `setVolume({ volumePercent: 50 })`

10. **adjustVolume**

   - **Description**: Adjust the playback volume up or down by a relative amount (requires Spotify Premium)
   - **Parameters**:
     - `adjustment` (number): The amount to adjust volume by (-100 to 100). Positive values increase volume, negative values decrease it.
     - `deviceId` (string, optional): ID of the device to adjust volume on
   - **Returns**: Success status showing the volume change (e.g., "Volume increased from 50% to 60%")
   - **Example**: `adjustVolume({ adjustment: 10 })` (increase by 10%)
   - **Example**: `adjustVolume({ adjustment: -20 })` (decrease by 20%)


### Album Operations

1. **getAlbums**

   - **Description**: Get detailed information about one or more albums by their Spotify IDs
   - **Parameters**:
     - `albumIds` (string|array): A single album ID or array of album IDs (max 20)
   - **Returns**: Album details including name, artists, release date, type, total tracks, and ID. For single album returns detailed view, for multiple albums returns summary list.
   - **Example**: `getAlbums("4aawyAB9vmqN3uQ7FjRGTy")` or `getAlbums(["4aawyAB9vmqN3uQ7FjRGTy", "1DFixLWuPkv3KT3TnV35m3"])`

2. **getAlbumTracks**

   - **Description**: Get tracks from a specific album with pagination support
   - **Parameters**:
     - `albumId` (string): The Spotify ID of the album
     - `limit` (number, optional): Maximum number of tracks to return (1-50)
     - `offset` (number, optional): Offset for pagination (0-based index)
   - **Returns**: List of tracks from the album with track names, artists, duration, and IDs. Shows pagination info.
   - **Example**: `getAlbumTracks("4aawyAB9vmqN3uQ7FjRGTy", 10, 0)`

3. **checkUsersSavedAlbums**

   - **Description**: Check if albums are saved in the user's "Your Music" library
   - **Parameters**:
     - `albumIds` (array): Array of Spotify album IDs to check (max 20)
   - **Returns**: Status of each album (saved or not saved)
   - **Example**: `checkUsersSavedAlbums(["4aawyAB9vmqN3uQ7FjRGTy", "1DFixLWuPkv3KT3TnV35m3"])`

### Playlist Operations

1. **getPlaylist**

   - **Description**: Get details of a specific Spotify playlist including tracks count, description and owner
   - **Parameters**:
     - `playlistId` (string): The Spotify ID of the playlist
   - **Returns**: Playlist name, owner, track count, visibility, description, ID, and URL
   - **Example**: `getPlaylist({ playlistId: "37i9dQZEVXcJZyENOWUFo7" })`

2. **updatePlaylist**

   - **Description**: Update the details of a Spotify playlist (name, description, public/private, collaborative)
   - **Parameters**:
     - `playlistId` (string): The Spotify ID of the playlist
     - `name` (string, optional): New name for the playlist
     - `description` (string, optional): New description for the playlist
     - `public` (boolean, optional): Whether the playlist should be public
     - `collaborative` (boolean, optional): Whether the playlist should be collaborative (requires public to be false)
   - **Returns**: Success confirmation with list of updated fields
   - **Example**: `updatePlaylist({ playlistId: "3cEYpjA9oz9GiPac4AsH4n", name: "New Name", public: true })`

3. **reorderPlaylistItems**

   - **Description**: Reorder a range of tracks within a Spotify playlist by moving them to a new position
   - **Parameters**:
     - `playlistId` (string): The Spotify ID of the playlist
     - `rangeStart` (number): The position of the first item to move (0-based index)
     - `insertBefore` (number): The position where the items should be inserted (0-based index)
     - `rangeLength` (number, optional): Number of consecutive items to move (defaults to 1)
     - `snapshotId` (string, optional): The playlist snapshot ID to target a specific version
   - **Returns**: Success confirmation with the move details
   - **Example**: `reorderPlaylistItems({ playlistId: "3cEYpjA9oz9GiPac4AsH4n", rangeStart: 2, insertBefore: 0 })`

4. **unfollowPlaylist**

   - **Description**: Unfollow a playlist. For a playlist you own this is how Spotify removes it from your library — the closest thing to deleting it. Recoverable for 90 days at [spotify.com/account/recover-playlists](https://www.spotify.com/account/recover-playlists/).
   - **Parameters**:
     - `playlistId` (string): The Spotify ID of the playlist
   - **Returns**: Success confirmation
   - **Example**: `unfollowPlaylist({ playlistId: "3cEYpjA9oz9GiPac4AsH4n" })`

## Deployment model

This fork runs as a **single-tenant remote MCP server** over Streamable HTTP, rather than
as a local stdio child process.

Single-tenant is a hard constraint, not a default. The server holds exactly one Spotify
identity — the owner's. Every request that reaches it acts as that account. There is no
per-user auth and no request-level identity; extending this toward multi-user requires a
full auth rewrite, not a config change.

Consequences worth internalising before deploying:

- The endpoint URL is the credential. Anyone holding it has full control of the account.
- Configuration is read from the environment only. Nothing is persisted to disk, because
  the deployed filesystem is ephemeral and a written token would be silently discarded on
  each redeploy while appearing to work.
- The OAuth authorization flow (`npm run auth`) is local-only. The deployed server needs
  no callback URL.

## Setup

### Prerequisites

- Node.js v20+ (this project is ESM and builds against `@types/node` v22)
- A Spotify Premium account
- A registered Spotify Developer application

### Installation

```bash
git clone https://github.com/omshuva/spotify-mcp-server.git
cd spotify-mcp-server
npm ci
npm run build
```

### Creating a Spotify Developer Application

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
2. Log in with your Spotify account
3. Click "Create an App"
4. Fill in the app name and description
5. Accept the Terms of Service and click "Create"
6. In your new app's dashboard you'll see your **Client ID**
7. Click "Show Client Secret" to reveal your **Client Secret**
8. Click "Edit Settings" and add the Redirect URI `http://127.0.0.1:8888/callback`
9. Save

The redirect URI is used only by the local `npm run auth` script. It stays a loopback
address even in production.

If the app is in Development Mode (5-user cap, which is fine for single-tenant), make sure
the owner account is listed under **User Management**. Unexpected 403s on playback calls
are usually this rather than a code bug.

### Configuration

All configuration comes from environment variables. There is no config file.

| Variable                  | Required | Purpose                                                          |
| ------------------------- | -------- | ---------------------------------------------------------------- |
| `SPOTIFY_CLIENT_ID`       | yes      | From the Spotify dashboard                                       |
| `SPOTIFY_CLIENT_SECRET`   | yes      | From the Spotify dashboard                                       |
| `SPOTIFY_REFRESH_TOKEN`   | yes      | Minted by `npm run auth`                                         |
| `MCP_SHARED_SECRET`       | yes      | Gates the endpoint. Generate with `openssl rand -hex 32`          |
| `PORT`                    | no       | Injected by Railway. Defaults to 8888                            |
| `SPOTIFY_REDIRECT_URI`    | no       | Local auth only. Defaults to `http://127.0.0.1:8888/callback`     |

The server validates all of these at boot and exits with a specific message naming any
that are missing, so a misconfigured deploy fails its healthcheck rather than looking
healthy and erroring on the first tool call.

For local work, copy `.env.example` to `.env` (gitignored) and load it:

```bash
set -a; source .env; set +a
```

### Authentication

Run this once, locally, **after** confirming the scope list in `authorizeSpotify()` is the
one you want. The refresh token carries whatever grant was in effect when it was minted —
narrowing scopes afterwards does not narrow an already-issued token.

```bash
npm run auth
```

The script opens a browser, you authorize, and it prints the refresh token to your
terminal. Nothing is written to disk: the token is a live credential granting full control
of the account, and a file in the working tree is one `git add -f` away from being
committed. Copy it straight into your deployment environment.

The server refreshes access tokens on demand and holds them in memory only. Concurrent
refreshes are deduplicated, so parallel tool calls issue a single token request.

### Requested scopes

Deliberately narrow, because the refresh token is deployed to a public HTTPS endpoint and
the grant is the real blast radius:

```
user-read-playback-state      user-modify-playback-state
user-read-currently-playing   user-read-playback-position
playlist-read-private         playlist-read-collaborative
playlist-modify-private       playlist-modify-public
user-library-read             user-read-recently-played
user-top-read
```

Omitted on purpose: `user-library-modify` (would allow deleting from Liked Songs, which
has no undo), `user-read-email` and `user-read-private` (leak account identity and profile
for no functional gain).

Correspondingly removed from the toolset: `removeUsersSavedTracks`,
`removeTracksFromPlaylist`, and `saveOrRemoveAlbumForUser` — the last because both of its
branches require `user-library-modify` and it could only ever have returned 403 once that
scope was dropped.

## Deploying to Railway

The repo ships a `railway.json`; no volume is needed or wanted.

1. Create a Railway project connected to this repo.
2. Set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`, and
   `MCP_SHARED_SECRET` under the service's Variables. `PORT` is injected automatically.
3. Deploy. Build runs `npm ci && npm run build`; start is `node build/index.js`;
   healthcheck is `GET /healthz` with a 30s timeout.

### Endpoints

| Method | Path                        | Auth | Purpose                          |
| ------ | --------------------------- | ---- | -------------------------------- |
| `GET`  | `/healthz`                  | none | Railway healthcheck. No Spotify calls |
| `POST` | `/mcp/<MCP_SHARED_SECRET>`  | path secret, optional bearer | The MCP endpoint |

Everything else returns 404. Non-POST on the MCP path returns 405. No CORS headers are
sent — nothing browser-based should be calling this.

### Endpoint authentication

Two layers:

1. **Secret path segment.** The endpoint is mounted at `/mcp/:secret`, compared against
   `MCP_SHARED_SECRET` in constant time. This is the primary gate, and it works regardless
   of what the client supports because the secret rides in the URL.
2. **Bearer token.** If an `Authorization: Bearer <token>` header is present it must also
   match `MCP_SHARED_SECRET`. Defence in depth, not the primary gate — absent is fine.

Failures return `401` with an empty body and no indication of which layer rejected the
request. Rejections are logged to stderr with the source IP. Requests are rate-limited to
60/min per IP, in memory.

Verify a deployment:

```bash
URL=https://<app>.up.railway.app
SECRET=<your MCP_SHARED_SECRET>

curl -s -o /dev/null -w '%{http_code}\n' $URL/healthz                    # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST $URL/mcp/wrong          # 401
curl -s -X POST "$URL/mcp/$SECRET" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

The `Accept` header must list both `application/json` and `text/event-stream`; the MCP
spec requires it and the transport rejects requests without it.

## Adding to claude.ai as a custom connector

Settings > Connectors > Add custom connector, with the URL:

```
https://<app>.up.railway.app/mcp/<MCP_SHARED_SECRET>
```

The secret in the path is what authenticates you, so treat this URL as a password. Do not
share it — it grants full control of the Spotify account.

Two caveats, current as of August 2026:

- **Request headers are gated.** claude.ai does support fixed-credential auth via a
  Request headers section (allowlisted names including `authorization`, value sent
  verbatim, so you'd enter `Bearer <secret>`), but it is in beta and rolled out on
  request. The secret path segment works without it.
- **No-auth servers may be rejected.** The connect flow can assume OAuth 2.1 and attempt
  Dynamic Client Registration, failing against a server that exposes no OAuth endpoints.
  This has been reported on Team/Enterprise with org-managed connectors. If you hit it, a
  static OAuth-metadata shim on this server is the fix — a small addition, not the
  multi-user rewrite that per-user auth would require.

## Local development

To run the HTTP server locally:

```bash
set -a; source .env; set +a
npm run build
npm start
```

Then point a client at `http://127.0.0.1:8888/mcp/$MCP_SHARED_SECRET`.
