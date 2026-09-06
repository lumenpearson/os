import { expect, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * The card lane in Files. Two things about it can only be checked in a
 * browser: that walking it with the keyboard scrolls the lane and nothing
 * else, and that the card the keyboard will act on is wearing the accent.
 */
test.describe('the card lane', () => {
  test('walking it scrolls the lane and leaves the rest of Files where it was', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await setupAndUnlock(page);
    await launch(page, 'Files');
    await expect(page.getByTestId('window').first()).toBeVisible();
    // The window has to have the keyboard before a view shortcut reaches it.
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+4');
    const lane = page.getByRole('listbox', { name: 'Files' });
    await expect(lane).toBeVisible();

    const sidebar = page.getByRole('navigation').first();
    const table = page.getByRole('grid').first();
    const before = {
      sidebar: await sidebar.boundingBox(),
      table: await table.boundingBox(),
      window: await page.getByTestId('window').first().boundingBox(),
    };

    // Walking the lane means having it: a click puts the keyboard on a card,
    // which is what a person does before pressing an arrow.
    await lane.locator('[role="option"]').first().click();
    // Far enough along the lane that the last cards start off the right edge.
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(600);

    expect(await lane.evaluate((el) => el.scrollLeft), 'the lane scrolled').toBeGreaterThan(0);

    // Nothing above the lane moved. `scrollIntoView` used to scroll every
    // scrollable ancestor, which dragged the whole of Files around.
    expect(await sidebar.boundingBox()).toEqual(before.sidebar);
    expect(await table.boundingBox()).toEqual(before.table);
    expect(await page.getByTestId('window').first().boundingBox()).toEqual(before.window);
  });

  test('the card the keyboard will act on wears the accent', async ({ page }) => {
    await setupAndUnlock(page);
    await launch(page, 'Files');
    await expect(page.getByTestId('window').first()).toBeVisible();
    // The window has to have the keyboard before a view shortcut reaches it.
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+4');
    const lane = page.getByRole('listbox', { name: 'Files' });
    await expect(lane).toBeVisible();

    // A card is marked from the moment the lane is drawn, before anything is
    // clicked: the lane always has a place the arrow keys would move from.
    await expect(lane.locator('[role="option"][data-at-cursor="true"]')).toHaveCount(1);

    await lane.locator('[role="option"]').first().click();
    await page.keyboard.press('ArrowRight');

    const cursor = page.locator('[role="option"][data-cursor="true"]');
    await expect(cursor).toHaveCount(1);

    const outline = await cursor.evaluate((el) => ({
      colour: getComputedStyle(el).outlineColor,
      width: Number.parseFloat(getComputedStyle(el).outlineWidth),
      style: getComputedStyle(el).outlineStyle,
    }));
    expect(outline.width).toBeGreaterThan(1);
    expect(outline.style).not.toBe('none');

    // Resolved through the token, so the ring is the one accent colour and
    // not a second one that happens to look like it.
    const accent = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--lumen-accent)';
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    });
    expect(outline.colour).toBe(accent);
  });
});
