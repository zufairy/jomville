import { describe, expect, it } from 'vitest';
import { isTopModal, modalDepth, popModal, pushModal } from './modalStack';

describe('modalStack', () => {
  it('the only open modal is top at depth 0', () => {
    const a = Symbol('a');
    pushModal(a);
    expect(isTopModal(a)).toBe(true);
    expect(modalDepth(a)).toBe(0);
    popModal(a);
  });

  it('the most recently pushed modal is top; earlier ones are not', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    pushModal(a);
    pushModal(b);
    expect(isTopModal(b)).toBe(true);
    expect(isTopModal(a)).toBe(false);
    expect(modalDepth(a)).toBe(0);
    expect(modalDepth(b)).toBe(1);
    popModal(a);
    popModal(b);
  });

  it('popping a non-top modal leaves the top modal on top', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    const c = Symbol('c');
    pushModal(a);
    pushModal(b);
    pushModal(c);
    popModal(b);
    expect(isTopModal(c)).toBe(true);
    expect(modalDepth(a)).toBe(0);
    expect(modalDepth(c)).toBe(1);
    popModal(a);
    popModal(c);
  });

  it('popping an id not in the stack is a no-op', () => {
    const a = Symbol('a');
    const ghost = Symbol('ghost');
    pushModal(a);
    popModal(ghost);
    expect(isTopModal(a)).toBe(true);
    popModal(a);
  });

  it('an id not in the stack has depth -1 and is never top of an empty stack', () => {
    const a = Symbol('a');
    expect(isTopModal(a)).toBe(false);
    expect(modalDepth(a)).toBe(-1);
  });
});
