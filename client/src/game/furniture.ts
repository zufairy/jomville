import { AnimatedSprite, Container, Texture } from 'pixi.js';
import { Placement, RIDE_PLATFORMS, footprint, furnitureDef, tileToScreen } from '@dovey/shared';
import { atlas } from './atlas';
import { holoLockSequence, lidSequence } from './casinoPixels';

/** each lid-swing frame shows this long (3 frames ~ 200 ms) */
const LID_STEP_MS = 70;

/** Animation speed: frames per second for looping items. */
const FPS: Record<number, number> = { 4: 3, 6: 6, 8: 8, 12: 8 };

/**
 * One placed furniture item, drawn from the baked atlas. Animated items play
 * their frame strip; on/off swaps to the other strip.
 */
export class FurnitureSprite extends Container {
  private sprite = new AnimatedSprite([Texture.EMPTY]);
  /** state key shown instead of placement.state while the lid swings or the hologram locks in */
  private lidKey: string | null = null;
  private lidTimer: ReturnType<typeof setTimeout> | null = null;
  placement: Placement;
  lit: boolean;

  constructor(placement: Placement) {
    super();
    this.placement = placement;
    this.lit = placement.on ?? true;
    this.sprite.roundPixels = true;
    this.addChild(this.sprite);
    this.redraw();
  }

  setPlacement(p: Placement) {
    const changed =
      p.def !== this.placement.def || p.rot !== this.placement.rot || (p.on ?? true) !== this.lit || (p.state ?? '') !== (this.placement.state ?? '');
    const from = this.placement.state ?? '';
    this.placement = p;
    this.lit = p.on ?? true;
    const kind = changed ? furnitureDef(p.def)?.kind : undefined;
    const seq = kind === 'dicemaster' ? lidSequence(from, p.state ?? '') : kind === 'holodice' ? holoLockSequence(from, p.state ?? '') : null;
    if (seq) this.playLid(seq);
    else if (changed) {
      this.stopLid();
      this.redraw();
    }
    else this.place();
  }

  /** plays client-only state keys (dicemaster lid swing, holodice lock-in), then settles on the real state */
  private playLid(keys: readonly string[]) {
    this.stopLid();
    let i = 0;
    const step = () => {
      if (i < keys.length) {
        this.lidKey = keys[i++];
        this.redraw();
        this.lidTimer = setTimeout(step, LID_STEP_MS);
      } else {
        this.lidTimer = null;
        this.lidKey = null;
        this.redraw();
      }
    };
    step();
  }

  private stopLid() {
    if (this.lidTimer) clearTimeout(this.lidTimer);
    this.lidTimer = null;
    this.lidKey = null;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.stopLid();
    super.destroy(options);
  }

  setGhost(on: boolean, valid = true) {
    this.alpha = on ? 0.55 : 1;
    this.sprite.tint = on && !valid ? 0xff6666 : 0xffffff;
  }

  setSelected(on: boolean) {
    this.sprite.tint = on ? 0xfff0a0 : 0xffffff;
  }

  private place() {
    const d = furnitureDef(this.placement.def);
    if (!d) return;
    const p = tileToScreen(this.placement.x, this.placement.y);
    this.position.set(p.x, p.y);
    const { w, h } = footprint(d, this.placement.rot);
    // depth: far corner of footprint, nudged behind avatars standing in front.
    // Ride platforms lie flat like rugs: their horses, cups and riders are sorted live on top.
    this.zIndex = d.walkable || RIDE_PLATFORMS.has(d.id) ?-1000 + this.placement.x + this.placement.y : this.placement.x + w + this.placement.y + h - 1.5;
  }

  redraw() {
    const d = furnitureDef(this.placement.def);
    if (!d || !atlas.ready) return;
    const set = atlas.frames(d, this.placement.rot, this.lit, this.lidKey ?? this.placement.state ?? '');
    this.sprite.textures = set.textures;
    this.sprite.position.set(set.offsetX, set.offsetY);
    if (set.textures.length > 1) {
      this.sprite.animationSpeed = (set.fps ?? FPS[d.anim] ?? 6) / 60;
      // desync loops so a row of lamps doesn't flicker in lockstep
      this.sprite.gotoAndPlay(Math.floor(Math.random() * set.textures.length));
    } else {
      this.sprite.stop();
      this.sprite.gotoAndStop(0);
    }
    this.place();
  }
}
