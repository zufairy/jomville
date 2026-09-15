/** the bits of a PointerEvent a hold button needs */
export interface HoldPointer {
  pointerId: number;
  currentTarget: { setPointerCapture(id: number): void };
}

/**
 * Press-and-hold touch button (Chop): on while the finger that pressed it is down.
 * Pointer capture keeps the hold through finger drift (moves, leaving the button);
 * only that finger lifting, a cancel or losing capture ends it.
 */
export function holdButton(set: (on: boolean) => void) {
  let held: number | null = null;
  const end = (e: { pointerId: number }) => {
    if (held !== e.pointerId) return;
    held = null;
    set(false);
  };
  return {
    onPointerDown: (e: HoldPointer) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* already gone */
      }
      held = e.pointerId;
      set(true);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  };
}
