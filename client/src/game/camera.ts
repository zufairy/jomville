import { Container } from 'pixi.js';

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Follows a target world point with a dead zone. World container is offset so
 * the camera centre lands at the screen centre. Clamped to world bounds
 * (in world px); if the world is smaller than the viewport it is centred.
 */
export class Camera {
  private cx = 0;
  private cy = 0;
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

  update(tx: number, ty: number, vw: number, vh: number) {
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

    const { minX, maxX, minY, maxY } = this.bounds;
    let camX = this.cx;
    let camY = this.cy;
    if (maxX - minX <= vw) camX = (minX + maxX) / 2;
    else camX = Math.min(Math.max(camX, minX + vw / 2), maxX - vw / 2);
    if (maxY - minY <= vh) camY = (minY + maxY) / 2;
    else camY = Math.min(Math.max(camY, minY + vh / 2), maxY - vh / 2);

    this.world.position.set(Math.round(vw / 2 - camX), Math.round(vh / 2 - camY));
  }
}
