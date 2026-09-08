#!/usr/bin/env node
/**
 * Renders the Lumen mark to PNG at the sizes the PWA manifest and Tauri need,
 * using the Chromium that Playwright ships. Run from the repo root:
 *   pnpm --filter @lumen/web icons
 */
import { globSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/** Playwright's bundled Chromium, when the browsers live outside the default cache. */
function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base) return undefined;
  return globSync(`${base}/chromium-*/chrome-linux/chrome`)[0];
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const svg = (
  size,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#141517"/>
  <rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" stroke="#ffffff" stroke-opacity="0.16"/>
  <path d="M22 17v30h21" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const targets = [
  { file: 'apps/web/public/icons/icon-192.png', size: 192 },
  { file: 'apps/web/public/icons/icon-512.png', size: 512 },
  { file: 'apps/desktop/public/icons/icon-512.png', size: 512 },
  { file: 'apps/desktop/app-icon.png', size: 1024 },
  { file: 'apps/landing/public/icon-512.png', size: 512 },
];

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage();
for (const { file, size } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`,
  );
  const buffer = await page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  const out = resolve(root, file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buffer);
  console.log(`wrote ${file} (${size}px)`);
}
await browser.close();
