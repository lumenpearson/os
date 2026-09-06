import { expect, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * A window either draws a title bar of its own or lets the app have that row.
 *
 * Twenty apps ask for the second — Files, Notes, 2048 and the rest — and for
 * a long time none of them got it: the header carried `relative` from the
 * shared part of its class list, Tailwind orders `.relative` after
 * `.absolute` in the sheet, and so the branch that makes the bar float could
 * not win. Every one of those windows had a 36px strip of nothing above the
 * app's own toolbar, with the traffic lights alone in it.
 *
 * Both halves are asserted here because both are what the person sees, and
 * neither is visible to a unit test: a class list says nothing about which
 * rule the browser applied.
 */
const measure = async (page: import('@playwright/test').Page) => {
  const frame = page.getByTestId('window').last();
  await page.waitForTimeout(600);
  return frame.evaluate((win) => {
    const top = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().y) : null);
    const header = win.querySelector('[data-testid="window-titlebar"]');
    const body = win.querySelector('[data-testid="window-body"]');
    return {
      win: top(win),
      header: top(header),
      position: header ? getComputedStyle(header).position : null,
      body: top(body),
      firstRow: top(body?.querySelector('[role="toolbar"]') ?? null),
    };
  });
};

test.describe('the top row of a window', () => {
  test('an inset bar leaves the row to the app, with no empty strip above it', async ({ page }) => {
    await setupAndUnlock(page);
    for (const name of ['2048', 'Notes', 'Files']) {
      await launch(page, name);
      const m = await measure(page);
      expect(m.position, `${name}: the inset bar has to be out of flow`).toBe('absolute');
      // The app's own first row starts at the top of the window, under the
      // controls rather than below them. One pixel of window border is the
      // whole distance allowed; a title bar's worth of it is the bug.
      expect(m.body as number, `${name}: the body starts at the window top`).toBeLessThanOrEqual(
        (m.win as number) + 2,
      );
      expect(
        m.firstRow as number,
        `${name}: the app's first row is the top row`,
      ).toBeLessThanOrEqual((m.win as number) + 2);
    }
  });

  test('a window with a title keeps its own row', async ({ page }) => {
    await setupAndUnlock(page);
    await launch(page, 'Calculator');
    const m = await measure(page);
    expect(m.position).toBe('relative');
    expect(m.body).toBeGreaterThan(m.win as number);
    await expect(page.getByTestId('window-titlebar').last().getByText('Calculator')).toBeVisible();
  });

  test('an inset window still drags by its top row', async ({ page }) => {
    await setupAndUnlock(page);
    await launch(page, '2048');
    const frame = page.getByTestId('window').last();
    await page.waitForTimeout(600);
    const before = await frame.boundingBox();
    if (!before) throw new Error('no window');
    // A point in the top row that is not one of the app's own controls.
    await page.mouse.move(before.x + before.width - 40, before.y + 12);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width - 40 + 80, before.y + 12 + 60, { steps: 8 });
    await page.mouse.up();
    const after = await frame.boundingBox();
    if (!after) throw new Error('no window');
    expect(Math.round(after.x - before.x)).toBeGreaterThan(50);
    expect(Math.round(after.y - before.y)).toBeGreaterThan(30);
  });
});
