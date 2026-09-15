/** the bits of a PointerEvent a hold button needs */
export interface HoldPointer {
  pointerId: number;
  currentTarget: { setPointerCapture(id: number): void };
}

/**
 * Press-and-hold touch button (Chop): on while any finger that pressed it is down.
 * Pointer capture keeps the hold through finger drift (moves, leaving the button);
 * each finger's own up, cancel or lost capture removes only that finger.
 */
export function holdButton(set: (on: boolean) => void) {
  const down = new Set<number>();
  const end = (e: { pointerId: number }) => {
    if (!down.delete(e.pointerId)) return;
    if (!down.size) set(false);
  };
  return {
    onPointerDown: (e: HoldPointer) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* already gone */
      }
      const first = !down.size;
      down.add(e.pointerId);
      if (first) set(true);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  };
}
