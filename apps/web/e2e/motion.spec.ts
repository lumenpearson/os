import { expect, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * LU-1602, the parts a person feels rather than watches: a window settles
 * into a shape a command gave it, a control gives under the press, and
 * neither happens when the matching Animation switch is off.
 */
test('a window settles into a shape a command gave it, and not under the hand', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await setupAndUnlock(page);
  await launch(page, 'Calculator');
  const win = page.getByTestId('window').first();
  await expect(win).toBeVisible();

  const properties = () => win.evaluate((el) => getComputedStyle(el).transitionProperty);
  /*
   * At rest the geometry is not in the transition list, and that is the point
   * of doing this at all: a drag writes `transform` at pointer rate, and a
   * transition on that property would leave the window trailing the hand.
   */
  expect(await properties()).not.toContain('transform');

  const before = (await win.boundingBox())?.width ?? 0;
  await win.getByTestId('window-controls').getByRole('button', { name: 'Zoom' }).click();
  // Read it while the command is settling, before the window has arrived.
  const during = await properties();
  await expect
    .poll(async () => (await win.boundingBox())?.width ?? 0, { message: 'the window grew' })
    .toBeGreaterThan(before);
  expect(during, 'the geometry animates while a command settles it').toContain('transform');

  // And it is given back afterwards, so the next drag is direct again.
  await expect.poll(properties, { message: 'back to a still frame' }).not.toContain('transform');
});

test('a control gives under the press, and stops when the switch is off', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await setupAndUnlock(page);
  await launch(page, 'Calendar');
  await expect(page.getByTestId('window').first()).toBeVisible();
  await page.waitForTimeout(900);
  // A dialog, because that is where the shared Button lives; the calculator's
  // keys and the window controls are each drawn by their own component.
  await page.getByRole('menuitem', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Event' }).click();
  const button = page.locator('.lumen-scrim').getByRole('button', { name: 'Cancel' });
  await expect(button).toBeVisible();

  const transformWhilePressed = async () => {
    const box = await button.boundingBox();
    await page.mouse.move((box?.x ?? 0) + 8, (box?.y ?? 0) + 8);
    await page.mouse.down();
    const transform = await button.evaluate((el) => getComputedStyle(el).transform);
    // Off the button before letting go, so the press is only a press: a real
    // click on Cancel would take the dialog away before the second reading.
    await page.mouse.move(4, 4);
    await page.mouse.up();
    return transform;
  };

  expect(await transformWhilePressed(), 'the control gives under the finger').not.toBe('none');
  await page.evaluate(() => {
    document.documentElement.dataset.animPress = 'off';
  });
  expect(await transformWhilePressed(), 'the Animation switch turns it off').toBe('none');
});
