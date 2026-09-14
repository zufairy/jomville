import { describe, expect, it } from 'vitest';
import { PLACEMENT_ID } from '@dovey/shared';
import { UNDO_DEPTH, UndoStack, newPlacementId } from './editor';

describe('editor', () => {
  it('undo stack caps at depth', () => {
    const u = new UndoStack();
    for (let i = 0; i < UNDO_DEPTH + 5; i++) u.push({ kind: 'remove', id: String(i) });
    expect(u.size).toBe(UNDO_DEPTH);
    expect(u.pop()).toEqual({ kind: 'remove', id: String(UNDO_DEPTH + 4) });
  });
  it('generates server-acceptable ids', () => {
    for (let i = 0; i < 50; i++) expect(PLACEMENT_ID.test(newPlacementId())).toBe(true);
  });
});
