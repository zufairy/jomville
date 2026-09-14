import { describe, expect, it } from 'vitest';
import { HANDLE, ROOM_SLUG } from './constants';
import { randomHandle, randomSlug } from './names';

describe('names', () => {
  it('handles and slugs match their validators', () => {
    for (let i = 0; i < 100; i++) {
      expect(HANDLE.test(randomHandle())).toBe(true);
      expect(ROOM_SLUG.test(randomSlug())).toBe(true);
    }
  });
});
