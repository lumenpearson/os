import { expect, test } from '@playwright/test';

/**
 * LU-1608. `overflow: auto` clips at the padding box, so anything a child
 * paints outside itself — a selection ring, a focus ring — is shaved off
 * against the edge of a scroller that has no padding to spare.
 *
 * The setup assistant's chosen accent lost the left quarter of its ring that
 * way, which is what a person sees as an element cut in half. The fix is
 * padding inside the scroller and a matching negative margin outside it, so
 * the ring has room and nothing moves.
 *
 * The same sweep was run across all thirty-five apps and found nothing else,
 * so only the case that was broken is kept here; the instrument stays because
 * it is the thing that would catch the next one.
 */

/**
 * Every element inside a `.lumen-scroll` that paints outside itself — a ring
 * or a focus outline — and whose paint falls outside the scroller's content
 * box, where `overflow: auto` clips it.
 */
function clipped() {
  const out: Array<Record<string, unknown>> = [];
  const spread = (shadow: string): number => {
    // Tailwind's ring is the last non-transparent layer: `rgb(...) 0px 0px 0px Npx`.
    let most = 0;
    for (const m of shadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g)) {
      const value = Number.parseFloat(m[4] ?? '0');
      if (Number.isFinite(value)) most = Math.max(most, value);
    }
    return most;
  };
  for (const scroller of document.querySelectorAll('.lumen-scroll')) {
    const cs = getComputedStyle(scroller);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    // Overflow clips at the PADDING box, which is why padding is the fix:
    // it is inside the clip and a child can paint over it.
    const port = scroller.getBoundingClientRect();
    const box = {
      left: port.left + Number.parseFloat(cs.borderLeftWidth),
      top: port.top + Number.parseFloat(cs.borderTopWidth),
      right: port.right - Number.parseFloat(cs.borderRightWidth),
    };
    for (const el of scroller.querySelectorAll('*')) {
      const style = getComputedStyle(el);
      const paint = Math.max(
        spread(style.boxShadow),
        style.outlineStyle === 'none'
          ? 0
          : Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset || '0'),
      );
      if (paint <= 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Only an element that is itself fully inside the clip: one scrolled
      // out of view is not clipped, it is scrolled, which is the point.
      const inside =
        r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5;
      if (!inside) continue;
      const over = Math.max(
        box.left - (r.left - paint),
        box.top - (r.top - paint),
        r.right + paint - box.right,
      );
      if (over > 0.5) {
        out.push({
          what:
            el.getAttribute('aria-label') ?? `${el.tagName}.${String(el.className).slice(0, 34)}`,
          paint,
          clippedBy: +over.toFixed(1),
        });
      }
    }
  }
  return out;
}

test('the setup assistant clips nothing it draws', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 460 });
  await page.goto('/');
  await expect(page.getByTestId('setup-assistant')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await page.waitForTimeout(300);
  // The chosen accent, whose ring paints four pixels outside the button.
  expect(await page.evaluate(clipped)).toEqual([]);
  // And the same control with the keyboard on it, which adds a focus ring.
  await page.getByRole('button', { name: 'Blue' }).focus();
  await page.waitForTimeout(150);
  expect(await page.evaluate(clipped)).toEqual([]);
});
