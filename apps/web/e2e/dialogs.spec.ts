import { expect, type Page, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/** `rgb()`, `rgba()` and `oklab()` as they come back from getComputedStyle. */
function parse(colour: string): { r: number; g: number; b: number; a: number } | null {
  const rgb = colour.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
  if (rgb)
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  // Chromium serialises `color-mix` results in oklab. Lightness 0 or 1 with no
  // chroma is black or white; that plus the alpha is all this test needs.
  const oklab = colour.match(
    /^oklab\(([\d.]+)\s+(-?[\d.e-]+)\s+(-?[\d.e-]+)(?:\s*\/\s*([\d.]+))?\)$/,
  );
  if (oklab) {
    const l = Number(oklab[1]);
    const chroma = Math.hypot(Number(oklab[2]), Number(oklab[3]));
    if (chroma > 0.01) return null; // a real colour, not a neutral — skip it
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v, a: oklab[4] === undefined ? 1 : Number(oklab[4]) };
  }
  return null;
}

interface Hairline {
  what: string;
  where: string;
  colour: string;
}

/** Every border and every 1px surface inside the modal sheets now on screen. */
async function hairlines(page: Page): Promise<Hairline[]> {
  return page.evaluate(() => {
    const out: { what: string; where: string; colour: string }[] = [];
    for (const scrim of document.querySelectorAll('.lumen-scrim')) {
      for (const el of scrim.querySelectorAll('*')) {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const where = `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`;
        for (const side of ['top', 'right', 'bottom', 'left']) {
          if (Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) === 0) continue;
          out.push({
            what: `border-${side}`,
            where,
            colour: style.getPropertyValue(`border-${side}-color`),
          });
        }
        if (box.height <= 2 || box.width <= 2)
          out.push({ what: 'surface', where, colour: style.backgroundColor });
      }
    }
    return out;
  });
}

/**
 * A separator has to read as a rule, not as a stripe of paint: neutral, and
 * faint enough that the surface shows through. The one exception is the
 * accent, which a focused control puts on its own border.
 */
function offending(list: Hairline[], accent: { r: number; g: number; b: number }) {
  return list.filter(({ colour }) => {
    const c = parse(colour);
    if (!c || c.a === 0) return false;
    const isAccent =
      Math.abs(c.r - accent.r) + Math.abs(c.g - accent.g) + Math.abs(c.b - accent.b) < 24;
    if (isAccent) return false;
    // Neutral: the three channels agree, so it is a grey and not a tint.
    const neutral = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) <= 2;
    return !neutral || c.a >= 0.5;
  });
}

async function accentRgb(page: Page) {
  const raw = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--lumen-accent)';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  const c = parse(raw);
  if (!c) throw new Error(`the accent did not parse: ${raw}`);
  return c;
}

for (const theme of ['light', 'dark'] as const) {
  test(`every rule in a dialog is a translucent grey — ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await setupAndUnlock(page);
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
    }, theme);
    const accent = await accentRgb(page);

    // The open dialog is the largest sheet in the OS: a sidebar, a toolbar,
    // a table with lanes and a footer, so it carries every kind of rule.
    await launch(page, 'Text Editor');
    await expect(page.getByRole('textbox', { name: 'Document text' })).toBeVisible();
    await page.keyboard.press('Control+o');
    const sheet = page.locator('.lumen-scrim [role="dialog"]');
    await expect(sheet).toBeVisible();

    const rules = await hairlines(page);
    expect(rules.length, 'the sheet has rules to check').toBeGreaterThan(4);
    const bad = offending(rules, accent);
    expect(
      bad.map((b) => `${b.what} ${b.colour} on ${b.where}`),
      'no rule inside a dialog is opaque or tinted',
    ).toEqual([]);
  });
}
