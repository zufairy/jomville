import { useState } from 'react';
import { HANDLE } from '@dovey/shared';
import { patchMe } from '../api';
import { useAppStore } from '../store';
import { Customizer } from './Customizer';
import { GoogleButton } from './GoogleButton';

type Step = 'profile' | 'look' | 'go';

const MALAYSIA_STATES = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Penang',
  'Perak',
  'Perlis',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
  'Kuala Lumpur',
  'Labuan',
  'Putrajaya',
  'Overseas',
];

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const yearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return isoDate(d);
};

/** First-visit flow: name -> look -> your room. Shown until the server marks the user onboarded. */
export function Onboarding() {
  const me = useAppStore((s) => s.me);
  const setMe = useAppStore((s) => s.setMe);
  const [step, setStep] = useState<Step>('profile');
  const [handle, setHandle] = useState(me?.handle ?? '');
  const [state, setState] = useState(me?.state ?? '');
  const [birthdate, setBirthdate] = useState(me?.birthdate ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const saveProfile = async () => {
    const h = handle.trim().toLowerCase();
    if (!HANDLE.test(h)) return setErr('3-16 letters, numbers or _');
    if (!MALAYSIA_STATES.includes(state)) return setErr('choose your state');
    if (!birthdate) return setErr('choose your birthdate');
    setBusy(true);
    const r = await patchMe({ handle: h, state, birthdate });
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
    if ('error' in r) return setErr(r.error);
    setMe(r);
  };

  return (
    <div className="onboard" role="dialog" aria-label="welcome">
      <div className="onboard__card">
        <div className="onboard__dots">
          {(['profile', 'look', 'go'] as Step[]).map((s) => (
            <span key={s} className={`onboard__dot ${s === step ? 'onboard__dot--on' : ''}`} />
          ))}
        </div>

        {step === 'profile' && (
          <>
            <h2>set up your Leypark profile</h2>
            <p className="onboard__p">your name shows above your head. your state helps Leypark feel closer to home.</p>
            <form
              className="onboard__form"
              onSubmit={(e) => {
                e.preventDefault();
                void saveProfile();
              }}
            >
              <label className="onboard__field">
                <span>Name</span>
                <input
                  autoFocus
                  className="onboard__input"
                  value={handle}
                  maxLength={16}
                  onChange={(e) => setHandle(e.target.value)}
                  aria-label="your name"
                  placeholder="aina_kl"
                />
              </label>
              <label className="onboard__field">
                <span>State</span>
                <select className="onboard__input onboard__select" value={state} onChange={(e) => setState(e.target.value)} aria-label="state">
                  <option value="">Choose your state</option>
                  {MALAYSIA_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="onboard__field">
                <span>Birthdate</span>
                <input
                  className="onboard__input"
                  type="date"
                  value={birthdate}
                  min={yearsAgo(100)}
                  max={yearsAgo(13)}
                  onChange={(e) => setBirthdate(e.target.value)}
                  aria-label="birthdate"
                />
              </label>
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
              it's a 10x10 blank floor with your name on the door. decorate it, invite friends, or head out to meet someone new.
            </p>
            {!me.linked && (
              <div className="onboard__google">
                <GoogleButton />
                <span className="onboard__fine">use Google to keep this same account on every device.</span>
              </div>
            )}
            {err && <span className="onboard__err">{err}</span>}
            <button className="btn btn--primary onboard__go" onClick={finish} disabled={busy}>
              walk in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
