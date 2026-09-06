import { expect, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * Two settings a unit test cannot finish checking. One writes a CSS value the
 * browser has to accept; the other moves a window, and the proof is where the
 * window ends up.
 */
test.describe('settings only a browser can answer', () => {
  test('dynamic chrome paints the menubar with a colour mixed from the wallpaper', async ({
    page,
  }) => {
    await setupAndUnlock(page);
    const override = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--lumen-chrome'),
    );
    expect(override).toContain('color-mix');
    expect(override).toContain('--lumen-chrome-base');

    // color-mix is only useful if it resolves: an unparsed value would leave
    // the menubar transparent over the wallpaper.
    const painted = await page
      .getByTestId('menubar')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(painted).not.toBe('rgba(0, 0, 0, 0)');
    expect(painted).not.toBe('transparent');
    // A resolved color-mix comes back as `color(srgb …)`, not `rgb(…)`.
    expect(painted).toMatch(/^(rgba?|color)\(/);
  });

  test('a window tiled to a half keeps the gap Settings asks for', async ({ page }) => {
    await setupAndUnlock(page);
    await launch(page, 'Settings');
    await page.getByRole('button', { name: 'Display' }).click();
    const slider = page.getByRole('slider', { name: 'Gap between tiled windows' });
    await expect(slider).toBeVisible();
    await slider.fill('16');
    await expect(page.getByText('16 px')).toBeVisible();

    await page.keyboard.press('Meta+ArrowLeft');
    const frame = page.getByTestId('window').first();
    const box = await frame.boundingBox();
    if (!box) throw new Error('the window has no box');
    // The work area starts at the left edge, so the tile starts one gap in.
    expect(Math.round(box.x)).toBe(16);
  });
});
