import { blurbFor, furnitureDef } from '@dovey/shared';
import { useAppStore } from '../store';
import { chanceStatus, serialLine } from './itemInfoText';

/** Docked card for the tapped furniture: preview, rarity, serial, blurb, live state and actions. */
export function ItemInfo() {
  const p = useAppStore((s) => s.selectedPlacement);
  const actions = useAppStore((s) => s.actions);
  const setSelectedItem = useAppStore((s) => s.setSelectedItem);
  const def = p ? furnitureDef(p.def) : undefined;
  if (!p || !def) return null;

  const img = actions?.previewOf(def.id) ?? '';
  const serial = serialLine(def, p);
  const status = chanceStatus(def, p.state);

  return (
    <div className={`iteminfo iteminfo--${def.rarity}`} role="dialog" aria-label={`${def.name} info`}>
      <div className="iteminfo__art">{img && <img src={img} alt="" draggable={false} />}</div>
      <div className="iteminfo__body">
        <div className="iteminfo__head">
          <span className="iteminfo__name">{def.name}</span>
          <span className={`iteminfo__rarity iteminfo__rarity--${def.rarity}`}>{def.rarity}</span>
        </div>
        {serial && <div className="iteminfo__serial">{serial}</div>}
        <div className="iteminfo__blurb">{blurbFor(def)}</div>
        {status && (
          <div className="iteminfo__status" aria-live="polite">
            {status}
          </div>
        )}
        {(def.use || def.interaction) && (
          <div className="iteminfo__actions">
            {def.use && (
              <button className="iteminfo__btn iteminfo__btn--use" onClick={() => actions?.useFurniture(p.id)}>
                Use
              </button>
            )}
            {def.interaction && (
              <button className="iteminfo__btn" onClick={() => actions?.useFurniture(p.id, true)}>
                Close
              </button>
            )}
          </div>
        )}
      </div>
      <button className="iteminfo__x" onClick={() => setSelectedItem(null)} aria-label="close item info">
        ✕
      </button>
    </div>
  );
}
