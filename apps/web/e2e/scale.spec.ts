import { expect, type Page, test } from '@playwright/test';
import { BUILT_IN_APPS, launch, setupAndUnlock } from './helpers';

/**
 * LU-1302: "Масштаб не ломает вёрстку… проверка на 90 %, 100 %, 130 %."
 *
 * The scale used to reach almost nothing — the type and spacing tokens were
 * px, so the root font-size the theme wrote had nothing relative to it to
 * move, and Settings shipped a Font size slider that changed no pixel anyone
 * could see. Now every token is a rem against that root, which means the
 * whole interface moves and the whole interface can break. That is what this
 * watches: at each of the three scales the requirement names, every app the
 * OS ships opens and nothing spills out of its own box.
 */

const SCALES = [0.9, 1, 1.3] as const;

/**
 * Move the Scale slider, the way a person would. Driving the real control
 * rather than writing the setting means the test also covers the path from
 * the slider to the root font-size, which is where this requirement failed.
 */
async function setScale(page: Page, scale: number) {
  await launch(page, 'Settings');
  await page.getByRole('button', { name: 'Display' }).click();
  const slider = page.getByRole('slider', { name: 'Scale' });
  await expect(slider).toBeVisible();
  await slider.fill(String(scale));
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+w');
  await page.waitForTimeout(150);
}

/** Widest spill of an in-flow child past the right edge of its parent, in px. */
async function worstSpill(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-testid="window"]');
    if (!(frame instanceof HTMLElement)) return { px: 0, where: 'no window' };
    let px = 0;
    let where = '';
    for (const parent of frame.querySelectorAll<HTMLElement>('*')) {
      if (parent.clientWidth === 0) continue;
      const style = getComputedStyle(parent);
      if (style.overflowX !== 'visible') continue;
      // `clientWidth` is the content box, and the rect's left edge is outside
      // the border, so the two only meet once the border is added back. Left
      // out, a child that exactly fills its parent reads as spilling by the
      // width of that border.
      const edge =
        parent.getBoundingClientRect().left +
        Number.parseFloat(style.borderLeftWidth || '0') +
        parent.clientWidth;
      for (const child of parent.children) {
        if (!(child instanceof HTMLElement)) continue;
        const position = getComputedStyle(child).position;
        if (position === 'absolute' || position === 'fixed') continue;
        const spill = Math.round(child.getBoundingClientRect().right - edge);
        if (spill > px) {
          px = spill;
          where = `${child.tagName}.${child.className.slice(0, 40)} out of ${parent.tagName}.${parent.className.slice(0, 40)}`;
        }
      }
    }
    return { px, where };
  });
}

test.describe('the interface at the scales Settings offers', () => {
  test('every app holds together at 90, 100 and 130 per cent', async ({ page }) => {
    test.setTimeout(420_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupAndUnlock(page);

    for (const scale of SCALES) {
      await setScale(page, scale);
      await page.waitForTimeout(200);

      // The root is what every rem in the system is measured against, so if
      // this has not moved nothing else has either and the sweep below is
      // checking the same layout three times.
      const root = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
      expect(root, `the root font-size follows the scale at ${scale}`).toBe(`${16 * scale}px`);

      const spills: string[] = [];
      for (const app of BUILT_IN_APPS) {
        await launch(page, app);
        await page.waitForTimeout(150);
        const spill = await worstSpill(page);
        // A pixel is rounding; anything more is a layout that stopped fitting.
        if (spill.px > 1) spills.push(`${app} at ${scale}: ${spill.px}px — ${spill.where}`);
        await page.keyboard.press('Control+w');
        await page.waitForTimeout(80);
      }
      expect(spills, `nothing spills at ${scale}`).toEqual([]);
    }
  });
});
