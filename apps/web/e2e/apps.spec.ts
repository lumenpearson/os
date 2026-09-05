import { expect, type Page, test } from '@playwright/test';

/**
 * The newest applications at both ends of the size range the OS claims to
 * work at. These open a window and photograph it rather than asserting on
 * pixels: what they are actually checking is that the layout adapts and that
 * nothing overflows the window, which is the sort of thing a unit test cannot
 * see and a person can.
 */

/** Walks setup once and lands on the desktop. */
async function setupAndUnlock(page: Page, password = 'lumen-test-1') {
  await page.goto('/');
  await expect(page.getByTestId('setup-assistant')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByLabel('Password hint').fill('the usual');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('I saved my recovery key').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('desktop')).toBeVisible();
}

/** Launch an app through Spotlight, which is the shortest path to one. */
async function launch(page: Page, name: string) {
  await page.keyboard.press('Control+Space');
  await expect(page.getByTestId('spotlight')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search' }).fill(name);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('spotlight')).toBeHidden();
}

/** Nothing may push the document wider than the window. */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * Shrinking the browser reaches the window manager through a ResizeObserver,
 * so the windows move a frame or two after the viewport does. Wait for the
 * one on screen to be back inside it before photographing anything.
 */
async function expectWindowInsideScreen(page: Page) {
  await expect
    .poll(async () => {
      const frame = page.getByTestId('window').first();
      const box = await frame.boundingBox();
      const view = page.viewportSize();
      if (!box || !view) return false;
      return box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width + 1;
    })
    .toBe(true);
}

const SMALL = { width: 800, height: 600 };
/** Small enough that the window itself drops under Calendar's 720 px threshold. */
const TINY = { width: 620, height: 560 };
const LARGE = { width: 2560, height: 1440 };

test.describe('the shell at a narrow width', () => {
  test('the menubar stays one line high with an app that has five menus', async ({ page }) => {
    await page.setViewportSize(TINY);
    await setupAndUnlock(page);
    await launch(page, 'Paint');
    await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
    await expectWindowInsideScreen(page);

    // The bar is a fixed 26 px row, so a wrapped clock does not make it
    // taller — it paints outside it, over the menu titles. What gives that
    // away is the clock's own content being taller than the box holding it,
    // which is what this asserts. Squeezed, "Sat, Sep 5" and "8:33 AM" each
    // took two lines; now the status items keep their width and the menus
    // clip instead.
    const overflow = await page.evaluate(() => {
      const clock = document.querySelector('[data-testid="menubar-clock"]');
      if (!(clock instanceof HTMLElement)) return null;
      return {
        scrollHeight: clock.scrollHeight,
        clientHeight: clock.clientHeight,
        lines: [...clock.querySelectorAll('span')].map((el) =>
          Math.round(el.getBoundingClientRect().height),
        ),
      };
    });
    expect(overflow).not.toBeNull();
    expect(overflow?.scrollHeight).toBeLessThanOrEqual(overflow?.clientHeight ?? 0);
    for (const height of overflow?.lines ?? []) expect(height).toBeLessThanOrEqual(20);
    await page.screenshot({ path: 'test-results/menubar-narrow.png' });
  });
});

test.describe('the newest apps at both ends of the range', () => {
  test('Calendar keeps its sidebar on a large screen and folds it on a small one', async ({
    page,
  }) => {
    await page.setViewportSize(LARGE);
    await setupAndUnlock(page);
    await launch(page, 'Calendar');
    await expect(page.getByRole('grid', { name: 'Month' })).toBeVisible();
    // Above 720 px of window the sidebar has room for itself.
    await expect(page.getByRole('complementary', { name: 'Calendar sidebar' })).toBeVisible();
    await page.screenshot({ path: 'test-results/calendar-large.png' });
    await expectNoHorizontalOverflow(page);

    // The window is clamped into the smaller screen, and the layout follows
    // the window rather than the viewport: at 800 the window is still wide
    // enough for the sidebar, so it stays.
    await page.setViewportSize(SMALL);
    await expectWindowInsideScreen(page);
    await expect(page.getByRole('grid', { name: 'Month' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Calendar sidebar' })).toBeVisible();
    await page.screenshot({ path: 'test-results/calendar-small.png' });
    await expectNoHorizontalOverflow(page);

    // Below 720 px of window there is no room for it, and it folds away
    // rather than squeezing the month grid into nothing.
    await page.setViewportSize(TINY);
    await expectWindowInsideScreen(page);
    await expect(page.getByRole('grid', { name: 'Month' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Calendar sidebar' })).toBeHidden();
    await page.screenshot({ path: 'test-results/calendar-tiny.png' });
    await expectNoHorizontalOverflow(page);
  });

  test('Paint draws its tools and canvas at both sizes', async ({ page }) => {
    await page.setViewportSize(LARGE);
    await setupAndUnlock(page);
    await launch(page, 'Paint');
    await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
    await expect(page.getByTestId('paint-surface')).toBeVisible();
    await page.screenshot({ path: 'test-results/paint-large.png' });
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize(SMALL);
    await expectWindowInsideScreen(page);
    await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
    await expect(page.getByTestId('paint-surface')).toBeVisible();
    await page.screenshot({ path: 'test-results/paint-small.png' });
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize(TINY);
    await expectWindowInsideScreen(page);
    await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
    await expect(page.getByTestId('paint-surface')).toBeVisible();
    await page.screenshot({ path: 'test-results/paint-tiny.png' });
    await expectNoHorizontalOverflow(page);
  });
});

/**
 * Every app, shrunk to the smallest window it says it can work in.
 *
 * Each app declares `minWidth`/`minHeight` in its definition, and the window
 * manager refuses to resize below them — so dragging the edges as far as they
 * go lands on exactly the size the app promises to work at. What this asserts
 * there is that nothing in the window sticks out past its own parent: a
 * toolbar squeezing a button to 16 px, or a breadcrumb collapsing to nothing,
 * is a promise the app has broken.
 */
const APPS = [
  'Files',
  'Browser',
  'Terminal',
  'Text Editor',
  'Notes',
  'Writer',
  'Sheets',
  'Slides',
  'Preview',
  'Media Player',
  'Paint',
  'Calculator',
  'Calendar',
  'Clock',
  'Settings',
  'Task Manager',
  'System Information',
  'Storage',
  'Console',
  'Software Center',
  'Minesweeper',
  'Chess',
];

/**
 * Widest spill of an in-flow child past the right edge of its parent, in px.
 * Absolutely positioned children are skipped: a few are meant to sit outside
 * their box, like the strip that straddles a spreadsheet column's edge.
 */
async function worstSpill(page: Page): Promise<{ px: number; where: string }> {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-testid="window"]');
    if (!(frame instanceof HTMLElement)) return { px: 0, where: 'no window' };
    let px = 0;
    let where = '';
    for (const parent of frame.querySelectorAll<HTMLElement>('*')) {
      if (parent.clientWidth === 0) continue;
      if (getComputedStyle(parent).overflowX !== 'visible') continue;
      const edge = parent.getBoundingClientRect().left + parent.clientWidth;
      for (const child of parent.children) {
        if (!(child instanceof HTMLElement)) continue;
        const position = getComputedStyle(child).position;
        if (position === 'absolute' || position === 'fixed') continue;
        const spill = Math.round(child.getBoundingClientRect().right - edge);
        if (spill > px) {
          px = spill;
          where = `${child.tagName}.${child.className.slice(0, 40)} out of ${parent.tagName}.${parent.className.slice(0, 40)}`;
        }
      }
    }
    return { px, where };
  });
}

/** Drag the east then the south edge inward; the window stops at its minimum. */
async function shrinkToMinimum(page: Page) {
  const frame = page.getByTestId('window').first();
  const first = await frame.boundingBox();
  if (!first) throw new Error('the window has no box');
  await page.mouse.move(first.x + first.width - 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 40, first.y + first.height / 2, { steps: 12 });
  await page.mouse.up();
  const second = await frame.boundingBox();
  if (!second) throw new Error('the window has no box');
  await page.mouse.move(second.x + second.width / 2, second.y + second.height - 2);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + 40, { steps: 12 });
  await page.mouse.up();
}

test.describe('every app at its declared minimum size', () => {
  test('nothing is squeezed out of its own box', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(LARGE);
    await setupAndUnlock(page);

    const spills: string[] = [];
    for (const name of APPS) {
      await launch(page, name);
      await expect(page.getByTestId('window').first()).toBeVisible();
      await shrinkToMinimum(page);
      // One hairline of slack: borders round in and out of the client box.
      await expect
        .poll(async () => (await worstSpill(page)).px, { timeout: 5_000 })
        .toBeLessThanOrEqual(2);
      const spill = await worstSpill(page);
      if (spill.px > 2) spills.push(`${name}: ${spill.px}px — ${spill.where}`);
      await page.keyboard.press('Control+w');
      await expect(page.getByTestId('window')).toHaveCount(0);
    }
    expect(spills).toEqual([]);
  });
});
