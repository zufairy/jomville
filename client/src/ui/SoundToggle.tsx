import { useState } from 'react';
import { setSfxMuted, sfx, sfxMuted } from '../audio';
import { Icon } from './Icon';

/** Speaker button for the room bar: switches every game sound effect on or off (saved per device). */
export function SoundToggle() {
  const [muted, setMuted] = useState(sfxMuted);
  const toggle = () => {
    const next = !muted;
    setSfxMuted(next);
    setMuted(next);
    // the delegated tap skips this button (data-nosfx): only turning sound on clicks, as a confirmation
    if (!next) sfx.uiTap();
  };
  return (
    <button
      className="hud__btn"
      onClick={toggle}
      aria-pressed={!muted}
      aria-label={muted ? 'Sound off' : 'Sound on'}
      title={muted ? 'Sound off' : 'Sound on'}
      data-nosfx
    >
      <Icon name={muted ? 'volumeOff' : 'volume'} />
    </button>
  );
}
