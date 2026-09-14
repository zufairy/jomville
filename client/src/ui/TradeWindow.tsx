import { useEffect, useState } from 'react';
import { FURNITURE, REPORT_NOTE_MAX, TRADE_CONFIRM_DELAY_MS, TRADE_SLOTS, isInstanceDef, type ResolvedOffer, type ResolvedSlot } from '@dovey/shared';
import { useAppStore } from '../store';
import { trade, useTrade } from '../trade';
import { confirmLeft, isFlashing, toOffer, toggleInstance, withCoins, withStack } from '../tradeLogic';
import { Thumb } from './BuildBar';
import { VipModal } from './VipModal';
import './trade.css';

const RING = 2 * Math.PI * 16;

/** Re-render on a timer while the window is open, for the countdown ring and slot flashes. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [on]);
  return now;
}

function Slot({ slot, flash, onRemove }: { slot?: ResolvedSlot; flash: boolean; onRemove?: () => void }) {
  const cls = `trade__slot${slot ? '' : ' trade__slot--empty'}${flash ? ' trade__flash' : ''}`;
  if (!slot) return <div className={cls} />;
  const badge = slot.serial !== null ? `#${slot.serial}` : slot.itemId ? '★' : `×${slot.qty}`;
  const body = (
    <>
      <Thumb def={slot.def} />
      <span className="trade__slot-name">{slot.name}</span>
      <span className={`trade__badge${slot.serial !== null ? ' trade__badge--ltd' : ''}`}>{badge}</span>
    </>
  );
  return onRemove ? (
    <button className={cls} onClick={onRemove} aria-label={`take back ${slot.name}`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Column(props: {
  title: string;
  side: 'you' | 'them';
  offer: ResolvedOffer;
  accepted: boolean;
  changedAt: Record<string, number>;
  now: number;
  onRemove?: (index: number) => void;
}) {
  const { title, side, offer, accepted, changedAt, now, onRemove } = props;
  return (
    <section className={`trade__col${accepted ? ' trade__col--ok' : ''}`} aria-label={`${title} offer`}>
      <header className="trade__col-head">
        <span className="trade__col-title">{title}</span>
        {accepted && <span className="trade__tick">✓ accepted</span>}
      </header>
      <div className="trade__grid">
        {Array.from({ length: TRADE_SLOTS }, (_, i) => (
          <Slot
            key={i}
            slot={offer.slots[i]}
            flash={isFlashing(changedAt, `${side}:${i}`, now)}
            onRemove={onRemove && offer.slots[i] ? () => onRemove(i) : undefined}
          />
        ))}
      </div>
      <div className={`trade__coins${isFlashing(changedAt, `${side}:coins`, now) ? ' trade__flash' : ''}`}>🪙 {offer.coins.toLocaleString()}</div>
    </section>
  );
}

/** Player-to-player trade: invite popup, waiting card, and the two-column trade window. */
export function TradeWindow() {
  const phase = useTrade((s) => s.phase);
  const handle = useTrade((s) => s.handle);
  const view = useTrade((s) => s.view);
  const changedAt = useTrade((s) => s.changedAt);
  const confirmed = useTrade((s) => s.confirmed);
  const draft = useTrade((s) => s.draft);
  const inventory = useAppStore((s) => s.inventory);
  const instances = useAppStore((s) => s.instances);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [coinDraft, setCoinDraft] = useState('0');
  const now = useNow(phase === 'open');
  const myCoins = view?.you.coins ?? 0;

  useEffect(() => {
    if (phase === 'open') return;
    setReporting(false);
    setNote('');
  }, [phase]);
  useEffect(() => setCoinDraft(String(myCoins)), [myCoins]);

  if (phase === 'idle') return null;

  if (phase === 'incoming') {
    return (
      <VipModal title="🤝 trade request" label="trade request" onExit={() => trade.respond(false)} exitLabel="decline">
        <p className="trade__sub">
          <b>{handle}</b> wants to trade
        </p>
        <div className="trade__btns">
          <button className="vip__btn vip__btn--pink" onClick={() => trade.respond(true)}>
            accept
          </button>
          <button className="vip__btn vip__btn--ghost" onClick={() => trade.respond(false)}>
            decline
          </button>
        </div>
      </VipModal>
    );
  }

  if (phase === 'waiting' || !view) {
    return (
      <VipModal title="🤝 trade" label="trade" onExit={() => trade.cancel()} exitLabel="cancel">
        <p className="trade__sub">waiting for {handle || 'them'} to accept…</p>
      </VipModal>
    );
  }

  // build every edit on my newest sent offer, so quick taps are not lost before the server echoes
  const offer = draft ?? toOffer(view.you);
  const full = offer.slots.length >= TRADE_SLOTS;
  const stacks = FURNITURE.filter((f) => !isInstanceDef(f) && (inventory[f.id] ?? 0) > 0);
  const unplaced = instances.filter((i) => !i.placed);
  const offeredQty = (def: string) => offer.slots.find((s): s is { def: string; qty: number } => !('itemId' in s) && s.def === def)?.qty ?? 0;
  const offeredItem = (id: string) => offer.slots.some((s) => 'itemId' in s && s.itemId === id);
  const takeBack = (i: number) => {
    const slot = view.you.slots[i];
    if (!slot) return;
    trade.offer(slot.itemId ? toggleInstance(offer, slot.itemId) : withStack(offer, slot.def, 0));
  };
  const bothAccepted = view.acceptedYou && view.acceptedThem;
  const left = confirmLeft(view.confirmEndsAt, now) ?? 0;
  const commitCoins = () => {
    const next = withCoins(offer, Number(coinDraft));
    if (next.coins !== offer.coins) trade.offer(next);
    else setCoinDraft(String(offer.coins));
  };

  const report = (
    <button className="trade__report" onClick={() => setReporting(true)} aria-label={`report ${view.partner.handle}`} title="report a scam">
      🚩
    </button>
  );

  return (
    <VipModal title={`🤝 trade with ${view.partner.handle}`} label="trade" onExit={() => trade.cancel()} exitLabel="cancel trade" headerExtra={report} wide>
      {reporting ? (
        <div className="trade__reportbox">
          <p className="trade__sub">
            report {view.partner.handle} for scamming? the trade is cancelled and a moderator sees both offers.
          </p>
          <input
            className="trade__note"
            placeholder="what happened? (optional)"
            maxLength={REPORT_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="report note"
          />
          <div className="trade__btns">
            <button className="vip__btn vip__btn--danger" onClick={() => trade.report(note.trim() || undefined)}>
              report &amp; cancel
            </button>
            <button className="vip__btn vip__btn--ghost" onClick={() => setReporting(false)}>
              back
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="trade__warn" role="note">
            ⚠️ Check items carefully — trades are final
          </p>
          <div className="trade__cols">
            <Column
              title="You"
              side="you"
              offer={view.you}
              accepted={view.acceptedYou}
              changedAt={changedAt}
              now={now}
              onRemove={takeBack}
            />
            <Column title={view.partner.handle} side="them" offer={view.them} accepted={view.acceptedThem} changedAt={changedAt} now={now} />
          </div>

          <label className="trade__coin-input">
            <span>🪙 your coins</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={coinDraft}
              onChange={(e) => setCoinDraft(e.target.value)}
              onBlur={commitCoins}
              onKeyDown={(e) => e.key === 'Enter' && commitCoins()}
              aria-label="coins to offer"
            />
          </label>

          <div className="trade__picker" aria-label="your inventory">
            {stacks.length === 0 && unplaced.length === 0 && <p className="trade__empty">nothing to offer yet. unplaced furniture shows up here.</p>}
            {unplaced.map((i) => {
              const on = offeredItem(i.id);
              const name = FURNITURE.find((f) => f.id === i.def)?.name ?? i.def;
              return (
                <button
                  key={i.id}
                  className={`trade__pick${on ? ' trade__pick--on' : ''}`}
                  disabled={!on && full}
                  onClick={() => trade.offer(toggleInstance(offer, i.id))}
                  aria-pressed={on}
                >
                  <Thumb def={i.def} />
                  <span className="trade__pick-name">{name}</span>
                  <span className={`trade__badge${i.serial !== null ? ' trade__badge--ltd' : ''}`}>{i.serial !== null ? `#${i.serial}` : '★'}</span>
                </button>
              );
            })}
            {stacks.map((f) => {
              const held = inventory[f.id] ?? 0;
              const q = offeredQty(f.id);
              return (
                <div key={f.id} className={`trade__pick${q ? ' trade__pick--on' : ''}`}>
                  <Thumb def={f.id} />
                  <span className="trade__pick-name">{f.name}</span>
                  <div className="trade__stepper">
                    <button disabled={q === 0} onClick={() => trade.offer(withStack(offer, f.id, q - 1))} aria-label={`offer one less ${f.name}`}>
                      −
                    </button>
                    <span>
                      {q}/{held}
                    </span>
                    <button
                      disabled={q >= held || (q === 0 && full)}
                      onClick={() => trade.offer(withStack(offer, f.id, q + 1))}
                      aria-label={`offer one more ${f.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="trade__btns">
            {!bothAccepted ? (
              <button className="vip__btn vip__btn--pink" disabled={view.acceptedYou} onClick={() => trade.accept()}>
                {view.acceptedYou ? `waiting for ${view.partner.handle}…` : 'accept'}
              </button>
            ) : (
              <button className="vip__btn vip__btn--pink trade__confirm" disabled={left > 0 || confirmed} onClick={() => trade.confirm()}>
                {left > 0 && (
                  <svg className="trade__ring" viewBox="0 0 40 40" aria-hidden>
                    <circle className="trade__ring-bg" cx="20" cy="20" r="16" />
                    <circle className="trade__ring-fg" cx="20" cy="20" r="16" style={{ strokeDasharray: RING, strokeDashoffset: RING * (1 - left / TRADE_CONFIRM_DELAY_MS) }} />
                  </svg>
                )}
                {confirmed ? 'confirmed, waiting…' : left > 0 ? `confirm in ${Math.ceil(left / 1000)}` : 'confirm trade'}
              </button>
            )}
          </div>
        </>
      )}
    </VipModal>
  );
}
