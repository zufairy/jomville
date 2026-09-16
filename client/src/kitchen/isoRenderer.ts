import { Application, Container, Graphics, Point, Sprite, Ticker } from 'pixi.js';
import { lendGameStage } from '../game/instance';
import { AvatarConfig, DEFAULT_AVATAR, kitchen, screenToTile, tileToScreen } from '@dovey/shared';
import { Camera } from '../game/camera';
import { PX } from '../game/pixelArt';
import { useAppStore } from '../store';
import { useRoster } from '../roster';
import type { KitchenRound } from './net';
import { Vec, reachTile } from './aim';
import { ChefSprite, place } from './chefSprite';
import { chefColor, hexToNumber } from './chefColors';
import { RING_STEPS, itemKey, itemSprite, knifeSprite, markerSprite, plateStackSprite, readySprite, ringSprite } from './kitchenPixels';
import { STATION_TOP, ZC, stationSprite, stationVariant } from './stationPixels';
import { WALL_H, floorSprite, wallsSprite } from './roomPixels';
import { ksfx } from './sounds';
import type { TapPlan } from './tapControls';
import { chefLook } from './looks';

interface StationGfx {
  i: number;
  box: Container;
  base: Sprite;
  item: Sprite;
  over: Sprite;
  ring: Sprite;
  ready: Sprite;
  windowRun: boolean;
  binnedAt: number;
  shakeUntil: number;
}

const LOOK_RETRY_MS = 1000;

/**
 * The round as an isometric pixel room: walls and floor, depth-sorted stations,
 * items and LPC chefs, progress rings, tap marker and target glow; the camera
 * follows the local chef (zoom only, no panning).
 */
const BACKGROUND = 0x2b2233;
/** a private app (fallback only) is torn down without touching anything shared */
const SAFE_DESTROY = [{ removeView: true }, { children: true, texture: false, textureSource: false, context: false }] as const;

export class IsoRenderer {
  private app!: Application;
  /** only when no world game is on the page; normally the world app is borrowed */
  private own: Application | null = null;
  private release: (() => void) | null = null;
  private root = new Container();
  private tick = (t: Ticker) => this.frame(t.deltaMS);
  private world = new Container();
  private room = new Container();
  private floorFx = new Container();
  private actors = new Container();
  private fx = new Container();
  private glow = new Graphics();
  private marker = new Sprite();
  private camera = new Camera(this.world, { minX: 0, maxX: 1, minY: 0, maxY: 1 });
  private stations: StationGfx[] = [];
  private chefs = new Map<string, ChefSprite>();
  private fallbackLooks = new Map<string, number>();
  private heldKeys = new Map<string, string>();
  private floorPool: Sprite[] = [];
  private built = false;
  private ready = false;
  private destroyed = false;
  private lastPlan: TapPlan | null = null;
  private markerAt = -Infinity;
  private markerTile: Vec = { x: 0, y: 0 };
  private lastChopSfx = 0;
  private lastSizzle = 0;

  constructor(private round: KitchenRound) {}

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  /**
   * Lifecycle: borrow the world game's Pixi app (world hidden + frozen, canvas
   * moved into `el`), add our root and ticker callback. destroy() removes the
   * callback, gives the stage back (world visible again) and destroys only our
   * own scene graph; shared textures stay. A second Pixi app is only a fallback.
   */
  async mount(el: HTMLElement): Promise<boolean> {
    const lease = lendGameStage(this.root, el, BACKGROUND);
    if (lease) {
      this.app = lease.app;
      this.release = lease.release;
    } else {
      const own = new Application();
      this.own = own;
      await own.init({
        resizeTo: el,
        backgroundColor: BACKGROUND,
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        preference: 'webgl',
      });
      if (this.destroyed) {
        own.destroy(...SAFE_DESTROY);
        return false;
      }
      el.appendChild(own.canvas);
      own.canvas.style.touchAction = 'none';
      own.stage.addChild(this.root);
      this.app = own;
    }
    this.ready = true;
    this.actors.sortableChildren = true;
    this.floorFx.addChild(this.marker);
    this.marker.visible = false;
    this.fx.addChild(this.glow);
    this.world.addChild(this.room, this.floorFx, this.actors, this.fx);
    this.root.addChild(this.world);
    this.camera.deadZone = { w: 40, h: 30 };
    this.app.ticker.add(this.tick);
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.ready) return;
    this.app.ticker.remove(this.tick);
    // give the world its stage back first, then drop only the kitchen scene graph (textures are shared)
    this.release?.();
    this.release = null;
    this.root.destroy({ children: true });
    for (const g of this.chefs.values()) if (!g.destroyed) g.destroy();
    this.chefs.clear();
    this.own?.destroy(...SAFE_DESTROY);
    this.own = null;
  }

  /** the tile under a client point; station tops win over the floor behind them */
  pickTile(clientX: number, clientY: number): Vec {
    const rect = this.app.canvas.getBoundingClientRect();
    const p = this.world.toLocal(new Point(clientX - rect.left, clientY - rect.top));
    const v = this.round.view;
    const top = screenToTile(p.x, p.y + ZC * PX);
    const topTile = { x: Math.floor(top.x), y: Math.floor(top.y) };
    if (v?.stations.some((s) => s.x === topTile.x && s.y === topTile.y)) return topTile;
    const t = screenToTile(p.x, p.y);
    return { x: Math.floor(t.x), y: Math.floor(t.y) };
  }

  zoomBy(factor: number, clientX: number, clientY: number) {
    if (!this.ready || this.destroyed) return;
    const rect = this.app.canvas.getBoundingClientRect();
    this.camera.zoomAt(factor, clientX - rect.left, clientY - rect.top);
    this.camera.follow();
  }

  shake(tx: number, ty: number) {
    const v = this.round.view;
    const g = v && this.stations.find((s) => v.stations[s.i].x === tx && v.stations[s.i].y === ty);
    if (g) g.shakeUntil = performance.now() + 320;
  }

  shakeKind(kind: kitchen.StationKind) {
    const v = this.round.view;
    if (!v) return;
    for (const g of this.stations) if (v.stations[g.i].kind === kind) g.shakeUntil = performance.now() + 320;
  }

  private build(v: NonNullable<KitchenRound['view']>) {
    this.built = true;
    const walls = new Sprite();
    place(walls, wallsSprite(v.w, v.h, v.stations), 0, 0);
    const floor = new Sprite();
    place(floor, floorSprite(v.w, v.h), 0, 0);
    this.room.addChild(walls, floor);
    v.stations.forEach((st, i) => {
      const box = new Container();
      const g: StationGfx = {
        i,
        box,
        base: new Sprite(),
        item: new Sprite(),
        over: new Sprite(),
        ring: new Sprite(),
        ready: new Sprite(),
        windowRun: st.kind === 'window' && v.stations.some((o) => o.kind === 'window' && o.y === st.y && o.x === st.x - 1),
        binnedAt: -Infinity,
        shakeUntil: 0,
      };
      box.addChild(g.base, g.item, g.over);
      box.zIndex = st.x + st.y;
      this.actors.addChild(box);
      this.fx.addChild(g.ring, g.ready);
      this.stations.push(g);
    });
    kitchen.levelDef(v.level)?.rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch !== '#') return;
        const s = new Sprite();
        const p = tileToScreen(x, y);
        place(s, stationSprite('wall'), p.x, p.y);
        s.zIndex = x + y;
        this.actors.addChild(s);
      }),
    );
    const bounds = {
      minX: tileToScreen(0, v.h).x - 80,
      maxX: tileToScreen(v.w, 0).x + 80,
      minY: -WALL_H * PX - 40,
      maxY: tileToScreen(v.w, v.h).y + 90,
    };
    this.camera.setBounds(bounds);
    const { width, height } = this.app.screen;
    this.camera.setZoom(Math.min(width / (bounds.maxX - bounds.minX), height / (bounds.maxY - bounds.minY)) * 1.05);
    const mid = tileToScreen(v.w / 2, v.h / 2);
    this.camera.snapTo(mid.x, mid.y);
  }

  private lookFor(id: string): AvatarConfig | null {
    return chefLook(id, { me: this.round.me, myAvatar: useAppStore.getState().avatar, looks: this.round.looks, roster: useRoster.getState().players });
  }

  private frame(dtMs: number) {
    const r = this.round;
    const v = r.view;
    if (!v || this.destroyed) return;
    if (!this.built) this.build(v);
    const now = performance.now();
    r.predictor?.frame(dtMs);
    const anim = Math.floor(now / 140);
    const roster = r.roster();
    const poses: Array<{ id: string; pose: { x: number; y: number; fx: number; fy: number }; chop: boolean }> = [];
    let myPose: { x: number; y: number } | null = null;

    // ---- chefs
    const seen = new Set<string>();
    for (const c of v.chefs) {
      seen.add(c.id);
      const pose = (c.id === r.me ? r.predictor?.pose() : r.interp.sample(c.id, now)) ?? c;
      let g = this.chefs.get(c.id);
      if (!g) {
        const look = this.lookFor(c.id);
        if (!look) this.fallbackLooks.set(c.id, now);
        g = new ChefSprite(look ?? DEFAULT_AVATAR, r.names[c.id] ?? 'chef', hexToNumber(chefColor(c.id, roster)), c.id === r.me);
        this.actors.addChild(g);
        this.fx.addChild(g.tag);
        this.chefs.set(c.id, g);
      } else {
        const since = this.fallbackLooks.get(c.id);
        if (since !== undefined && now - since > LOOK_RETRY_MS) {
          const look = this.lookFor(c.id);
          if (look) {
            g.setLook(look);
            this.fallbackLooks.delete(c.id);
          } else this.fallbackLooks.set(c.id, now);
        }
      }
      g.update(pose, c.held, c.chop, r.away.has(c.id), dtMs, now);
      if (c.id === r.me) myPose = pose;
      poses.push({ id: c.id, pose, chop: c.chop });
      const cur = c.held ? itemKey(c.held) : '';
      const prev = this.heldKeys.get(c.id);
      if (prev !== undefined && prev !== cur) {
        const t = reachTile(pose);
        const bin = this.stations.find((s) => v.stations[s.i].kind === 'bin' && v.stations[s.i].x === t.x && v.stations[s.i].y === t.y);
        if (bin && prev) {
          bin.binnedAt = now;
          ksfx.bin();
        } else if (c.id === r.me) ksfx.grab();
      }
      this.heldKeys.set(c.id, cur);
    }
    for (const [id, g] of this.chefs)
      if (!seen.has(id)) {
        g.destroy();
        this.chefs.delete(id);
        this.heldKeys.delete(id);
      }

    // ---- stations
    let lit = false;
    for (const g of this.stations) {
      const st = v.stations[g.i];
      const corner = tileToScreen(st.x, st.y);
      place(g.base, stationSprite(st.kind, stationVariant(st, { now, windowRun: g.windowRun, binnedAgo: now - g.binnedAt })), corner.x, corner.y);
      const top = STATION_TOP[st.kind];
      const c = tileToScreen(st.x + 0.5, st.y + 0.5);
      const ty = c.y - (top ?? ZC) * PX;
      if (st.item && top !== null) {
        place(g.item, itemSprite(st.item, anim), c.x, ty);
        g.item.visible = true;
      } else g.item.visible = false;
      g.over.visible = true;
      if (st.kind === 'board') {
        const chopping = poses.some((p) => p.chop && reachTile(p.pose).x === st.x && reachTile(p.pose).y === st.y);
        place(g.over, knifeSprite(chopping ? 1 + (Math.floor(now / 80) % 3) : 0), c.x, ty);
      } else if (st.kind === 'plates' || st.kind === 'return') {
        const stack = plateStackSprite(st.count);
        if (stack) place(g.over, stack, c.x, ty);
        else g.over.visible = false;
      } else g.over.visible = false;
      g.ring.visible = false;
      g.ready.visible = false;
      const ringY = ty - 40;
      if (st.kind === 'board' && st.item?.kind === 'ing' && !st.item.chopped && st.chop > 0) {
        place(g.ring, ringSprite('chop', (st.chop / kitchen.CHOP_TIME) * RING_STEPS), c.x, ringY);
        g.ring.visible = true;
      }
      if (st.kind === 'stove' && st.item?.kind === 'pot' && st.item.contents.length && !st.item.burnt) {
        lit = true;
        const pot = st.item;
        if (kitchen.potDone(pot)) {
          const danger = pot.over / kitchen.BURN_AFTER;
          if (danger > 0.35) {
            place(g.ring, ringSprite('burn', danger * RING_STEPS), c.x, ringY);
            g.ring.visible = danger < 0.7 || Math.floor(now / 150) % 2 === 0;
          } else {
            place(g.ready, readySprite(), c.x, ringY + 8);
            g.ready.visible = true;
          }
        } else {
          const cap = kitchen.COOK_PER_ING * pot.contents.length;
          const readyForMore = pot.contents.length < kitchen.POT_MAX && pot.cook >= cap;
          if (readyForMore) {
            place(g.ready, readySprite(), c.x, ringY + 8);
            g.ready.visible = true;
          } else {
            place(g.ring, ringSprite('cook', (pot.cook / cap) * RING_STEPS), c.x, ringY);
            g.ring.visible = true;
          }
        }
      }
      g.box.x = g.shakeUntil > now ? Math.round(Math.sin(now / 22) * 3) : 0;
    }

    // ---- floor items
    v.floor.forEach((f, i) => {
      let s = this.floorPool[i];
      if (!s) {
        s = new Sprite();
        this.floorPool.push(s);
        this.actors.addChild(s);
      }
      const p = tileToScreen(f.x, f.y);
      place(s, itemSprite(f.item, anim), p.x, p.y);
      s.zIndex = f.x + f.y - 1.5;
      s.visible = true;
    });
    for (let i = v.floor.length; i < this.floorPool.length; i++) this.floorPool[i].visible = false;

    // ---- tap feedback
    const plan = r.controls.pilot.plan;
    if (plan !== this.lastPlan) {
      this.lastPlan = plan;
      if (plan && !plan.station) {
        this.markerAt = now;
        this.markerTile = plan.goal;
      }
    }
    const age = now - this.markerAt;
    this.marker.visible = age < 520;
    if (this.marker.visible) {
      const m = tileToScreen(this.markerTile.x + 0.5, this.markerTile.y + 0.5);
      place(this.marker, markerSprite(Math.floor(age / 175)), m.x, m.y);
    }
    this.glow.clear();
    if (plan?.station) {
      const st = v.stations.find((s) => s.x === plan.station!.x && s.y === plan.station!.y);
      const z = (st ? (STATION_TOP[st.kind] ?? ZC) : ZC) * PX;
      const pts = [tileToScreen(plan.station.x, plan.station.y), tileToScreen(plan.station.x + 1, plan.station.y), tileToScreen(plan.station.x + 1, plan.station.y + 1), tileToScreen(plan.station.x, plan.station.y + 1)];
      this.glow.poly(pts.flatMap((p) => [p.x, p.y - z])).stroke({ width: 3, color: 0xffe07a, alpha: 0.55 + 0.35 * Math.sin(now / 120) });
    }

    // ---- sounds
    if (poses.some((p) => p.id === r.me && p.chop) && now - this.lastChopSfx > 230) {
      this.lastChopSfx = now;
      ksfx.chop();
    }
    if (lit && now - this.lastSizzle > 1500) {
      this.lastSizzle = now;
      ksfx.sizzle();
    }

    // ---- camera
    const focus = myPose ? tileToScreen(myPose.x, myPose.y) : tileToScreen(v.w / 2, v.h / 2);
    this.camera.update(focus.x, focus.y - 40, this.app.screen.width, this.app.screen.height);
  }
}
