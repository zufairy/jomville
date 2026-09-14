import { Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { AvatarConfig, kitchen, tileToScreen } from '@dovey/shared';
import { Avatar } from '../game/avatar';
import { PX } from '../game/pixelArt';
import { avatarDir } from './aim';
import type { IsoSprite } from './isoRaster';
import { hatSprite, itemSprite } from './kitchenPixels';
import { mapTexture } from './pixelTexture';

/** hat band sits this far above the feet (world px) */
export const HAT_Y = -60;
/** held items float at chest height */
const HELD_Y = -22;
/** facing the camera: carried at the hands, below the face */
const HELD_Y_FRONT = -10;

const TAG_STYLE = new TextStyle({
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSize: 11,
  fontWeight: '800',
  fill: 0xffffff,
  stroke: { color: 0x2a1a14, width: 3 },
});

/** puts a pixel sprite so its anchor art pixel lands on (wx, wy) */
export function place(s: Sprite, iso: IsoSprite, wx: number, wy: number) {
  const tex = mapTexture(iso.map);
  if (s.texture !== tex) s.texture = tex;
  s.scale.set(PX);
  s.position.set(Math.round(wx - iso.ax * PX), Math.round(wy - iso.ay * PX));
}

/** One chef: the player's LPC avatar, a white toque, the held item and a coloured name tag. */
export class ChefSprite extends Container {
  readonly avatar: Avatar;
  /** drawn in the fx layer so counters never hide names */
  readonly tag = new Container();
  private hat = new Sprite();
  private held = new Sprite();
  private feet = new Graphics();
  private last = { x: NaN, y: NaN };
  private still = 0;

  constructor(cfg: AvatarConfig, name: string, color: number, me: boolean) {
    super();
    this.sortableChildren = true;
    this.feet.ellipse(0, 1, 19, 8).stroke({ width: me ? 3 : 2, color, alpha: me ? 0.95 : 0.6 });
    this.feet.zIndex = 0;
    this.avatar = new Avatar(0, 0, cfg);
    this.avatar.position.set(0, 0);
    this.avatar.zIndex = 1;
    place(this.hat, hatSprite(), 0, HAT_Y);
    this.hat.zIndex = 2;
    this.held.zIndex = 3;
    this.held.visible = false;
    this.addChild(this.feet, this.avatar, this.hat, this.held);

    const label = new Text({ text: name, style: TAG_STYLE });
    label.resolution = 2;
    label.anchor.set(0.5, 0);
    const w = Math.max(28, label.width + 12);
    const pill = new Graphics().roundRect(-w / 2, 0, w, 16, 8).fill({ color, alpha: 0.92 }).stroke({ width: 2, color: 0x2a1a14 });
    label.position.set(0, 1);
    this.tag.addChild(pill, label);
  }

  setLook(cfg: AvatarConfig) {
    this.avatar.setConfig(cfg);
  }

  update(pose: { x: number; y: number; fx: number; fy: number }, held: kitchen.Item | null, chopping: boolean, away: boolean, dtMs: number, now: number) {
    const p = tileToScreen(pose.x, pose.y);
    const moved = Math.hypot(p.x - this.last.x, p.y - this.last.y);
    // interpolation hands us tiny steps; only walk after a couple of still-free frames
    this.still = moved > 0.3 ? 0 : this.still + dtMs;
    this.last = { x: p.x, y: p.y };
    this.position.set(Math.round(p.x), Math.round(p.y));
    this.zIndex = pose.x + pose.y - 1 + 0.01;
    const dir = avatarDir(pose.fx, pose.fy);
    this.avatar.moving = this.still < 90;
    this.avatar.setDir(dir);
    this.avatar.tick(dtMs);
    // the toque wobbles while chopping
    this.hat.rotation = chopping ? Math.sin(now / 45) * 0.08 : 0;
    this.hat.position.y = Math.round(HAT_Y - hatSprite().ay * PX + (chopping ? Math.abs(Math.sin(now / 90)) * 2 : 0));
    if (held) {
      const side = dir === 1 ? 12 : dir === 3 ? -12 : 0;
      const bob = Math.round(Math.sin(now / 260) * 1.5);
      // facing the camera the item sits lower and a bit smaller, in the hands rather than over the face
      const front = dir === 2;
      const spr = itemSprite(held, Math.floor(now / 140));
      place(this.held, spr, side, (front ? HELD_Y_FRONT : HELD_Y) + bob);
      if (front) {
        const s = PX * 0.8;
        this.held.scale.set(s);
        this.held.position.set(Math.round(side - spr.ax * s), Math.round(HELD_Y_FRONT + bob - spr.ay * s));
      }
      this.held.zIndex = dir === 0 ? 0.5 : 3;
      this.held.visible = true;
    } else this.held.visible = false;
    this.alpha = away ? 0.4 : 1;
    this.tag.alpha = this.alpha;
    this.tag.position.set(this.position.x, this.position.y + 10);
  }

  override destroy() {
    this.tag.destroy({ children: true });
    super.destroy({ children: true });
  }
}
