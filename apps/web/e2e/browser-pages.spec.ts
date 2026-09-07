import { expect, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * LU-1609. A great many sites refuse to be framed — `X-Frame-Options` and
 * `frame-ancestors` are how a site says "not inside someone else's page" —
 * and Lumen's browser is a frame, so it showed a wall where the page should
 * be. It now asks Lumen to fetch the document and serves it from Lumen's own
 * origin, where the site's frame rule does not apply.
 *
 * End-to-end on purpose: the endpoint, the frame and the fallback only
 * compose in a real browser against a real server, and the defect was exactly
 * a composition.
 */
test('a site that refuses to be framed still opens', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await setupAndUnlock(page);
  await launch(page, 'Browser');
  const win = page.getByTestId('window').first();
  await expect(win).toBeVisible();

  // Typed the way a person types it: select what is there, then replace it.
  const address = win.getByRole('combobox', { name: 'Address and search' });
  const goTo = async (url: string) => {
    await address.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(url);
    await address.press('Enter');
  };
  await goTo('https://www.google.com/');

  const frame = win.locator('iframe');
  await expect(frame).toBeVisible();
  await expect
    .poll(() => frame.getAttribute('src'), { message: 'asked through Lumen' })
    .toContain('/api/page?url=');

  // The wall is gone, and the page says how it got here rather than passing
  // itself off as the site loaded directly.
  await expect(win.getByText('This site refused to be embedded')).toHaveCount(0);
  await expect(win.getByText(/Lumen fetched the page/)).toBeVisible();

  // The page is the site's, not a placeholder: its own text is in the frame.
  await expect(win.frameLocator('iframe').getByText('Google Search').first()).toBeVisible();

  // And browsing carries on from there, to another site that refuses framing.
  await goTo('https://en.wikipedia.org/wiki/Operating_system');
  await expect(address).toHaveValue('en.wikipedia.org/wiki/Operating_system');
  await expect(
    win.frameLocator('iframe').getByRole('heading', { name: 'Operating system' }).first(),
  ).toBeVisible();
});

/**
 * The endpoint answers the browser it belongs to, not the internet. Without
 * the headers a browser sets on its own requests it refuses, which is what
 * keeps a public deployment from being an open proxy for whoever finds it.
 */
test('the page endpoint refuses a request that did not come from Lumen', async ({ request }) => {
  const response = await request.get('/api/page?url=https://example.com/');
  expect(response.status()).toBe(403);
});

test('the page endpoint will not fetch an address inside its own network', async ({ request }) => {
  for (const url of [
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'file:///etc/passwd',
  ]) {
    const response = await request.get(`/api/page?url=${encodeURIComponent(url)}`, {
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(response.status(), url).toBe(400);
  }
});
