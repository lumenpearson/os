import { expect, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * LU-1602. Things arrive with an animation and used to vanish between one
 * frame and the next, because React unmounts on the tick the flag goes false
 * and leaves nothing to animate. `usePresence` holds a sheet for the length
 * of its exit.
 *
 * The file picker is the case worth watching: its provider answers the
 * request and drops the component, so the presence has to live in the
 * provider rather than the sheet — and the picker's own state is a folder it
 * is meant to forget, so each request gets a new component rather than the
 * last one's directory. Both halves are checked here, because a fix for the
 * first that broke the second would be worse than the defect.
 */
test('the file dialog leaves, and reopens on a fresh folder', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 720 });
  await setupAndUnlock(page);
  await launch(page, 'Text Editor');
  await expect(page.getByRole('textbox', { name: 'Document text' })).toBeVisible();

  await page.keyboard.press('Control+o');
  const sheet = page.locator('.lumen-scrim [role="dialog"]');
  await expect(sheet).toBeVisible();
  // Walk into a folder, so a stale instance would be obvious on reopen.
  await page
    .getByRole('navigation', { name: 'Sidebar' })
    .getByRole('button', { name: /Applications/ })
    .click();
  await page.waitForTimeout(400);

  await page.keyboard.press('Escape');
  const during = await sheet
    .evaluate((el) => getComputedStyle(el).animationDirection)
    .catch(() => null);
  await expect(sheet).toHaveCount(0, { timeout: 2000 });

  // Reopened, it is a new picker on its own starting folder rather than the
  // one the last request was left in.
  await page.keyboard.press('Control+o');
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(400);
  // The listing itself, not the sidebar — Applications is a favourite there
  // either way, so the whole text says nothing about which folder is open.
  const rows = await page
    .locator(
      '.lumen-scrim [role="dialog"] [role="listbox"] [role="option"], .lumen-scrim [role="dialog"] [role="row"]',
    )
    .allInnerTexts();
  expect(
    rows.some((r) => r.startsWith('Desktop')),
    'back at Home, not the folder it was left in',
  ).toBe(true);
  expect(during, 'the sheet was still there just after Escape').toBe('reverse');
});
