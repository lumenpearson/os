import { expect, test } from '@playwright/test';
import { setupAndUnlock } from './helpers';

/**
 * LU-1602, the shell's half. Panels arrived with an animation and then went
 * out between one frame and the next; each now plays the reverse of its
 * entrance on the way out.
 *
 * Two things are checked, and the second is the one that could do harm. A
 * panel that lingers is still a panel: if it went on taking clicks for the
 * length of its exit, the press that dismissed it — or the next one — would
 * land on a menu row that is already gone.
 */
test('the start menu leaves, and stops taking clicks as it goes', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 720 });
  await setupAndUnlock(page);

  await page.getByTestId('start-button').click();
  const menu = page.getByTestId('start-menu');
  await expect(menu).toBeVisible();

  await page.keyboard.press('Escape');
  const during = await menu
    .evaluate((el) => ({
      direction: getComputedStyle(el).animationDirection,
      fill: getComputedStyle(el).animationFillMode,
      pointerEvents: getComputedStyle(el).pointerEvents,
      category: el.getAttribute('data-anim'),
    }))
    .catch(() => null);
  await expect(menu).toHaveCount(0, { timeout: 2000 });

  expect(during, 'the menu was still on screen just after Escape').not.toBeNull();
  expect(during?.direction).toBe('reverse');
  expect(during?.fill).toBe('forwards');
  expect(during?.pointerEvents).toBe('none');
  // Which Animation switch turns this off — the panel one, not menus.
  expect(during?.category).toBe('panel');
});

/**
 * The exit is timed in script, and script can only read a token. Tailwind
 * emits the theme variables it can see used, and `--duration-${category}` is
 * not a use it can see — two of these three once survived only because a test
 * file happened to spell them out, and the third came through as the empty
 * string, which reads as "no animation" and unmounts on the spot.
 */
test('every animation category has a duration to wait on', async ({ page }) => {
  await setupAndUnlock(page);
  const durations = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string) => style.getPropertyValue(name).trim();
    return {
      base: read('--duration-base'),
      menu: read('--duration-menu'),
      dialog: read('--duration-dialog'),
      panel: read('--duration-panel'),
    };
  });
  expect(durations.menu).toBe(durations.base);
  expect(durations.dialog).toBe(durations.base);
  expect(durations.panel).toBe(durations.base);
  expect(Number.parseFloat(durations.base)).toBeGreaterThan(0);
});
