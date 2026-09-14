import { useMemo, useState } from 'react';
import {
  AvatarConfig,
  BODY_TYPES,
  EYE_COLOURS,
  ITEMS_BY_SLOT,
  ItemDef,
  SKIN_TONES,
  SLOTS,
  Slot,
  isGearSlot,
  isOptionalSlot,
  itemDef,
  randomAvatar,
} from '@dovey/shared';
import { useAppStore } from '../store';
import { AvatarPreview, Focus } from './AvatarPreview';

/** Swatch colours for the pack's named variants. Unknown names fall back to grey. */
const SWATCH: Record<string, string> = {
  // skin
  light: '#f2cba3', amber: '#e0a870', olive: '#c99154', taupe: '#a9744a', bronze: '#8c5a34', brown: '#6f452a', black: '#4a2f1d',
  // hair
  blonde: '#e8cf7a', ash: '#b9a88c', chestnut: '#7a4a2b', redhead: '#c1502e', platinum: '#eae3d2', white: '#ffffff',
  // garments
  red: '#d4443a', blue: '#3f7fd0', green: '#5aa84f', yellow: '#e8c33c', pink: '#ee8ab0', purple: '#9b6bdc',
  navy: '#2c3e63', forest: '#2f6b3f', sky: '#8fd0f0', rose: '#e0728c', gray: '#9b9b9b', grey: '#9b9b9b',
  orange: '#e8893c', gold: '#e0b23c', steel: '#9aa7b4', leather: '#8a5a34', charcoal: '#4a4a4a',
  maroon: '#7d2b34', lavender: '#c8b2e8', bluegray: '#7d90a8', slate: '#5d6b7a',
};
const swatch = (name: string) => SWATCH[name] ?? '#b7b3c4';

const TAB_LABEL: Record<string, string> = {
  look: 'you',
  hair: 'hair',
  hat: 'hats',
  torso: 'shirts',
  legs: 'legs',
  feet: 'shoes',
  face: 'eyewear',
  helm: 'helmets',
  aura: 'auras',
  back: 'backs',
};
/** Catalog cards zoom to the part being chosen. */
const SLOT_FOCUS: Record<Slot, Focus> = {
  hair: 'head',
  hat: 'head',
  torso: 'full',
  legs: 'lower',
  feet: 'lower',
  face: 'head',
  helm: 'full',
  aura: 'full',
  back: 'full',
};
type Tab = 'look' | Slot;
const TABS: Tab[] = ['look', ...SLOTS];

function Swatches({ values, current, onPick }: { values: readonly string[]; current: string; onPick: (v: string) => void }) {
  return (
    <div className="cust__row">
      {values.map((v) => (
        <button
          key={v}
          className={`swatch ${v === current ? 'swatch--on' : ''}`}
          style={{ background: swatch(v) }}
          onClick={() => onPick(v)}
          aria-label={v}
          title={v}
        />
      ))}
    </div>
  );
}

/** A wearable, previewed on your own body so the catalog shows the real thing. */
function ItemCard({
  item,
  cfg,
  slot,
  selected,
  locked,
  onPick,
}: {
  item: ItemDef | null;
  cfg: AvatarConfig;
  slot: Slot;
  selected: boolean;
  locked: boolean;
  onPick: () => void;
}) {
  const worn = useMemo<AvatarConfig>(() => {
    if (!item) return { ...cfg, [slot]: 'none' };
    if (isGearSlot(slot)) return { ...cfg, [slot]: item.id };
    const colour = item.variants.includes(cfg[`${slot}Colour` as keyof AvatarConfig] as string)
      ? (cfg[`${slot}Colour` as keyof AvatarConfig] as string)
      : item.variants[0];
    return { ...cfg, [slot]: item.id, [`${slot}Colour`]: colour };
  }, [item, cfg, slot]);

  return (
    <button
      className={`wear ${selected ? 'wear--on' : ''} ${locked ? 'wear--locked' : ''} ${item ? `wear--${item.rarity}` : ''}`}
      onClick={onPick}
      title={item?.name ?? 'none'}
    >
      <span className="wear__art">
        {/* only the chosen card plays its gear animation, so a full tab stays light */}
        <AvatarPreview cfg={worn} scale={3} animate={false} fx={selected} focus={SLOT_FOCUS[slot]} />
      </span>
      <span className="wear__name">
        {locked && '🔒 '}
        {item?.name ?? 'none'}
      </span>
      {item && item.rarity !== 'starter' && <span className={`wear__tag wear__tag--${item.rarity}`}>{item.rarity}</span>}
    </button>
  );
}

export function Customizer({ embedded = false, onDone }: { embedded?: boolean; onDone?: () => void } = {}) {
  const cfg = useAppStore((s) => s.avatar);
  const set = useAppStore((s) => s.setAvatar);
  const wardrobe = useAppStore((s) => s.wardrobe);
  const flash = useAppStore((s) => s.flash);
  const close = () => (onDone ? onDone() : useAppStore.getState().setCustomizing(false));
  const [tab, setTab] = useState<Tab>('look');

  const owned = (id: string) => id === 'none' || wardrobe === null || wardrobe.includes(id) || itemDef(id)?.rarity === 'starter';

  const slotBody = (slot: Slot) => {
    const current = cfg[slot] as string;
    const gear = isGearSlot(slot);
    const colourKey = `${slot}Colour` as 'hairColour' | 'hatColour' | 'torsoColour' | 'legsColour' | 'feetColour';
    const def = itemDef(current);
    const wearPatch = (i: ItemDef): Partial<AvatarConfig> =>
      gear ? { [slot]: i.id } : { [slot]: i.id, [colourKey]: i.variants.includes(cfg[colourKey]) ? cfg[colourKey] : i.variants[0] };
    return (
      <>
        <div className="wear__grid">
          {isOptionalSlot(slot) && (
            <ItemCard item={null} cfg={cfg} slot={slot} selected={current === 'none'} locked={false} onPick={() => set({ [slot]: 'none' })} />
          )}
          {ITEMS_BY_SLOT[slot].map((i) => (
            <ItemCard
              key={i.id}
              item={i}
              cfg={cfg}
              slot={slot}
              selected={current === i.id}
              locked={!owned(i.id)}
              onPick={() => (owned(i.id) ? set(wearPatch(i)) : flash('pull it from a capsule machine'))}
            />
          ))}
        </div>
        {def && !gear && (
          <>
            <h3>colour</h3>
            <Swatches values={def.variants} current={cfg[colourKey]} onPick={(v) => set({ [colourKey]: v })} />
          </>
        )}
      </>
    );
  };

  return (
    <div className={`cust ${embedded ? 'cust--embedded' : ''}`} role={embedded ? undefined : 'dialog'} aria-label="customize avatar">
      <div className="cust__head">
        <AvatarPreview cfg={cfg} scale={2.4} className="cust__preview" />
        <div className="cust__headbtns">
          <button className="btn" onClick={() => set(randomAvatar())}>
            🎲 shuffle
          </button>
          <button className="btn btn--primary" onClick={close}>
            done
          </button>
        </div>
      </div>
      <div className="cust__tabs" role="tablist">
        {TABS.filter((t) => t === 'look' || ITEMS_BY_SLOT[t].length).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'tab--on' : ''}`} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="cust__body">
        {tab === 'look' ? (
          <>
            <h3>body</h3>
            <div className="cust__row">
              {BODY_TYPES.map((b) => (
                <button key={b} className={`chip ${cfg.body === b ? 'chip--on' : ''}`} onClick={() => set({ body: b })}>
                  {b === 'male' ? 'male' : 'female'}
                </button>
              ))}
            </div>
            <h3>skin</h3>
            <Swatches values={SKIN_TONES} current={cfg.skin} onPick={(skin) => set({ skin })} />
            <h3>eyes</h3>
            <Swatches values={EYE_COLOURS} current={cfg.eyes} onPick={(eyes) => set({ eyes })} />
          </>
        ) : (
          slotBody(tab)
        )}
      </div>
    </div>
  );
}

export { SLOTS };
