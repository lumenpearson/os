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
