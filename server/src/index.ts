import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'colyseus';
import { Encoder } from '@colyseus/schema';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer } from 'http';
import { GameRoom } from './GameRoom';
import { openDb } from './db';
import { Repo } from './repo';
import { buildApi } from './api';

// system rooms carry ~700 furniture entries; the 8KB default truncates the encoded state
Encoder.BUFFER_SIZE = 512 * 1024;

/** minimal .env loader (server/.env, gitignored): KEY=value lines, no expansion */
function loadEnv(path = '.env') {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env: rely on the environment */
  }
}
loadEnv();

/**
 * In production the server also hosts the built client (client/dist), so one
 * service serves the landing page, the game, the API and the websocket. Hashed
 * assets cache for a year; the app shell never caches, so deploys land at once.
 */
function serveClient(app: express.Express) {
  const dist = process.env.CLIENT_DIST ?? fileURLToPath(new URL('../../client/dist', import.meta.url));
  if (!existsSync(`${dist}/index.html`)) {
    console.log('[dovey] no client build found; serving api + ws only');
    return;
  }
  app.use('/assets', express.static(`${dist}/assets`, { immutable: true, maxAge: '1y' }));
  // a stale hashed asset must 404 (not fall through to the HTML shell)
  app.use('/assets', (_req, res) => {
    res.status(404).end();
  });
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  // app routes (/, /play, /r/:slug) all load the shell; api and matchmaking stay untouched
  app.get(/^\/(?!api\/|matchmake\/).*/, (_req, res) => {
    res.set('cache-control', 'no-cache');
    res.sendFile(`${dist}/index.html`);
  });
  console.log(`[dovey] serving client from ${dist}`);
}

async function main() {
  const port = Number(process.env.PORT ?? 2567);
  const db = await openDb();
  const repo = new Repo(db);
  GameRoom.repo = repo;
  await repo.ensureSystemRooms();

  const app = buildApi(repo);
  app.disable('x-powered-by');
  serveClient(app);
  const httpServer = createServer(app);

  const gameServer = new Server({
    // SDP offers for video calls run ~10-20KB; the ws-transport default (4KB) drops the client.
    transport: new WebSocketTransport({ server: httpServer, maxPayload: 64 * 1024 }),
  });

  // one Colyseus room instance per room slug
  gameServer.define('room', GameRoom).filterBy(['slug']);

  await gameServer.listen(port);
  console.log(`[dovey] listening on http://localhost:${port} (ws + api)`);

  // Colyseus already traps SIGINT/SIGTERM and shuts rooms down (flushing layouts);
  // a second handler of our own raced it and logged "already_shutting_down"
  gameServer.onShutdown(() => db.close());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
