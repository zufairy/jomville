/**
 * Game-feel sounds wired from the outside: room chime, chat pops, typing ticks,
 * UI taps and sheet whooshes. Components are never edited for these; taps come
 * from one delegated listener and whooshes from store subscriptions.
 * Everything is quiet, throttled, muted with the global sound toggle and silent
 * in hidden tabs (audio.ts checks both).
 */
import { audioUnlocked, sfx, whenAudioReady } from './audio';
import { SfxThrottle } from './sfxThrottle';
import { useAppStore } from './store';
import { useFriends } from './friends';
import { useTrade } from './trade';

/** chat: at most one pop per 250 ms and four per 2 s */
const chatThrottle = new SfxThrottle(250, 4, 2000);
/** typing: one tick per 1.5 s room-wide */
const typingThrottle = new SfxThrottle(1500);
/** taps: a double-tap is two clicks, a stuck pointer storm is not */
const tapThrottle = new SfxThrottle(40);
/** a sheet swapping for another fires close + open together: one whoosh */
const sheetThrottle = new SfxThrottle(120);

function hiddenFor(id: string): boolean {
  const st = useAppStore.getState();
  return st.muted.includes(id) || st.blocked.includes(id);
}

/** the room finished loading; skipped silently when the browser still holds audio locked */
export function playEnterRoom() {
  void whenAudioReady().then((ok) => {
    if (ok) sfx.enterRoom();
  });
}

/** a chat line arrived from `id` (`self` = my session) */
export function playChat(id: string, self: string | null) {
  if (!audioUnlocked() || hiddenFor(id)) return;
  if (!chatThrottle.allow(performance.now())) return;
  if (id === self) sfx.chatSent();
  else sfx.chatBlip();
}

/** `id` started typing */
export function playTypingStart(id: string) {
  if (!audioUnlocked() || hiddenFor(id)) return;
  if (typingThrottle.allow(performance.now())) sfx.typingTick();
}

/** one bit per sheet/popup that can be open */
function openSheets(): number {
  const s = useAppStore.getState();
  const trade = useTrade.getState().phase;
  const flags = [
    !!s.profile,
    s.shopping,
    s.styling,
    s.browsing,
    s.customizing,
    s.vending,
    s.edit.on,
    useFriends.getState().open,
    trade === 'incoming' || trade === 'open',
  ];
  let mask = 0;
  for (let i = 0; i < flags.length; i++) if (flags[i]) mask |= 1 << i;
  return mask;
}

/** Install delegated button taps and sheet whooshes. Returns the uninstall. */
export function installUiSounds(): () => void {
  const onPointerDown = (e: PointerEvent) => {
    const t = e.target as Element | null;
    const btn = t && typeof t.closest === 'function' ? t.closest('button, [role="button"]') : null;
    if (!btn) return;
    // the duel arena has its own sounds; data-nosfx opts a control out
    if (btn.closest('.dhd, [data-nosfx]')) return;
    if ((btn as HTMLButtonElement).disabled || btn.getAttribute('aria-disabled') === 'true') return;
    if (tapThrottle.allow(performance.now())) sfx.uiTap();
  };
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });

  let last = openSheets();
  const onStore = () => {
    const now = openSheets();
    if (now === last) return;
    const opened = now & ~last;
    last = now;
    if (!audioUnlocked() || !sheetThrottle.allow(performance.now())) return;
    if (opened) sfx.sheetOpen();
    else sfx.sheetClose();
  };
  const unsubs = [useAppStore.subscribe(onStore), useFriends.subscribe(onStore), useTrade.subscribe(onStore)];

  return () => {
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
    for (const u of unsubs) u();
  };
}
