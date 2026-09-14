import { RoomStyle, STYLE_BGS, STYLE_FLOORS, STYLE_WALLS } from '@dovey/shared';
import { useAppStore } from '../store';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function Row({ label, values, current, onPick }: { label: string; values: readonly number[]; current: number; onPick: (v: number) => void }) {
  return (
    <>
      <h3>{label}</h3>
      <div className="cust__row">
        {values.map((v) => (
          <button
            key={v}
            className={`swatch ${v === current ? 'swatch--on' : ''}`}
            style={{ background: hex(v) }}
            onClick={() => onPick(v)}
            aria-label={`${label} ${hex(v)}`}
          />
        ))}
      </div>
    </>
  );
}

/** Owner-only room look: floor, wall and background colours, walls on/off. Changes apply live for everyone. */
export function StyleSheet() {
  const room = useAppStore((s) => s.room);
  const actions = useAppStore((s) => s.actions);
  const setStyling = useAppStore((s) => s.setStyling);
  if (!room) return null;
  const st = room.style;
  const patch = (p: Partial<RoomStyle>) => actions?.setRoomMeta({ style: p });

  return (
    <div className="cust" role="dialog" aria-label="room style">
      <div className="browser__head">
        <div className="shop__title">
          <span className="shop__h">room style</span>
        </div>
        <button className="btn" onClick={() => setStyling(false)}>
          done
        </button>
      </div>
      <div className="cust__body">
        <div className="stylesheet__row">
          <h3>walls</h3>
          <button className={`toggle ${st.walls ? 'toggle--on' : ''}`} onClick={() => patch({ walls: !st.walls })}>
            {st.walls ? 'on' : 'off'}
          </button>
        </div>
        <Row label="wall colour" values={STYLE_WALLS} current={st.wall} onPick={(wall) => patch({ wall })} />
        <Row label="floor colour" values={STYLE_FLOORS} current={st.floor} onPick={(floor) => patch({ floor })} />
        <Row label="background colour" values={STYLE_BGS} current={st.bg} onPick={(bg) => patch({ bg })} />
        {room.theme !== 'indoor' && <p className="shop__hint">outdoor rooms keep their grass or sand floor; walls only show indoors.</p>}
      </div>
    </div>
  );
}
