import { expect, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * Three things about windows that only a real browser can answer: whether the
 * title bar drags, whether an inactive window keeps quiet, and whether an open
 * dialog stays where it is instead of being rebuilt under the person reading
 * it. Each was a defect; each is watched here.
 */

test.describe('windows', () => {
  test('drag the title bar anywhere along it, not only by the controls', async ({ page }) => {
    await setupAndUnlock(page);
    await launch(page, 'Files');
    const frame = page.getByTestId('window').first();
    await expect(frame).toBeVisible();
    const before = await frame.boundingBox();
    if (!before) throw new Error('the window has no box');

    // The middle of the bar: in Files that is the breadcrumb, which is exactly
    // where dragging used to do nothing at all.
    await page.mouse.move(before.x + before.width / 2, before.y + 14);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 120, before.y + 74, { steps: 10 });
    await page.mouse.up();

    const after = await frame.boundingBox();
    expect(after?.x).toBeCloseTo(before.x + 120, -1);
    expect(after?.y).toBeCloseTo(before.y + 60, -1);
  });

  test('the controls of the window behind stay grey under the pointer', async ({ page }) => {
    await setupAndUnlock(page);
    await launch(page, 'Files');
    await launch(page, 'Calculator');
    const behind = page.locator('[data-testid="window"][data-app-id="lumen.files"]');
    await expect(behind).toHaveAttribute('data-focused', 'false');

    const close = behind.getByRole('button', { name: 'Close' });
    await close.hover();
    const glyph = close.locator('svg');
    await expect(glyph).toHaveCSS('opacity', '0');
  });

  test('an open dialog is not rebuilt while it is being read', async ({ page }) => {
    await setupAndUnlock(page);
    await launch(page, 'Paint');
    await expect(page.getByTestId('paint-surface')).toBeVisible();
    await page.keyboard.press('Shift+Control+C');
    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible();

    // The kernel ticks its load figures every two seconds, which renders every
    // window frame. That used to throw away the window body the dialog is
    // portalled into, so the dialog blinked. Five seconds covers two ticks.
    const survived = await page.evaluate(async () => {
      const node = document.querySelector('[role="dialog"][aria-modal="true"]');
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const now = document.querySelector('[role="dialog"][aria-modal="true"]');
      return node !== null && node === now;
    });
    expect(survived).toBe(true);
  });
});
