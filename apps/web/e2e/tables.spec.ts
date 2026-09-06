import { expect, type Page, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * A table's header and its rows are two separate grids. Nothing makes them
 * agree except being laid out in boxes of the same width, and any padding on
 * one and not the other silently redistributes across the flexible tracks —
 * so the drift is small on the left, grows to the right, and is invisible
 * until a column of buttons makes it obvious.
 *
 * This measures it. For every table in the OS: the header lane and the row
 * lane under it must start at the same x and be the same width.
 */

/** Header lane vs row lane, per column, as `x/width` pairs that must match. */
async function lanes(page: Page, gridTestId?: string) {
  return page.evaluate((testId) => {
    const scope = testId ? document.querySelector(`[data-testid="${testId}"]`) : document;
    const root = scope ?? document;
    const headerCell = root.querySelector('[role="columnheader"]');
    const headerRow = headerCell?.closest('[role="row"]');
    if (!headerRow) return { error: 'no header row' };
    const grid = headerRow.closest('[role="grid"], [role="treegrid"]') ?? root;
    const bodyRow = [...grid.querySelectorAll('[role="row"]')].find(
      (r) => r !== headerRow && r.querySelector('[role="gridcell"]'),
    );
    if (!bodyRow) return { error: 'no body row' };
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), width: Math.round(r.width) };
    };
    return {
      heads: [...headerRow.children].map(box),
      cells: [...bodyRow.children].map(box),
    };
  }, gridTestId);
}

/** The one assertion: every lane of the header sits over the lane beneath it. */
function expectAligned(measured: Awaited<ReturnType<typeof lanes>>, where: string) {
  if ('error' in measured) throw new Error(`${where}: ${measured.error}`);
  const { heads, cells } = measured;
  expect(heads.length, `${where}: a header lane for every cell`).toBe(cells.length);
  for (let i = 0; i < heads.length; i++) {
    const head = heads[i];
    const cell = cells[i];
    if (!head || !cell) throw new Error(`${where}: missing lane ${i}`);
    expect(head.x, `${where}: lane ${i} starts in the same place`).toBe(cell.x);
    expect(head.width, `${where}: lane ${i} is the same width`).toBe(cell.width);
  }
}

test.describe('every table lines its header up with its rows', () => {
  test('Task Manager: processes, services and apps', async ({ page }) => {
    await setupAndUnlock(page);
    await launch(page, 'Task Manager');
    await expect(page.getByRole('radio', { name: 'Processes' })).toBeVisible();
    expectAligned(await lanes(page), 'Task Manager · Processes');

    await page.getByRole('radio', { name: 'Services' }).click();
    await expect(page.getByRole('button', { name: 'Start' }).first()).toBeVisible();
    expectAligned(await lanes(page), 'Task Manager · Services');

    await page.getByRole('radio', { name: 'Apps' }).click();
    await page.waitForTimeout(200);
    expectAligned(await lanes(page), 'Task Manager · Apps');
  });

  test('Storage, in its largest-files list', async ({ page }) => {
    await setupAndUnlock(page);
    await launch(page, 'Storage');
    await page.getByRole('radio', { name: 'Largest Files' }).click();
    await expect(page.getByRole('columnheader').first()).toBeVisible();
    expectAligned(await lanes(page), 'Storage · largest files');
  });

  test('Files, in list view', async ({ page }) => {
    await setupAndUnlock(page);
    await launch(page, 'Files');
    await page.keyboard.press('Control+2');
    await page.waitForTimeout(300);
    expectAligned(await lanes(page), 'Files · list');
  });
});
