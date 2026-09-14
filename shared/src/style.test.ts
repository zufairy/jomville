import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, normalizeStyle, parseStyle } from './style';

describe('room style', () => {
  it('keeps valid picks, falls back on junk', () => {
    expect(normalizeStyle({ floor: 0x2c3e50, walls: false })).toEqual({ ...DEFAULT_STYLE, floor: 0x2c3e50, walls: false });
    expect(normalizeStyle({ floor: 0x123456, wall: 'red', bg: null, walls: 'yes' })).toEqual(DEFAULT_STYLE);
    expect(normalizeStyle(null)).toEqual(DEFAULT_STYLE);
  });
  it('merges onto a base', () => {
    const base = { ...DEFAULT_STYLE, bg: 0x1c1c1c };
    expect(normalizeStyle({ walls: false }, base)).toEqual({ ...base, walls: false });
  });
  it('parses json safely', () => {
    expect(parseStyle('{"bg":1842204}')).toEqual({ ...DEFAULT_STYLE, bg: 0x1c1c1c });
    expect(parseStyle('nope')).toEqual(DEFAULT_STYLE);
  });
});
