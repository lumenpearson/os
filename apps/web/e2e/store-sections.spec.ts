import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * LU-1607. The store's sidebar names eleven places and every one of them has
 * to lead somewhere: a sidebar entry that draws nothing is a worse store than
 * a short sidebar. This walks the three that were added last and checks each
 * one is a working screen rather than a heading.
 *
 * The catalogue is served from the repository's own `store/` build, routed in
 * place of the configured origin, so the numbers on screen are the numbers in
 * that catalogue and the test does not depend on a network.
 */
const CATALOGUE = path.resolve('dist/store');

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://raw.githubusercontent.com/lumenpearson/os-appstore/main/**',
    async (route) => {
      const rel = new URL(route.request().url()).pathname.replace(
        '/lumenpearson/os-appstore/main/',
        '',
      );
      try {
        await route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          body: await readFile(path.join(CATALOGUE, rel)),
        });
      } catch {
        await route.fulfill({ status: 404, body: 'not found' });
      }
    },
  );
});

async function openStore(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await setupAndUnlock(page);
  await launch(page, 'Software Center');
  const win = page.getByTestId('window').first();
  await expect(win).toBeVisible();
  // The catalogue has to be in hand before a section can count anything.
  await expect(win.getByText(/in the catalogue/)).toBeVisible();
  return win;
}

test('Offers counts the plan against the catalogue that is actually loaded', async ({ page }) => {
  const win = await openStore(page);
  await win.getByRole('button', { name: 'Offers', exact: true }).click();

  const heading = win.getByRole('heading', { name: /packages$/ });
  await expect(heading).toBeVisible();
  const [covered, total] = (await heading.innerText()).match(/(\d+) of (\d+)/)?.slice(1) ?? [];
  expect(Number(covered), 'the plan covers something, or the section says nothing').toBeGreaterThan(
    0,
  );
  expect(Number(total)).toBeGreaterThan(Number(covered));

  // Every package on the shelf is one the plan is what pays for.
  const shelf = win.getByRole('region', { name: 'What the plan unlocks' });
  await expect(shelf).toBeVisible();
  const prices = await shelf.getByRole('button').allInnerTexts();
  expect(prices.length).toBe(Number(covered));
  for (const tile of prices) expect(tile).toContain('Subscription');

  // And it leads to where a plan is actually taken.
  await win.getByRole('button', { name: 'See the plans' }).click();
  await expect(win.getByRole('region', { name: 'Yearly' })).toBeVisible();
});

test('Updates answers from the catalogue rather than from a timer', async ({ page }) => {
  const win = await openStore(page);
  await win.getByRole('button', { name: 'Updates', exact: true }).click();
  // Nothing is installed in a fresh session, so nothing can be out of date —
  // and the screen says that, rather than saying nothing.
  await expect(win.getByText('No updates available')).toBeVisible();
  await expect(win.getByText('Everything is up to date')).toBeVisible();
  await expect(win.getByRole('button', { name: /Check for Updates/ })).toBeEnabled();
});

test('Store Settings changes the setting it shows', async ({ page }) => {
  const win = await openStore(page);
  await win.getByRole('button', { name: 'Store Settings', exact: true }).click();

  await expect(win.getByLabel('Store address')).toHaveValue(
    'https://raw.githubusercontent.com/lumenpearson/os-appstore/main/',
  );
  await expect(win.getByText(/Fetched from the address above on/)).toBeVisible();

  // The interval follows the switch: with fetching off there is nothing to schedule.
  const often = win.getByLabel('How often to fetch the catalogue');
  await expect(often).toBeEnabled();
  await win.getByLabel('Fetch the catalogue on its own').click();
  await expect(often).toBeDisabled();
});
