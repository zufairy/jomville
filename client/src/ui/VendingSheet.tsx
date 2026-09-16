import { useEffect, useRef, useState } from 'react';
import { RARITY_LABEL, VEND_COST, VendRarity, isGearSlot, itemDef, vendingPool } from '@dovey/shared';
import { useAppStore } from '../store';
import { wearPatch } from '../wear';
import { sfx } from '../audio';
import { CREDIT_PACKS, CreditPackId, createCreditCheckout } from '../api';
import { FRAME, composite, dirRow, findPart, loadManifest, sheetFor } from '../game/lpc';
import { GEAR_FRAMES, GEAR_FRAME_MS, paintGear } from '../game/gearArt';

export interface VendResultView {
  itemId: string;
  name: string;
  rarity: VendRarity;
  slot: string;
  duplicate: boolean;
  refund: number;
  credits: number;
}

type Phase = 'idle' | 'coin' | 'rattle' | 'drop' | 'open' | 'reveal';
const TIER: Record<VendRarity, 0 | 1 | 2 | 3> = { common: 0, rare: 1, epic: 2, legendary: 3 };

/** Square window onto the 64px body frame (x, y, size) that frames each kind of item. */
const VIEW: Record<string, [number, number, number]> = {
  hair: [16, 4, 32],
  hat: [14, 0, 36],
  torso: [12, 16, 40],
  legs: [14, 30, 34],
  feet: [16, 44, 22],
  face: [18, 14, 28],
  helm: [8, -10, 48],
  aura: [-10, -8, 84],
  back: [-8, -10, 80],
};
/** how long each side of the item is shown before it turns */
const TURN_MS = 1500;

/**
 * The pulled item on its own: no body and no catalog. It turns to show each
 * side and plays its own animation (shine, beams, flapping, sparkles).
 */
function Showcase({ itemId }: { itemId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const body = useAppStore((s) => s.avatar.body);
  const def = itemDef(itemId);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !def) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let alive = true;
    const gear = isGearSlot(def.slot);
    // eyewear has nothing to show from behind
    const dirs = def.slot === 'face' ? [2, 1, 2, 3] : [2, 1, 0, 3];
    const [vx, vy, size] = VIEW[def.slot] ?? [0, 0, FRAME];
    const loop = GEAR_FRAMES * GEAR_FRAME_MS;

    void (async () => {
      let sheet: HTMLCanvasElement | null = null;
      if (!gear) {
        try {
          const m = await loadManifest();
          const part = findPart(m, itemId);
          const rel = part ? sheetFor(part, body, def.variants[0]) : null;
          if (rel) sheet = (await composite(`show:${rel}`, [{ rel, z: 0 }])).canvas;
        } catch {
          // art failed to load; the name and rarity still tell the story
        }
      }
      if (!alive) return;
      const start = performance.now();
      const draw = (now: number) => {
        const elapsed = now - start;
        const turn = elapsed / TURN_MS;
        const dir = dirs[Math.floor(turn) % dirs.length];
        // each new side flips in from edge-on, like the item is spinning
        const k = 0.12 + 0.88 * Math.min(1, (turn % 1) / 0.14);
        const zoom = canvas.width / size;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(zoom * k, 0, 0, zoom, (canvas.width / 2) * (1 - k), 0);
        ctx.translate(-vx, -vy);
        if (sheet) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(sheet, 0, dirRow(dir) * FRAME, FRAME, FRAME, 0, 0, FRAME, FRAME);
        } else if (gear) {
          ctx.imageSmoothingEnabled = true;
          paintGear(ctx, itemId, dir, (elapsed % loop) / loop);
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [itemId, body, def]);

  return (
    <div className="showcase">
      <span className="showcase__rays" />
      <canvas ref={ref} width={380} height={380} className="showcase__art" role="img" aria-label={def?.name ?? 'item'} />
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className="showcase__spark" />
      ))}
    </div>
  );
}

export function VendingSheet() {
  const open = useAppStore((s) => s.vending);
  const setVending = useAppStore((s) => s.setVending);
  const credits = useAppStore((s) => s.credits);
  const actions = useAppStore((s) => s.actions);
  const result = useAppStore((s) => s.vendResult);
  const setVendResult = useAppStore((s) => s.setVendResult);
  const [phase, setPhase] = useState<Phase>('idle');
  const [buying, setBuying] = useState<CreditPackId | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // result arrives from the server while we're rattling; hold it until the drop
  useEffect(() => {
    if (!result || phase !== 'rattle') return;
    const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    later(() => {
      setPhase('drop');
      sfx.drop();
    }, 300);
    later(() => {
      setPhase('open');
      sfx.pop();
    }, 1100);
    later(() => {
      setPhase('reveal');
      sfx.reveal(TIER[result.rarity]);
    }, 1500);
  }, [result, phase]);

  if (!open) return null;
  const can = (credits ?? 0) >= VEND_COST && phase === 'idle';

  const pull = () => {
    if (!can) {
      sfx.nope();
      return;
    }
    setVendResult(null);
    setPhase('coin');
    sfx.coin();
    timers.current.push(
      window.setTimeout(() => {
        setPhase('rattle');
        sfx.rattle();
        actions?.vend();
      }, 450),
    );
    // safety: if the server never answers, reset
    timers.current.push(
      window.setTimeout(() => {
        setPhase((p) => (p === 'rattle' ? 'idle' : p));
      }, 8000),
    );
  };

  const again = () => {
    setPhase('idle');
    setVendResult(null);
    sfx.tap();
  };

  const buyCredits = async (packId: CreditPackId) => {
    setBuying(packId);
    setPayError(null);
    const r = await createCreditCheckout(packId);
    if (r.url) {
      location.assign(r.url);
      return;
    }
    setPayError(r.error ?? 'payment unavailable');
    setBuying(null);
  };

  return (
    <div className="vend" role="dialog" aria-label="vending machine">
      <div className="vend__card">
        <div className="vend__head">
          <span className="vend__title">capsule machine</span>
          <span className="vend__credits">🪙 {credits ?? '…'}</span>
          <button className="btn" onClick={() => setVending(false)} disabled={phase !== 'idle' && phase !== 'reveal'}>
            close
          </button>
        </div>

        <div className={`machine machine--${phase}`}>
          <div className="machine__bulbs">
            {Array.from({ length: 9 }).map((_, i) => (
              <i key={i} />
            ))}
          </div>
          <div className="machine__marquee">CAPSULES</div>
          <div className="machine__coinslot" />
          <div className="machine__glass">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="machine__ball" style={{ ['--i' as string]: i }} />
            ))}
          </div>
          <div className="machine__slot" />
          <div className="machine__chute">
            {(phase === 'drop' || phase === 'open' || phase === 'reveal') && result && (
              <div className={`capsule capsule--${result.rarity} ${phase !== 'drop' ? 'capsule--open' : ''}`}>
                <span className="capsule__top" />
                <span className="capsule__bottom" />
              </div>
            )}
          </div>
        </div>

        {phase === 'reveal' && result ? (
          <div className={`reveal reveal--${result.rarity}`}>
            <div className="reveal__burst" />
            <Showcase itemId={result.itemId} />
            <div className="reveal__name">{result.name}</div>
            <div className="reveal__rarity">{RARITY_LABEL[result.rarity]}</div>
            {result.duplicate ? (
              <div className="reveal__dup">already yours · +{result.refund} credits back</div>
            ) : (
              <div className="reveal__new">new! added to your wardrobe</div>
            )}
            <div className="vend__btns">
              <button className="btn" onClick={again}>
                again
              </button>
              <button
                className="btn btn--primary"
                onClick={() => {
                  const st = useAppStore.getState();
                  const def = itemDef(result.itemId);
                  // put it on straight away, then open the wardrobe on that item
                  if (def) st.setAvatar(wearPatch(st.avatar, def));
                  st.setCustomizeFocus(result.itemId);
                  setVending(false);
                  st.setCustomizing(true);
                }}
              >
                wear it
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="vend__economy">
              <span>New players start with 200 credits.</span>
              <strong>Each capsule costs {VEND_COST}.</strong>
            </div>
            <button className={`btn btn--primary vend__pull ${phase !== 'idle' ? 'vend__pull--busy' : ''}`} onClick={pull} disabled={!can}>
              {phase === 'idle' ? `pull · 🪙 ${VEND_COST}` : phase === 'coin' ? 'clink…' : 'rattling…'}
            </button>
            <div className="credit-shop" aria-label="buy credits">
              {CREDIT_PACKS.map((pack) => (
                <button key={pack.id} className="credit-pack" onClick={() => void buyCredits(pack.id)} disabled={!!buying || phase !== 'idle'}>
                  <span>{pack.label}</span>
                  <strong>{pack.price}</strong>
                  <em>{pack.credits.toLocaleString()} credits</em>
                  {buying === pack.id && <small>opening Stripe…</small>}
                </button>
              ))}
            </div>
            {payError && <p className="vend__payerr">{payError}</p>}
            <p className="vend__tease">{vendingPool().length} surprises inside · epic and legendary ones glow</p>
            <p className="vend__fine">Secure card checkout by Stripe. Cosmetics only. Duplicates refund credits.</p>
          </>
        )}
      </div>
    </div>
  );
}
