import { expect, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * LU-1603. A scroller shows, at its edge, that content carries on past it —
 * and stops showing it at the end, which is the half that is easy to leave
 * out. Only a browser can answer this: the shadow is a computed style that
 * depends on a layout, and the attribute behind it is written by a
 * `ResizeObserver` and a scroll listener rather than by React.
 */
test('a table says when it carries on past its edge, and stops at the end', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 560 });
  await setupAndUnlock(page);
  await launch(page, 'Files');
  await page.waitForTimeout(1500);
  // The applications folder: more entries than a short window can show.
  await page
    .getByRole('navigation', { name: 'Sidebar' })
    .getByRole('button', { name: /Applications/ })
    .click();
  await page.waitForTimeout(1200);

  const grid = page.getByRole('grid').first();
  const read = async () => {
    const s = await grid.evaluate((el) => ({
      top: el.dataset.edgeTop ?? '-',
      bottom: el.dataset.edgeBottom ?? '-',
      shadow: getComputedStyle(el).boxShadow.slice(0, 48),
      over: el.scrollHeight - el.clientHeight,
    }));
    return s;
  };

  const start = await read();
  await grid.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(400);
  const end = await read();

  expect(start.over, 'the list overflows its port').toBeGreaterThan(0);
  expect(start.top, 'nothing above a list at its start').toBe('-');
  expect(start.bottom, 'something below it').toBe('true');
  expect(end.top, 'something above it once scrolled').toBe('true');
  expect(end.bottom, 'nothing below it at the end').toBe('-');
  expect(end.shadow, 'and the shadow is drawn').not.toBe('none');
});
