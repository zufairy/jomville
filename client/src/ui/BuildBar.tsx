import { useEffect, useState } from 'react';
import { FURNITURE, furnitureDef, isInstanceDef } from '@dovey/shared';
import { useAppStore } from '../store';

function Thumb({ def }: { def: string }) {
  const preview = useAppStore((s) => s.actions?.previewOf);
  const [src, setSrc] = useState('');
  useEffect(() => {
    const id = requestAnimationFrame(() => setSrc(preview?.(def) ?? ''));
    return () => cancelAnimationFrame(id);
  }, [def, preview]);
  return src ? <img className="furn__img" src={src} alt="" draggable={false} /> : <span className="furn__img" />;
}

/** Build tray: only what you own (bought and not yet placed) can be placed. */
export function BuildBar() {
  const edit = useAppStore((s) => s.edit);
  const setEdit = useAppStore((s) => s.setEdit);
  const actions = useAppStore((s) => s.actions);
  const undoCount = useAppStore((s) => s.undoCount);
  const inventory = useAppStore((s) => s.inventory);
  const instances = useAppStore((s) => s.instances);
  const setShopping = useAppStore((s) => s.setShopping);
  const setStyling = useAppStore((s) => s.setStyling);
  if (!edit.on) return null;

  const owned = FURNITURE.filter((f) => !isInstanceDef(f) && (inventory[f.id] ?? 0) > 0);
  const unplaced = instances.filter((i) => !i.placed);

  return (
    <div className="build">
      <div className="build__tools">
        <button className="btn" onClick={() => setEdit({ on: false })}>
          done
        </button>
        <button className="btn" disabled={undoCount === 0} onClick={() => actions?.undo()} aria-label="undo">
          ↶ undo
        </button>
        {edit.selected && (
          <>
            <button className="btn" onClick={() => actions?.rotateSelected()} aria-label="rotate">
              ⟳
            </button>
            <button
              className={`btn ${edit.moving ? 'btn--primary' : ''}`}
              onClick={() => setEdit({ ...edit, moving: !edit.moving, placing: null, placingItem: null })}
              aria-label="move"
            >
              {edit.moving ? 'tap a tile…' : '✥ move'}
            </button>
            <button className="btn btn--danger" onClick={() => actions?.removeSelected()} aria-label="pick up">
              📦 pick up
            </button>
          </>
        )}
        <button className="btn build__shop" onClick={() => setStyling(true)}>
          🎨 style
        </button>
        <button className="btn build__shop" onClick={() => setShopping(true)}>
          🛍 shop
        </button>
      </div>
      <div className="build__tray">
        {owned.length === 0 && unplaced.length === 0 && <div className="build__empty">nothing in your inventory yet. hit shop to buy furniture.</div>}
        {unplaced.map((i) => {
          const on = edit.placingItem === i.id;
          return (
            <button
              key={i.id}
              className={`furn ${on ? 'furn--on' : ''}`}
              onClick={() => setEdit({ ...edit, placing: on ? null : i.def, placingItem: on ? null : i.id, selected: null, moving: false })}
            >
              <Thumb def={i.def} />
              <span className="furn__name">{furnitureDef(i.def)?.name}</span>
              <span className="furn__qty">{i.serial !== null ? `#${i.serial}` : '★'}</span>
            </button>
          );
        })}
        {owned.map((f) => (
          <button
            key={f.id}
            className={`furn ${edit.placing === f.id && !edit.placingItem ? 'furn--on' : ''}`}
            onClick={() => setEdit({ ...edit, placing: edit.placing === f.id ? null : f.id, placingItem: null, selected: null, moving: false })}
          >
            <Thumb def={f.id} />
            <span className="furn__name">{f.name}</span>
            <span className="furn__qty">×{inventory[f.id]}</span>
          </button>
        ))}
      </div>
      {edit.placing && <div className="build__hint">tap a tile to place {furnitureDef(edit.placing)?.name}</div>}
    </div>
  );
}
