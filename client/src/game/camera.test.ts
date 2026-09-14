import { describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import { Camera, MAX_ZOOM, MIN_ZOOM } from './camera';

function stubWorld() {
  const world = {
    position: { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } },
    scale: { x: 1, y: 1, set(x: number, y: number) { this.x = x; this.y = y; } },
  };
  return world as unknown as Container & { position: { x: number; y: number }; scale: { x: number; y: number } };
}

describe('Camera zoom clamp', () => {
  it('clamps setZoom to [0.6, 2.0]', () => {
    const world = stubWorld();
    const cam = new Camera(world, { minX: 0, maxX: 1000, minY: 0, maxY: 1000 });
    cam.setZoom(5);
    expect(cam.zoom).toBe(MAX_ZOOM);
    cam.setZoom(0.01);
    expect(cam.zoom).toBe(MIN_ZOOM);
  });
});

describe('Camera zoomAt', () => {
  it('keeps the world point under the cursor fixed after zooming', () => {
    const world = stubWorld();
    const cam = new Camera(world, { minX: -100000, maxX: 100000, minY: -100000, maxY: 100000 });
    cam.snapTo(500, 500);
    // seed viewport size via a normal follow update
    cam.update(500, 500, 800, 600);
    const screenX = 600;
    const screenY = 250;
    // world point currently under the cursor, before zoom
    const oldZoom = cam.zoom;
    const worldXBefore = (screenX - 800 / 2) / oldZoom + 500;
    const worldYBefore = (screenY - 600 / 2) / oldZoom + 500;

    cam.zoomAt(1.5, screenX, screenY);
    cam.update(500, 500, 800, 600); // free mode: target is ignored, just re-renders

    // recompute the world point now under the same screen coordinate
    const newZoom = cam.zoom;
    const worldXAfter = (screenX - world.position.x) / newZoom;
    const worldYAfter = (screenY - world.position.y) / newZoom;

    expect(worldXAfter).toBeCloseTo(worldXBefore, 5);
    expect(worldYAfter).toBeCloseTo(worldYBefore, 5);
    expect(newZoom).toBeCloseTo(oldZoom * 1.5, 5);
  });
});

describe('Camera bounds clamp under zoom', () => {
  it('keeps the visible viewport inside world bounds when zoomed in', () => {
    const world = stubWorld();
    const bounds = { minX: 0, maxX: 400, minY: 0, maxY: 400 };
    const cam = new Camera(world, bounds);
    cam.snapTo(0, 0); // try to push the camera to the far corner
    cam.setZoom(2);
    cam.update(0, 0, 800, 600);
    // at zoom 2, viewport is 400x300 world px; half-extents are 200x150
    // camera can't get closer to the min edge than minX + halfW
    const halfW = 800 / (2 * 2);
    const halfH = 600 / (2 * 2);
    expect(world.position.x).toBe(Math.round(400 - halfW * 2)); // screenCentre - clampedCx*zoom
    // clamp check: the world x=0 edge must not be visible past the left edge of the screen
    const leftEdgeWorldX = -world.position.x / cam.zoom;
    expect(leftEdgeWorldX).toBeGreaterThanOrEqual(bounds.minX - 1e-6);
  });

  it('centres the camera when the (zoomed) viewport is bigger than the world', () => {
    const world = stubWorld();
    const cam = new Camera(world, { minX: 0, maxX: 100, minY: 0, maxY: 100 });
    cam.snapTo(1000, 1000);
    cam.setZoom(1);
    cam.update(1000, 1000, 800, 600);
    expect(world.position.x).toBe(Math.round(400 - 50 * 1));
  });
});

describe('Camera fling', () => {
  it('decays momentum to zero and stops moving', () => {
    const world = stubWorld();
    const cam = new Camera(world, { minX: -100000, maxX: 100000, minY: -100000, maxY: 100000 });
    cam.snapTo(0, 0);
    cam.update(0, 0, 800, 600);
    cam.fling(2, 0); // 2 screen px/ms
    expect(cam.isFree).toBe(true);

    let prevX = world.position.x;
    let moved = false;
    for (let i = 0; i < 400; i++) {
      cam.update(0, 0, 800, 600);
      if (world.position.x !== prevX) moved = true;
      prevX = world.position.x;
    }
    expect(moved).toBe(true); // it actually moved at some point

    // after many frames the momentum should have decayed away and position settled
    const settledX = world.position.x;
    cam.update(0, 0, 800, 600);
    expect(world.position.x).toBe(settledX);
  });
});

describe('Camera follow', () => {
  it('exits free mode and resumes following the target', () => {
    const world = stubWorld();
    const cam = new Camera(world, { minX: -100000, maxX: 100000, minY: -100000, maxY: 100000 });
    cam.snapTo(0, 0);
    cam.update(0, 0, 800, 600);
    cam.pan(50, 0);
    expect(cam.isFree).toBe(true);

    cam.follow();
    expect(cam.isFree).toBe(false);
    // now it should move back toward the (0,0) target across updates, settling
    // at the edge of the dead zone (it's a dead-zone follow cam, not a snap)
    for (let i = 0; i < 50; i++) cam.update(0, 0, 800, 600);
    expect(world.position.x).toBe(430);
  });
});
