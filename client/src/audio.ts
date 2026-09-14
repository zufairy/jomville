/**
 * Tiny synth for UI sounds via Web Audio. No asset files, works offline,
 * unlocked on first user gesture (browsers require it).
 */
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

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.08, at = 0, slideTo?: number) {
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

function noise(dur: number, gain = 0.05, at = 0, hp = 800) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + at;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  /** coin dropped into the slot */
  coin() {
    tone(1900, 0.08, 'square', 0.05);
    tone(2600, 0.12, 'square', 0.04, 0.07);
  },
  /** machine rattling while the capsule rolls */
  rattle() {
    for (let i = 0; i < 6; i++) noise(0.05, 0.035, i * 0.09, 1200);
    tone(140, 0.55, 'sawtooth', 0.02, 0, 90);
  },
  /** capsule drops and bounces */
  drop() {
    tone(320, 0.12, 'triangle', 0.08, 0, 180);
    tone(260, 0.09, 'triangle', 0.05, 0.16, 160);
    tone(220, 0.07, 'triangle', 0.03, 0.28, 150);
  },
  /** capsule pops open */
  pop() {
    tone(500, 0.06, 'sine', 0.1, 0, 900);
    noise(0.08, 0.04, 0, 2000);
  },
  /** reveal chime, grander for rarer items */
  reveal(tier: 0 | 1 | 2 | 3) {
    const base = [523, 659, 784, 1047];
    const n = 3 + tier * 2;
    for (let i = 0; i < n; i++) tone(base[i % 4] * (1 + Math.floor(i / 4)), 0.35, 'sine', 0.06, i * 0.07);
    if (tier >= 2) tone(1568, 1.2, 'sine', 0.05, n * 0.07);
    if (tier === 3) noise(0.6, 0.03, 0.2, 3000);
  },
  /** soft click for popups */
  tap() {
    tone(900, 0.04, 'sine', 0.04);
  },
  /** sad honk for not enough credits */
  nope() {
    tone(220, 0.18, 'square', 0.05, 0, 170);
  },
};
