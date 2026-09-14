import { useEffect, useState } from 'react';
import { useAppStore } from '../store';

/** how long a line stays visible before it fades out, in the compact feed */
const LINE_TTL_MS = 6000;
/** the line spends its last stretch fading out rather than popping off */
const FADE_MS = 900;
/** compact mode shows only the most recent lines */
const COMPACT_COUNT = 6;
/** history mode (input focused) shows more, scrollable */
const HISTORY_COUNT = 30;
/** how often the compact feed re-checks line ages, for a smooth-ish fade */
const TICK_MS = 200;

/** re-renders periodically so lines older than LINE_TTL_MS drop out of the compact view */
function useNow(intervalMs: number, enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

export function ChatFeed() {
  const chatLog = useAppStore((s) => s.chatLog);
  const historyOpen = useAppStore((s) => s.chatHistoryOpen);
  const now = useNow(TICK_MS, !historyOpen);

  const visible = historyOpen ? chatLog.slice(-HISTORY_COUNT) : chatLog.slice(-COMPACT_COUNT).filter((l) => now - l.at < LINE_TTL_MS);

  if (visible.length === 0) return null;

  return (
    <div className={`chatfeed ${historyOpen ? 'chatfeed--history' : ''}`}>
      {visible.map((line) => {
        const age = now - line.at;
        const fadeStart = LINE_TTL_MS - FADE_MS;
        const opacity = historyOpen || age < fadeStart ? 1 : Math.max(0, 1 - (age - fadeStart) / FADE_MS);
        return (
          <div
            key={line.key}
            className={`chatfeed__line ${line.roll ? 'chatfeed__line--roll' : ''}`}
            style={historyOpen ? undefined : { opacity }}
          >
            <span className="chatfeed__name">{line.name}</span>
            <span className="chatfeed__text">{line.text}</span>
          </div>
        );
      })}
    </div>
  );
}
