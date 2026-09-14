import { Placement } from '@dovey/shared';

/** Client-side undo stack for room edits. Each entry is the inverse op to send. */
export type EditOp =
  | { kind: 'place'; p: Placement }
  | { kind: 'move'; p: Placement }
  | { kind: 'remove'; id: string };

export const UNDO_DEPTH = 20;

export class UndoStack {
  private stack: EditOp[] = [];

  push(inverse: EditOp) {
    this.stack.push(inverse);
    if (this.stack.length > UNDO_DEPTH) this.stack.shift();
  }

  pop(): EditOp | undefined {
    return this.stack.pop();
  }

  get size() {
    return this.stack.length;
  }

  clear() {
    this.stack = [];
  }
}

export function newPlacementId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
