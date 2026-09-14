import { describe, expect, it } from 'vitest';
import { FURNITURE } from '@dovey/shared';
import {
  HOLO_FONT,
  HOLO_IDLE_FRAMES,
  LID_CLOSE,
  LID_OPEN,
  allCasinoFrames,
  carpetMap,
  casinoMap,
  dicePips,
  holoGlyph,
  holoKey,
  holoLockSequence,
  lidSequence,
  wheelRotation,
  wheelSegmentAtPointer,
} from './casinoPixels';
import { validateMap } from './pixelArt';

describe('casino pixel sprites', () => {
  const frames = allCasinoFrames();

  it('every frame is a valid map', () => {
    for (const f of frames) expect(validateMap(f.map), f.name).toEqual([]);
  });

  it('all frames of a kind share one size so anchors stay put', () => {
    const sizes = new Map<string, string>();
    for (const f of frames) {
      const kind = f.name.split(':')[0];
      const size = `${f.map.rows[0].length}x${f.map.rows.length}`;
      expect(sizes.get(kind) ?? size, f.name).toBe(size);
      sizes.set(kind, size);
    }
  });

  it('draws every casino kind in the catalog', () => {
    for (const d of FURNITURE.filter((d) => d.cat === 'casino')) expect(casinoMap({ kind: d.kind, state: '0', frame: 0, on: true }), d.id).not.toBeNull();
  });

  it('dicemaster shows the right pip layout per face', () => {
    expect(dicePips('1')).toEqual([[1, 1]]);
    for (let n = 1; n <= 6; n++) expect(dicePips(String(n))).toHaveLength(n);
    // odd faces carry the centre pip, even faces never do
    for (let n = 1; n <= 6; n++) expect(dicePips(String(n)).some(([c, r]) => c === 1 && r === 1)).toBe(n % 2 === 1);
    expect(dicePips('6').every(([c]) => c !== 1)).toBe(true);
    expect(dicePips('0')).toEqual([]);
    // open faces differ from each other and from the closed box
    const faces = ['0', '1', '2', '3', '4', '5', '6'].map((k) => casinoMap({ kind: 'dicemaster', state: k, frame: 0, on: true })!.rows.join('\n'));
    expect(new Set(faces).size).toBe(7);
  });

  it('plays the lid swing only on reveal and close', () => {
    expect(lidSequence('-1', '4')).toBe(LID_OPEN);
    expect(lidSequence('4', '0')).toBe(LID_CLOSE);
    expect(lidSequence('0', '-1')).toBeNull();
    expect(lidSequence('3', '-1')).toBe(LID_CLOSE);
    expect(lidSequence('0', '5')).toBeNull();
  });

  it('hologram digit font: 0-9 and ? share one core size and one beveled size', () => {
    const keys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '?'];
    expect(Object.keys(HOLO_FONT).sort()).toEqual([...keys].sort());
    for (const k of keys) {
      expect(HOLO_FONT[k], k).toHaveLength(5);
      for (const r of HOLO_FONT[k]) expect(r, k).toMatch(/^[#.]{3}$/);
      const g = holoGlyph(k);
      expect(g, k).toHaveLength(6);
      for (const r of g) expect(r, k).toMatch(/^[#+.]{4}$/);
    }
    // every glyph is distinct so the numbers read unambiguously
    expect(new Set(keys.map((k) => HOLO_FONT[k].join('/'))).size).toBe(keys.length);
  });

  it('holodice draws each number, its lock-in pop and a moving idle loop', () => {
    const map = (state: string, frame = 0) => casinoMap({ kind: 'holodice', state, frame, on: true })!.rows.join('\n');
    expect(holoKey('42')).toBe('42');
    expect(holoKey('lock3:100')).toBe('lock3:100');
    expect(holoKey('0')).toBe('0');
    expect(holoKey('abc')).toBe('0');
    expect(map('7')).not.toBe(map('42'));
    expect(map('42')).not.toBe(map('100'));
    expect(map('0')).not.toBe(map('7'));
    expect(map('42', 0)).not.toBe(map('42', 1));
    expect(map('42', HOLO_IDLE_FRAMES)).toBe(map('42', 0));
    expect(map('lock1:42')).not.toBe(map('42'));
    expect(map('-1', 0)).not.toBe(map('-1', 1));
    expect(holoLockSequence('-1', '42')).toEqual(['lock1:42', 'lock2:42', 'lock3:42']);
    expect(holoLockSequence('42', '0')).toBeNull();
    expect(holoLockSequence('0', '-1')).toBeNull();
    expect(holoLockSequence('-1', '0')).toBeNull();
  });

  it('draws every new trading room piece with a valid map', () => {
    for (const kind of ['egg_stack_2', 'egg_stack_3', 'egg_wall', 'gold_patch', 'leaf_hedge', 'palm_planter', 'gold_rail', 'trade_sofa', 'trading_banner', 'dragon_egg']) {
      const m = casinoMap({ kind, state: '', frame: 0, on: true });
      expect(m, kind).not.toBeNull();
      expect(validateMap(m!), kind).toEqual([]);
    }
    const gp = casinoMap({ kind: 'gold_patch', state: '', frame: 0, on: true })!.rows;
    gp.forEach((row, y) => expect(row.replace(/\./g, '').length).toBe(2 * (y < 8 ? 2 * y + 1 : 2 * (15 - y) + 1)));
    // eggs and hedges stay under avatar height (~31 art rows); towers and palms under ~1.6x
    const above = (kind: string) => {
      const m = casinoMap({ kind, state: '', frame: 0, on: true })!;
      const first = m.rows.findIndex((r) => /[^.]/.test(r));
      return m.rows.length - (m.foot ?? 0) - first;
    };
    for (const k of ['leaf_hedge', 'gold_rail', 'dragon_egg', 'egg_stack_2']) expect(above(k), k).toBeLessThanOrEqual(33);
    for (const k of ['egg_stack_3', 'palm_planter']) expect(above(k), k).toBeLessThanOrEqual(50);
  });

  it('parks the winning wheel segment under the pointer', () => {
    for (let n = 1; n <= 8; n++) expect(wheelSegmentAtPointer(wheelRotation(String(n), 0))).toBe(n);
  });

  it('carpet diamond tiles without gaps or overlap', () => {
    const rows = carpetMap().rows;
    expect(rows).toHaveLength(16);
    rows.forEach((row, y) => {
      const half = y < 8 ? 2 * y + 1 : 2 * (15 - y) + 1;
      expect(row.replace(/\./g, '').length).toBe(2 * half);
    });
  });
});
