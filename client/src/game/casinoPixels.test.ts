import { describe, expect, it } from 'vitest';
import { FURNITURE } from '@dovey/shared';
import { LID_CLOSE, LID_OPEN, allCasinoFrames, carpetMap, casinoMap, dicePips, lidSequence, wheelRotation, wheelSegmentAtPointer } from './casinoPixels';
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
    expect(lidSequence('3', '-1')).toBeNull();
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
