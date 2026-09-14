import { useEffect, useMemo, useState } from 'react';
import { FURNITURE, FURNITURE_CATS, FurnitureCat, FurnitureDef } from '@dovey/shared';
import { buyItem, fetchShopStock } from '../api';
import { useAppStore } from '../store';

/*
 * Furniture catalog: buy items with coins, they land in your inventory and
 * show up in the build tray.
 */

function ItemCard({
  def,
  owned,
  stock,
  coins,
  onBuy,
  busy,
}: {
  def: FurnitureDef;
  owned: number;
  stock?: { sold: number; cap: number };
  coins: number | null;
  onBuy: () => void;
  busy: boolean;
}) {
  const preview = useAppStore((s) => s.actions?.previewOf);
  const [src, setSrc] = useState('');
  useEffect(() => {
    // previews come from the game's GPU atlas; yield so the sheet paints first
    const id = requestAnimationFrame(() => setSrc(preview?.(def.id) ?? ''));
    return () => cancelAnimationFrame(id);
  }, [def.id, preview]);
  const soldOut = !!stock && stock.sold >= stock.cap;
  const can = !soldOut && coins !== null && coins >= def.price;
  return (
    <div className={`shopcard shopcard--${def.rarity}`}>
      <div className="shopcard__art">
        {src ? <img src={src} alt="" draggable={false} /> : <span className="shopcard__ph" />}
        <span className="shopcard__tags">
          {def.anim > 1 && <span className="shopcard__tag">animated</span>}
          {def.use && <span className="shopcard__tag shopcard__tag--use">usable</span>}
          {def.sit && <span className="shopcard__tag shopcard__tag--sit">sit</span>}
          {def.interaction && <span className="shopcard__tag shopcard__tag--use">chance</span>}
          {def.ltd && <span className="shopcard__tag">LTD {stock ? `${stock.cap - stock.sold}/${stock.cap} left` : `of ${def.ltd}`}</span>}
        </span>
      </div>
      <div className="shopcard__name">{def.name}</div>
      <div className="shopcard__meta">
        {def.w}×{def.h}
        {owned > 0 && <span className="shopcard__owned"> · own {owned}</span>}
      </div>
      <button className={`btn shopcard__buy ${can ? 'btn--primary' : ''}`} disabled={!can || busy} onClick={onBuy}>
        {soldOut ? 'SOLD OUT' : `🪙 ${def.price.toLocaleString()}`}
      </button>
    </div>
  );
}

export function ShopSheet() {
  const setShopping = useAppStore((s) => s.setShopping);
  const coins = useAppStore((s) => s.coins);
  const inventory = useAppStore((s) => s.inventory);
  const instances = useAppStore((s) => s.instances);
  const setInstances = useAppStore((s) => s.setInstances);
  const setCoins = useAppStore((s) => s.setCoins);
  const setInventory = useAppStore((s) => s.setInventory);
  const flash = useAppStore((s) => s.flash);
  const [cat, setCat] = useState<FurnitureCat>('seating');
  const [busy, setBusy] = useState<string | null>(null);
  const [stock, setStock] = useState<Record<string, { sold: number; cap: number }>>({});
  useEffect(() => {
    void fetchShopStock().then(setStock);
  }, []);

  const items = useMemo(() => FURNITURE.filter((f) => f.cat === cat && f.price > 0), [cat]);

  const buy = async (def: FurnitureDef) => {
    if (busy) return;
    setBusy(def.id);
    const r = await buyItem(def.id, 1);
    setBusy(null);
    if ('error' in r) {
      flash(r.error === 'not_enough_coins' ? 'not enough coins' : r.error === 'sold_out' ? 'sold out. only trades now' : 'could not buy');
      if (r.error === 'sold_out') void fetchShopStock().then(setStock);
      return;
    }
    setCoins(r.coins);
    setInventory(r.items);
    setInstances(r.instances);
    if (def.ltd) void fetchShopStock().then(setStock);
    flash(`bought ${def.name}`);
  };

  return (
    <div className="cust shop" role="dialog" aria-label="furniture shop">
      <div className="browser__head">
        <div className="shop__title">
          <span className="shop__h">shop</span>
          <span className="shop__coins">🪙 {coins ?? '…'}</span>
        </div>
        <button className="btn" onClick={() => setShopping(false)}>
          close
        </button>
      </div>
      <div className="cust__tabs shop__tabs">
        {FURNITURE_CATS.map((c) => (
          <button key={c} className={`tab ${cat === c ? 'tab--on' : ''}`} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="cust__body shop__grid">
        {items.map((def) => (
          <ItemCard
            key={def.id}
            def={def}
            owned={(inventory[def.id] ?? 0) + instances.filter((i) => i.def === def.id).length}
            stock={stock[def.id]}
            coins={coins}
            busy={busy === def.id}
            onBuy={() => buy(def)}
          />
        ))}
      </div>
      <div className="shop__hint">you earn 5 coins a minute while you hang out. casino rares are limited: once sold out, trading is the only way.</div>
    </div>
  );
}
