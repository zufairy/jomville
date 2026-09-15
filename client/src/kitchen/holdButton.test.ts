import { describe, expect, it } from 'vitest';
import { Controls } from './controls';
import { holdButton } from './holdButton';

function chopButton() {
  const controls = new Controls();
  const states: boolean[] = [];
  const captured: number[] = [];
  const h = holdButton((on) => {
    states.push(on);
    controls.setUse(on);
  });
  const ev = (pointerId: number) => ({ pointerId, currentTarget: { setPointerCapture: (id: number) => captured.push(id) } });
  return { controls, states, captured, h, ev };
}

describe('Chop hold button', () => {
  it('captures the pointer and keeps chopping through drift until that finger lifts', () => {
    const b = chopButton();
    b.h.onPointerDown(b.ev(7));
    expect(b.captured).toEqual([7]);
    // drift: pointermove / pointerleave are not handled at all, so nothing ends the hold
    expect(Object.keys(b.h).sort()).toEqual(['onLostPointerCapture', 'onPointerCancel', 'onPointerDown', 'onPointerUp']);
    for (let i = 0; i < 10; i++) expect(b.controls.next().use).toBe(true);
    b.h.onPointerUp(b.ev(7));
    b.h.onLostPointerCapture(b.ev(7)); // browsers fire this right after pointerup
    expect(b.controls.next().use).toBe(false);
    expect(b.states).toEqual([true, false]);
  });

  it('another finger lifting does not end the hold', () => {
    const b = chopButton();
    b.h.onPointerDown(b.ev(1));
    b.h.onPointerUp(b.ev(2));
    b.h.onLostPointerCapture(b.ev(2));
    expect(b.controls.next().use).toBe(true);
    b.h.onPointerCancel(b.ev(1));
    expect(b.controls.next().use).toBe(false);
  });
});

describe('Chop hold button with two fingers on it', () => {
  it('stays held until every finger that pressed it is gone', () => {
    const b = chopButton();
    b.h.onPointerDown(b.ev(1));
    b.h.onPointerDown(b.ev(2));
    b.h.onPointerUp(b.ev(2));
    expect(b.controls.next().use).toBe(true);
    b.h.onPointerUp(b.ev(1));
    expect(b.controls.next().use).toBe(false);
    expect(b.states).toEqual([true, false]);
  });

  it('cancel and lost capture each end only their own finger', () => {
    const b = chopButton();
    b.h.onPointerDown(b.ev(1));
    b.h.onPointerDown(b.ev(2));
    b.h.onPointerCancel(b.ev(1));
    expect(b.controls.next().use).toBe(true);
    b.h.onLostPointerCapture(b.ev(1)); // repeat for an id already gone: no-op
    expect(b.controls.next().use).toBe(true);
    b.h.onLostPointerCapture(b.ev(2));
    expect(b.controls.next().use).toBe(false);
    expect(b.states).toEqual([true, false]);
  });
});
