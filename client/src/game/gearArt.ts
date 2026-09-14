import type { AvatarConfig } from '@dovey/shared';

/**
 * Art for gear (eyewear, helmets, auras, back pieces), drawn with Canvas2D on
 * top of the sprite-sheet avatar. Every painter works in the avatar's 64px
 * frame (feet at the bottom, head near the top) and gets the facing and a loop
 * phase t in [0, 1), so the same code draws UI previews live and bakes the
 * in-game sprite sheets. Sheets are baked once per look and cached; nothing is
 * allocated per game tick.
 */

export const GEAR_FRAMES = 8;
export const GEAR_FRAME_MS = 110;
/** a gear cell is larger than the 64px body frame so wings, halos and auras fit */
export const GEAR_CELL = 96;
/** where the body frame's top-left sits inside a gear cell */
export const GEAR_OX = 16;
export const GEAR_OY = 24;
/** sheets are drawn at 2x for crisp edges */
export const GEAR_RES = 2;

export type GearLayer = 'back' | 'front';
type Ctx = CanvasRenderingContext2D;
/** t: idle loop phase in [0, 1); u: progress of a "use" in [0, 1], 0 when idle */
type Painter = (c: Ctx, dir: number, t: number, u: number) => void;

const TAU = Math.PI * 2;
const INK = '#3b2a2a';
/** head landmarks in frame pixels, on the pack's head facing the viewer */
const H = { x: 32, top: 12, eye: 25, chin: 33 };
/** facings: 0 away, 1 right, 2 toward the viewer, 3 left */
const side = (dir: number) => (dir === 1 ? 1 : dir === 3 ? -1 : 0);
const wave = (t: number, k = 1, phase = 0) => Math.sin((t * k + phase) * TAU);
const pulse = (t: number, k = 1, phase = 0) => 0.5 + 0.5 * wave(t, k, phase);
/** 0 at rest, swelling to 1 mid-use and back to 0 as the use ends */
const boost = (u: number) => (u > 0 ? Math.sin(Math.PI * Math.min(1, u)) : 0);

// ---- drawing helpers

function fillStroke(c: Ctx, fill?: string | CanvasGradient, stroke?: string, lw = 1) {
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.lineWidth = lw;
    c.strokeStyle = stroke;
    c.stroke();
  }
}

function path(c: Ctx, pts: number[]) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
}

function poly(c: Ctx, pts: number[], fill?: string | CanvasGradient, stroke?: string, lw = 1) {
  path(c, pts);
  fillStroke(c, fill, stroke, lw);
}

function ell(c: Ctx, x: number, y: number, rx: number, ry: number, fill?: string | CanvasGradient, stroke?: string, lw = 1, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  fillStroke(c, fill, stroke, lw);
}

function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill?: string | CanvasGradient, stroke?: string, lw = 1) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  fillStroke(c, fill, stroke, lw);
}

function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, lw = 1) {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.lineWidth = lw;
  c.strokeStyle = color;
  c.lineCap = 'round';
  c.stroke();
}

function lin(c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Array<[number, string]>): CanvasGradient {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

/** soft radial glow; rgb as "r,g,b" */
function glow(c: Ctx, x: number, y: number, r: number, rgb: string, a: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

/** four-point twinkle */
function star4(c: Ctx, x: number, y: number, r: number, color: string) {
  if (r <= 0.05) return;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
}

function star5(c: Ctx, x: number, y: number, r: number, fill: string, stroke?: string) {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  poly(c, pts, fill, stroke, 0.8);
}

function heart(c: Ctx, x: number, y: number, s: number, fill: string, stroke?: string) {
  c.beginPath();
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.7, y - s * 1.3, x, y - s * 0.35);
  c.bezierCurveTo(x + s * 0.7, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
  fillStroke(c, fill, stroke, 0.8);
}

/** a bright band that sweeps across a box once per loop, then rests: the "shine" */
function glint(c: Ctx, x: number, y: number, w: number, h: number, t: number, a = 0.9, r = 0) {
  const k = (t * 1.5) % 1.5;
  if (k > 1) return;
  const p = x - 4 + (w + 8) * k;
  c.save();
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.clip();
  c.fillStyle = `rgba(255,255,255,${a})`;
  path(c, [p, y - 1, p + 2.5, y - 1, p - 1.5, y + h + 1, p - 4, y + h + 1]);
  c.fill();
  c.restore();
}

// ---- eyewear

/** Two lenses facing the viewer, one in profile, nothing from behind. `w` squashes lenses in profile. */
function specs(c: Ctx, dir: number, lens: (x: number, y: number, w: number) => void, frame = INK) {
  if (dir === 0) return;
  const y = H.eye;
  if (dir === 2) {
    lens(H.x - 4.5, y, 1);
    lens(H.x + 4.5, y, 1);
    line(c, H.x - 1.2, y - 1, H.x + 1.2, y - 1, frame, 1);
    return;
  }
  const s = side(dir);
  line(c, H.x + s * 3, y - 1, H.x - s * 4, y - 1.5, frame, 0.9);
  lens(H.x + s * 5, y, 0.55);
}

const RUBY: Array<[number, string]> = [[0, '#ff9a8a'], [0.45, '#e0282f'], [1, '#7a0f1c']];
const SUNSET: Array<[number, string]> = [[0, '#d6a3ff'], [0.5, '#ff8a5b'], [1, '#f9d66b']];

const FACE: Record<string, Painter> = {
  'face.round_specs': (c, d) => specs(c, d, (x, y, w) => ell(c, x, y, 3.1 * w, 2.8, 'rgba(210,240,255,0.35)', INK, 1.1)),
  'face.shades': (c, d) =>
    specs(c, d, (x, y, w) => {
      rrect(c, x - 3.3 * w, y - 2.3, 6.6 * w, 4.6, 1.3, '#1c1c1c', INK, 0.9);
      ell(c, x - 1.4 * w, y - 1, 0.9 * w, 0.6, 'rgba(255,255,255,0.8)');
    }),
  'face.heart_shades': (c, d) =>
    specs(
      c,
      d,
      (x, y, w) => {
        c.save();
        c.translate(x, y);
        c.scale(w, 1);
        heart(c, 0, 0.3, 3, '#ff6f91', INK);
        c.restore();
      },
      '#c0476d',
    ),
  'face.three_d': (c, d) =>
    specs(c, d, (x, y, w) => rrect(c, x - 3.2 * w, y - 2.2, 6.4 * w, 4.4, 0.6, x < H.x ? 'rgba(224,60,60,0.8)' : 'rgba(70,200,230,0.8)', '#fff', 1.1), '#fff'),
  'face.star_shades': (c, d, t) => {
    specs(
      c,
      d,
      (x, y, w) => {
        c.save();
        c.translate(x, y);
        c.scale(w, 1);
        star5(c, 0, 0, 3.6, '#f9d66b', INK);
        c.restore();
      },
      '#c98f22',
    );
    if (d !== 0) star4(c, H.x + 9, H.eye - 5, 2.2 * pulse(t), '#fff6c2');
  },
  'face.pixel_shades': (c, d) => {
    if (d === 0) return;
    const y = H.eye - 2;
    c.fillStyle = '#111';
    if (d === 2) {
      c.fillRect(H.x - 9, y, 18, 2);
      c.fillRect(H.x - 8, y + 2, 6, 2);
      c.fillRect(H.x + 2, y + 2, 6, 2);
      c.fillRect(H.x - 7, y + 4, 4, 1);
      c.fillRect(H.x + 3, y + 4, 4, 1);
      c.fillStyle = '#fff';
      c.fillRect(H.x - 7, y + 2, 1, 1);
      c.fillRect(H.x + 3, y + 2, 1, 1);
      return;
    }
    const s = side(d);
    c.fillRect(H.x + (s > 0 ? 1 : -9), y, 8, 2);
    c.fillRect(H.x + (s > 0 ? 4 : -8), y + 2, 4, 2);
  },
  'face.monocle': (c, d, t) => {
    if (d === 0) return;
    const x = d === 2 ? H.x + 4.5 : H.x + side(d) * 5;
    const w = d === 2 ? 1 : 0.55;
    ell(c, x, H.eye, 3.2 * w, 3.2, 'rgba(220,240,255,0.3)', '#e0b23c', 1.3);
    c.beginPath();
    c.moveTo(x + 2.5 * w, H.eye + 2.5);
    c.quadraticCurveTo(x + 4, H.eye + 9, x + 1, H.eye + 13);
    c.lineWidth = 0.7;
    c.strokeStyle = '#e0b23c';
    c.stroke();
    star4(c, x - 1.5 * w, H.eye - 1.5, 0.6 + 1.6 * Math.max(0, wave(t)), '#fff');
  },
  'face.aviator': (c, d, t) =>
    specs(
      c,
      d,
      (x, y, w) => {
        rrect(c, x - 3.6 * w, y - 2.6, 7.2 * w, 5.4, 2, lin(c, 0, y - 2.6, 0, y + 2.8, [[0, '#ffe08a'], [0.55, '#f0a35e'], [1, '#b8572a']]), '#c98f22', 1);
        glint(c, x - 3.6 * w, y - 2.6, 7.2 * w, 5.4, t, 0.9, 2);
      },
      '#c98f22',
    ),
  'face.ski_goggles': (c, d, t) => {
    if (d === 0) {
      line(c, H.x - 10, H.eye - 1, H.x + 10, H.eye - 1, '#2c3e63', 2.2);
      return;
    }
    if (d === 2) {
      line(c, H.x - 10, H.eye, H.x + 10, H.eye, '#2c3e63', 2.2);
      rrect(c, H.x - 7.5, H.eye - 3.2, 15, 6.4, 3, lin(c, 0, H.eye - 3, 0, H.eye + 3, SUNSET), INK, 1.1);
      glint(c, H.x - 7.5, H.eye - 3.2, 15, 6.4, t, 0.9, 3);
      return;
    }
    const s = side(d);
    line(c, H.x + s * 6, H.eye, H.x - s * 6, H.eye, '#2c3e63', 2.2);
    rrect(c, H.x + (s > 0 ? 2 : -7), H.eye - 3.2, 5, 6.4, 2.5, lin(c, 0, H.eye - 3, 0, H.eye + 3, SUNSET), INK, 1);
  },
  'face.masquerade': (c, d, t) => {
    if (d === 0) return;
    const y = H.eye;
    const mask = (x0: number, w: number) => {
      c.save();
      c.translate(x0, y);
      c.scale(w, 1);
      c.beginPath();
      c.moveTo(-9, -1);
      c.quadraticCurveTo(-8, -5, -3, -3.5);
      c.quadraticCurveTo(0, -2, 3, -3.5);
      c.quadraticCurveTo(8, -5, 9, -1);
      c.quadraticCurveTo(7, 4, 2.5, 2.5);
      c.quadraticCurveTo(0, 1.5, -2.5, 2.5);
      c.quadraticCurveTo(-7, 4, -9, -1);
      c.closePath();
      fillStroke(c, '#7a3fb8', '#e0b23c', 0.9);
      ell(c, -4.5, -0.3, 2.2, 1.4, '#1c1030');
      ell(c, 4.5, -0.3, 2.2, 1.4, '#1c1030');
      c.restore();
    };
    if (d === 2) mask(H.x, 1);
    else mask(H.x + side(d) * 3, 0.5);
    c.save();
    c.translate(d === 3 ? H.x - 8 : H.x + 8, y - 3);
    c.rotate(0.5 + wave(t) * 0.1);
    ell(c, 0, -5, 1.6, 5, '#d6a3ff', '#9b6bdc', 0.6);
    c.restore();
  },
  'face.vr_visor': (c, d, t) => {
    if (d === 0) {
      line(c, H.x - 10, H.eye - 1, H.x + 10, H.eye - 1, '#1c1c1c', 2);
      return;
    }
    const [x, y, w, h] = d === 2 ? [H.x - 8.5, H.eye - 4, 17, 8] : [H.x + (side(d) > 0 ? 1 : -9), H.eye - 4, 8, 8];
    glow(c, x + w / 2, y + h / 2, 12, '94,242,255', 0.25 + 0.15 * pulse(t, 2));
    rrect(c, x, y, w, h, 2, '#141824', '#5ef2ff', 1);
    c.fillStyle = 'rgba(94,242,255,0.25)';
    c.fillRect(x + 1, y + 1, w - 2, h - 2);
    c.fillStyle = 'rgba(94,242,255,0.9)';
    c.fillRect(x + 1, y + 1 + (h - 3) * t, w - 2, 0.9);
  },
  /** a gold-rimmed ruby visor that shines and fires twin beams */
  'face.ruby_visor': (c, d, t, u) => {
    if (d === 0) {
      line(c, H.x - 10, H.eye - 1, H.x + 10, H.eye - 1, '#c98f22', 2.4);
      return;
    }
    // in use: a full-power beam; idle: a short flicker once per loop
    const power = boost(u);
    const beam = power > 0 || (t > 0.55 && t < 0.72);
    const reach = 24 + 40 * power;
    const beamW = 2.2 + 3 * power;
    glow(c, H.x + side(d) * 4, H.eye, 13 + 8 * power, '255,40,50', Math.min(1, 0.28 + 0.22 * pulse(t, 2) + 0.4 * power));
    if (d === 2) {
      rrect(c, H.x - 9.5, H.eye - 3.6, 19, 7.2, 3.4, '#2a1a1a', '#e0b23c', 1.1);
      rrect(c, H.x - 8, H.eye - 2.2, 16, 4.4, 2.2, lin(c, 0, H.eye - 2.2, 0, H.eye + 2.2, RUBY));
      glint(c, H.x - 8, H.eye - 2.2, 16, 4.4, t, 0.95, 2.2);
      if (beam)
        for (const s of [-1, 1]) {
          c.save();
          c.globalAlpha = 0.75;
          line(c, H.x + s * 5, H.eye + 2, H.x + s * (14 + 10 * power), H.eye + 2 + reach, '#ff3b3b', beamW);
          line(c, H.x + s * 5, H.eye + 2, H.x + s * (14 + 10 * power), H.eye + 2 + reach, '#ffd0c8', beamW * 0.35);
          c.restore();
        }
      return;
    }
    const s = side(d);
    rrect(c, H.x + (s > 0 ? 0 : -10), H.eye - 3.6, 10, 7.2, 3, '#2a1a1a', '#e0b23c', 1);
    rrect(c, H.x + (s > 0 ? 3 : -9), H.eye - 2.2, 6, 4.4, 2, lin(c, 0, H.eye - 2.2, 0, H.eye + 2.2, RUBY));
    glint(c, H.x + (s > 0 ? 3 : -9), H.eye - 2.2, 6, 4.4, t, 0.95, 2);
    if (beam) {
      c.save();
      c.globalAlpha = 0.8;
      line(c, H.x + s * 9, H.eye, H.x + s * (40 + 30 * power), H.eye + 2, '#ff3b3b', beamW + 0.2);
      line(c, H.x + s * 9, H.eye, H.x + s * (40 + 30 * power), H.eye + 2, '#ffd0c8', beamW * 0.35);
      c.restore();
    }
  },
  'face.cyber_mask': (c, d, t) => {
    if (d === 0) return;
    const y = H.eye + 3;
    if (d === 2) {
      poly(c, [H.x - 7, y, H.x + 7, y, H.x + 6, y + 6, H.x + 2, y + 8, H.x - 2, y + 8, H.x - 6, y + 6], '#7d7a91', INK, 1);
      const lit = Math.floor(t * 5);
      for (let i = 0; i < 5; i++) {
        const x = H.x - 4 + i * 2;
        if (i === lit) glow(c, x, y + 3, 4, '94,242,255', 0.7);
        ell(c, x, y + 3, 0.7, 0.7, i === lit ? '#5ef2ff' : '#2c3e50');
      }
      return;
    }
    const s = side(d);
    poly(c, [H.x + s, y, H.x + s * 8, y + 1, H.x + s * 7, y + 6, H.x + s, y + 8], '#7d7a91', INK, 1);
    glow(c, H.x + s * 5, y + 3, 4, '94,242,255', 0.4 + 0.4 * pulse(t, 3));
    ell(c, H.x + s * 5, y + 3, 0.8, 0.8, '#5ef2ff');
  },
  'face.laser_eyes': (c, d, t, u) => {
    if (d === 0) return;
    const power = boost(u);
    const a = Math.min(1, 0.55 + 0.45 * pulse(t, 2) + power);
    const eyes = d === 2 ? [H.x - 4.5, H.x + 4.5] : [H.x + side(d) * 5];
    for (const x of eyes) {
      glow(c, x, H.eye, 7, '255,40,40', a);
      ell(c, x, H.eye, 1.6, 1.3, '#fff');
    }
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = a;
    if (d === 2) {
      for (const x of eyes) {
        const s = x < H.x ? -1 : 1;
        line(c, x, H.eye, x + s * (10 + 8 * power), H.eye + 34 + 30 * power, '#ff2a2a', 2.6 + 3 * power);
        line(c, x, H.eye, x + s * (10 + 8 * power), H.eye + 34 + 30 * power, '#ffe0d8', 0.8 + power);
      }
    } else {
      const s = side(d);
      line(c, eyes[0], H.eye, eyes[0] + s * (42 + 30 * power), H.eye + 3, '#ff2a2a', 2.8 + 3 * power);
      line(c, eyes[0], H.eye, eyes[0] + s * (42 + 30 * power), H.eye + 3, '#ffe0d8', 0.9 + power);
    }
    c.restore();
  },
  'face.mustache': (c, d, t) => {
    if (d === 0) return;
    const y = H.eye + 5.5;
    const wiggle = wave(t) * 0.08;
    const half = (x: number, s: number) => {
      c.save();
      c.translate(x, y);
      c.rotate(s * wiggle);
      c.scale(s, 1);
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(3, -2.5, 6, -0.5);
      c.quadraticCurveTo(7.5, 0.8, 6.5, 2);
      c.quadraticCurveTo(5.5, 0.5, 3.5, 1.4);
      c.quadraticCurveTo(1.5, 2, 0, 1.2);
      c.closePath();
      fillStroke(c, '#4a2f1d', INK, 0.6);
      c.restore();
    };
    if (d === 2) {
      half(H.x, 1);
      half(H.x, -1);
    } else half(H.x + side(d) * 3, side(d));
  },
  'face.clown_nose': (c, d, t) => {
    if (d === 0) return;
    const x = d === 2 ? H.x : H.x + side(d) * 7;
    const r = 2.4 + 0.25 * pulse(t, 2);
    ell(c, x, H.eye + 3, r, r, lin(c, x - r, H.eye, x + r, H.eye + 6, [[0, '#ff7a7a'], [1, '#c0182a']]), INK, 0.8);
    ell(c, x - 0.8, H.eye + 2.2, 0.7, 0.5, 'rgba(255,255,255,0.8)');
  },
  /** headband above the eyes and a wrap below them, tails fluttering behind */
  'face.ninja_mask': (c, d, t) => {
    const band = '#2c2f3a';
    const tail = wave(t) * 2;
    rrect(c, H.x - 10, H.eye - 7, 20, 3.5, 1.5, band, INK, 0.9);
    if (d === 0) {
      poly(c, [H.x + 2, H.eye - 5, H.x + 9, H.eye + 4 + tail, H.x + 6, H.eye + 6 + tail], band, INK, 0.7);
      return;
    }
    if (d === 2) {
      rrect(c, H.x - 8, H.eye + 2.5, 16, 7, 3, band, INK, 0.9);
      return;
    }
    const s = side(d);
    rrect(c, H.x + (s > 0 ? -2 : -8), H.eye + 2.5, 10, 7, 3, band, INK, 0.9);
    poly(c, [H.x - s * 9, H.eye - 6, H.x - s * 16, H.eye + tail, H.x - s * 14, H.eye + 2 + tail], band, INK, 0.7);
  },
  'face.hologram': (c, d, t) => {
    if (d === 0) return;
    const [x, w] = d === 2 ? [H.x - 9, 18] : [H.x + (side(d) > 0 ? 1 : -9), 8];
    c.save();
    // the projection glitches out for a moment each loop
    c.globalAlpha = t > 0.4 && t < 0.46 ? 0.25 : 1;
    glow(c, x + w / 2, H.eye, 12, '94,242,255', 0.3);
    poly(c, [x, H.eye - 3, x + w, H.eye - 3, x + w - 1.5, H.eye + 3, x + 1.5, H.eye + 3], 'rgba(94,242,255,0.35)', '#8ff7ff', 0.8);
    for (let i = 0; i < 3; i++) {
      const yy = H.eye - 2 + ((t * 6 + i) % 3) * 2;
      line(c, x + 1, yy, x + w - 1, yy, 'rgba(200,255,255,0.7)', 0.5);
    }
    c.restore();
  },
  'face.dragon_eyes': (c, d, t) => {
    if (d === 0) return;
    const eyes = d === 2 ? [H.x - 4.5, H.x + 4.5] : [H.x + side(d) * 5];
    const open = t > 0.9 ? 0.3 : 1;
    for (const x of eyes) {
      glow(c, x, H.eye, 6, '120,255,120', 0.55);
      ell(c, x, H.eye, 2.4, 1.8 * open, '#b8ff5a', '#2f6b3f', 0.6);
      ell(c, x, H.eye, 0.5, 1.6 * open, '#123d24');
    }
  },
  'face.diamond_shades': (c, d, t) => {
    specs(
      c,
      d,
      (x, y, w) => {
        c.save();
        c.translate(x, y);
        c.scale(w, 1);
        poly(c, [0, -3.6, 3.8, -0.4, 0, 3.4, -3.8, -0.4], lin(c, -4, -4, 4, 4, [[0, '#e6fbff'], [0.5, '#8fd0f0'], [1, '#d6a3ff']]), '#9aa7b4', 0.9);
        line(c, -3.8, -0.4, 3.8, -0.4, 'rgba(255,255,255,0.7)', 0.5);
        c.restore();
      },
      '#dfe6ee',
    );
    if (d === 0) return;
    const glints: Array<[number, number]> = [
      [H.x - 8, 0],
      [H.x + 9, 0.5],
      [H.x + 1, 0.25],
    ];
    for (const [px, p] of glints) star4(c, px, H.eye - 5, 2.2 * Math.max(0, wave(t, 2, p)), '#ffffff');
  },
};

// ---- helmets and headgear

const STEEL: Array<[number, string]> = [[0, '#8a97a6'], [0.45, '#eef3f7'], [1, '#6b7684']];
const GOLD: Array<[number, string]> = [[0, '#fff1a8'], [0.4, '#f2b632'], [1, '#a8741c']];

const HELM: Record<string, Painter> = {
  'helm.cat_ears': (c, d, t) => {
    const twitch = t > 0.8 ? -0.25 : 0;
    const ear = (x: number, tilt: number) => {
      c.save();
      c.translate(x, H.top + 3);
      c.rotate(tilt);
      poly(c, [-3.5, 0, 0, -7, 3.5, 0], '#3b2a2a', INK, 0.8);
      poly(c, [-1.8, -0.5, 0, -4.6, 1.8, -0.5], '#ff9ab8');
      c.restore();
    };
    if (d === 1 || d === 3) {
      const s = side(d);
      ear(H.x - s * 2, -0.1 * s);
      ear(H.x + s * 3, 0.15 * s + twitch);
      return;
    }
    ear(H.x - 6.5, -0.3 + twitch);
    ear(H.x + 6.5, 0.3);
  },
  'helm.bunny_ears': (c, d, t) => {
    const flop = wave(t) * 0.08;
    const ear = (x: number, tilt: number) => {
      c.save();
      c.translate(x, H.top + 3);
      c.rotate(tilt);
      ell(c, 0, -8, 2.6, 8.5, '#fff7e6', INK, 0.9);
      ell(c, 0, -8, 1.2, 6.5, '#ffb3c6');
      c.restore();
    };
    if (d === 1 || d === 3) {
      const s = side(d);
      ear(H.x - s, -0.2 * s + flop);
      ear(H.x + s * 2, 0.05 * s - flop);
      return;
    }
    ear(H.x - 4, -0.22 + flop);
    ear(H.x + 4, 0.22 - flop);
  },
  'helm.devil_horns': (c, d) => {
    const horn = (x: number, s: number) => {
      c.beginPath();
      c.moveTo(x - 1.8 * s, H.top + 3);
      c.quadraticCurveTo(x - s, H.top - 4, x + 2.5 * s, H.top - 6);
      c.quadraticCurveTo(x + 0.5 * s, H.top - 1, x + 1.8 * s, H.top + 3);
      c.closePath();
      fillStroke(c, '#e0553d', '#7d2b34', 0.8);
    };
    if (d === 1 || d === 3) return horn(H.x + side(d) * 2, side(d));
    horn(H.x - 6, -1);
    horn(H.x + 6, 1);
  },
  'helm.halo': (c, _d, t) => {
    const y = H.top - 5 + wave(t) * 1.2;
    glow(c, H.x, y, 12, '249,214,107', 0.35 + 0.25 * pulse(t));
    ell(c, H.x, y, 8, 2.4, undefined, '#f2b632', 2.2);
    ell(c, H.x, y, 8, 2.4, undefined, '#fff6c2', 0.8);
  },
  'helm.viking': (c, d) => {
    const horn = (x: number, k: number) => {
      c.beginPath();
      c.moveTo(x, H.top + 9);
      c.quadraticCurveTo(x + k * 9, H.top + 8, x + k * 8, H.top - 3);
      c.quadraticCurveTo(x + k * 5, H.top + 4, x, H.top + 5);
      c.closePath();
      fillStroke(c, '#fff1d6', '#9c6242', 0.8);
    };
    if (d === 1 || d === 3) horn(H.x - side(d) * 6, -side(d));
    else {
      horn(H.x - 9, -1);
      horn(H.x + 9, 1);
    }
    c.beginPath();
    c.moveTo(H.x - 10, H.top + 10);
    c.quadraticCurveTo(H.x - 10, H.top - 2, H.x, H.top - 2);
    c.quadraticCurveTo(H.x + 10, H.top - 2, H.x + 10, H.top + 10);
    c.closePath();
    fillStroke(c, lin(c, 0, H.top - 2, 0, H.top + 10, [[0, '#dfe6ee'], [1, '#8a97a6']]), INK, 1);
    rrect(c, H.x - 10.5, H.top + 8, 21, 3, 1, '#9c6242', INK, 0.8);
    for (const k of [-6, 0, 6]) ell(c, H.x + k, H.top + 9.5, 0.7, 0.7, '#f9d66b');
  },
  'helm.wizard': (c, _d, t) => {
    const tip = H.x + 3 + wave(t) * 2.5;
    c.beginPath();
    c.moveTo(H.x - 9, H.top + 6);
    c.quadraticCurveTo(H.x - 2, H.top - 6, tip, H.top - 18);
    c.quadraticCurveTo(H.x + 3, H.top - 4, H.x + 9, H.top + 6);
    c.closePath();
    fillStroke(c, lin(c, 0, H.top - 18, 0, H.top + 6, [[0, '#9b6bdc'], [1, '#4b2a86']]), INK, 1);
    ell(c, H.x, H.top + 6, 12, 2.6, '#5b3a9a', INK, 1);
    const stars: Array<[number, number, number]> = [
      [H.x - 2, H.top - 3, 0],
      [H.x + 3, H.top - 9, 0.4],
      [H.x - 4, H.top + 2, 0.7],
    ];
    for (const [x, y, p] of stars) star4(c, x, y, 0.8 + 1.2 * pulse(t, 1, p), '#f9d66b');
  },
  'helm.pumpkin': (c, d, t) => {
    const cy = H.top + 10;
    ell(c, H.x, cy, 12, 11, lin(c, 0, cy - 11, 0, cy + 11, [[0, '#ffb454'], [1, '#d2621e']]), INK, 1.1);
    for (const k of [-6, 0, 6]) ell(c, H.x + k, cy, 3.2, 10.5, undefined, 'rgba(122,56,20,0.6)', 0.6);
    rrect(c, H.x - 1.2, cy - 14, 2.4, 4, 1, '#4f7a2c', INK, 0.6);
    if (d === 0) return;
    const flick = 0.7 + 0.3 * pulse(t, 3);
    c.save();
    c.translate(d === 2 ? H.x : H.x + side(d) * 6, cy);
    c.scale(d === 2 ? 1 : 0.45, 1);
    glow(c, 0, 1, 11, '255,210,90', 0.35 * flick);
    c.fillStyle = `rgba(255,226,120,${flick})`;
    path(c, [-6, -3, -2.5, -3, -4.2, -6]);
    c.fill();
    path(c, [6, -3, 2.5, -3, 4.2, -6]);
    c.fill();
    path(c, [-7, 3, -3, 5, 0, 3.5, 3, 5, 7, 3, 4, 7.5, 0, 6, -4, 7.5]);
    c.fill();
    c.restore();
  },
  'helm.knight': (c, d, t) => {
    const x = H.x - 11;
    const y = H.top - 3;
    const w = 22;
    const h = 27;
    c.save();
    c.translate(H.x, y + 2);
    c.rotate(wave(t) * 0.12);
    ell(c, 0, -3, 3, 5.5, '#e0553d', '#7d2b34', 0.8);
    c.restore();
    rrect(c, x, y, w, h, 8, lin(c, x, 0, x + w, 0, STEEL), INK, 1.2);
    if (d === 2) {
      rrect(c, H.x - 8, H.eye - 2, 16, 3, 1, '#1c1c1c');
      line(c, H.x, H.eye + 2, H.x, y + h - 2, 'rgba(59,42,42,0.5)', 0.8);
      for (const k of [-4, 0, 4]) for (const r of [0, 2.5]) ell(c, H.x + k, H.eye + 5 + r, 0.5, 0.5, '#1c1c1c');
    } else if (d !== 0) {
      rrect(c, H.x + (side(d) > 0 ? 1 : -10), H.eye - 2, 9, 3, 1, '#1c1c1c');
    } else line(c, H.x, y + 3, H.x, y + h - 3, 'rgba(59,42,42,0.45)', 1);
    glint(c, x, y, w, h, t, 0.55, 8);
  },
  'helm.astronaut': (c, d, t) => {
    const cx = H.x;
    const cy = H.eye - 2;
    const r = 13;
    ell(c, cx, cy + 12, 11, 3.5, '#e6e2ea', INK, 1);
    ell(c, cx, cy, r, r, 'rgba(170,215,255,0.22)', '#fff', 1.6);
    ell(c, cx, cy, r, r, undefined, INK, 0.7);
    if (d === 2) ell(c, cx, cy + 2, 9, 7, 'rgba(249,214,107,0.12)');
    const a = t * TAU - Math.PI * 0.85;
    c.save();
    c.beginPath();
    c.arc(cx, cy, r - 2, 0, TAU);
    c.clip();
    c.beginPath();
    c.arc(cx, cy, r - 3.5, a - 0.5, a);
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineCap = 'round';
    c.stroke();
    c.restore();
    ell(c, cx - 5, cy - 6, 2.2, 1.2, 'rgba(255,255,255,0.8)', undefined, 1, -0.6);
    const blink = t < 0.5;
    line(c, cx + 7, cy - 11, cx + 9, cy - 16, '#b7b3c4', 1);
    if (blink) glow(c, cx + 9, cy - 16.5, 4, '255,95,162', 0.6);
    ell(c, cx + 9, cy - 16.5, 1.3, 1.3, blink ? '#ff5fa2' : '#7d2b34');
  },
  'helm.samurai': (c, d, t) => {
    c.beginPath();
    c.moveTo(H.x - 11, H.top + 9);
    c.quadraticCurveTo(H.x - 11, H.top - 4, H.x, H.top - 4);
    c.quadraticCurveTo(H.x + 11, H.top - 4, H.x + 11, H.top + 9);
    c.closePath();
    fillStroke(c, lin(c, 0, H.top - 4, 0, H.top + 9, [[0, '#b83a3a'], [1, '#5c1616']]), INK, 1);
    for (const k of [-1, 1]) poly(c, [H.x + k * 10, H.top + 7, H.x + k * 15, H.top + 16, H.x + k * 11, H.top + 18, H.x + k * 8, H.top + 9], '#7d2b34', INK, 0.8);
    rrect(c, H.x - 11.5, H.top + 7, 23, 2.6, 1, '#e0b23c', INK, 0.6);
    if (d === 0) return;
    const cx = H.x + side(d) * 3;
    const sx = d === 2 ? 1 : 0.5;
    c.save();
    c.translate(cx, H.top - 3);
    c.scale(sx, 1);
    c.beginPath();
    c.moveTo(-1, 0);
    c.quadraticCurveTo(-9, -3, -10, -12);
    c.quadraticCurveTo(-5, -5, 0, -3);
    c.quadraticCurveTo(5, -5, 10, -12);
    c.quadraticCurveTo(9, -3, 1, 0);
    c.closePath();
    fillStroke(c, lin(c, -10, 0, 10, 0, [[0, '#c98f22'], [0.5, '#fff1a8'], [1, '#c98f22']]), INK, 0.7);
    c.restore();
    star4(c, cx + 9 * sx, H.top - 14, 1.8 * Math.max(0, wave(t)), '#fff6c2');
  },
  'helm.robot': (c, d, t) => {
    const x = H.x - 11;
    const y = H.top - 3;
    const w = 22;
    const h = 25;
    const bulb = t < 0.5;
    line(c, H.x, y, H.x, y - 7, '#7d7a91', 1.2);
    if (bulb) glow(c, H.x, y - 8, 6, '255,95,95', 0.6);
    ell(c, H.x, y - 8, 1.8, 1.8, bulb ? '#ff5f5f' : '#7d2b34', INK, 0.6);
    rrect(c, x, y, w, h, 4, lin(c, x, 0, x + w, 0, [[0, '#9aa7b4'], [0.5, '#dfe6ee'], [1, '#7d8a98']]), INK, 1.2);
    ell(c, x - 0.5, y + h / 2, 1.6, 3.2, '#b7b3c4', INK, 0.7);
    ell(c, x + w + 0.5, y + h / 2, 1.6, 3.2, '#b7b3c4', INK, 0.7);
    const open = !(t > 0.86 && t < 0.94);
    const led = (lx: number) => {
      if (open) glow(c, lx, H.eye - 0.5, 5, '94,242,255', 0.45);
      rrect(c, lx - 2.5, H.eye - 2, 5, open ? 3 : 0.8, 1, '#5ef2ff');
    };
    if (d === 2) {
      led(H.x - 4.5);
      led(H.x + 4.5);
      rrect(c, H.x - 5, H.eye + 5, 10, 3, 1, '#2c3e50');
      for (let i = 0; i < 4; i++) line(c, H.x - 3.5 + i * 2.3, H.eye + 5.4, H.x - 3.5 + i * 2.3, H.eye + 7.6, '#9aa7b4', 0.6);
    } else if (d !== 0) led(H.x + side(d) * 6);
    else for (let i = 0; i < 3; i++) line(c, H.x - 5, H.eye + i * 3, H.x + 5, H.eye + i * 3, '#6b7684', 1);
  },
  'helm.crown': (c, _d, t) => {
    const y = H.top - 1;
    const x0 = H.x - 9;
    poly(c, [x0, y + 7, x0, y - 1, x0 + 4.5, y + 3, H.x, y - 4, H.x + 4.5, y + 3, H.x + 9, y - 1, H.x + 9, y + 7], lin(c, 0, y - 4, 0, y + 7, [[0, '#fff1a8'], [0.5, '#f2b632'], [1, '#c98f22']]), INK, 1);
    ell(c, H.x, y + 3.5, 1.5, 1.5, '#e0282f', INK, 0.5);
    ell(c, x0 + 3, y + 4.5, 1, 1, '#3f8fe0');
    ell(c, H.x + 6, y + 4.5, 1, 1, '#3f8fe0');
    const tips: Array<[number, number, number]> = [
      [x0, y - 1, 0],
      [H.x, y - 4, 0.33],
      [H.x + 9, y - 1, 0.66],
    ];
    for (const [px, py, p] of tips) star4(c, px, py - 1, 2 * Math.max(0, wave(t, 1, p)), '#fff');
  },
  /** red armor with a gold faceplate, glowing eye slits and a sweeping shine */
  'helm.crimson_armor': (c, d, t, u) => {
    const x = H.x - 11.5;
    const y = H.top - 4;
    const w = 23;
    const h = 28;
    const blast = boost(u);
    const eye = Math.min(1, 0.6 + 0.4 * pulse(t, 2) + blast);
    const slit = (pts: number[], gx: number) => {
      glow(c, gx, H.eye - 0.5, 7, '140,240,255', 0.55 * eye);
      path(c, pts);
      c.fillStyle = `rgba(230,255,255,${eye})`;
      c.fill();
    };
    rrect(c, x, y, w, h, 9, lin(c, x, y, x + w, y + h, [[0, '#ff6a5a'], [0.5, '#c0182a'], [1, '#6a0a14']]), INK, 1.2);
    if (d === 2) {
      path(c, [H.x - 7.5, H.top + 3, H.x + 7.5, H.top + 3, H.x + 8, H.eye + 3, H.x + 5, y + h - 1, H.x - 5, y + h - 1, H.x - 8, H.eye + 3]);
      fillStroke(c, lin(c, 0, H.top + 3, 0, y + h, GOLD), INK, 0.9);
      for (const k of [-1, 1]) slit([H.x + k * 1.5, H.eye - 1.2, H.x + k * 6.5, H.eye - 2, H.x + k * 6, H.eye + 0.6, H.x + k * 1.8, H.eye + 0.8], H.x + k * 4);
      line(c, H.x - 3, y + h - 5, H.x + 3, y + h - 5, 'rgba(59,42,42,0.55)', 0.8);
    } else if (d !== 0) {
      const s = side(d);
      path(c, [H.x + s * 2, H.top + 3, H.x + s * 11.5, H.top + 5, H.x + s * 11, y + h - 3, H.x + s * 4, y + h - 1]);
      fillStroke(c, lin(c, 0, H.top + 3, 0, y + h, GOLD), INK, 0.9);
      slit([H.x + s * 5, H.eye - 1.5, H.x + s * 10.5, H.eye - 2, H.x + s * 10, H.eye + 0.6, H.x + s * 5.2, H.eye + 0.8], H.x + s * 8);
    } else rrect(c, H.x - 2, y + 2, 4, h - 6, 2, '#f2b632', INK, 0.7);
    glint(c, x, y, w, h, t, 0.6, 9);
    // in use: repulsor blasts from the eye slits
    if (blast > 0 && d !== 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = blast;
      const slits = d === 2 ? [H.x - 4, H.x + 4] : [H.x + side(d) * 8];
      for (const sx of slits) {
        glow(c, sx, H.eye, 14, '140,240,255', 0.8);
        if (d === 2) line(c, sx, H.eye, sx + (sx < H.x ? -8 : 8), H.eye + 40, '#b8fbff', 3);
        else line(c, sx, H.eye, sx + side(d) * 44, H.eye + 2, '#b8fbff', 3);
      }
      c.restore();
    }
  },
  'helm.party_hat': (c, _d, t) => {
    const tip = { x: H.x + wave(t) * 1.2, y: H.top - 14 };
    poly(c, [H.x - 7, H.top + 4, H.x + 7, H.top + 4, tip.x, tip.y], lin(c, 0, tip.y, 0, H.top + 4, [[0, '#7ecbff'], [1, '#3f8fe0']]), INK, 1);
    for (let i = 0; i < 3; i++) line(c, H.x - 5 + i * 2.5, H.top + 2 - i * 4, H.x - 2 + i * 2.5, H.top + 3 - i * 4, '#f9d66b', 1.2);
    ell(c, tip.x, tip.y, 2.2, 2.2, '#ff6f91', INK, 0.7);
  },
  'helm.chef_hat': (c, _d, t) => {
    const puff = 1 + 0.03 * wave(t);
    rrect(c, H.x - 8, H.top + 1, 16, 5, 1.5, '#fff', INK, 0.9);
    c.save();
    c.translate(H.x, H.top - 4);
    c.scale(puff, puff);
    const puffs: Array<[number, number, number]> = [
      [-5, 0, 4.5],
      [0, -3, 5.5],
      [5, 0, 4.5],
    ];
    for (const [x, y, r] of puffs) ell(c, x, y, r, r, '#fff', INK, 0.9);
    ell(c, 0, 1, 7, 3, '#fff');
    c.restore();
  },
  'helm.headphones': (c, d, t) => {
    c.beginPath();
    c.arc(H.x, H.eye - 2, 12, Math.PI * 1.08, Math.PI * 1.92);
    c.lineWidth = 2.4;
    c.strokeStyle = '#2c3e50';
    c.stroke();
    const cups = d === 1 || d === 3 ? [H.x - side(d)] : [H.x - 11, H.x + 11];
    for (const x of cups) rrect(c, x - 3, H.eye - 5, 6, 9, 2.5, '#ff5fa2', INK, 1);
    // sound waves ripple out of both cups
    for (let i = 0; i < 2; i++) {
      const k = (t + i / 2) % 1;
      c.globalAlpha = 1 - k;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.arc(H.x + s * 13, H.eye - 1, 3 + k * 7, s > 0 ? -0.7 : Math.PI - 0.7, s > 0 ? 0.7 : Math.PI + 0.7);
        c.lineWidth = 0.8;
        c.strokeStyle = '#ff5fa2';
        c.stroke();
      }
      c.globalAlpha = 1;
    }
  },
  'helm.cyber_helmet': (c, d, t) => {
    const x = H.x - 11;
    const y = H.top - 3;
    const w = 22;
    const h = 26;
    rrect(c, x, y, w, h, 10, lin(c, x, 0, x + w, 0, [[0, '#1c2233'], [0.5, '#39425c'], [1, '#141824']]), INK, 1.2);
    const hue = ['#5ef2ff', '#ff5fa2', '#b8ff5a'][Math.floor(t * 3) % 3];
    if (d === 2) {
      glow(c, H.x, H.eye - 0.5, 14, '94,242,255', 0.3);
      rrect(c, H.x - 9, H.eye - 3, 18, 5, 2.5, hue);
    } else if (d !== 0) rrect(c, H.x + (side(d) > 0 ? 2 : -11), H.eye - 3, 9, 5, 2.5, hue);
    for (let i = 0; i < 3; i++) line(c, x + 3, y + 5 + i * 3, x + 3 + 4 * pulse(t, 2, i * 0.2), y + 5 + i * 3, hue, 0.8);
    glint(c, x, y, w, h, t, 0.35, 10);
  },
  'helm.unicorn_horn': (c, _d, t) => {
    const cols = ['#ff9ab8', '#f9d66b', '#8fe3d2', '#a8e6ff', '#d6a3ff'];
    glow(c, H.x, H.top - 7, 11, '255,240,255', 0.35 + 0.25 * pulse(t));
    poly(c, [H.x - 3, H.top + 3, H.x + 3, H.top + 3, H.x + 0.5, H.top - 15], lin(c, 0, H.top - 15, 0, H.top + 3, cols.map((col, i): [number, string] => [i / 4, col])), INK, 0.9);
    for (let i = 0; i < 3; i++) line(c, H.x - 2.4 + i * 0.6, H.top - i * 4, H.x + 2.4 - i * 0.6, H.top - 2 - i * 4, 'rgba(255,255,255,0.8)', 0.6);
    for (let i = 0; i < 3; i++) star4(c, H.x + Math.cos(t * TAU + i * 2.1) * 7, H.top - 9 + Math.sin(t * TAU + i * 2.1) * 3, 1.3 * Math.max(0, wave(t, 2, i * 0.3)), cols[i]);
  },
  'helm.flame_crown': (c, _d, t) => {
    glow(c, H.x, H.top - 4, 14, '255,138,60', 0.35 + 0.15 * pulse(t, 3));
    for (let i = 0; i < 5; i++) {
      const x = H.x - 8 + i * 4;
      const hgt = 7 + 5 * Math.abs(wave(t, 2, i * 0.23)) + (i === 2 ? 4 : 0);
      c.beginPath();
      c.moveTo(x - 2.6, H.top + 2);
      c.quadraticCurveTo(x - 2, H.top - hgt * 0.6, x + wave(t, 1, i * 0.3), H.top - hgt);
      c.quadraticCurveTo(x + 2, H.top - hgt * 0.6, x + 2.6, H.top + 2);
      c.closePath();
      fillStroke(c, lin(c, 0, H.top - hgt, 0, H.top + 2, [[0, '#fff1a8'], [0.5, '#ff8a3c'], [1, '#e0282f']]));
    }
    rrect(c, H.x - 9.5, H.top + 1, 19, 4, 1.5, lin(c, 0, H.top + 1, 0, H.top + 5, GOLD), INK, 0.9);
    ell(c, H.x, H.top + 3, 1.2, 1.2, '#e0282f');
  },
};

// ---- auras (drawn behind the body, so the body itself stays clear)

const AURA: Record<string, Painter> = {
  'aura.sparkles': (c, _d, t) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7 + t * 0.25) * TAU;
      star4(c, 32 + Math.cos(a) * 20, 38 + Math.sin(a) * 26, 0.6 + 2.2 * Math.max(0, wave(t, 2, i * 0.37)), i % 2 ? '#fff6c2' : '#a8e6ff');
    }
  },
  'aura.bubbles': (c, _d, t) => {
    for (let i = 0; i < 6; i++) {
      const k = (t + i / 6) % 1;
      const x = 32 + (i % 2 ? 1 : -1) * (13 + 5 * Math.sin(i * 2.1)) + wave(k, 1, i * 0.2) * 2;
      const y = 62 - k * 56;
      const r = 1.4 + (i % 3) * 0.7;
      c.globalAlpha = Math.sin(k * Math.PI);
      ell(c, x, y, r, r, 'rgba(168,230,255,0.25)', '#7ecbff', 0.7);
      ell(c, x - r * 0.35, y - r * 0.35, r * 0.3, r * 0.3, '#fff');
      c.globalAlpha = 1;
    }
  },
  'aura.leaves': (c, _d, t) => {
    for (let i = 0; i < 5; i++) {
      const k = (t + i / 5) % 1;
      c.save();
      c.translate(32 + Math.sin(i * 1.7) * 18 + wave(k, 1.5, i * 0.3) * 4, 6 + k * 58);
      c.rotate(wave(k, 1, i * 0.2) * 0.9);
      c.globalAlpha = Math.sin(k * Math.PI);
      ell(c, 0, 0, 2.6, 1.2, i % 2 ? '#63b04a' : '#b8e986', '#3f7a2c', 0.5);
      c.restore();
    }
  },
  'aura.hearts': (c, _d, t) => {
    for (let i = 0; i < 5; i++) {
      const a = (t + i / 5) * TAU;
      const depth = Math.sin(a);
      heart(c, 32 + Math.cos(a) * 20, 40 + depth * 7, 1.6 + depth * 0.6, '#ff6f91', '#c0476d');
    }
  },
  'aura.notes': (c, _d, t) => {
    for (let i = 0; i < 4; i++) {
      const k = (t + i / 4) % 1;
      const x = 32 + (i % 2 ? 1 : -1) * (15 + 3 * wave(k, 1, i * 0.25));
      const y = 46 - k * 40;
      c.globalAlpha = Math.sin(k * Math.PI);
      ell(c, x, y, 1.9, 1.4, '#3f8fe0', undefined, 1, -0.4);
      line(c, x + 1.6, y, x + 1.6, y - 6, '#3f8fe0', 0.9);
      if (i % 2) line(c, x + 1.6, y - 6, x + 4, y - 4.5, '#3f8fe0', 0.9);
      c.globalAlpha = 1;
    }
  },
  'aura.snow': (c, _d, t) => {
    for (let i = 0; i < 8; i++) {
      const k = (t + i / 8) % 1;
      const x = 32 + Math.sin(i * 2.3) * 22 + wave(k, 1, i * 0.4) * 2;
      const y = 2 + k * 62;
      c.globalAlpha = Math.sin(k * Math.PI);
      for (let a = 0; a < 3; a++) {
        const ang = (a * Math.PI) / 3 + k * 2;
        line(c, x - Math.cos(ang) * 2, y - Math.sin(ang) * 2, x + Math.cos(ang) * 2, y + Math.sin(ang) * 2, '#fff', 0.7);
      }
      c.globalAlpha = 1;
    }
  },
  'aura.coins': (c, _d, t) => {
    glow(c, 32, 46, 24, '249,214,107', 0.12);
    for (let i = 0; i < 6; i++) {
      const a = (t + i / 6) * TAU;
      const x = 32 + Math.cos(a) * 21;
      const y = 46 + Math.sin(a) * 6;
      const spin = Math.abs(Math.cos(a * 3));
      ell(c, x, y, 2.6 * spin + 0.3, 2.6, '#f2b632', '#a8741c', 0.7);
      if (spin > 0.5) ell(c, x, y, 1.2 * spin, 1.2, '#fff1a8');
    }
  },
  'aura.lightning': (c, _d, t) => {
    glow(c, 32, 38, 28, '126,203,255', 0.18 + 0.12 * pulse(t, 4));
    const f = Math.floor(t * GEAR_FRAMES);
    for (let b = 0; b < 2; b++) {
      const seed = f * 7 + b * 13;
      if (seed % 3 === 0) continue;
      let x = 32 + (b ? 1 : -1) * (15 + (seed % 5));
      let y = 12 + (seed % 7);
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += ((seed * (k + 3)) % 7) - 3;
        y += 7;
        c.lineTo(x, y);
      }
      c.lineWidth = 2.2;
      c.strokeStyle = 'rgba(126,203,255,0.9)';
      c.stroke();
      c.lineWidth = 0.8;
      c.strokeStyle = '#fff';
      c.stroke();
    }
  },
  'aura.flame': (c, _d, t) => {
    glow(c, 32, 44, 26, '255,138,60', 0.25 + 0.1 * pulse(t, 3));
    for (let i = 0; i < 7; i++) {
      const x = 18 + i * 4.7;
      const hgt = 18 + 10 * Math.abs(wave(t, 2, i * 0.29)) + (i % 2) * 6;
      c.beginPath();
      c.moveTo(x - 4.2, 62);
      c.quadraticCurveTo(x - 3.4, 62 - hgt * 0.6, x + wave(t, 1, i * 0.2) * 2, 62 - hgt);
      c.quadraticCurveTo(x + 3.4, 62 - hgt * 0.6, x + 4.2, 62);
      c.closePath();
      fillStroke(c, lin(c, 0, 62 - hgt, 0, 62, [[0, 'rgba(255,241,168,0.9)'], [0.5, 'rgba(255,138,60,0.85)'], [1, 'rgba(224,85,61,0.6)']]));
    }
  },
  'aura.rainbow': (c, _d, t) => {
    const cols = ['#ff5f5f', '#ff9a3c', '#f9d66b', '#63b04a', '#3f8fe0', '#9b6bdc'];
    glow(c, 32, 60, 20, '255,255,255', 0.15);
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6 + t) * TAU;
      c.beginPath();
      c.ellipse(32, 60, 18, 5, 0, a0, a0 + TAU / 6);
      c.lineWidth = 2.4;
      c.strokeStyle = cols[i];
      c.stroke();
    }
  },
  'aura.galaxy': (c, _d, t) => {
    glow(c, 32, 36, 32, '155,107,220', 0.3 + 0.1 * pulse(t));
    glow(c, 26, 30, 14, '94,242,255', 0.12);
    for (let i = 0; i < 10; i++) {
      const rr = 14 + (i % 3) * 5;
      const a = (t * (i % 2 ? 0.5 : -0.35) + i / 10) * TAU;
      star4(c, 32 + Math.cos(a) * rr, 38 + Math.sin(a) * rr * 1.25, 0.4 + 1.4 * Math.max(0, wave(t, 2, i * 0.21)), i % 3 ? '#fff' : '#d6a3ff');
    }
    const pa = t * TAU;
    ell(c, 32 + Math.cos(pa) * 22, 38 + Math.sin(pa) * 9, 2.4, 2.4, '#ff8a5b', INK, 0.6);
  },
  'aura.void': (c, _d, t) => {
    glow(c, 32, 40, 30, '90,20,120', 0.35 + 0.1 * pulse(t, 2));
    for (let i = 0; i < 6; i++) {
      const k = (t + i / 6) % 1;
      const r = 3 + k * 5;
      c.globalAlpha = 0.55 * Math.sin(k * Math.PI);
      ell(c, 32 + Math.sin(i * 1.9) * 14 + wave(k, 1, i * 0.3) * 3, 62 - k * 50, r, r * 0.8, '#2a1440');
      c.globalAlpha = 1;
    }
    for (let i = 0; i < 4; i++) star4(c, 32 + Math.cos(i * 1.6 + t * TAU) * 18, 38 + Math.sin(i * 2.2 + t * TAU) * 22, 0.5 + 1.3 * Math.max(0, wave(t, 3, i * 0.25)), '#ff5fa2');
  },
  'aura.confetti': (c, _d, t) => {
    const cols = ['#ff6f91', '#f9d66b', '#7ecbff', '#8fe3d2', '#d6a3ff'];
    for (let i = 0; i < 10; i++) {
      const k = (t + i / 10) % 1;
      c.save();
      c.translate(32 + Math.sin(i * 2.7) * 22 + wave(k, 1, i * 0.1) * 3, 4 + k * 60);
      c.rotate(k * TAU * (i % 2 ? 1 : -1));
      c.globalAlpha = Math.sin(k * Math.PI);
      c.fillStyle = cols[i % cols.length];
      c.fillRect(-1.4, -0.8, 2.8, 1.6);
      c.restore();
    }
  },
  'aura.petals': (c, _d, t) => {
    for (let i = 0; i < 6; i++) {
      const k = (t + i / 6) % 1;
      c.save();
      c.translate(32 + Math.sin(i * 1.9) * 20 + wave(k, 1.2, i * 0.3) * 5, 4 + k * 58);
      c.rotate(wave(k, 1, i * 0.4) * 1.2);
      c.globalAlpha = Math.sin(k * Math.PI);
      ell(c, 0, 0, 2.2, 1.3, '#ffc2da', '#f28ab0', 0.5);
      c.restore();
    }
  },
  'aura.fireflies': (c, _d, t) => {
    for (let i = 0; i < 7; i++) {
      const a = t * TAU * (i % 2 ? 0.5 : -0.4) + i;
      const x = 32 + Math.cos(a) * (14 + (i % 3) * 5);
      const y = 38 + Math.sin(a * 1.3) * 20;
      const on = Math.max(0, wave(t, 2, i * 0.37));
      glow(c, x, y, 5, '220,255,120', 0.5 * on);
      ell(c, x, y, 0.9, 0.9, on > 0.2 ? '#f6ff9a' : 'rgba(246,255,154,0.3)');
    }
  },
  'aura.plasma': (c, _d, t) => {
    glow(c, 32, 38, 26, '180,90,255', 0.18);
    for (let i = 0; i < 4; i++) {
      const a = (t + i / 4) * TAU;
      const x = 32 + Math.cos(a) * 19;
      const y = 38 + Math.sin(a) * 22;
      line(c, x, y, 32 + Math.cos(a - 0.5) * 19, 38 + Math.sin(a - 0.5) * 22, 'rgba(214,163,255,0.6)', 1.4);
      glow(c, x, y, 7, '200,120,255', 0.7);
      ell(c, x, y, 2.2, 2.2, '#f3e2ff');
    }
  },
  'aura.sunburst': (c, _d, t) => {
    c.save();
    c.translate(32, 36);
    c.rotate(t * TAU * 0.25);
    for (let i = 0; i < 12; i++) {
      c.rotate(TAU / 12);
      poly(c, [-1.5, 14, 1.5, 14, 0, 30 + 3 * wave(t, 2, i * 0.1)], i % 2 ? 'rgba(249,214,107,0.55)' : 'rgba(255,241,168,0.4)');
    }
    c.restore();
    glow(c, 32, 36, 22, '249,214,107', 0.3 + 0.15 * pulse(t, 2));
  },
  'aura.cosmic_rings': (c, _d, t) => {
    glow(c, 32, 38, 30, '94,242,255', 0.15);
    const ring = (ry: number, tilt: number, col: string, speed: number) => {
      c.beginPath();
      c.ellipse(32, 38, 24, ry, tilt, 0, TAU);
      c.lineWidth = 1.4;
      c.strokeStyle = col;
      c.stroke();
      // a moon riding each ring
      const a = t * TAU * speed;
      const mx = Math.cos(a) * 24;
      const my = Math.sin(a) * ry;
      ell(c, 32 + mx * Math.cos(tilt) - my * Math.sin(tilt), 38 + mx * Math.sin(tilt) + my * Math.cos(tilt), 2, 2, '#fff', col, 0.8);
    };
    ring(7, 0.35, 'rgba(126,203,255,0.9)', 1);
    ring(6, -0.5, 'rgba(214,163,255,0.9)', -1.3);
    ring(9, 1.2, 'rgba(249,214,107,0.8)', 0.7);
  },
};

// ---- back pieces (behind the body, over it when walking away)

/** Wings spread from the shoulder blades: a pair facing or leaving the viewer, one trailing in profile. */
function wings(c: Ctx, dir: number, flap: number, draw: (c: Ctx) => void, reach = 1) {
  const pair = dir === 0 || dir === 2;
  const sides = pair ? [-1, 1] : [-side(dir)];
  for (const s of sides) {
    c.save();
    c.translate(32 + s * 2, 34);
    c.rotate(-s * flap);
    c.scale(s * reach * (pair ? 1 : 0.8), 1);
    draw(c);
    c.restore();
  }
}

function cape(c: Ctx, dir: number, t: number, cloth: string, lining: string, trim?: string) {
  const sway = wave(t) * 2;
  if (dir === 0) {
    poly(c, [24, 31, 40, 31, 44 + sway, 58, 20 + sway, 58], cloth, INK, 1);
    if (trim) line(c, 20 + sway, 58, 44 + sway, 58, trim, 1.6);
    return;
  }
  if (dir === 2) return poly(c, [23, 31, 41, 31, 46 + sway, 58, 18 + sway, 58], lining, INK, 1);
  const s = side(dir);
  const tail = 32 - s * (11 + Math.abs(sway) * 2);
  poly(c, [32 + s * 2, 31, 32 - s * 3, 31, tail, 58, 32 + s, 58], cloth, INK, 1);
  if (trim) line(c, tail, 58, 32 + s, 58, trim, 1.4);
}

const BACK: Record<string, Painter> = {
  'back.cape_red': (c, d, t) => cape(c, d, t, '#d4443a', '#7d2b34'),
  'back.cape_royal': (c, d, t) => cape(c, d, t, '#6f47ad', '#3b2466', '#f2b632'),
  'back.backpack': (c, d) => {
    if (d === 2) return rrect(c, 22, 32, 20, 16, 4, '#8a5a34', INK, 1);
    if (d === 0) {
      rrect(c, 24, 31, 16, 18, 4, '#9c6242', INK, 1);
      rrect(c, 24, 31, 16, 7, 3, '#c9793a', INK, 0.9);
      rrect(c, 27.5, 41, 9, 6, 2, '#6b4632', INK, 0.8);
      return ell(c, 32, 38, 1, 1, '#f9d66b');
    }
    rrect(c, side(d) > 0 ? 18 : 36, 32, 10, 16, 3, '#9c6242', INK, 1);
  },
  'back.balloon': (c, d, t) => {
    const hand = d === 3 ? 22 : 42;
    const bx = hand + (d === 3 ? -5 : 5) + wave(t) * 1.5;
    const by = -2 + wave(t, 1, 0.25) * 2;
    c.beginPath();
    c.moveTo(hand, 46);
    c.quadraticCurveTo(hand + 3, 20, bx, by + 7);
    c.lineWidth = 0.6;
    c.strokeStyle = INK;
    c.stroke();
    ell(c, bx, by, 6, 7, lin(c, bx - 6, by - 7, bx + 6, by + 7, [[0, '#ff8a8a'], [1, '#d4443a']]), INK, 1);
    poly(c, [bx - 1.2, by + 7.8, bx + 1.2, by + 7.8, bx, by + 6.4], '#d4443a');
    ell(c, bx - 2.2, by - 3, 1.4, 2.2, 'rgba(255,255,255,0.7)', undefined, 1, 0.4);
  },
  'back.guitar': (c, d) => {
    if (d === 1 || d === 3) return rrect(c, 32 - side(d) * 8 - 3, 30, 6, 26, 2, '#9c6242', INK, 0.9);
    c.save();
    c.translate(32, 44);
    c.rotate(-0.6);
    rrect(c, -1.2, -24, 2.4, 18, 1, '#6b4632', INK, 0.7);
    ell(c, 0, -2, 7, 5.5, '#c9793a', INK, 1);
    ell(c, 0, 5, 8, 6.5, '#c9793a', INK, 1);
    ell(c, 0, 1.5, 2, 2, '#3b2a2a');
    c.restore();
  },
  'back.bat_wings': (c, d, t) =>
    wings(c, d, 0.35 * wave(t, 2), (w) => {
      poly(w, [0, 0, 8, -9, 17, -6, 22, 2, 17, 0, 14, 7, 9, 3, 5, 8], '#3b2a4a', INK, 0.9);
      line(w, 0, 0, 17, -6, '#5d4a70', 0.8);
      line(w, 8, -9, 9, 3, '#5d4a70', 0.6);
      line(w, 8, -9, 14, 7, '#5d4a70', 0.6);
    }),
  'back.butterfly': (c, d, t) =>
    wings(c, d, 0, (w) => {
      w.scale(0.55 + 0.45 * Math.abs(wave(t, 2)), 1);
      ell(w, 8, -7, 9, 7.5, lin(w, 0, -14, 16, 0, [[0, '#ff8a5b'], [1, '#ff5fa2']]), INK, 0.9, -0.3);
      ell(w, 7, 5, 6, 5, lin(w, 0, 0, 12, 10, [[0, '#f9d66b'], [1, '#ff8a5b']]), INK, 0.9, 0.3);
      ell(w, 10, -8, 1.8, 1.8, '#fff');
      ell(w, 8, 5, 1.3, 1.3, INK);
    }),
  'back.angel_wings': (c, d, t) => {
    glow(c, 32, 30, 24, '255,247,230', 0.25);
    wings(c, d, 0.28 * wave(t), (w) => {
      for (let i = 0; i < 4; i++) ell(w, 6 + i * 4, -6 + i * 3.5, 9 - i, 3.2, i % 2 ? '#fff7e6' : '#ffffff', '#b7b3c4', 0.7, -0.5 + i * 0.28);
    });
  },
  'back.fairy': (c, d, t) => {
    wings(c, d, 0.18 * wave(t, 3), (w) => {
      ell(w, 8, -8, 10, 5.5, 'rgba(142,242,255,0.35)', 'rgba(94,200,230,0.9)', 0.8, -0.5);
      ell(w, 7, 4, 7, 3.6, 'rgba(214,163,255,0.35)', 'rgba(155,107,220,0.9)', 0.8, 0.45);
    });
    for (let i = 0; i < 4; i++) star4(c, 32 + Math.cos(i * 1.7) * 18, 26 + Math.sin(i * 2.3) * 10, 0.4 + 1.3 * Math.max(0, wave(t, 2, i * 0.3)), '#e6fbff');
  },
  'back.jetpack': (c, d, t, u) => {
    const tanks = d === 1 || d === 3 ? [32 - side(d) * 7] : [28, 36];
    for (const x of tanks) {
      const flame = 8 + 5 * Math.abs(wave(t, 3, x * 0.03)) + 22 * boost(u);
      glow(c, x, 50 + flame * 0.6, 7, '255,150,60', 0.5);
      c.beginPath();
      c.moveTo(x - 2.2, 49);
      c.quadraticCurveTo(x, 49 + flame * 1.3, x + 2.2, 49);
      c.closePath();
      fillStroke(c, lin(c, 0, 49, 0, 49 + flame, [[0, '#fff1a8'], [0.5, '#ff8a3c'], [1, 'rgba(224,85,61,0)']]));
      rrect(c, x - 3.5, 30, 7, 18, 3, lin(c, x - 3.5, 0, x + 3.5, 0, [[0, '#7d8a98'], [0.5, '#dfe6ee'], [1, '#6b7684']]), INK, 1);
      rrect(c, x - 3.5, 30, 7, 3.5, 2, '#e0553d', INK, 0.7);
      rrect(c, x - 2.2, 47, 4.4, 2.5, 1, INK);
    }
  },
  'back.dragon_wings': (c, d, t) => {
    glow(c, 32, 30, 26, '224,40,47', 0.18);
    wings(
      c,
      d,
      0.32 * wave(t, 1.5),
      (w) => {
        poly(w, [0, 0, 10, -14, 26, -12, 24, -3, 20, 1, 22, 8, 15, 3, 11, 10, 6, 4], lin(w, 0, -14, 26, 10, [[0, '#2f6b3f'], [1, '#123d24']]), INK, 1);
        for (const [x, y] of [[26, -12], [20, 1], [22, 8], [11, 10]]) line(w, 10, -14, x, y, '#7fd49a', 0.6);
        ell(w, 10, -14, 1.2, 1.2, '#f9d66b');
      },
      1.1,
    );
  },
  'back.phoenix': (c, d, t) => {
    glow(c, 32, 32, 28, '255,138,60', 0.3 + 0.1 * pulse(t, 2));
    wings(c, d, 0.3 * wave(t), (w) => {
      for (let i = 0; i < 5; i++) {
        const len = 12 + i * 3;
        w.save();
        w.rotate(-0.9 + i * 0.32);
        w.beginPath();
        w.moveTo(0, 0);
        w.quadraticCurveTo(len * 0.5, -3.5, len, 0);
        w.quadraticCurveTo(len * 0.5, 3.5, 0, 0);
        w.closePath();
        fillStroke(w, lin(w, 0, 0, len, 0, [[0, '#e0553d'], [0.55, '#ff8a3c'], [1, '#fff1a8']]));
        w.restore();
      }
    });
    for (let i = 0; i < 5; i++) {
      const k = (t + i / 5) % 1;
      c.globalAlpha = 1 - k;
      ell(c, 32 + Math.sin(i * 2.1) * 20, 40 - k * 36, 0.9, 0.9, i % 2 ? '#fff1a8' : '#ff8a3c');
      c.globalAlpha = 1;
    }
  },
  'back.kite': (c, d, t) => {
    const hand = d === 3 ? 22 : 42;
    const kx = hand + (d === 3 ? -10 : 10) + wave(t) * 3;
    const ky = -6 + wave(t, 1, 0.3) * 3;
    c.beginPath();
    c.moveTo(hand, 46);
    c.quadraticCurveTo(hand + (d === 3 ? -2 : 2), 18, kx, ky + 7);
    c.lineWidth = 0.5;
    c.strokeStyle = INK;
    c.stroke();
    c.save();
    c.translate(kx, ky);
    c.rotate(wave(t) * 0.2);
    poly(c, [0, -7, 5, 0, 0, 8, -5, 0], lin(c, -5, -7, 5, 8, [[0, '#ff6f91'], [0.33, '#f9d66b'], [0.66, '#7ecbff'], [1, '#d6a3ff']]), INK, 0.9);
    line(c, 0, -7, 0, 8, INK, 0.5);
    line(c, -5, 0, 5, 0, INK, 0.5);
    for (let i = 0; i < 3; i++) ell(c, wave(t, 1, i * 0.2) * 2, 10 + i * 3.5, 1.2, 0.8, ['#ff6f91', '#f9d66b', '#7ecbff'][i]);
    c.restore();
  },
  'back.katana': (c, d, t) => {
    const s = d === 1 || d === 3 ? -side(d) : 1;
    c.save();
    c.translate(32, 42);
    c.rotate(-0.75 * s);
    rrect(c, -1.6, -30, 3.2, 26, 1.2, lin(c, -1.6, 0, 1.6, 0, STEEL), INK, 0.7);
    glint(c, -1.6, -30, 3.2, 26, t, 0.8, 1.2);
    rrect(c, -3.5, -4.5, 7, 1.8, 0.8, '#e0b23c', INK, 0.6);
    rrect(c, -1.4, -2.7, 2.8, 9, 1, '#3b2a4a', INK, 0.6);
    c.restore();
  },
  'back.shield': (c, d, t) => {
    const profile = d === 1 || d === 3;
    const x = profile ? 32 - side(d) * 9 : 32;
    c.save();
    c.translate(x, 40);
    c.scale(profile ? 0.45 : 1, 1);
    const rings: Array<[number, string]> = [
      [11, '#d4443a'],
      [8, '#f5f5f5'],
      [5, '#d4443a'],
      [2.8, '#3f7fd0'],
    ];
    for (const [r, col] of rings) ell(c, 0, 0, r, r, col, INK, 0.8);
    star5(c, 0, 0, 2.4, '#fff');
    c.restore();
    if (d === 0) glint(c, x - 11, 29, 22, 22, t, 0.5, 11);
  },
  'back.robot_arms': (c, d, t) => {
    const pair = d === 0 || d === 2;
    const arms = pair ? [-1, 1] : [-side(d)];
    for (const s of arms) {
      const sway = wave(t, 1, s > 0 ? 0 : 0.5) * 0.5;
      c.save();
      c.translate(32 + s * 6, 34);
      c.rotate(s * (-0.9 + sway));
      rrect(c, -1.6, -14, 3.2, 14, 1.5, lin(c, -1.6, 0, 1.6, 0, STEEL), INK, 0.7);
      ell(c, 0, -14, 2.2, 2.2, '#7d7a91', INK, 0.6);
      c.translate(0, -14);
      c.rotate(s * (0.9 + sway));
      rrect(c, -1.4, -11, 2.8, 11, 1.3, lin(c, -1.4, 0, 1.4, 0, STEEL), INK, 0.7);
      poly(c, [-2.6, -11, -1, -15, 0, -12, 1, -15, 2.6, -11], '#5ef2ff', INK, 0.5);
      c.restore();
    }
  },
  'back.rocket': (c, d, t, u) => {
    const x = d === 1 || d === 3 ? 32 - side(d) * 8 : 32;
    const power = boost(u);
    const flame = 9 + 5 * Math.abs(wave(t, 3)) + 26 * power;
    glow(c, x, 52 + flame * 0.5, 9 + power * 8, '255,150,60', 0.55);
    c.beginPath();
    c.moveTo(x - 3.2, 50);
    c.quadraticCurveTo(x, 50 + flame * 1.3, x + 3.2, 50);
    c.closePath();
    fillStroke(c, lin(c, 0, 50, 0, 50 + flame, [[0, '#ffffff'], [0.3, '#fff1a8'], [0.6, '#ff8a3c'], [1, 'rgba(224,85,61,0)']]));
    c.beginPath();
    c.moveTo(x, 20);
    c.quadraticCurveTo(x + 7, 28, x + 5.5, 50);
    c.lineTo(x - 5.5, 50);
    c.quadraticCurveTo(x - 7, 28, x, 20);
    c.closePath();
    fillStroke(c, lin(c, x - 6, 0, x + 6, 0, [[0, '#dfe6ee'], [0.5, '#ffffff'], [1, '#9aa7b4']]), INK, 1);
    ell(c, x, 32, 2.4, 2.4, '#7ecbff', INK, 0.7);
    poly(c, [x - 5.5, 42, x - 9, 51, x - 5, 50], '#e0553d', INK, 0.7);
    poly(c, [x + 5.5, 42, x + 9, 51, x + 5, 50], '#e0553d', INK, 0.7);
  },
  'back.ice_wings': (c, d, t) => {
    glow(c, 32, 30, 26, '168,230,255', 0.25 + 0.1 * pulse(t));
    wings(
      c,
      d,
      0.22 * wave(t),
      (w) => {
        for (let i = 0; i < 4; i++) {
          const len = 12 + i * 4;
          w.save();
          w.rotate(-0.8 + i * 0.35);
          poly(w, [0, -1.5, len * 0.6, -3.5, len, 0, len * 0.6, 3.5, 0, 1.5], lin(w, 0, 0, len, 0, [[0, 'rgba(168,230,255,0.9)'], [1, 'rgba(230,251,255,0.7)']]), '#7ecbff', 0.6);
          w.restore();
        }
      },
      1.05,
    );
    for (let i = 0; i < 4; i++) star4(c, 32 + Math.cos(i * 1.9 + t * TAU) * 20, 26 + Math.sin(i * 2.4) * 10, 1.6 * Math.max(0, wave(t, 2, i * 0.27)), '#ffffff');
  },
};

const PAINTERS: Record<string, Painter> = { ...FACE, ...HELM, ...AURA, ...BACK };

export function hasGearArt(id: string): boolean {
  return id in PAINTERS;
}

/** Worn gear in draw order: auras, back pieces, eyewear, then helmets over eyewear. */
export function gearIds(cfg: Pick<AvatarConfig, 'face' | 'helm' | 'aura' | 'back'>): string[] {
  return [cfg.aura, cfg.back, cfg.face, cfg.helm].filter((id): id is string => !!id && id !== 'none' && hasGearArt(id));
}

/** Eyewear and helmets sit over the body; auras behind it; back pieces behind unless walking away. */
export function gearLayer(id: string, dir: number): GearLayer {
  const slot = id.split('.')[0];
  if (slot === 'face' || slot === 'helm') return 'front';
  if (slot === 'back') return dir === 0 ? 'front' : 'back';
  return 'back';
}

/** How high a piece lifts its wearer while in use, in frame pixels: wings, jets and balloons fly. */
const LIFT: Record<string, number> = {
  'back.jetpack': 22,
  'back.rocket': 26,
  'back.angel_wings': 16,
  'back.fairy': 14,
  'back.bat_wings': 14,
  'back.butterfly': 12,
  'back.dragon_wings': 18,
  'back.phoenix': 20,
  'back.ice_wings': 18,
  'back.balloon': 10,
  'back.kite': 8,
};

export function gearLift(ids: string[]): number {
  return ids.reduce((most, id) => Math.max(most, LIFT[id] ?? 0), 0);
}

/** The burst every piece plays on top of its own boosted animation while in use. */
function useFx(c: Ctx, slot: string, dir: number, u: number) {
  const b = boost(u);
  if (b <= 0) return;
  c.save();
  if (slot === 'face' && dir !== 0) {
    const eyes = dir === 2 ? [H.x - 4.5, H.x + 4.5] : [H.x + side(dir) * 5];
    for (const x of eyes) glow(c, x, H.eye, 6 + 6 * b, '255,255,255', 0.6 * b);
  } else if (slot === 'helm') {
    c.globalAlpha = 1 - u;
    ell(c, H.x, H.eye - 3, 10 + 16 * u, 4 + 6 * u, undefined, '#fff6c2', 1.4);
  } else if (slot === 'aura') {
    c.globalAlpha = 1 - u;
    ell(c, 32, 60, 8 + 26 * u, 3 + 8 * u, undefined, '#ffffff', 1.6);
  } else if (slot === 'back') {
    c.globalAlpha = 0.8 * b;
    for (const dx of [-6, 0, 6]) line(c, 32 + dx, 64, 32 + dx * 1.4, 64 + 10 * b, 'rgba(255,255,255,0.9)', 1);
  }
  c.globalAlpha = 1;
  const ring = slot === 'aura' || slot === 'back' ? 22 : 12;
  const cy = slot === 'face' || slot === 'helm' ? H.eye - 2 : 38;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + u * 2;
    const r = ring * (0.6 + u);
    star4(c, 32 + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, 2.4 * b, i % 2 ? '#fff6c2' : '#ffffff');
  }
  c.restore();
}

/**
 * Draw one item into a context whose origin is the top-left of the 64px body
 * frame. `u` is the progress of a use (0 idle): pieces speed up, swell and burst.
 */
export function paintGear(c: Ctx, id: string, dir: number, t: number, u = 0) {
  const p = PAINTERS[id];
  if (!p) return;
  const slot = id.split('.')[0];
  const b = boost(u);
  c.save();
  if (b > 0 && slot === 'helm') {
    c.translate(H.x, H.eye);
    c.scale(1 + 0.12 * b, 1 + 0.12 * b);
    c.translate(-H.x, -H.eye);
  } else if (b > 0 && slot === 'aura') {
    c.translate(32, 40);
    c.scale(1 + 0.45 * b, 1 + 0.45 * b);
    c.translate(-32, -40);
  }
  // pieces animate faster while in use: wings beat, flames roar, lights race
  p(c, dir, u > 0 ? (t + u * 3) % 1 : t, u);
  c.restore();
  useFx(c, slot, dir, u);
}

/** Every worn piece on one layer for one facing, into a context at a gear cell's top-left (GEAR_RES scale). */
export function paintGearCell(c: Ctx, ids: string[], dir: number, layer: GearLayer, t: number, u = 0) {
  c.save();
  c.scale(GEAR_RES, GEAR_RES);
  c.translate(GEAR_OX, GEAR_OY);
  for (const id of ids) if (gearLayer(id, dir) === layer) paintGear(c, id, dir, t, u);
  c.restore();
}

/** sheet rows follow the sprite pack: facing up, left, down, right */
const ROW_DIRS = [0, 3, 2, 1];
const MAX_SHEETS = 32;
const sheets = new Map<string, HTMLCanvasElement | null>();

/**
 * One layer of a look's gear as a sprite sheet: GEAR_FRAMES columns x 4 facing
 * rows of GEAR_CELL cells at GEAR_RES. Null when nothing is drawn on that layer.
 */
export function gearSheet(ids: string[], layer: GearLayer): HTMLCanvasElement | null {
  const key = `${layer}:${ids.join('|')}`;
  const hit = sheets.get(key);
  if (hit !== undefined) return hit;
  const drawn = ids.filter((id) => ROW_DIRS.some((d) => gearLayer(id, d) === layer));
  let canvas: HTMLCanvasElement | null = null;
  if (drawn.length) {
    const px = GEAR_CELL * GEAR_RES;
    canvas = document.createElement('canvas');
    canvas.width = px * GEAR_FRAMES;
    canvas.height = px * ROW_DIRS.length;
    const c = canvas.getContext('2d')!;
    ROW_DIRS.forEach((dir, row) => {
      for (let f = 0; f < GEAR_FRAMES; f++) {
        for (const id of drawn) {
          if (gearLayer(id, dir) !== layer) continue;
          c.save();
          c.translate(f * px, row * px);
          c.scale(GEAR_RES, GEAR_RES);
          c.translate(GEAR_OX, GEAR_OY);
          paintGear(c, id, dir, f / GEAR_FRAMES);
          c.restore();
        }
      }
    });
  }
  if (sheets.size >= MAX_SHEETS) sheets.delete(sheets.keys().next().value as string);
  sheets.set(key, canvas);
  return canvas;
}
