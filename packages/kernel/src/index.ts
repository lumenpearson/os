export type { InstalledApp } from './apps/registry';
export {
  appsForFile,
  defaultAppForFile,
  getApp,
  listApps,
  parseManifest,
  searchApps,
  useRegistryStore,
} from './apps/registry';
export { useClipboardStore } from './clipboard/store';
export type { WallpaperPreset } from './desktop/wallpapers';
export { WALLPAPERS, wallpaperById, wallpaperUrl } from './desktop/wallpapers';
export type { KernelEvents } from './events';
export { EventBus, events } from './events';
export * from './fs/layout';
export { seedApplications, seedHome, seedSystem } from './fs/seed';
export type { KernelOptions } from './kernel';
export { createKernel, getKernel, Kernel } from './kernel';
export { log, useLogStore } from './log/store';
export { useMenuStore } from './menu/store';
export type { PostNotificationInput } from './notifications/store';
export { selectUnreadCount, useNotificationStore } from './notifications/store';
export { useProcessStore } from './process/store';
export { useSessionStore } from './session/store';
export * from './settings/schema';
export type { SettingsPath } from './settings/store';
export { getSettings, useSettingsStore } from './settings/store';
export * from './shortcuts';
export { applyThemeToDocument, resolveTheme } from './theme/apply';
export * from './types';
export * from './users/crypto';
export {
  AVATAR_PRESETS,
  createUserAccount,
  currentUser,
  resetCredentials,
  slugify,
  useUsersStore,
  verifyPassword,
  verifyRecoveryKey,
} from './users/store';
export * from './window/geometry';
export { selectFocusedWindow, selectOrderedWindows, useWindowStore } from './window/store';
