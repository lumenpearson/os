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
