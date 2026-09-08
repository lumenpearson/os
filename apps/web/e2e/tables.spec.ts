import { expect, type Page, test } from '@playwright/test';
import { BUILT_IN_APPS, launch, setupAndUnlock } from './helpers';

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

/**
 * The first lane that does not sit over the one beneath it, as a sentence,
 * or null when they all do. Collected rather than thrown so that a sweep of
 * thirty-five apps reports every table that drifted, not just the first.
 */
function misalignment(measured: Awaited<ReturnType<typeof lanes>>, where: string): string | null {
  if ('error' in measured) return `${where}: ${measured.error}`;
  const { heads, cells } = measured;
  if (heads.length !== cells.length) {
    return `${where}: ${heads.length} header lanes over ${cells.length} cells`;
  }
  for (let i = 0; i < heads.length; i++) {
    const head = heads[i];
    const cell = cells[i];
    if (!head || !cell) return `${where}: missing lane ${i}`;
    if (head.x !== cell.x || head.width !== cell.width) {
      return `${where}: lane ${i} is ${head.x}/${head.width} in the header and ${cell.x}/${cell.width} in the rows`;
    }
  }
  return null;
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

/**
 * Where a table is not the first thing an app shows, the step that reaches
 * one. Everything else is opened and looked at as it comes up.
 */
const REACH: Record<string, (page: Page) => Promise<void>> = {
  Storage: async (page) => {
    await page.getByRole('radio', { name: 'Largest Files' }).click();
  },
  Files: async (page) => {
    await page.keyboard.press('Control+2');
  },
};

test.describe('every app the OS ships', () => {
  test('draws no table whose header has drifted off its rows', async ({ page }) => {
    test.setTimeout(300_000);
    await setupAndUnlock(page);

    const drifting: string[] = [];
    const stuck: string[] = [];
    const tables: string[] = [];
    for (const app of BUILT_IN_APPS) {
      await launch(page, app);
      await expect(page.getByTestId('window').first()).toBeVisible();
      await REACH[app]?.(page);
      // The measurement is of laid-out boxes, so it has to be taken after
      // the app has drawn its first rows rather than while it is still
      // reading the disk.
      await page.waitForTimeout(400);
      if ((await page.locator('[role="columnheader"]').count()) > 0) {
        tables.push(app);
        const measured = await lanes(page);
        const problem = misalignment(measured, app);
        if (problem) drifting.push(problem);
      }
      // Close everything before the next app, so one app's window cannot be
      // measured as another's — and note any app that ignores the standard
      // shortcut, because a window a person cannot close from the keyboard is
      // a defect whatever its tables look like.
      await page.keyboard.press('Control+w');
      if ((await page.getByTestId('window').count()) > 0) {
        stuck.push(`${app}: still open after Ctrl+W`);
        await page.getByRole('button', { name: 'Close' }).first().click();
        await expect(page.getByTestId('window')).toHaveCount(0, { timeout: 5000 });
      }
    }

    // Named rather than counted: a run that opened every app and found no
    // table at all would otherwise pass while measuring nothing.
    expect(tables.length, 'apps with a table were found').toBeGreaterThan(2);
    expect(drifting).toEqual([]);
    expect(stuck).toEqual([]);
  });
});

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
