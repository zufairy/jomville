import { useState } from 'react';
import { HANDLE } from '@dovey/shared';
import { patchMe } from '../api';
import { useAppStore } from '../store';
import { Customizer } from './Customizer';
import { GoogleButton } from './GoogleButton';

type Step = 'name' | 'look' | 'go';

/** First-visit flow: name -> look -> your room. Shown until the server marks the user onboarded. */
export function Onboarding() {
  const me = useAppStore((s) => s.me);
  const setMe = useAppStore((s) => s.setMe);
  const [step, setStep] = useState<Step>('name');
  const [handle, setHandle] = useState(me?.handle ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const saveName = async () => {
    const h = handle.trim().toLowerCase();
    if (!HANDLE.test(h)) return setErr('3-16 letters, numbers or _');
    setBusy(true);
    const r = await patchMe({ handle: h });
    setBusy(false);
    if ('error' in r) return setErr(r.error);
    setMe(r);
    setErr(null);
    setStep('look');
  };

  const finish = async () => {
    setBusy(true);
    const r = await patchMe({ onboarded: true });
    setBusy(false);
    if (!('error' in r)) setMe(r);
  };

  return (
    <div className="onboard" role="dialog" aria-label="welcome">
      <div className="onboard__card">
        <div className="onboard__dots">
          {(['name', 'look', 'go'] as Step[]).map((s) => (
            <span key={s} className={`onboard__dot ${s === step ? 'onboard__dot--on' : ''}`} />
          ))}
        </div>

        {step === 'name' && (
          <>
            <h2>hi! what should we call you?</h2>
            <p className="onboard__p">this shows above your head. you can change it later.</p>
            <form
              className="onboard__form"
              onSubmit={(e) => {
                e.preventDefault();
                void saveName();
              }}
            >
              <input
                autoFocus
                className="onboard__input"
                value={handle}
                maxLength={16}
                onChange={(e) => setHandle(e.target.value)}
                aria-label="your name"
              />
              {err && <span className="onboard__err">{err}</span>}
              <button className="btn btn--primary" type="submit" disabled={busy}>
                next →
              </button>
            </form>
          </>
        )}

        {step === 'look' && (
          <>
            <h2>pick your look</h2>
            <p className="onboard__p">shuffle until it feels like you. more looks drop from capsules later.</p>
            <div className="onboard__cust">
              <Customizer embedded onDone={() => setStep('go')} />
            </div>
          </>
        )}

        {step === 'go' && (
          <>
            <h2>your room is ready, {me.handle}</h2>
            <p className="onboard__p">
              it's a 10x10 blank floor with your name on the door. tap the hammer to decorate, or tap 🎲 to visit someone busy.
            </p>
            {!me.linked && (
              <div className="onboard__google">
                <GoogleButton />
                <span className="onboard__fine">optional. keeps your room and looks on every device.</span>
              </div>
            )}
            <button className="btn btn--primary onboard__go" onClick={finish} disabled={busy}>
              🚪 walk in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
