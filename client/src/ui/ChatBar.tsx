import { FormEvent, useRef, useState } from 'react';
import { CHAT_MAX_LEN } from '@dovey/shared';
import { useAppStore } from '../store';

export function ChatBar() {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const actions = useAppStore((s) => s.actions);
  const historyOpen = useAppStore((s) => s.chatHistoryOpen);
  const status = useAppStore((s) => s.status);
  const setChatHistoryOpen = useAppStore((s) => s.setChatHistoryOpen);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || !actions) return;
    actions.say(t);
    setText('');

    // on touch devices drop focus so the keyboard closes; on desktop keep typing
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) inputRef.current?.blur();
    else inputRef.current?.focus();
  };

  return (
    <form className="chatbar" onSubmit={submit}>
      <button type="button" className="chatbar__history" aria-label={historyOpen ? 'Close chat history' : 'Open chat history'} aria-expanded={historyOpen} aria-controls="room-chat-history" onClick={() => setChatHistoryOpen(!historyOpen)}>{historyOpen ? '⌄' : '⌃'} <span>Chat history</span></button>
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
        aria-label="chat message"
      />
      <button className="chatbar__send" type="submit" disabled={!text.trim()} aria-label="send">
        ➤
      </button>
    </form>
  );
}
