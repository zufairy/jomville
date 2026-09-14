# dovey

Mobile-first 2D social world. Rooms are URLs; tap to walk; chat, decorate, collect.

## Status (Phase 1 in progress)

- Isometric rooms, tap-to-move with A*, camera follow, server-authoritative movement.
- Text chat with speech bubbles, emotes, server-side filter and rate limits.
- Pixel-art humanoid avatars with equipment slots (hat, face, outfit, back) and a customizer.
- Room editor: place, rotate, move, delete furniture, 20-step undo. Owner only.
- Rooms are URLs (`/r/:slug`), persisted, with a public browser and "take me somewhere".
- Anonymous device identity (random handle, one home room each). No signup yet.

Database: PGlite (embedded Postgres) under `server/data/` in dev. `DATABASE_URL` for a
real Postgres is the next step and needs the `pg` driver wired in `server/src/db.ts`.

## Run

```sh
pnpm install
pnpm dev          # server on ws://localhost:2567, client on http://localhost:5173
pnpm test
pnpm typecheck
```

Open the client URL in two tabs (or on a phone on the same Wi-Fi via the Network URL).
Set `VITE_SERVER_URL` to point the client at a non-local server.

## Sign in with Google

Guests get an anonymous device identity. To enable "continue with Google", create an
OAuth 2.0 Web client in Google Cloud Console with `http://localhost:5173` as an authorised
JavaScript origin, then set:

```sh
# client/.env.local
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
# server env
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```

The client uses Google Identity Services; the server verifies the ID token and links the
Google account to the device identity (or points the device at the existing account).

## Layout

- `shared/` — constants, grid, A*, isometric math. Used by both sides.
- `server/` — Colyseus `room` (one instance per slug), HTTP API under `/api`, PGlite repo.
- `client/` — Vite + React + PixiJS v8. Own avatar predicted locally, others interpolated.
