import { expect, type Page, test } from '@playwright/test';

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
  const key = (await page.getByTestId('recovery-key').textContent())?.trim() ?? '';
  expect(key).toMatch(/^([A-Z0-9]{4}-){5}[A-Z0-9]{4}$/);
  await page.getByLabel('I saved my recovery key').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('desktop')).toBeVisible();
  return key;
}

test.describe('Lumen OS', () => {
  test('boots, runs setup, shows the desktop, locks and unlocks', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('boot-screen')).toBeVisible();
    const key = await setupAndUnlock(page);
    await expect(page.getByTestId('menubar')).toBeVisible();
    await expect(page.getByTestId('taskbar')).toBeVisible();
    await expect(page.getByTestId('os-cursor')).toBeAttached();
    await page.screenshot({ path: 'test-results/desktop.png' });

    // lock from the system menu, unlock with the password
    await page.getByRole('menuitem').first().click();
    await page.getByRole('menuitem', { name: 'Lock Screen' }).click();
    await expect(page.getByTestId('lock-screen')).toBeVisible();
    await expect(page.getByTestId('lock-clock')).toBeVisible();
    await page.screenshot({ path: 'test-results/lock.png' });
    await page.getByLabel('Password').fill('wrong');
    await page.getByLabel('Unlock').click();
    await expect(page.getByText('Wrong password.')).toBeVisible();
    await expect(page.getByText('Hint: the usual')).toBeVisible();
    await page.getByLabel('Password').fill('lumen-test-1');
    await page.getByLabel('Password').press('Enter');
    await expect(page.getByTestId('desktop')).toBeVisible();

    // recovery flow: verify the key, set a new password
    await page.getByRole('menuitem').first().click();
    await page.getByRole('menuitem', { name: 'Lock Screen' }).click();
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByLabel('Recovery key').fill(key.toLowerCase());
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Password', { exact: true }).fill('new-pass-2');
    await page.getByLabel('Confirm').fill('new-pass-2');
    await page.getByRole('button', { name: 'Set password' }).click();
    const newKey = (await page.getByTestId('new-recovery-key').textContent())?.trim() ?? '';
    expect(newKey).not.toBe(key);
    await page.getByLabel('I saved my new recovery key').check();
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByTestId('desktop')).toBeVisible();
  });

  test('state survives a reload: lands on the lock screen with the same user', async ({ page }) => {
    await setupAndUnlock(page);
    await page.reload();
    await expect(page.getByTestId('lock-screen')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
  });

  test('start menu, search and windows work', async ({ page }) => {
    await setupAndUnlock(page);
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('start-menu')).toBeVisible();
    await page.screenshot({ path: 'test-results/start-menu.png' });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('start-menu')).toBeHidden();

    await page.keyboard.press('Control+Space');
    await expect(page.getByTestId('spotlight')).toBeVisible();
    await page.getByRole('textbox', { name: 'Search' }).fill('12*12');
    await expect(page.getByText('144')).toBeVisible();
    await page.keyboard.press('Escape');

    // open the Control Center and Notification Center
    await page.getByTestId('control-center-button').click();
    await expect(page.getByTestId('control-center')).toBeVisible();
    await page.screenshot({ path: 'test-results/control-center.png' });
    await page.keyboard.press('Escape');
  });

  test('fits a small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 640 });
    await setupAndUnlock(page);
    await expect(page.getByTestId('taskbar')).toBeVisible();
    await page.screenshot({ path: 'test-results/small.png' });
  });
});
