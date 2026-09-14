# Deploying dovey on Railway

One Railway service runs everything: the server hosts the built client (landing page
and game), the HTTP API and the Colyseus websocket on Railway's `PORT`. Data lives in
PGlite (embedded Postgres) on a Railway volume.

## 1. Create the service

1. Push this repo to GitHub.
2. Railway → **New Project** → **Deploy from GitHub repo** → pick the repo.
3. Railway reads `railway.json`:
   - build: `pnpm build` (Railpack installs with pnpm from `packageManager`, then builds `client/dist`)
   - start: `pnpm start` (runs `server/src/index.ts` with tsx in production mode)
   - health check: `GET /api/health`

## 2. Add a volume (required)

Service → **Settings** → **Volumes** → **Add volume**, mount path `/data`.

Without a volume the database is wiped on every deploy (rooms, coins, wardrobes, reports).

## 3. Variables

Service → **Variables**:

| Variable | Required | Value |
| --- | --- | --- |
| `PGLITE_DIR` | yes | `/data/pglite` |
| `MOD_TOKEN` | recommended | a long random string; enables the moderation queue |
| `GOOGLE_CLIENT_ID` | optional | Google OAuth web client id |
| `VITE_GOOGLE_CLIENT_ID` | optional | same id; read at **build** time, so redeploy after setting it |
| `KIE_API_KEY` / `GEMINI_API_KEY` | optional | AI chat for the lobby locals |

Do not set `PORT`; Railway provides it. Do not set `VITE_SERVER_URL` or `VITE_API_URL`;
the client talks to the same origin in production.

## 4. Domain

Service → **Settings** → **Networking** → **Generate domain** (or add a custom domain).
Websockets work over the same HTTPS domain (`wss://`).

For Google sign-in, add the domain (for example `https://dovey.up.railway.app`) to the
OAuth client's **Authorised JavaScript origins**.

## 5. Scale notes

- Keep **1 replica**. Rooms live in one process (no Redis presence), and PGlite is a
  single-writer file database.
- One instance handles a few hundred concurrent players across rooms. For more, move to
  Postgres (`DATABASE_URL`, needs the `pg` driver wired in `server/src/db.ts`) and
  Colyseus Redis presence before adding replicas.

## Check a deploy

```sh
curl https://YOUR-DOMAIN/api/health            # {"ok":true}
DOVEY_API=https://YOUR-DOMAIN node client/scripts/smoke-tables.mjs gameden
```

The smoke script joins Game Den with two test players, plays a match, a rematch, a bot
game and a table seating, and prints PASS.

## Local production run

```sh
pnpm install
pnpm build
PORT=2600 PGLITE_DIR=/tmp/dovey-pglite pnpm start   # open http://localhost:2600
```
