import { expect, test } from '@playwright/test';
import { launch, settledBox, setupAndUnlock } from './helpers';

/**
 * Three things about windows that only a real browser can answer: whether the
 * title bar drags, whether an inactive window keeps quiet, and whether an open
 * dialog stays where it is instead of being rebuilt under the person reading
 * it. Each was a defect; each is watched here.
 */

test.describe('windows', () => {
  test('drag the top row anywhere it is free, not only by the controls', async ({ page }) => {
    await setupAndUnlock(page);
    await launch(page, 'Files');
    const frame = page.getByTestId('window').first();
    await expect(frame).toBeVisible();
    const before = await settledBox(frame);

    /*
     * Files puts its own toolbar on the top row, so most of that row is
     * breadcrumb, search and view buttons — and a button must navigate, not
     * drag. What has to drag is the bare row between them. Asking the page
     * where that is beats guessing: the midpoint of the row is a breadcrumb
     * segment, and a test that dragged from there only passed because the
     * open animation nudged the pointer into the gap beside it.
     */
    const grab = await page.evaluate(
      ({ left, right, y }) => {
        const free = (x: number) =>
          !document
            .elementFromPoint(x, y)
            ?.closest('button, a, input, select, textarea, [role="button"], [role="textbox"]');
        let start: number | null = null;
        for (let x = left; x <= right; x += 2) {
          if (free(x)) {
            if (start === null) start = x;
            else if (x - start >= 24) return (start + x) / 2;
          } else start = null;
        }
        return null;
      },
      {
        left: Math.round(before.x) + 2,
        right: Math.round(before.x + before.width) - 2,
        y: Math.round(before.y) + 18,
      },
    );
    if (grab === null)
      throw new Error('the top row is controls end to end, with nowhere to grab it');

    // Right of the three window controls: dragging used to work only there.
    const controls = await page.getByRole('button', { name: 'Close' }).first().boundingBox();
    expect(grab, 'the grab point is past the window controls').toBeGreaterThan(
      (controls?.x ?? before.x) + 40,
    );

    await page.mouse.move(grab, before.y + 18);
    await page.mouse.down();
    await page.mouse.move(grab + 120, before.y + 78, { steps: 10 });
    await page.mouse.up();

    const after = await settledBox(frame);
    expect(after.x).toBeCloseTo(before.x + 120, -1);
    expect(after.y).toBeCloseTo(before.y + 60, -1);
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
