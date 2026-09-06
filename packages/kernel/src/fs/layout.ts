import { join } from '@lumen/vfs';

/** Well-known locations. Everything the kernel writes lives under /System. */
export const SYSTEM_DIR = '/System';
export const SETTINGS_FILE = '/System/settings.json';
export const USERS_FILE = '/System/users.json';
export const STATE_FILE = '/System/state.json';
export const RECENTS_FILE = '/System/recents.json';
export const APPLICATIONS_DIR = '/Applications';
export const USERS_DIR = '/Users';
export const TRASH_DIR = '/Trash';
export const WALLPAPERS_DIR = '/System/Wallpapers';

/**
 * The files the kernel itself rewrites while the OS runs. /System is a
 * protected path, so each of these writes carries the kernel's own authority
 * (`elevate` in `kernel.ts`); nothing else can write, delete or rename them.
 * `layout.test.ts` keeps the layout and the VFS policy describing one disk.
 */
export const SYSTEM_STATE_FILES = [SETTINGS_FILE, USERS_FILE, STATE_FILE] as const;

export const HOME_SUBDIRS = [
  'Desktop',
  'Documents',
  'Downloads',
  'Pictures',
  'Music',
  'Videos',
  'Projects',
] as const;

export function homeDir(username: string): string {
  return join(USERS_DIR, username);
}

export function desktopDir(username: string): string {
  return join(homeDir(username), 'Desktop');
}

export function documentsDir(username: string): string {
  return join(homeDir(username), 'Documents');
}

/** Persisted shell state (window layout, desktop icon positions, recents…). */
export interface PersistedState {
  version: number;
  desktopIcons: Record<string, { x: number; y: number }>;
  /** Last known window bounds by app id, so apps reopen where they were. */
  windowBounds: Record<string, { x: number; y: number; width: number; height: number }>;
  recents: Array<{ path: string; openedAt: number; appId: string }>;
  /** Files pinned in the Files sidebar. */
  favorites: string[];
  lastLoginAt: number | null;
  /** Total OS uptime across sessions, for About. */
  totalUptimeMs: number;
}

export function defaultState(): PersistedState {
  return {
    version: 1,
    desktopIcons: {},
    windowBounds: {},
    recents: [],
    favorites: [],
    lastLoginAt: null,
    totalUptimeMs: 0,
  };
}
