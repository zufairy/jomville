import { Container } from 'pixi.js';

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2.0;
/** momentum decay applied per frame while flinging */
const FRICTION = 0.92;
/** below this speed (screen px/ms) momentum is considered settled */
const FLING_EPS = 0.01;
/** assumed frame duration (ms) used to integrate fling velocity per tick */
const FRAME_MS = 16.7;

function clampNum(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Follows a target world point with a dead zone, or (in "free" mode) tracks
 * user pan/pinch/fling gestures instead. World container position + scale
 * are written every tick from `update`, so callers just keep gesturing and
 * let the ticker apply it.
 */
export class Camera {
  private cx = 0;
  private cy = 0;
  private zoomLevel = 1;
  private free = false;
  /** last known viewport size, cached so gesture handlers (which run outside
   *  the ticker) can convert screen deltas to world deltas */
  private vw = 0;
  private vh = 0;
  /** fling momentum, screen px / ms */
  private vx = 0;
  private vy = 0;
  deadZone = { w: 60, h: 60 };
  lerp = 0.15;

  constructor(private world: Container, private bounds: Bounds) {}

  setBounds(b: Bounds) {
    this.bounds = b;
  }

  snapTo(x: number, y: number) {
    this.cx = x;
    this.cy = y;
  }

  get isFree() {
    return this.free;
  }

  get zoom() {
    return this.zoomLevel;
  }

  setZoom(z: number) {
    this.zoomLevel = clampNum(z, MIN_ZOOM, MAX_ZOOM);
    this.clampToBounds();
  }

  /** stop following; resume with a call to follow() */
  private enterFree() {
    this.free = true;
  }

  /** resume following the target, killing any momentum */
  follow() {
    this.free = false;
    this.vx = 0;
    this.vy = 0;
  }

  /** pan by a screen-space delta (drag / two-finger midpoint move) */
  pan(dxScreen: number, dyScreen: number) {
    this.enterFree();
    this.cx -= dxScreen / this.zoomLevel;
    this.cy -= dyScreen / this.zoomLevel;
    this.clampToBounds();
  }

  /** zoom by `factor`, keeping the world point under (screenX, screenY) fixed */
  zoomAt(factor: number, screenX: number, screenY: number) {
    this.enterFree();
    const oldZoom = this.zoomLevel;
    const newZoom = clampNum(oldZoom * factor, MIN_ZOOM, MAX_ZOOM);
    const worldX = (screenX - this.vw / 2) / oldZoom + this.cx;
    const worldY = (screenY - this.vh / 2) / oldZoom + this.cy;
    this.zoomLevel = newZoom;
    this.cx = worldX + (this.vw / 2 - screenX) / newZoom;
    this.cy = worldY + (this.vh / 2 - screenY) / newZoom;
    this.clampToBounds();
  }

  /** begin momentum scrolling at (vx, vy) screen px / ms; decays each frame */
  fling(vx: number, vy: number) {
    this.enterFree();
    this.vx = vx;
    this.vy = vy;
  }

  private clampToBounds() {
    const { minX, maxX, minY, maxY } = this.bounds;
    const halfW = this.vw / (2 * this.zoomLevel);
    const halfH = this.vh / (2 * this.zoomLevel);
    if (maxX - minX <= halfW * 2) this.cx = (minX + maxX) / 2;
    else this.cx = clampNum(this.cx, minX + halfW, maxX - halfW);
    if (maxY - minY <= halfH * 2) this.cy = (minY + maxY) / 2;
    else this.cy = clampNum(this.cy, minY + halfH, maxY - halfH);
  }

  update(tx: number, ty: number, vw: number, vh: number) {
    this.vw = vw;
    this.vh = vh;

    if (!this.free) {
      const dx = tx - this.cx;
      const dy = ty - this.cy;
      const hw = this.deadZone.w / 2;
      const hh = this.deadZone.h / 2;
      let gx = this.cx;
      let gy = this.cy;
      if (dx > hw) gx = tx - hw;
      else if (dx < -hw) gx = tx + hw;
      if (dy > hh) gy = ty - hh;
      else if (dy < -hh) gy = ty + hh;

      this.cx += (gx - this.cx) * this.lerp;
      this.cy += (gy - this.cy) * this.lerp;
    } else if (this.vx !== 0 || this.vy !== 0) {
      // integrate momentum (screen px/ms) over one frame, in world space, then decay it
      this.cx -= (this.vx * FRAME_MS) / this.zoomLevel;
      this.cy -= (this.vy * FRAME_MS) / this.zoomLevel;
      this.vx *= FRICTION;
      this.vy *= FRICTION;
      if (Math.hypot(this.vx, this.vy) < FLING_EPS) {
        this.vx = 0;
        this.vy = 0;
      }
    }

    this.clampToBounds();

    this.world.scale.set(this.zoomLevel);
    this.world.position.set(
      Math.round(vw / 2 - this.cx * this.zoomLevel),
      Math.round(vh / 2 - this.cy * this.zoomLevel),
    );
  }
}
