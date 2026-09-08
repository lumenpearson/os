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

  /*
   * The page is the site's, not a placeholder: its own search box is in the
   * frame. Matched by the field's name rather than by anything written on it,
   * because Google answers in the language of wherever the request came from
   * and the words on this page are not the same twice.
   */
  await expect(win.frameLocator('iframe').locator('input[name="q"]').first()).toBeVisible();

  // And browsing carries on from there, to another site that refuses framing.
  await goTo('https://en.wikipedia.org/wiki/Operating_system');
  await expect(address).toHaveValue('en.wikipedia.org/wiki/Operating_system');
  await expect(
    win.frameLocator('iframe').getByRole('heading', { name: 'Operating system' }).first(),
  ).toBeVisible();
});

/**
 * LU-1609, the second half. The document is served from Lumen's origin with a
 * `<base>` pointing at the site, so that the page's own images and
 * stylesheets load — and that sent the page's links to the site as well. A
 * link followed from a fetched page went straight to `google.com`, into a
 * frame google refuses, and the page went blank on the first click.
 */
test('a link followed inside a fetched page stays inside Lumen', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await setupAndUnlock(page);
  await launch(page, 'Browser');
  const win = page.getByTestId('window').first();
  const address = win.getByRole('combobox', { name: 'Address and search' });

  await address.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('https://www.google.com/');
  await address.press('Enter');

  const frame = win.locator('iframe');
  await expect
    .poll(() => frame.getAttribute('src'), { message: 'asked through Lumen' })
    .toContain('/api/page?url=');

  // Matched by where the link goes rather than by what it says, because the
  // words on this page depend on where the request came from.
  await win.frameLocator('iframe').locator('a[href*="advanced_search"]').first().click();

  // The link was followed, and it was followed through Lumen: handed to the
  // site, it would have landed in a frame google refuses.
  await expect
    .poll(() => frame.getAttribute('src'), { message: 'the link went through Lumen' })
    .toContain('advanced_search');
  // And the browser knows where its page went, so the address bar is right.
  await expect(address).toHaveValue(/google\.com\/advanced_search/);
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
