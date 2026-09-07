import { expect, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * LU-1608. Lumen's chrome is translucent and blurred, and `backdrop-filter`
 * only works if the element's backdrop is the screen behind it. Any ancestor
 * with filter, backdrop-filter, transform, opacity, will-change, contain or
 * isolation becomes a *backdrop root*: a descendant then filters only what is
 * inside that ancestor, which below it is nothing — so the surface comes out
 * translucent with no blur, and whatever is behind it shows through sharp.
 *
 * That is what happened to every menubar menu. The bar is blurred, and its
 * dropdown was rendered as a child of the bar, so the system menu and every
 * app's File/Edit/View were see-through with the desktop legible underneath.
 *
 * The invariant is stated for all of them at once, because the next surface
 * someone nests inside blurred chrome will fail the same way.
 */
function backdropRootAbove(selector: string) {
  const el = document.querySelector(selector);
  if (!el) return { missing: true, selector };
  const style = getComputedStyle(el);
  const spoilers: string[] = [];
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    const why: string[] = [];
    if (s.filter !== 'none') why.push('filter');
    if (s.backdropFilter !== 'none') why.push('backdrop-filter');
    if (s.transform !== 'none') why.push('transform');
    if (s.opacity !== '1') why.push(`opacity ${s.opacity}`);
    if (s.willChange !== 'auto') why.push(`will-change ${s.willChange}`);
    if (s.contain !== 'none') why.push(`contain ${s.contain}`);
    if (s.isolation !== 'auto') why.push('isolation');
    if (why.length > 0) {
      spoilers.push(`${p.dataset.testid ?? p.tagName.toLowerCase()}: ${why.join(', ')}`);
    }
  }
  return {
    selector,
    blurs: style.backdropFilter !== 'none',
    translucent: !/^rgba?\([^)]*(,\s*1)?\)$/.test(style.backgroundColor)
      ? true
      : !style.backgroundColor.includes('/ 1'),
    spoilers,
  };
}

test('no blurred surface is trapped inside another one', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await setupAndUnlock(page);
  expect(
    await page.evaluate(() => document.documentElement.dataset.transparency),
    'the check is meaningless with transparency off',
  ).toBe('full');

  const clean = async (selector: string) => {
    const seen = await page.evaluate(backdropRootAbove, selector);
    expect(seen, `${selector} is on screen`).not.toHaveProperty('missing');
    return seen as { blurs: boolean; spoilers: string[] };
  };

  // The bars themselves.
  for (const bar of ['[data-testid="menubar"]', '[data-testid="taskbar"]']) {
    const seen = await clean(bar);
    expect(seen.blurs, bar).toBe(true);
    expect(seen.spoilers, bar).toEqual([]);
  }

  // The menubar's own dropdown — the one that was broken. It is blurred
  // chrome opened from inside blurred chrome, which is the whole trap.
  await page.locator('[data-menu-id="system"]').click();
  const systemMenu = await clean('[role="menu"]');
  expect(systemMenu.blurs).toBe(true);
  expect(systemMenu.spoilers, 'the menu escaped the bar it was opened from').toEqual([]);
  await page.keyboard.press('Escape');

  // An app's menu, opened from the same bar.
  await launch(page, 'Calendar');
  await expect(page.getByTestId('window').first()).toBeVisible();
  await page.getByRole('menuitem', { name: 'View', exact: true }).click();
  const appMenu = await clean('[role="menu"]');
  expect(appMenu.blurs).toBe(true);
  expect(appMenu.spoilers, "an app's menu escaped the bar too").toEqual([]);
  await page.keyboard.press('Escape');

  // The shell's panels, which are siblings of the bars rather than children.
  await page.getByTestId('start-button').click();
  const start = await clean('[data-testid="start-menu"]');
  expect(start.blurs).toBe(true);
  expect(start.spoilers).toEqual([]);
});

/**
 * And the same thing measured in pixels rather than in styles, because a
 * computed `backdrop-filter` that never samples anything still reads as
 * `blur(14px)`. Text behind the menu should be smeared, not legible.
 */
test('the backdrop behind a menubar menu is actually blurred', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await setupAndUnlock(page);
  await launch(page, 'Text Editor');
  const area = page.getByRole('textbox', { name: 'Document text' });
  await expect(area).toBeVisible();
  await area.click();
  // Fine, high-contrast detail: the hardest thing for a blur to hide.
  await page.keyboard.type('IIIIIIIIIIIIII WWWWWWWWWWWWWW IIIIIIIIIIIIII\n'.repeat(40));
  await page.getByTestId('window-controls').getByRole('button', { name: 'Zoom' }).click();
  await page.waitForTimeout(600);

  await page.locator('[data-menu-id="system"]').click();
  await page.waitForTimeout(400);
  const box = await page.locator('[role="menu"]').boundingBox();
  expect(box).not.toBeNull();
  // The gutter left of the labels: only the backdrop shows through it.
  const shot = await page.screenshot({
    clip: { x: (box?.x ?? 0) + 4, y: (box?.y ?? 0) + 4, width: 22, height: 240 },
  });

  const edge = await page.evaluate(
    async (bytes) => {
      const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return 999;
      ctx.drawImage(bmp, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
      let sum = 0;
      let n = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 1; x < width; x++) {
          const i = (y * width + x) * 4;
          const at = (k: number) => data[k] ?? 0;
          sum += Math.abs(at(i) - at(i - 4)) + Math.abs(at(i + 1) - at(i - 3));
          n++;
        }
      }
      return sum / n;
    },
    [...shot],
  );

  // Measured: 3.15 with the menu trapped inside the bar, 1.69 once it was
  // portalled out. Halfway between the two, so it fails either way round.
  expect(edge, 'glyph edges survive behind the menu').toBeLessThan(2.4);
});
