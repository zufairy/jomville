import { FormEvent, useRef, useState } from 'react';
import { CHAT_MAX_LEN } from '@dovey/shared';
import { useAppStore } from '../store';

export function ChatBar() {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const actions = useAppStore((s) => s.actions);
  const status = useAppStore((s) => s.status);
  const setChatHistoryOpen = useAppStore((s) => s.setChatHistoryOpen);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || !actions) return;
    actions.say(t);
    setText('');
    setChatHistoryOpen(false);
    inputRef.current?.focus();
  };

  return (
    <form className="chatbar" onSubmit={submit}>
      <input
        ref={inputRef}
        className="chatbar__input"
        type="text"
        inputMode="text"
        enterKeyHint="send"
        autoComplete="off"
        autoCorrect="on"
        maxLength={CHAT_MAX_LEN}
        placeholder={status === 'connected' ? 'say something…' : 'connecting…'}
        disabled={status !== 'connected'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setChatHistoryOpen(true)}
        onBlur={() => setChatHistoryOpen(false)}
        aria-label="chat message"
      />
      <button className="chatbar__send" type="submit" disabled={!text.trim()} aria-label="send">
        ➤
      </button>
    </form>
  );
}
