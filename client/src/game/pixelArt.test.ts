import { describe, expect, it } from 'vitest';
import { PixelCanvas, pixelRuns, validateMap } from './pixelArt';

const tiny = { palette: { a: 0xff0000, b: 0x00ff00 }, rows: ['aab.', '.bbb'] };

describe('pixel art', () => {
  it('merges same-colour horizontal runs and skips transparency', () => {
    expect(pixelRuns(tiny)).toEqual([
      { x: 0, y: 0, w: 2, key: 'a' },
      { x: 2, y: 0, w: 1, key: 'b' },
      { x: 1, y: 1, w: 3, key: 'b' },
    ]);
  });
  it('mirrors rows when flipped', () => {
    expect(pixelRuns(tiny, true)).toEqual([
      { x: 1, y: 0, w: 1, key: 'b' },
      { x: 2, y: 0, w: 2, key: 'a' },
      { x: 0, y: 1, w: 3, key: 'b' },
    ]);
  });
  it('reports ragged rows and unknown keys', () => {
    expect(validateMap(tiny)).toEqual([]);
    const errs = validateMap({ palette: { a: 1 }, rows: ['aa', 'a', 'az'] });
    expect(errs).toContain('row 1 is 1 wide, expected 2');
    expect(errs).toContain("row 2 uses unknown key 'z'");
  });
  it('rings shapes with a 1px outline', () => {
    const cv = new PixelCanvas(3, 3).rect(1, 1, 1, 1, 'a').outline('o');
    expect(cv.toMap({ a: 1, o: 0 }).rows).toEqual(['.o.', 'oao', '.o.']);
  });
});
