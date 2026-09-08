import { expect, type Page } from '@playwright/test';

/** Walks setup once and lands on the desktop. */
export async function setupAndUnlock(page: Page, password = 'lumen-test-1') {
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
export async function launch(page: Page, name: string) {
  await page.keyboard.press('Control+Space');
  await expect(page.getByTestId('spotlight')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search' }).fill(name);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('spotlight')).toBeHidden();
}

/**
 * Every app a person can launch, by the name the launcher shows.
 *
 * One list, used by both sweeps — the minimum-size sweep in `apps.spec.ts`
 * and the table-lane sweep in `tables.spec.ts` — because two lists drift and
 * the one that gets forgotten is the one that stops covering new apps. It is
 * kept in step with `packages/apps/src/registry.ts` by
 * `scripts/check-e2e-app-list.mjs`, which fails the build when an app is
 * added to the OS and not to this list.
 *
 * Web App is not here: it is the host that runs installed HTML programs and
 * no launcher shows it.
 */
export const BUILT_IN_APPS = [
  'Files',
  'Mail',
  'Browser',
  'Terminal',
  'Text Editor',
  'Notes',
  'Writer',
  'Sheets',
  'Slides',
  'Contacts',
  'Reminders',
  'Preview',
  'Photos',
  'Media Player',
  'Paint',
  'Calculator',
  'Units',
  'Colour',
  'Character Map',
  'Clipboard',
  'Calendar',
  'Clock',
  'Settings',
  'Task Manager',
  'System Information',
  'Storage',
  'Console',
  'Workbench',
  'Archive Utility',
  'Software Center',
  'Minesweeper',
  'Chess',
  'Sudoku',
  '2048',
  'Solitaire',
] as const;

/** What `boundingBox()` returns, once it has stopped changing. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function same(a: Box, b: Box) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * The box of an element that has finished moving.
 *
 * A window opens with a scale animation, so for the first ~200 ms its box is a
 * position it never actually rests at: measured the frame it appears, a window
 * that settles at x=180 reads x=188. A test that takes that as its baseline
 * then asserts a drag landed 8 px short of where it truthfully landed, and
 * fails or passes on how busy the machine was — which is what
 * `windows.spec.ts` did on CI while passing locally.
 *
 * So read until three frames running agree. Anything still animating moves
 * between frames; anything at rest does not.
 */
export async function settledBox(locator: import('@playwright/test').Locator): Promise<Box> {
  const frame = () => locator.page().evaluate(() => new Promise(requestAnimationFrame));
  let agreed = 0;
  let last: Box | null = null;
  for (let i = 0; i < 180; i++) {
    const box = await locator.boundingBox();
    if (box && last && same(box, last)) {
      if (++agreed >= 2) return box;
    } else {
      agreed = 0;
    }
    last = box;
    await frame();
  }
  throw new Error('the box never stopped moving');
}

/**
 * A point on a window's top row that is bare chrome rather than a control.
 *
 * Apps draw their own toolbar on that row, so its midpoint is usually a
 * breadcrumb or a button — and a button has to navigate, not drag. Asking the
 * page which stretch of the row is free beats guessing at a layout that
 * changes with the app.
 */
export async function freeTitleBarSpot(page: Page, box: Box): Promise<{ x: number; y: number }> {
  const y = Math.round(box.y) + 18;
  const x = await page.evaluate(
    ({ left, right, row }) => {
      const free = (at: number) =>
        !document
          .elementFromPoint(at, row)
          ?.closest('button, a, input, select, textarea, [role="button"], [role="textbox"]');
      let start: number | null = null;
      for (let at = left; at <= right; at += 2) {
        if (free(at)) {
          if (start === null) start = at;
          else if (at - start >= 24) return (start + at) / 2;
        } else start = null;
      }
      return null;
    },
    { left: Math.round(box.x) + 2, right: Math.round(box.x + box.width) - 2, row: y },
  );
  if (x === null) throw new Error('the top row is controls end to end, with nowhere to grab it');
  return { x, y };
}
