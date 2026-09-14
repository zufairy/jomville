import { describe, expect, it } from 'vitest';
import { BlockBook } from './blocks';

const book = () => {
  const b = new BlockBook();
  b.join('sA', 'userA');
  b.join('sB', 'userB');
  b.join('sC', 'userC');
  return b;
};
const ALL = ['sA', 'sB', 'sC'];

describe('BlockBook', () => {
  it('hides both ways once either side blocks', () => {
    const b = book();
    expect(b.isHidden('sA', 'sB')).toBe(false);
    b.add('userA', 'userB');
    expect(b.isHidden('sA', 'sB')).toBe(true);
    expect(b.isHidden('sB', 'sA')).toBe(true);
    expect(b.isHidden('sA', 'sC')).toBe(false);
  });

  it('keeps a blocked pair out of each other audience but not the room', () => {
    const b = book();
    b.add('userA', 'userB');
    expect(b.audience('sB', ALL)).toEqual(['sB', 'sC']);
    expect(b.audience('sA', ALL)).toEqual(['sA', 'sC']);
    expect(b.audience('sC', ALL)).toEqual(ALL);
  });

  it('a speaker always hears themselves', () => {
    const b = book();
    b.add('userA', 'userB');
    expect(b.audience('sA', ALL)).toContain('sA');
    expect(b.isHidden('sA', 'sA')).toBe(false);
  });

  it('applies to a second session of the same user', () => {
    const b = book();
    b.add('userA', 'userB');
    b.join('sB2', 'userB', []); // same person, new tab
    b.add('userA', 'userB'); // re-applied on join in the room
    expect(b.isHidden('sA', 'sB2')).toBe(true);
  });

  it('unblocking restores visibility', () => {
    const b = book();
    b.add('userA', 'userB');
    b.remove('userA', 'userB');
    expect(b.isHidden('sA', 'sB')).toBe(false);
    expect(b.audience('sB', ALL)).toEqual(ALL);
  });

  it('reload replaces a session hidden set', () => {
    const b = book();
    b.reload('sA', ['userC']);
    expect(b.isHidden('sA', 'sC')).toBe(true);
    b.reload('sA', []);
    expect(b.isHidden('sA', 'sC')).toBe(false);
  });

  it('resolves session ids to users and ignores junk', () => {
    const b = book();
    expect(b.userOf('sA')).toBe('userA');
    expect(b.userOf('nope')).toBeNull();
    expect(b.userOf(42)).toBeNull();
  });

  it('forgets a session on leave and stops hiding through it', () => {
    const b = book();
    b.add('userA', 'userB');
    b.leave('sB');
    expect(b.isHidden('sA', 'sB')).toBe(false);
    expect(b.audience('sA', ALL)).toEqual(ALL);
  });
});
