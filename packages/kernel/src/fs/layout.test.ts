import { isProtectedPath, requiresElevation, SYSTEM_PROTECTION } from '@lumen/vfs';
import { describe, expect, it } from 'vitest';
import {
  APPLICATIONS_DIR,
  desktopDir,
  homeDir,
  SETTINGS_FILE,
  SYSTEM_DIR,
  SYSTEM_STATE_FILES,
  USERS_DIR,
  WALLPAPERS_DIR,
} from './layout';

/**
 * The VFS holds the protected-path rule and the kernel holds the layout. They
 * are separate packages and neither can import the other's constant, so these
 * tests are what keeps them describing the same disk: move a system file and
 * one of them fails rather than a protection quietly stopping applying.
 */
describe('the layout the protection rule is written against', () => {
  it('has the kernel writing its state under a protected /System', () => {
    expect(isProtectedPath(SYSTEM_DIR)).toBe(true);
    expect(isProtectedPath(WALLPAPERS_DIR)).toBe(true);
    expect(isProtectedPath(APPLICATIONS_DIR)).toBe(true);
    for (const file of SYSTEM_STATE_FILES) expect(isProtectedPath(file)).toBe(true);
  });

  it('exempts nothing from the write rule: the kernel elevates its own saves', () => {
    expect(SYSTEM_PROTECTION.writable).toEqual([]);
    for (const file of SYSTEM_STATE_FILES) {
      expect(requiresElevation('write', file)).toBe(true);
      expect(requiresElevation('remove', file)).toBe(true);
    }
    expect(requiresElevation('write', `${SYSTEM_DIR}/anything-else.json`)).toBe(true);
  });

  it('leaves the files people own alone', () => {
    expect(isProtectedPath(USERS_DIR)).toBe(false);
    expect(isProtectedPath(homeDir('ada'))).toBe(false);
    expect(isProtectedPath(desktopDir('ada'))).toBe(false);
    expect(isProtectedPath(`${APPLICATIONS_DIR}/Quick Notes.app`)).toBe(false);
    expect(requiresElevation('remove', `${homeDir('ada')}/Documents/notes.txt`)).toBe(false);
  });

  it('names the settings file where the kernel expects it', () => {
    expect(SETTINGS_FILE).toBe(`${SYSTEM_DIR}/settings.json`);
  });
});
