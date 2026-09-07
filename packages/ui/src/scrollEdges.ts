/**
 * Which edges of a scroller have content past them.
 *
 * Pure, so the arithmetic can be tested without a browser: what the DOM gives
 * is four numbers per axis and what the interface needs is four booleans.
 *
 * The tolerance is not fussiness. A scroller's `scrollHeight` is a rounded
 * integer while `scrollTop` is fractional at any zoom but 100 %, so the sum at
 * the bottom of a list lands a fraction short of the whole and an exact
 * comparison leaves a shadow hanging under content that has nothing beneath
 * it. One pixel is below the width of the shadow it decides.
 */

export interface ScrollMetrics {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
}

export interface ScrollEdges {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

/** Below the width of the shadow whose presence it decides. */
const SLACK = 1;

export function scrollEdges(m: ScrollMetrics): ScrollEdges {
  return {
    top: m.scrollTop > SLACK,
    bottom: m.scrollTop + m.clientHeight < m.scrollHeight - SLACK,
    left: m.scrollLeft > SLACK,
    // A right-to-left scroller reports `scrollLeft` as zero or negative at its
    // start, so the far edge is the distance either way rather than a sum.
    right: Math.abs(m.scrollLeft) + m.clientWidth < m.scrollWidth - SLACK,
  };
}
