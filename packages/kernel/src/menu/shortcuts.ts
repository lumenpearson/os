/**
 * Finding the menu item a key chord belongs to.
 *
 * This lives in the kernel rather than in the app SDK because two callers need
 * the same answer: the SDK, to run the item when its window is focused, and
 * the shell, to know that the focused app has claimed a chord the system also
 * binds. Two copies of this walk would drift, and the shell would start
 * swallowing keys the app believed it owned.
 */
import type { ModifierPreference } from '../shortcuts';
import { type KeyLike, matchesShortcut } from '../shortcuts';
import type { MenuItemTemplate, MenuTemplate } from '../types';

/**
 * The first enabled item whose shortcut matches, depth-first through
 * submenus. A disabled item does not claim its chord — the command is off, so
 * whatever else binds the key should get it.
 */
export function findMenuShortcut(
  menus: MenuTemplate[],
  event: KeyLike,
  modifier: ModifierPreference = 'auto',
): MenuItemTemplate | null {
  const walk = (items: MenuItemTemplate[]): MenuItemTemplate | null => {
    for (const item of items) {
      if (
        item.shortcut &&
        item.enabled !== false &&
        matchesShortcut(event, item.shortcut, modifier)
      )
        return item;
      if (item.submenu) {
        const found = walk(item.submenu);
        if (found) return found;
      }
    }
    return null;
  };
  for (const menu of menus) {
    const found = walk(menu.items);
    if (found) return found;
  }
  return null;
}

/** Whether the focused window's menus bind this chord to a live command. */
export function menusClaimShortcut(
  menus: MenuTemplate[] | undefined,
  event: KeyLike,
  modifier: ModifierPreference = 'auto',
): boolean {
  return menus !== undefined && findMenuShortcut(menus, event, modifier) !== null;
}
