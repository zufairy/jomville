import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { kitchen } from '@dovey/shared';
import { Camera, MAX_ZOOM, MIN_ZOOM } from '../game/camera';
import { screenToWorldDir } from './aim';
import { Controls } from './controls';
import { STICK_RADIUS, STICK_START } from './joystick';
import { HOLD_MS, bindPointer } from './pointerInput';
import type { KitchenRound } from './net';
import type { IsoRenderer } from './isoRenderer';

vi.mock('./sounds', () => ({ ksfx: new Proxy({}, { get: () => () => {} }) }));

const lv = kitchen.parseLevel(kitchen.LEVELS.diner);
/** the fake renderer maps client px to tiles at 20px per tile */
const PX = 20;
const at = (tx: number, ty: number) => ({ x: tx * PX + PX / 2, y: ty * PX + PX / 2 });
const FLOOR = at(6, 6);
const CRATE = at(2, 0); // lettuce crate
const BOARD = at(0, 1);

class FakeCanvas extends EventTarget {
  setPointerCapture() {}
  getBoundingClientRect() {
    return { left: 0, top: 0 };
  }
}

function rig(joystick: boolean) {
  const canvas = new FakeCanvas();
  const controls = new Controls();
  const chef = { x: 2.5, y: 2.5, fx: 0, fy: 1 };
  const round = {
    me: 'me',
    controls,
    predictor: { simPose: () => chef },
    view: { ...lv, stations: lv.stations, chefs: [{ id: 'me', held: null }] },
  } as unknown as KitchenRound;
  controls.context = { pose: () => chef, stations: () => lv.stations, held: () => null };
  const camera = new Camera(new Container(), { minX: -2000, maxX: 2000, minY: -2000, maxY: 2000 });
  camera.update(0, 0, 800, 600);
  const zooms: Array<[number, number, number]> = [];
  const renderer = {
    pickTile: (x: number, y: number) => ({ x: Math.floor(x / PX), y: Math.floor(y / PX) }),
    zoomBy: (f: number, x: number, y: number) => {
      zooms.push([f, x, y]);
      camera.zoomAt(f, x, y);
    },
    shake: () => {},
  } as unknown as IsoRenderer;
  const sticks: Array<{ knob: { x: number; y: number }; origin: { x: number; y: number } } | null> = [];
  const unbind = bindPointer(canvas as unknown as HTMLCanvasElement, round, renderer, { joystick: () => joystick, onStick: (s) => sticks.push(s) });
  const fire = (type: string, id: number, p: { x: number; y: number }, button = 0) =>
    canvas.dispatchEvent(Object.assign(new Event(type), { pointerId: id, clientX: p.x, clientY: p.y, button }));
  const down = (p: { x: number; y: number }, id = 1) => fire('pointerdown', id, p);
  const move = (p: { x: number; y: number }, id = 1) => fire('pointermove', id, p);
  const up = (p: { x: number; y: number }, id = 1) => fire('pointerup', id, p);
  return { canvas, controls, pilot: controls.pilot, chef, camera, zooms, sticks, unbind, down, move, up };
}

const plus = (p: { x: number; y: number }, dx: number, dy: number) => ({ x: p.x + dx, y: p.y + dy });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('floating joystick (pointer input)', () => {
  it('steers screen-relative: a drag right on screen walks screen-right in world axes', () => {
    const r = rig(true);
    r.down(FLOOR);
    r.move(plus(FLOOR, 40, 0));
    const inp = r.controls.next();
    const want = screenToWorldDir(40 / STICK_RADIUS, 0);
    expect(inp.mx).toBeCloseTo(want.x, 6);
    expect(inp.my).toBeCloseTo(want.y, 6);
    expect(inp.mx).toBeGreaterThan(0);
    expect(inp.my).toBeLessThan(0);
    expect(r.sticks.at(-1)).toEqual({ knob: { x: 40, y: 0 }, origin: FLOOR });
    // screen up walks up the screen: both world axes negative
    r.move(plus(FLOOR, 0, -STICK_RADIUS));
    const upInp = r.controls.next();
    expect(upInp.mx).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(upInp.my).toBeCloseTo(-Math.SQRT1_2, 6);
    r.unbind();
  });

  it('ignores drags inside the start radius and clamps full deflection', () => {
    const r = rig(true);
    r.down(FLOOR);
    r.move(plus(FLOOR, STICK_START - 2, 0));
    expect(r.controls.next()).toMatchObject({ mx: 0, my: 0 });
    expect(r.sticks).toEqual([]);
    r.move(plus(FLOOR, 500, 0));
    const inp = r.controls.next();
    expect(Math.hypot(inp.mx, inp.my)).toBeCloseTo(1, 6);
    expect(r.sticks.at(-1)!.knob).toEqual({ x: STICK_RADIUS, y: 0 });
    // just past the start radius the stick is already outside the sim's deadzone
    expect(Math.hypot(...Object.values(screenToWorldDir((STICK_START + 1) / STICK_RADIUS, 0)))).toBeGreaterThan(kitchen.DEADZONE);
    r.unbind();
  });

  it('release stops the chef and is not a tap', () => {
    const r = rig(true);
    r.down(FLOOR);
    r.move(plus(FLOOR, 40, 10));
    expect(Math.hypot(r.controls.next().mx, 0)).toBeGreaterThan(0);
    r.up(plus(FLOOR, 40, 10));
    expect(r.controls.next()).toMatchObject({ mx: 0, my: 0, grab: false });
    expect(r.sticks.at(-1)).toBeNull();
    expect(r.pilot.active).toBe(false);
    r.unbind();
  });

  it('a short tap on the floor still walks there', () => {
    const r = rig(true);
    r.down(FLOOR);
    r.move(plus(FLOOR, 3, 2)); // finger jitter
    r.up(plus(FLOOR, 3, 2));
    expect(r.pilot.plan).toMatchObject({ action: 'walk', goal: { x: 6, y: 6 } });
    r.unbind();
  });

  it('a short tap on a station still uses it', () => {
    const r = rig(true);
    r.down(CRATE);
    r.up(CRATE);
    expect(r.pilot.plan).toMatchObject({ action: 'grab', station: { x: 2, y: 0 } });
    r.unbind();
  });

  it('a press that starts on a station steers when dragged, and never grabs or chops', () => {
    const r = rig(true);
    r.down(BOARD);
    r.move(plus(BOARD, 0, 40));
    const inp = r.controls.next();
    expect(Math.hypot(inp.mx, inp.my)).toBeGreaterThan(kitchen.DEADZONE);
    expect(r.pilot.active).toBe(false);
    vi.advanceTimersByTime(HOLD_MS * 2);
    expect(r.pilot.active).toBe(false);
    r.up(plus(BOARD, 0, 40));
    expect(r.pilot.active).toBe(false);
    const after = r.controls.next();
    expect(after).toMatchObject({ mx: 0, my: 0, grab: false, use: false });
    r.unbind();
  });

  it('a still hold on a station chops, and finger drift does not turn it into steering', () => {
    const r = rig(true);
    r.down(BOARD);
    vi.advanceTimersByTime(HOLD_MS + 1);
    expect(r.pilot.plan).toMatchObject({ action: 'hold', station: { x: 0, y: 1 } });
    expect(r.pilot.holding).toBe(true);
    r.move(plus(BOARD, 45, 30));
    expect(r.pilot.holding).toBe(true);
    expect(r.sticks).toEqual([]);
    r.up(plus(BOARD, 45, 30));
    expect(r.pilot.holding).toBe(false);
    r.unbind();
  });
});

describe('station hold without the joystick', () => {
  it('survives finger drift until the finger lifts', () => {
    const r = rig(false);
    r.down(BOARD);
    vi.advanceTimersByTime(HOLD_MS + 1);
    expect(r.pilot.plan).toMatchObject({ action: 'hold' });
    for (let i = 1; i <= 6; i++) r.move(plus(BOARD, i * 15, -i * 9));
    expect(r.pilot.plan).toMatchObject({ action: 'hold' });
    expect(r.pilot.holding).toBe(true);
    r.up(plus(BOARD, 90, -54));
    expect(r.pilot.holding).toBe(false);
    r.unbind();
  });
});

describe('pinch zoom', () => {
  it('zooms by the finger distance ratio around the midpoint', () => {
    const r = rig(false);
    r.down({ x: 300, y: 300 }, 1);
    r.down({ x: 400, y: 300 }, 2);
    r.move({ x: 450, y: 300 }, 2); // 100 -> 150 apart
    expect(r.zooms).toHaveLength(1);
    const [f, mx, my] = r.zooms[0];
    expect(f).toBeCloseTo(1.5, 6);
    expect(mx).toBe(375);
    expect(my).toBe(300);
    r.move({ x: 225, y: 300 }, 1); // 150 -> 225 apart: ratio from the last distance
    expect(r.zooms[1][0]).toBeCloseTo(1.5, 6);
    r.unbind();
  });

  it('is clamped by the camera', () => {
    const r = rig(false);
    r.down({ x: 399, y: 300 }, 1);
    r.down({ x: 401, y: 300 }, 2);
    r.move({ x: 790, y: 300 }, 2);
    expect(r.camera.zoom).toBe(MAX_ZOOM);
    r.move({ x: 780, y: 300 }, 1);
    r.move({ x: 781, y: 300 }, 2);
    expect(r.camera.zoom).toBe(MIN_ZOOM);
    r.unbind();
  });

  it('never walks, grabs or chops, even when the first finger was on a station', () => {
    for (const joystick of [false, true]) {
      for (const first of [BOARD, FLOOR, CRATE]) {
        const r = rig(joystick);
        r.down(first, 1);
        r.down(plus(first, 120, 80), 2);
        expect(r.pilot.active).toBe(false);
        r.move(plus(first, 200, 120), 2);
        vi.advanceTimersByTime(HOLD_MS * 2);
        r.up(first, 1);
        // the remaining finger drags and lifts: still no stick, tap or walk
        r.move(plus(first, 260, 160), 2);
        r.up(plus(first, 260, 160), 2);
        vi.advanceTimersByTime(HOLD_MS * 2);
        const inp = r.controls.next();
        expect(inp, `joystick=${joystick} first=${JSON.stringify(first)}`).toMatchObject({ mx: 0, my: 0, grab: false, use: false });
        expect(r.pilot.active).toBe(false);
        expect(r.sticks.filter(Boolean)).toEqual([]);
        // and the next ordinary tap works again
        r.down(FLOOR, 3);
        r.up(FLOOR, 3);
        expect(r.pilot.plan).toMatchObject({ action: 'walk' });
        r.unbind();
      }
    }
  });
});
