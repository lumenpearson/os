import { expect, test } from '@playwright/test';
import { launch, setupAndUnlock } from './helpers';

/**
 * LU-1604. Every item inside a submenu was dead, in every app, since the
 * first commit — and by mouse and by keyboard for two different reasons.
 *
 * A submenu is portalled to the document body, so it is not inside the
 * menubar. The bar closes its menu on a pointer-down outside itself, counted
 * a submenu row as outside, and took the row away before the pointer-up that
 * would have run the command. Separately, ArrowRight bubbled past the menu to
 * the bar, which read it as "next title".
 *
 * These are end-to-end because the defect only exists once the menu and the
 * surface that owns the click-outside are composed; neither alone shows it.
 */
test('a menubar submenu item runs its command', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await setupAndUnlock(page);
  await launch(page, 'Notes');
  await expect(page.getByTestId('window').first()).toBeVisible();

  const sortState = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="menuitemradio"]')].map(
        (el) => `${el.textContent?.trim()}=${el.getAttribute('aria-checked')}`,
      ),
    );

  const openSortBy = async () => {
    await page.getByRole('menuitem', { name: 'View', exact: true }).click();
    await page.getByRole('menuitem', { name: /Sort By/ }).hover();
    await expect(page.getByRole('menuitemradio', { name: 'Title' })).toBeVisible();
  };

  await openSortBy();
  expect(await sortState()).toContain('Title=false');
  await page.getByRole('menuitemradio', { name: 'Title' }).click();

  await openSortBy();
  expect(await sortState(), 'the command ran and the sort moved to Title').toContain('Title=true');
  await page.keyboard.press('Escape');
});

test('a context-menu submenu item runs its command', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await setupAndUnlock(page);
  await launch(page, 'Files');
  const grid = page.getByRole('grid').first();
  await expect(grid).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Sidebar' })
    .getByRole('button', { name: /Documents/ })
    .click();
  await expect(grid).toBeVisible();

  const rows = () => page.locator('[role="row"]').count();
  const before = await rows();
  const box = await grid.boundingBox();
  // Empty space inside the listing, so the menu is the folder's own.
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) - 40,
    (box?.y ?? 0) + (box?.height ?? 0) - 40,
    {
      button: 'right',
    },
  );
  await page.getByRole('menuitem', { name: /New Document/i }).hover();
  await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
  await expect.poll(rows, { message: 'the submenu command made a file' }).toBeGreaterThan(before);
});

/**
 * LU-1605. "Open with…" was dead for the same reason — it is a submenu — and
 * it offered only the app that would have opened the file anyway, which is no
 * offer at all. It now lists the apps that claim the kind, a rule, and every
 * other app that opens files.
 */
test('open with opens the file in the app that was chosen', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await setupAndUnlock(page);
  await launch(page, 'Files');
  await page
    .getByRole('navigation', { name: 'Sidebar' })
    .getByRole('button', { name: /Documents/ })
    .click();
  const row = page.locator('[role="row"]').nth(1);
  await expect(row).toBeVisible();
  await row.click({ button: 'right' });

  await page.getByRole('menuitem', { name: /Open With/ }).hover();
  const offered = await page.evaluate(() => {
    const menus = [...document.querySelectorAll('[role="menu"]')];
    const last = menus[menus.length - 1];
    return [...(last?.querySelectorAll('[role="menuitem"]') ?? [])].map((el) =>
      (el.textContent ?? '').trim(),
    );
  });
  expect(offered.length, 'more than the one app that already owns the kind').toBeGreaterThan(1);
  expect(offered).toContain('Text Editor');

  const before = await page.getByTestId('window').count();
  await page.getByRole('menuitem', { name: 'Text Editor', exact: true }).last().click();
  await expect
    .poll(() => page.getByTestId('window').count(), { message: 'the chosen app opened' })
    .toBe(before + 1);
});
