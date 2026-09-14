import { Container, FillGradient, Graphics } from 'pixi.js';

/**
 * Screen-space scenery behind the world: sky gradient, sun, rolling hills and
 * drifting clouds for outdoor rooms; a soft vignette wash for indoor rooms.
 * Parallaxes slightly against the camera so the world feels grounded.
 */
export class Backdrop extends Container {
  private sky = new Graphics();
  private hills = new Graphics();
  private clouds = new Graphics();
  private theme = 'indoor';
  private bg = 0xf6ecd9;
  private w = 0;
  private h = 0;
  private drift = 0;

  constructor() {
    super();
    this.addChild(this.sky, this.hills, this.clouds);
  }

  setTheme(theme: string, bg: number) {
    if (theme === this.theme && bg === this.bg && this.w) return;
    this.theme = theme;
    this.bg = bg;
    this.w = 0; // force redraw on next update
  }

  private outdoor() {
    return this.theme === 'park' || this.theme === 'harbor' || this.theme === 'love';
  }

  private redraw(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.sky.clear();
    this.hills.clear();
    this.clouds.clear();
    if (this.theme === 'lab') return this.drawSpace(w, h);
    if (this.theme === 'beach') return this.drawSunset(w, h);
    if (this.theme === 'dream') return this.drawDreamSky(w, h);
    if (this.theme === 'funpark') return this.drawDome(w, h);
    if (!this.outdoor()) return;
    const harbor = this.theme === 'harbor';
    const sky = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: harbor
        ? [
            { offset: 0, color: 0x7ec8f2 },
            { offset: 0.55, color: 0xbfe6fb },
            { offset: 1, color: 0xfff1c9 },
          ]
        : [
            { offset: 0, color: 0x8fd3ff },
            { offset: 0.6, color: 0xcfeeff },
            { offset: 1, color: 0xf3f9d9 },
          ],
      textureSpace: 'local',
    });
    this.sky.rect(0, 0, w, h).fill(sky);
    // sun
    this.sky.circle(w * 0.82, h * 0.16, 46).fill({ color: 0xfff1a8, alpha: 0.9 });
    this.sky.circle(w * 0.82, h * 0.16, 70).fill({ color: 0xfff1a8, alpha: 0.25 });
    this.sky.circle(w * 0.82, h * 0.16, 110).fill({ color: 0xfff7d6, alpha: 0.15 });
    // rolling hills: two bands
    const bands = harbor ? [[0x9fd7a8, 0.62], [0x7fc48d, 0.7]] : [[0xb7e492, 0.58], [0x8fcf72, 0.66]];
    for (const [col, yk] of bands as Array<[number, number]>) {
      const g = this.hills;
      const y0 = h * yk;
      g.moveTo(0, h);
      g.lineTo(0, y0 + 20);
      const bumps = 6;
      for (let i = 0; i < bumps; i++) {
        const x0 = (i / bumps) * w;
        const x1 = ((i + 1) / bumps) * w;
        const cxm = (x0 + x1) / 2;
        g.quadraticCurveTo(cxm, y0 - 30 - ((i * 7) % 3) * 14, x1, y0 + 20);
      }
      g.lineTo(w, h).closePath().fill(col);
      // tiny trees on the ridge
      for (let i = 0; i < 12; i++) {
        const x = ((i * 97) % 100) / 100 * w;
        const y = y0 + 8;
        g.circle(x, y - 6, 5).fill(shadeHex(col, 0.75));
        g.rect(x - 1, y - 2, 2, 5).fill(0x6b4632);
      }
    }
  }

  /** 'beach' theme: golden-hour sky, a sun melting into the sea, a palm island silhouette */
  private drawSunset(w: number, h: number) {
    const horizon = h * 0.78;
    const sky = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0x3b2a6b },
        { offset: 0.35, color: 0xb8397f },
        { offset: 0.62, color: 0xff8a5b },
        { offset: 0.78, color: 0xffc46b },
        { offset: 0.781, color: 0x3f8fe0 },
        { offset: 1, color: 0x2a6fb8 },
      ],
      textureSpace: 'local',
    });
    this.sky.rect(0, 0, w, h).fill(sky);
    const sx = w * 0.5;
    this.sky.circle(sx, horizon, 160).fill({ color: 0xffd27a, alpha: 0.18 });
    this.sky.circle(sx, horizon, 110).fill({ color: 0xffe08f, alpha: 0.25 });
    this.sky.circle(sx, horizon, 72).fill(0xfff1a8);
    this.sky.rect(0, horizon, w, h - horizon).fill(0x3f8fe0); // sea covers the lower half of the sun
    for (let i = 0; i < 5; i++) {
      const y = h * (0.12 + i * 0.07);
      const x = rand(i + 7) * w;
      this.sky.ellipse(x, y, 90 + rand(i + 3) * 80, 6 + rand(i) * 4).fill({ color: 0xffb3c6, alpha: 0.45 });
    }
    // distant island with palms
    const g = this.hills;
    const ix = w * 0.14;
    g.ellipse(ix, horizon + 2, 110, 16).fill(0x3b2a4f);
    for (const [dx, hgt] of [
      [-30, 70],
      [10, 90],
      [40, 60],
    ]) {
      const bx = ix + dx;
      const top = horizon - hgt;
      g.moveTo(bx, horizon).quadraticCurveTo(bx + 10, horizon - hgt / 2, bx + 6, top).stroke({ width: 5, color: 0x3b2a4f });
      for (let f = 0; f < 5; f++) {
        const a = Math.PI + (f / 4) * Math.PI;
        g.moveTo(bx + 6, top).quadraticCurveTo(bx + 6 + Math.cos(a) * 20, top - 12, bx + 6 + Math.cos(a) * 36, top + 8 + Math.abs(Math.sin(a)) * 4).stroke({ width: 4, color: 0x3b2a4f });
      }
    }
  }

  private tickSunset(dtMs: number, w: number, h: number, worldX: number, worldY: number) {
    this.drift += dtMs;
    this.hills.position.set(worldX * 0.04, worldY * 0.02);
    const g = this.clouds;
    g.clear();
    const horizon = h * 0.78;
    // sun glitter on the water
    for (let i = 0; i < 9; i++) {
      const y = horizon + 6 + i * 9;
      const half = 60 - i * 5;
      const a = 0.35 + 0.35 * Math.sin(this.drift / 300 + i * 1.7);
      g.rect(w * 0.5 - half + Math.sin(this.drift / 700 + i) * 8, y, half * 2, 2.5).fill({ color: 0xfff1a8, alpha: a });
    }
    for (let i = 0; i < 18; i++) {
      const tw = Math.max(0, Math.sin(this.drift / (400 + rand(i) * 600) + i * 3));
      g.rect(rand(i + 30) * w, horizon + rand(i + 60) * (h - horizon), 6, 1.5).fill({ color: 0xffffff, alpha: tw * 0.5 });
    }
    // gull silhouettes gliding across the sky
    for (let i = 0; i < 3; i++) {
      const x = ((this.drift * (0.02 + i * 0.006) + i * 400) % (w + 120)) - 60;
      const y = h * (0.28 + i * 0.08) + Math.sin(this.drift / 500 + i) * 8;
      const flap = Math.sin(this.drift / 160 + i) * 4;
      g.moveTo(x - 10, y - flap).quadraticCurveTo(x - 4, y - 4, x, y).quadraticCurveTo(x + 4, y - 4, x + 10, y - flap).stroke({ width: 2, color: 0x3b2a4f, alpha: 0.8 });
    }
  }

  /** 'dream' theme: pastel pink sky, a soft rainbow, and big fluffy clouds */
  private drawDreamSky(w: number, h: number) {
    const sky = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0xffc6e0 },
        { offset: 0.55, color: 0xffe1ef },
        { offset: 1, color: 0xe6d4ff },
      ],
      textureSpace: 'local',
    });
    this.sky.rect(0, 0, w, h).fill(sky);
    const bands = [0xffb3c6, 0xffd6a5, 0xfff1a8, 0xb8e986, 0xa8e6ff, 0xd6a3ff];
    bands.forEach((col, i) => {
      this.hills.arc(w * 0.78, h * 0.95, 300 - i * 16, Math.PI, TAU_BD).stroke({ width: 16, color: col, alpha: 0.55 });
    });
    const puffs: Array<[number, number, number]> = [
      [0.1, 0.9, 70],
      [0.25, 0.95, 90],
      [0.62, 0.97, 80],
      [0.9, 0.9, 100],
      [0.45, 1.0, 70],
    ];
    for (const [kx, ky, r] of puffs) {
      for (const [dx, dy, s] of [
        [0, 0, 1],
        [-0.7, 0.15, 0.7],
        [0.7, 0.12, 0.75],
      ]) {
        this.sky.circle(w * kx + dx * r, h * ky + dy * r, r * s).fill({ color: 0xffffff, alpha: 0.85 });
      }
    }
  }

  private tickDream(dtMs: number, w: number, h: number, worldX: number, worldY: number) {
    this.drift += dtMs;
    this.hills.position.set(worldX * 0.03, worldY * 0.02);
    const g = this.clouds;
    g.clear();
    // small clouds drifting
    for (let i = 0; i < 4; i++) {
      const x = ((this.drift * (0.01 + i * 0.004) + i * 380) % (w + 200)) - 100;
      const y = h * (0.1 + i * 0.1);
      g.ellipse(x, y, 40, 14).fill({ color: 0xffffff, alpha: 0.8 });
      g.ellipse(x - 22, y + 4, 22, 10).fill({ color: 0xffffff, alpha: 0.8 });
      g.ellipse(x + 24, y + 4, 24, 11).fill({ color: 0xffffff, alpha: 0.8 });
    }
    // hearts floating up + twinkles
    for (let i = 0; i < 12; i++) {
      const period = 9000 + rand(i) * 6000;
      const k = ((this.drift + rand(i + 5) * period) % period) / period;
      const x = rand(i + 11) * w + Math.sin(k * TAU_BD * 2 + i) * 14;
      const y = h * (1.05 - k * 1.1);
      const r = 4 + rand(i + 17) * 5;
      const col = i % 3 === 0 ? 0xff6f91 : i % 3 === 1 ? 0xffb3c6 : 0xd6a3ff;
      const a = Math.sin(k * Math.PI) * 0.7;
      g.circle(x - r * 0.5, y, r * 0.55).fill({ color: col, alpha: a });
      g.circle(x + r * 0.5, y, r * 0.55).fill({ color: col, alpha: a });
      g.poly([{ x: x - r * 1.05, y: y + r * 0.2 }, { x: x + r * 1.05, y: y + r * 0.2 }, { x, y: y + r * 1.2 }]).fill({ color: col, alpha: a });
    }
    for (let i = 0; i < 16; i++) {
      const tw = Math.max(0, Math.sin(this.drift / (500 + rand(i + 40) * 700) + i));
      const x = rand(i + 70) * w;
      const y = rand(i + 90) * h * 0.7;
      g.moveTo(x - 4 * tw, y).lineTo(x + 4 * tw, y).moveTo(x, y - 4 * tw).lineTo(x, y + 4 * tw).stroke({ width: 1.5, color: 0xffffff, alpha: tw });
    }
  }

  /** 'funpark' theme: warm night under a glass-and-brass dome, with festoon lights glowing far overhead */
  private drawDome(w: number, h: number) {
    const sky = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0x0f0a14 },
        { offset: 0.55, color: 0x24160f },
        { offset: 1, color: 0x3a2416 },
      ],
      textureSpace: 'local',
    });
    this.sky.rect(0, 0, w, h).fill(sky);
    for (let i = 0; i < 70; i++) {
      this.sky.circle(rand(i + 200) * w, rand(i + 300) * h * 0.6, 0.4 + rand(i + 400) * 1.1).fill({ color: 0xffffff, alpha: 0.2 + rand(i + 500) * 0.35 });
    }
    // dome ribs and rings of brass across the glass
    const cx = w / 2;
    const cy = h * 1.15;
    const R = Math.max(w, h) * 1.05;
    for (let i = 0; i < 15; i++) {
      const a = Math.PI + (i / 14) * Math.PI;
      this.hills.moveTo(cx, cy).lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R).stroke({ width: 2, color: 0xe2b24f, alpha: 0.12 });
    }
    for (const k of [0.4, 0.6, 0.8, 1]) this.hills.arc(cx, cy, R * k, Math.PI, TAU_BD).stroke({ width: k === 1 ? 5 : 2, color: 0xe2b24f, alpha: 0.16 });
  }

  private tickDome(dtMs: number, w: number, h: number, worldX: number, worldY: number) {
    this.drift += dtMs;
    this.hills.position.set(worldX * 0.03, worldY * 0.02);
    const g = this.clouds;
    g.clear();
    // soft warm bokeh drifting in the haze
    for (let i = 0; i < 22; i++) {
      const x = (((rand(i + 11) * w + worldX * 0.05) % w) + w) % w;
      const y = rand(i + 31) * h * 0.6 + Math.sin(this.drift / 1800 + i) * 6 + worldY * 0.04;
      const r = 6 + rand(i + 51) * 14;
      const a = 0.08 + 0.07 * Math.sin(this.drift / (900 + rand(i + 71) * 900) + i);
      g.circle(x, y, r).fill({ color: i % 3 ? 0xffd98a : 0xff9a5c, alpha: a });
      g.circle(x, y, r * 0.35).fill({ color: 0xfff1c8, alpha: Math.min(1, a * 1.8) });
    }
    // two festoon strings swaying across the top of the view
    for (let s = 0; s < 2; s++) {
      const y0 = h * (0.06 + s * 0.09) + worldY * 0.02;
      const sag = 30 + s * 12 + Math.sin(this.drift / 1400 + s) * 4;
      const x0 = -30;
      const x1 = w + 30;
      const mx = w / 2 + worldX * 0.02;
      g.moveTo(x0, y0).quadraticCurveTo(mx, y0 + sag * 2, x1, y0).stroke({ width: 1.2, color: 0x1a120d, alpha: 0.9 });
      const n = Math.max(6, Math.floor(w / 56));
      for (let i = 1; i < n; i++) {
        const k = i / n;
        const u = 1 - k;
        const px = u * u * x0 + 2 * u * k * mx + k * k * x1;
        const py = u * u * y0 + 2 * u * k * (y0 + sag * 2) + k * k * y0;
        const tw = 0.75 + 0.25 * Math.sin(this.drift / 500 + i * 1.7 + s);
        g.circle(px, py + 5, 10).fill({ color: 0xffd98a, alpha: 0.14 * tw });
        g.circle(px, py + 5, 2.6).fill({ color: 0xfff1c8, alpha: tw });
      }
    }
  }

  /** 'lab' theme: deep-space gradient, nebula haze, a ringed planet and a fixed star field */
  private drawSpace(w: number, h: number) {
    const sky = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0x07061a },
        { offset: 0.55, color: 0x1a1442 },
        { offset: 1, color: 0x3a2263 },
      ],
      textureSpace: 'local',
    });
    this.sky.rect(0, 0, w, h).fill(sky);
    const nebulae: Array<[number, number, number, number]> = [
      [0.2, 0.3, 220, 0x9b6bdc],
      [0.75, 0.7, 260, 0xff6f91],
      [0.5, 0.1, 180, 0x3f8fe0],
    ];
    for (const [kx, ky, r, col] of nebulae) {
      this.sky.circle(w * kx, h * ky, r).fill({ color: col, alpha: 0.07 });
      this.sky.circle(w * kx, h * ky, r * 0.55).fill({ color: col, alpha: 0.06 });
    }
    for (let i = 0; i < 140; i++) {
      this.sky.circle(rand(i) * w, rand(i + 500) * h, 0.5 + rand(i + 900) * 1.2).fill({ color: 0xffffff, alpha: 0.25 + rand(i + 1300) * 0.6 });
    }
    const px = w * 0.84;
    const py = h * 0.2;
    this.hills.circle(px, py, 54).fill(0x6b4fb0);
    this.hills.circle(px - 14, py - 16, 40).fill({ color: 0x9b7be0, alpha: 0.5 });
    this.hills.ellipse(px, py + 4, 92, 16).stroke({ width: 5, color: 0xd6a3ff, alpha: 0.6 });
    this.hills.circle(w * 0.1, h * 0.78, 16).fill(0xb7b3c4);
  }

  /** twinkles, planet parallax and a shooting star every ~7s */
  private tickSpace(dtMs: number, w: number, h: number, worldX: number, worldY: number) {
    this.drift += dtMs;
    this.hills.position.set(worldX * 0.03, worldY * 0.02);
    const g = this.clouds;
    g.clear();
    for (let i = 0; i < 26; i++) {
      const a = 0.5 + 0.5 * Math.sin(this.drift / (500 + rand(i + 70) * 900) + i);
      const x = rand(i + 40) * w;
      const y = rand(i + 90) * h;
      g.circle(x, y, 1.2 + a).fill({ color: 0xffffff, alpha: a });
      if (a > 0.92) g.moveTo(x - 5, y).lineTo(x + 5, y).moveTo(x, y - 5).lineTo(x, y + 5).stroke({ width: 1, color: 0xffffff, alpha: (a - 0.92) * 10 });
    }
    const k = (this.drift % 7000) / 900;
    if (k < 1) {
      const sx = w * 0.15 + k * w * 0.45;
      const sy = h * 0.08 + k * h * 0.18;
      g.moveTo(sx, sy).lineTo(sx - 60, sy - 24).stroke({ width: 2, color: 0xffffff, alpha: 1 - k });
      g.circle(sx, sy, 2.5).fill({ color: 0xffffff, alpha: 1 - k });
    }
  }

  update(dtMs: number, w: number, h: number, worldX: number, worldY: number) {
    if (w !== this.w || h !== this.h) this.redraw(w, h);
    if (this.theme === 'lab') return this.tickSpace(dtMs, w, h, worldX, worldY);
    if (this.theme === 'beach') return this.tickSunset(dtMs, w, h, worldX, worldY);
    if (this.theme === 'dream') return this.tickDream(dtMs, w, h, worldX, worldY);
    if (this.theme === 'funpark') return this.tickDome(dtMs, w, h, worldX, worldY);
    if (!this.outdoor()) return;
    this.drift = (this.drift + dtMs * 0.008) % (w + 200);
    // parallax: hills follow the camera at 8%, clouds at 4%
    this.hills.position.set(worldX * 0.08 - 40, worldY * 0.06);
    const g = this.clouds;
    g.clear();
    for (let i = 0; i < 5; i++) {
      const x = ((i * 173 + this.drift) % (w + 200)) - 100 + worldX * 0.04;
      const y = h * (0.12 + ((i * 37) % 30) / 100) + worldY * 0.03;
      const s = 0.8 + ((i * 13) % 5) / 10;
      g.ellipse(x, y, 34 * s, 14 * s).fill({ color: 0xffffff, alpha: 0.85 });
      g.ellipse(x - 22 * s, y + 4, 20 * s, 10 * s).fill({ color: 0xffffff, alpha: 0.85 });
      g.ellipse(x + 24 * s, y + 5, 22 * s, 11 * s).fill({ color: 0xffffff, alpha: 0.85 });
      g.ellipse(x + 4, y - 8 * s, 22 * s, 13 * s).fill({ color: 0xffffff, alpha: 0.9 });
    }
  }
}

const TAU_BD = Math.PI * 2;

/** stable 0..1 hash for star positions */
function rand(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function shadeHex(colour: number, k: number): number {
  const ch = (sh: number) => Math.min(255, Math.round(((colour >> sh) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
