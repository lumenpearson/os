import { expect, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * Sheets keeps Add sheet and Delete sheet reachable however many sheets a
 * workbook has. They used to share one row with the tabs and nothing that
 * could shrink or scroll, so the seventh sheet pushed both buttons past the
 * window edge — and the Sheet menu cannot switch sheets, so a tab past the
 * edge had no route to it either.
 */
test('the sheet tabs scroll and never push the buttons out of the window', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await setupAndUnlock(page);
  await launch(page, 'Sheets');
  await expect(page.getByTestId('sheet-tabs')).toBeVisible();

  // Shrink to the width the app promises to work at, then fill the row.
  const frame = page.getByTestId('window').first();
  const box = await frame.boundingBox();
  if (!box) throw new Error('the window has no box');
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  const add = page.getByRole('button', { name: 'Add sheet' });
  for (let i = 0; i < 8; i++) await add.click();

  const tabs = page.getByTestId('sheet-tabs');
  await expect(tabs.getByRole('button')).toHaveCount(9);

  // Both buttons are still inside the window, whatever the tabs are doing.
  const window = await frame.boundingBox();
  for (const name of ['Add sheet', 'Delete sheet']) {
    const button = await page.getByRole('button', { name }).boundingBox();
    if (!button || !window) throw new Error(`${name} has no box`);
    expect(button.x + button.width, `${name} is inside the window`).toBeLessThanOrEqual(
      window.x + window.width + 1,
    );
    expect(button.x, `${name} starts inside the window`).toBeGreaterThanOrEqual(window.x - 1);
  }

  // And the tabs that no longer fit are reachable by scrolling their own row.
  expect(await tabs.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await tabs.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  expect(await tabs.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});
