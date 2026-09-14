/** Kitchen sounds: a tiny Web Audio synth (no assets), unlocked by the first gesture. */
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.06, at = 0, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.04, at = 0, hp = 800, lp = 12000) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + at;
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const high = a.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = hp;
  const low = a.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = lp;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(high).connect(low).connect(g).connect(a.destination);
  src.start(t0);
}

export const ksfx = {
  /** knife on the board */
  chop() {
    noise(0.04, 0.05, 0, 1800);
    tone(420, 0.04, 'square', 0.02);
  },
  /** soft sizzle from a lit stove */
  sizzle() {
    noise(0.5, 0.012, 0, 3000, 9000);
  },
  /** pick up / put down */
  grab() {
    tone(660, 0.05, 'triangle', 0.05, 0, 880);
  },
  /** order served: the brass bell */
  serve() {
    tone(1568, 0.5, 'sine', 0.06);
    tone(2349, 0.35, 'sine', 0.03, 0.01);
  },
  /** chopping finished */
  ready() {
    tone(880, 0.08, 'sine', 0.05);
    tone(1175, 0.12, 'sine', 0.05, 0.07);
  },
  /** that does nothing here */
  nope() {
    tone(220, 0.16, 'square', 0.045, 0, 170);
  },
  dash() {
    noise(0.14, 0.04, 0, 600, 3000);
  },
  /** soup burnt / order missed */
  burn() {
    tone(330, 0.12, 'square', 0.04);
    tone(247, 0.2, 'square', 0.04, 0.13);
  },
  bin() {
    tone(180, 0.08, 'triangle', 0.06, 0, 120);
    noise(0.06, 0.03, 0.02, 400, 2000);
  },
};
