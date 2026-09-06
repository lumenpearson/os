import { expect, test } from '@playwright/test';
import { launch, settledBox, setupAndUnlock } from './helpers';

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
    const box = await settledBox(frame);
    // The work area starts at the left edge, so the tile starts one gap in.
    expect(Math.round(box.x)).toBe(16);
  });
});

/**
 * LU-402: a dialog is sized by the window it belongs to, and only its content
 * scrolls. The acceptance is a small window, because that is where a sheet
 * with a fixed height escapes its frame — and the failure is invisible on a
 * large screen, which is why it needs a test rather than a look.
 */
test.describe('a dialog inside a small window', () => {
  test('stays inside the window body, and only its content scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 560 });
    await setupAndUnlock(page);
    await launch(page, 'Settings');
    // At this width Settings folds its sidebar into a section picker.
    await page.getByLabel('Section').selectOption('power');
    await page.getByRole('button', { name: 'Restart' }).click();

    // A window carries role="dialog" too, so name the sheet.
    const dialog = page.getByRole('dialog', { name: 'Restart now?' });
    await expect(dialog).toBeVisible();
    const body = page.getByTestId('window-body').first();

    const [sheet, host] = await Promise.all([dialog.boundingBox(), body.boundingBox()]);
    if (!sheet || !host) throw new Error('no boxes to compare');
    expect(sheet.x).toBeGreaterThanOrEqual(host.x - 1);
    expect(sheet.y).toBeGreaterThanOrEqual(host.y - 1);
    expect(sheet.x + sheet.width).toBeLessThanOrEqual(host.x + host.width + 1);
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(host.y + host.height + 1);

    // The frame itself never scrolls: overflow belongs to the body alone.
    const frame = await dialog.evaluate((el) => ({
      scroll: el.scrollHeight,
      client: el.clientHeight,
    }));
    expect(frame.scroll).toBeLessThanOrEqual(frame.client + 1);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

/**
 * LU-307: the overview shows every window grouped by the app it belongs to,
 * with the panels out of the way. The grouping is unit-tested as geometry;
 * what needs a browser is that the headings are drawn where the layout says
 * and that the taskbar really does leave.
 */
test.describe('the window overview', () => {
  test('groups the windows by app and takes the panels away', async ({ page }) => {
    await setupAndUnlock(page);
    await launch(page, 'Files');
    await launch(page, 'Terminal');
    await expect(page.getByTestId('window')).toHaveCount(2);

    const taskbar = page.getByTestId('taskbar');
    const before = await taskbar.boundingBox();
    if (!before) throw new Error('no taskbar');

    await page.keyboard.press('Control+Alt+ArrowUp');
    const overview = page.getByTestId('mission-control');
    await expect(overview).toBeVisible();

    // One heading per app, naming the app rather than the window.
    await expect(overview.getByRole('heading', { name: /Files/ })).toBeVisible();
    await expect(overview.getByRole('heading', { name: /Terminal/ })).toBeVisible();

    // The taskbar slides off its edge rather than sitting under the scrim.
    await expect
      .poll(async () => {
        const box = await taskbar.boundingBox();
        return box ? Math.round(box.y) : -1;
      })
      .toBeGreaterThan(Math.round(before.y));

    await page.keyboard.press('Escape');
    await expect(overview).toBeHidden();
    await expect
      .poll(async () => {
        const box = await taskbar.boundingBox();
        return box ? Math.round(box.y) : -1;
      })
      .toBe(Math.round(before.y));
  });
});
