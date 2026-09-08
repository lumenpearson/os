import { expect, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * LU-1601. The dialog flicker was never in a dialog.
 *
 * `WindowFrame` subscribed to the whole process object, and the load model
 * hands back a new one every two seconds for any process whose figures moved.
 * So the entire app subtree — an open dialog and every input in it —
 * re-rendered on that tick, React re-applied `name` and `type` on each input,
 * and that is what a person sees as flicker. Measured before the fix: 80 DOM
 * mutations in ten seconds, in five bursts exactly 2000 ms apart.
 *
 * The invariant is stated at the frame, not at one app's dialog, because the
 * frame is what all 35 of them are drawn inside: a load tick must not touch
 * an app's DOM at all.
 */
const CHURN = `(ms) => new Promise((resolve) => {
  const body = document.querySelector('[data-testid="window-body"]');
  if (!body) return resolve(-1);
  let n = 0;
  const obs = new MutationObserver((records) => { n += records.length; });
  obs.observe(body, { subtree: true, childList: true, attributes: true, characterData: true });
  setTimeout(() => { obs.disconnect(); resolve(n); }, ms);
})`;

// Two ticks' worth, so a tick that lands anywhere in the window is caught.
const WATCH_MS = 5_000;

test('an open dialog is not redrawn by the load tick', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await setupAndUnlock(page);
  await launch(page, 'Calendar');
  await expect(page.getByTestId('window').first()).toBeVisible();

  // Through the menubar rather than the shortcut: the window has to have the
  // keyboard for a shortcut to land, and this test is not about that.
  await page.waitForTimeout(1000);
  await page.getByRole('menuitem', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Event' }).click();
  await expect(page.locator('.lumen-scrim [role="dialog"]')).toBeVisible();
  // Past the entrance animation, so only the steady state is measured.
  await page.waitForTimeout(600);

  expect(await page.evaluate(`(${CHURN})(${WATCH_MS})`)).toBe(0);
});

/**
 * The same invariant for a window with no dialog open, across several apps —
 * a still app is still. Apps that draw a clock are left out: they are
 * supposed to change.
 */
for (const app of ['Calculator', 'Contacts', 'Text Editor', 'Files'] as const) {
  test(`${app} sits still between ticks`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await setupAndUnlock(page);
    await launch(page, app);
    await expect(page.getByTestId('window').first()).toBeVisible();
    await page.waitForTimeout(1200);
    expect(await page.evaluate(`(${CHURN})(${WATCH_MS})`)).toBe(0);
  });
}
