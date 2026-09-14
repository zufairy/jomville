import { Container, Graphics, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { AvatarConfig, GEAR_USE_MS, TILE_H, serializeAvatar, tileToScreen } from '@dovey/shared';
import { COLS, Composite, FRAME, Layer, Manifest, composite, dirRow, findPart, loadManifest, sheetFor } from './lpc';
import { GEAR_CELL, GEAR_FRAMES, GEAR_FRAME_MS, GEAR_OY, GEAR_RES, gearIds, gearLift, gearSheet, paintGearCell } from './gearArt';

/** Bodies are drawn this much larger than the pack's 64px frames; anything placed relative to an avatar scales by it. */
export const AVATAR_SCALE = 1.3;

const WALK_FRAME_MS = 105;
const TAG_STYLE = new TextStyle({
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSize: 11,
  fontWeight: '700',
  fill: 0x3b2a2a,
  stroke: { color: 0xfff7e6, width: 3 },
});

/** Eye layer sits at this z in the pack; parts below and above it are batched separately. */
const EYE_Z = 105;

export type Expression = 'happy' | 'surprised' | 'sad' | 'heart' | 'wink' | 'angry';
export type Action = 'hop' | 'wiggle';

/** Where the sticker overlay sits above the head, in frame pixels. */
const STICKER_Y = -46;

/**
 * Seated pose. The pack has no sit frames, so the standing frame is cut at the
 * hips (row 51 of 64) and the legs are re-laid as a bent thigh and a hanging
 * shin. Rows measured on the LPC body: head 15, hips 51, knees 56, feet 62.
 */
const HIP_Y = 51;
const KNEE_Y = 56;
const FEET_Y = 62;
/** standing hips sit this far above the sprite anchor */
const STAND_HIP = 64 - HIP_Y;
const SIT_MS = 190;

interface Cuts {
  upper: Texture;
  thigh: Texture;
  shin: Texture;
}
const CUTS = new WeakMap<Texture, Cuts>();

/** Sub-textures of one frame: they share the composite's GPU source, so they cost nothing to upload. */
function cutsOf(tex: Texture): Cuts {
  let c = CUTS.get(tex);
  if (!c) {
    const f = tex.frame;
    const part = (y0: number, y1: number) => new Texture({ source: tex.source, frame: new Rectangle(f.x, f.y + y0, f.width, y1 - y0) });
    c = { upper: part(0, HIP_Y), thigh: part(HIP_Y, KNEE_Y + 1), shin: part(KNEE_Y, FEET_Y) };
    CUTS.set(tex, c);
  }
  return c;
}

/** Gear sheet canvas -> frame textures [row][frame], sharing one GPU upload per sheet. */
const GEAR_TEX = new WeakMap<HTMLCanvasElement, Texture[][]>();
function gearFrames(sheet: HTMLCanvasElement | null): Texture[][] | null {
  if (!sheet) return null;
  let rows = GEAR_TEX.get(sheet);
  if (!rows) {
    const base = Texture.from(sheet);
    const px = GEAR_CELL * GEAR_RES;
    rows = Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: GEAR_FRAMES }, (_, f) => new Texture({ source: base.source, frame: new Rectangle(f * px, r * px, px, px) })),
    );
    GEAR_TEX.set(sheet, rows);
  }
  return rows;
}

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

function layersFor(m: Manifest, cfg: AvatarConfig): { below: Layer[]; eyes: Layer[]; above: Layer[] } {
  const below: Layer[] = [];
  const eyes: Layer[] = [];
  const above: Layer[] = [];
  const add = (id: string, variant: string) => {
    const part = findPart(m, id);
    if (!part) return;
    const rel = sheetFor(part, cfg.body, variant);
    if (!rel) return;
    const layer = { rel, z: part.z };
    if (part.z === EYE_Z) eyes.push(layer);
    else if (part.z < EYE_Z) below.push(layer);
    else above.push(layer);
  };
  add('body', cfg.skin);
  add('head', cfg.skin);
  add('eyes', cfg.eyes);
  add(cfg.feet, cfg.feetColour);
  add(cfg.legs, cfg.legsColour);
  add(cfg.torso, cfg.torsoColour);
  if (cfg.hair !== 'none') add(cfg.hair, cfg.hairColour);
  if (cfg.hat && cfg.hat !== 'none') add(cfg.hat, cfg.hatColour ?? 'black');
  return { below, eyes, above };
}

/**
 * One player. The look is three stacked sprite sheets (everything under the
 * eyes, the eyes alone, then hair and hats), so the eyes can blink and emote
 * independently of the body while still being real art from the pack. Drawn
 * gear rides on top: back pieces and auras behind the body, eyewear and
 * helmets in front, each an animated sheet.
 */
export class Avatar extends Container {
  tx: number;
  ty: number;
  dir = 2;
  moving = false;

  private below = new Sprite();
  private eyes = new Sprite();
  private above = new Sprite();
  private gearBack = new Sprite();
  private gearFront = new Sprite();
  private sticker = new Graphics();
  private shadow = new Graphics().ellipse(0, 0, 15, 6).fill({ color: 0x3b2a2a, alpha: 0.2 });

  private sets: { below?: Composite; eyes?: Composite; above?: Composite } = {};
  private gear: { back: Texture[][] | null; front: Texture[][] | null } = { back: null, front: null };
  private gearClock = Math.random() * 1000;
  private gearFrame = 0;
  private gearList: string[] = [];
  /** a gear "use" in progress: its layers are painted live for GEAR_USE_MS */
  private use: { t: number; lift: number; layers: Array<{ canvas: HTMLCanvasElement; tex: Texture; sprite: Sprite; layer: 'back' | 'front' }> } | null = null;
  /** how far a use has lifted the body off the floor (wings, jetpacks) */
  private lift = 0;
  private key = '';
  private frame = 0;
  private walkClock = 0;

  private blinkIn = 1500 + Math.random() * 4000;
  private blinkPhase = 0;
  private eyeScale = 1;
  private expression: { state: Expression; until: number } | null = null;
  private action: { kind: Action; t: number; dur: number } | null = null;
  private bob = 0;
  private sitting = false;
  /** hip height above the floor and whether the bent legs show */
  private seat = { z: 14, legs: true };
  /** 0 standing .. 1 settled into the seat */
  private sitK = 0;
  private breathClock = Math.random() * 4000;
  private breath = 0;
  private thigh = new Sprite();
  private shin = new Sprite();
  /** extra depth so a seated body draws above its seat (set by the game) */
  zBias = 0;

  constructor(tx: number, ty: number, cfg: AvatarConfig, handle = '') {
    super();
    this.scale.set(AVATAR_SCALE);
    this.tx = tx;
    this.ty = ty;
    for (const s of [this.below, this.eyes, this.above]) {
      s.anchor.set(0.5, 1);
      s.visible = false;
    }
    for (const s of [this.gearBack, this.gearFront]) {
      // the gear cell's frame bottom lines up with the body frame's feet
      s.anchor.set(0.5, (GEAR_OY + FRAME) / GEAR_CELL);
      s.scale.set(1 / GEAR_RES);
      s.visible = false;
    }
    for (const s of [this.thigh, this.shin]) {
      s.anchor.set(0.5, 0);
      s.visible = false;
    }
    this.shadow.visible = false;
    this.addChild(this.shadow, this.gearBack, this.shin, this.below, this.thigh, this.eyes, this.above, this.gearFront, this.sticker);
    if (handle) {
      const tag = new Text({ text: handle, style: TAG_STYLE });
      tag.anchor.set(0.5, 0);
      tag.position.set(0, 6);
      tag.resolution = 2;
      // names stay the same size however big the body is drawn
      tag.scale.set(1 / AVATAR_SCALE);
      this.addChild(tag);
    }
    this.setConfig(cfg);
    this.syncPosition();
  }

  get configKey() {
    return this.key;
  }

  setConfig(cfg: AvatarConfig) {
    const key = serializeAvatar(cfg);
    if (key === this.key) return;
    this.key = key;
    const ids = gearIds(cfg);
    this.gearList = ids;
    this.gear = { back: gearFrames(gearSheet(ids, 'back')), front: gearFrames(gearSheet(ids, 'front')) };
    this.applyGear();
    void this.build(key, cfg);
  }

  private async build(key: string, cfg: AvatarConfig) {
    let m: Manifest;
    try {
      m = await loadManifest();
    } catch {
      return;
    }
    if (this.destroyed || this.key !== key) return;
    const { below, eyes, above } = layersFor(m, cfg);
    // eye sheets are shared across looks, so key them by colour alone
    const [b, e, a] = await Promise.all([
      composite(`b:${key}`, below),
      eyes.length ? composite(`e:${cfg.eyes}`, eyes) : Promise.resolve(undefined),
      above.length ? composite(`a:${key}`, above) : Promise.resolve(undefined),
    ]);
    if (this.destroyed || this.key !== key) return;
    this.sets = { below: b, eyes: e, above: a };
    this.applyFrame();
  }

  /**
   * Sit with the hips on a surface `seatZ` px above the floor. The body eases
   * down onto the seat, legs bend forward, and the walk cycle stops.
   */
  setSitting(on: boolean, seatZ = 14, legs = true) {
    // seat heights are world pixels; the body is drawn AVATAR_SCALE larger, so convert to frame pixels
    const z = seatZ / AVATAR_SCALE;
    if (on === this.sitting && (!on || (z === this.seat.z && legs === this.seat.legs))) return;
    if (on !== this.sitting) this.sitK = 0;
    this.sitting = on;
    this.seat = { z, legs };
    this.applyFrame();
  }

  setDir(d: number) {
    if (d === this.dir) return;
    this.dir = d;
    this.applyFrame();
  }

  private pick(set: Composite | undefined, sprite: Sprite, row: number): void {
    if (!set) {
      sprite.visible = false;
      return;
    }
    const tex = set.frames[row][this.sitting ? 0 : this.frame] ?? Texture.EMPTY;
    // seated: only the part above the hips; the legs are laid out separately
    sprite.texture = this.sitting && tex !== Texture.EMPTY ? cutsOf(tex).upper : tex;
    sprite.visible = true;
  }

  /** Current gear frame for the current facing; gear waits for the body so it never floats alone. */
  private applyGear() {
    // a use paints its own live textures until it ends
    if (this.use) return;
    const row = dirRow(this.dir);
    const show = !!this.sets.below;
    for (const [rows, sprite] of [
      [this.gear.back, this.gearBack],
      [this.gear.front, this.gearFront],
    ] as const) {
      sprite.visible = show && !!rows;
      if (rows) sprite.texture = rows[row][this.gearFrame];
    }
  }

  private applyFrame() {
    const row = dirRow(this.dir);
    this.pick(this.sets.below, this.below, row);
    this.pick(this.sets.eyes, this.eyes, row);
    this.pick(this.sets.above, this.above, row);
    this.applyGear();
    // eyes are hidden from behind anyway; skip the blink squash there
    this.eyes.scale.y = this.dir === 0 ? 1 : this.eyeScale;
    const legs = this.sitting && this.seat.legs && this.dir !== 0 && !!this.sets.below;
    this.thigh.visible = this.shin.visible = legs;
    if (legs) {
      const tex = this.sets.below!.frames[row][0];
      if (tex && tex !== Texture.EMPTY) {
        const c = cutsOf(tex);
        this.thigh.texture = c.thigh;
        this.shin.texture = c.shin;
      }
    }
    this.shadow.visible = !this.sitting && !!this.sets.below;
    this.layout();
  }

  /** Gear is anchored at the feet, so a seated body lifts it by the hip-to-feet height. */
  private placeGear(feetY: number) {
    this.gearBack.position.y = this.gearFront.position.y = feetY;
  }

  /** Place the body parts for standing, sitting down, or seated breathing. */
  private layout() {
    const upper = [this.below, this.eyes, this.above];
    if (!this.sitting) {
      const up = this.bob + this.lift;
      for (const s of upper) s.position.y = -up;
      this.placeGear(-up);
      return;
    }
    const k = easeOut(Math.min(1, this.sitK));
    // hips travel from standing height onto the seat surface
    const hip = -(STAND_HIP + (this.seat.z - STAND_HIP) * k);
    const upperY = Math.round(hip - this.bob - this.breath - this.lift);
    for (const s of upper) s.position.y = upperY;
    this.placeGear(upperY + STAND_HIP);
    if (!this.thigh.visible) return;
    const thighLen = KNEE_Y + 1 - HIP_Y;
    const shinLen = FEET_Y - KNEE_Y;
    if (this.dir === 2) {
      // facing the viewer: thighs come toward us (foreshortened), shins hang below the knees
      this.thigh.rotation = 0;
      this.thigh.scale.set(1, 0.5 + 0.5 * (1 - k));
      this.thigh.position.set(0, Math.round(hip));
      this.shin.rotation = 0;
      this.shin.scale.set(1, 1);
      this.shin.position.set(0, Math.round(hip + thighLen * this.thigh.scale.y));
    } else {
      // side on: thighs swing forward level with the seat, shins drop from the knee
      const fwd = this.dir === 1 ? 1 : -1;
      this.thigh.rotation = -fwd * (Math.PI / 2) * k;
      this.thigh.scale.set(0.62, 1.45);
      this.thigh.position.set(0, Math.round(hip + 2));
      const reach = thighLen * 1.45 * k;
      this.shin.rotation = 0;
      this.shin.scale.set(0.7, 1.35);
      this.shin.position.set(Math.round(fwd * reach), Math.round(hip + 1));
    }
    void shinLen;
  }

  /** Play worn gear's "use" move (tapping yourself). Returns false when nothing is worn. */
  useGear(): boolean {
    if (!this.gearList.length || this.destroyed) return false;
    this.endUse();
    const px = GEAR_CELL * GEAR_RES;
    const layers = (['back', 'front'] as const).map((layer) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = px;
      return { canvas, tex: Texture.from(canvas), sprite: layer === 'back' ? this.gearBack : this.gearFront, layer };
    });
    this.use = { t: 0, lift: gearLift(this.gearList), layers };
    this.tickUse(0);
    return true;
  }

  private endUse() {
    const use = this.use;
    if (!use) return;
    this.use = null;
    this.lift = 0;
    for (const l of use.layers) {
      if (l.sprite.texture === l.tex) l.sprite.texture = Texture.EMPTY;
      l.tex.destroy(true);
    }
    if (this.destroyed) return;
    this.applyGear();
    this.layout();
  }

  private tickUse(dtMs: number) {
    const use = this.use;
    if (!use) return;
    use.t += dtMs;
    const u = use.t / GEAR_USE_MS;
    if (u >= 1) return this.endUse();
    const loop = GEAR_FRAMES * GEAR_FRAME_MS;
    const t = (this.gearClock % loop) / loop;
    for (const l of use.layers) {
      const c = l.canvas.getContext('2d');
      if (!c) continue;
      c.clearRect(0, 0, l.canvas.width, l.canvas.height);
      paintGearCell(c, this.gearList, this.dir, l.layer, t, u);
      l.tex.source.update();
      l.sprite.texture = l.tex;
      l.sprite.visible = !!this.sets.below;
    }
    this.lift = Math.sin(Math.PI * u) * use.lift;
    this.layout();
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.endUse();
    super.destroy(options);
  }

  syncPosition() {
    const p = tileToScreen(this.tx, this.ty);
    this.position.set(Math.round(p.x), Math.round(p.y + TILE_H / 2 + 2));
    this.zIndex = this.tx + this.ty + this.zBias;
  }

  /** Show an expression for a while (from emotes), then return to blinking. */
  express(state: Expression, ms = 1800) {
    this.expression = { state, until: performance.now() + ms };
    this.drawSticker(state);
  }

  /** Small whole-body action (from emotes). */
  act(kind: Action, dur = 600) {
    this.action = { kind, t: 0, dur };
  }

  /**
   * Expression stickers. The pack has no expression frames, so feelings are
   * drawn marks beside the head rather than a redrawn face.
   */
  private drawSticker(state: Expression | null) {
    const g = this.sticker;
    g.clear();
    if (!state) return;
    const y = STICKER_Y;
    switch (state) {
      case 'heart':
        for (const [dx, dy, s] of [[-16, y, 1], [16, y - 6, 0.75]] as const) {
          const r = 5 * s;
          g.moveTo(dx, dy + r * 1.2)
            .bezierCurveTo(dx - r * 2, dy - r * 0.6, dx - r * 0.9, dy - r * 1.8, dx, dy - r * 0.4)
            .bezierCurveTo(dx + r * 0.9, dy - r * 1.8, dx + r * 2, dy - r * 0.6, dx, dy + r * 1.2)
            .fill(0xff6f91);
        }
        break;
      case 'happy':
        for (const [dx, dy] of [[-17, y], [17, y - 4]] as const) {
          g.moveTo(dx - 5, dy).lineTo(dx + 5, dy).moveTo(dx, dy - 5).lineTo(dx, dy + 5).stroke({ width: 2.5, color: 0xf9d66b });
          g.moveTo(dx - 3.5, dy - 3.5).lineTo(dx + 3.5, dy + 3.5).moveTo(dx - 3.5, dy + 3.5).lineTo(dx + 3.5, dy - 3.5).stroke({ width: 2, color: 0xf9d66b });
        }
        break;
      case 'surprised':
        g.roundRect(10, y - 10, 7, 14, 3).fill(0xffffff).stroke({ width: 2, color: 0x3b2a2a });
        g.circle(13.5, y + 8, 3).fill(0xffffff).stroke({ width: 2, color: 0x3b2a2a });
        break;
      case 'sad':
        for (const dx of [-14, 14]) g.ellipse(dx, y + 8, 3, 5).fill(0x7ecbff).stroke({ width: 1.5, color: 0x3f8fe0 });
        break;
      case 'angry':
        g.moveTo(12, y - 6).lineTo(22, y + 2).moveTo(22, y - 6).lineTo(12, y + 2).stroke({ width: 3, color: 0xe0553d });
        break;
      case 'wink':
        g.circle(16, y, 6).fill(0xfff1a8).stroke({ width: 2, color: 0xf2b632 });
        g.moveTo(13, y).lineTo(19, y).stroke({ width: 2, color: 0x3b2a2a });
        break;
    }
  }

  private tickEyes(dtMs: number) {
    const now = performance.now();
    if (this.expression && now >= this.expression.until) {
      this.expression = null;
      this.drawSticker(null);
    }
    this.blinkIn -= dtMs;
    if (this.blinkIn > 0) return;
    // squash the eye layer rather than swapping art: the pack has no blink frames
    const seq: Array<[number, number]> = [
      [0.55, 45],
      [0.06, 85],
      [0.55, 45],
      [1, 0],
    ];
    const step = seq[this.blinkPhase];
    this.blinkPhase++;
    if (!step) {
      this.blinkPhase = 0;
      this.blinkIn = 1800 + Math.random() * 4500;
      return;
    }
    this.eyeScale = step[0];
    this.eyes.scale.y = this.dir === 0 ? 1 : this.eyeScale;
    this.blinkIn = step[1];
  }

  private setBodyRotation(r: number) {
    this.below.rotation = this.eyes.rotation = this.above.rotation = this.gearBack.rotation = this.gearFront.rotation = r;
  }

  private tickAction(dtMs: number) {
    if (!this.action) {
      if (this.bob !== 0) {
        this.bob = 0;
        this.applyFrame();
      }
      this.setBodyRotation(0);
      return;
    }
    this.action.t += dtMs;
    const k = Math.min(1, this.action.t / this.action.dur);
    if (this.action.kind === 'hop') {
      this.bob = Math.sin(k * Math.PI) * 12;
      this.applyFrame();
    } else {
      this.setBodyRotation(Math.sin(k * Math.PI * 4) * 0.1 * (1 - k));
    }
    if (k >= 1) this.action = null;
  }

  private tickGear(dtMs: number) {
    if (!this.gear.back && !this.gear.front) return;
    this.gearClock += dtMs;
    const f = Math.floor(this.gearClock / GEAR_FRAME_MS) % GEAR_FRAMES;
    if (f === this.gearFrame) return;
    this.gearFrame = f;
    this.applyGear();
  }

  tick(dtMs: number) {
    this.tickEyes(dtMs);
    this.tickAction(dtMs);
    this.tickGear(dtMs);
    this.tickUse(dtMs);
    if (this.sitting) {
      let dirty = false;
      if (this.sitK < 1) {
        this.sitK = Math.min(1, this.sitK + dtMs / SIT_MS);
        dirty = true;
      }
      // a slow one-pixel breath once settled
      this.breathClock += dtMs;
      const breath = this.sitK >= 1 && Math.sin(this.breathClock / 700) > 0.35 ? 1 : 0;
      if (breath !== this.breath) {
        this.breath = breath;
        dirty = true;
      }
      if (dirty) this.layout();
    } else if (this.breath) {
      this.breath = 0;
    }
    if (this.moving && !this.sitting) {
      this.walkClock += dtMs;
      // column 0 is the standing pose; the cycle runs 1..8
      const f = 1 + (Math.floor(this.walkClock / WALK_FRAME_MS) % (COLS - 1));
      if (f !== this.frame) {
        this.frame = f;
        this.applyFrame();
      }
    } else if (this.frame !== 0) {
      this.frame = 0;
      this.walkClock = 0;
      this.applyFrame();
    }
  }
}
