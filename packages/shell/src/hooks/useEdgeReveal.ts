/**
 * Whether the pointer is close enough to an edge of the screen to bring a
 * hidden panel back.
 *
 * The listener runs at pointer rate, so it writes state only when the answer
 * changes — twice per approach rather than once per pixel. The band is
 * deliberately shallow: a panel that comes back whenever the pointer drifts
 * near the top is a panel that is always in the way.
 */

import { useEffect, useState } from 'react';

export type Edge = 'top' | 'bottom' | 'left' | 'right';

/** How close to the edge the pointer has to be, in px. */
export const REVEAL_BAND = 4;

/** How far past the panel it has to go before the panel hides again. */
export const HIDE_AT = 64;

export function edgeDistance(edge: Edge, x: number, y: number, w: number, h: number): number {
  switch (edge) {
    case 'top':
      return y;
    case 'bottom':
      return h - y;
    case 'left':
      return x;
    case 'right':
      return w - x;
  }
}

export function useEdgeReveal(edge: Edge, enabled: boolean): boolean {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setRevealed(false);
      return;
    }
    const onMove = (event: PointerEvent) => {
      const distance = edgeDistance(
        edge,
        event.clientX,
        event.clientY,
        window.innerWidth,
        window.innerHeight,
      );
      setRevealed((was) => (was ? distance < HIDE_AT : distance <= REVEAL_BAND));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [edge, enabled]);

  return enabled && revealed;
}
