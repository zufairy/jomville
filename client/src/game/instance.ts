import type { Container } from 'pixi.js';
import { Game } from './Game';

/**
 * One Game for the page. React StrictMode mounts effects twice in dev and a
 * hot update of App re-runs them; tearing the game down each time rejoined the
 * room and rebuilt the world, which looked like the page restarting. Detach is
 * deferred so an immediate re-attach keeps the running game.
 */

const GRACE_MS = 1500;

let game: Game | null = null;
let host: HTMLElement | null = null;
let pendingDestroy: ReturnType<typeof setTimeout> | null = null;

function teardown() {
  if (pendingDestroy) clearTimeout(pendingDestroy);
  pendingDestroy = null;
  game?.destroy();
  game = null;
  host = null;
}

export function attachGame(el: HTMLElement) {
  if (pendingDestroy) {
    clearTimeout(pendingDestroy);
    pendingDestroy = null;
  }
  if (game && host === el) return;
  // a genuinely new stage element (full remount): start fresh on it
  teardown();
  game = new Game();
  host = el;
  game.mount(el).catch(() => {});
}

export function detachGame() {
  if (pendingDestroy) return;
  pendingDestroy = setTimeout(teardown, GRACE_MS);
}

export function setGamePaused(paused: boolean) {
  game?.setPaused(paused);
}

/**
 * Borrow the page's Pixi app for a full-screen scene (kitchen round) instead of
 * creating a second one (see the note below). Null when no world game is up.
 */
export function lendGameStage(root: Container, el: HTMLElement, background?: number) {
  return game?.lendStage(root, el, background) ?? null;
}

// When the game code (this module or anything it imports) changes, reload the page once instead of
// swapping in place. A second Pixi app in the same page after the first has rendered breaks Pixi's
// shared textures (every frame throws and the stage stays black). Accepting here stops the update
// from reaching App, so App never builds that second game; the reload's pagehide leaves the room.
if (import.meta.hot) {
  import.meta.hot.accept(() => location.reload());
}
