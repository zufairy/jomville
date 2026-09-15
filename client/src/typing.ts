/**
 * Tells the room when you are typing in the chat bar, without touching ChatBar:
 * delegated document listeners filtered to its input (`input.chatbar__input`
 * inside `form.chatbar`, aria-label "chat message").
 *
 * ChatBar clears its value through React state on send (no native input event)
 * and blurs on touch devices, so "off" goes out on submit, Enter and blur as
 * well as on an emptied field.
 */
import { sendToWorld } from './net';
import { useAppStore } from './store';
import { TypingSender } from './typingState';

const INPUT = 'input.chatbar__input';
const FORM = 'form.chatbar';
const TICK_MS = 250;

const isChatInput = (t: EventTarget | null): t is HTMLInputElement => t instanceof HTMLInputElement && t.matches(INPUT);

/** Install the detector. Returns the uninstall. */
export function installTypingDetector(): () => void {
  const sender = new TypingSender((on) => {
    // a disconnected bar is disabled; never announce typing into a dead socket
    if (on && useAppStore.getState().status !== 'connected') return;
    sendToWorld('typing', { on });
  });
  let timer: ReturnType<typeof setInterval> | null = null;
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const kick = () => {
    if (timer || !sender.active) return;
    timer = setInterval(() => {
      if (!sender.tick(performance.now())) stopTimer();
    }, TICK_MS);
  };
  const stop = () => {
    sender.stop();
    stopTimer();
  };

  const onInput = (e: Event) => {
    if (!isChatInput(e.target)) return;
    sender.input(e.target.value, performance.now());
    if (sender.active) kick();
    else stopTimer();
  };
  const onFocusOut = (e: FocusEvent) => {
    if (isChatInput(e.target)) stop();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && isChatInput(e.target)) stop();
  };
  const onSubmit = (e: Event) => {
    if (e.target instanceof HTMLFormElement && e.target.matches(FORM)) stop();
  };
  const unsubStatus = useAppStore.subscribe((s, prev) => {
    if (s.status !== prev.status && s.status !== 'connected') stop();
  });

  document.addEventListener('input', onInput, true);
  document.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('submit', onSubmit, true);
  return () => {
    stop();
    unsubStatus();
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('focusout', onFocusOut, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('submit', onSubmit, true);
  };
}
