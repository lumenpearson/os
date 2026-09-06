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
export type { ScreensaverPreset } from './desktop/screensavers';
export { SCREENSAVERS, screensaverById } from './desktop/screensavers';
export type { Rgb } from './desktop/tint';
export {
  averagePixels,
  CHROME_TINT_MIX,
  chromeTintValue,
  parseHex,
  presetTint,
  quietTint,
  toHex,
  weightedAverage,
} from './desktop/tint';
export type { WallpaperPreset } from './desktop/wallpapers';
export { WALLPAPERS, wallpaperById, wallpaperUrl } from './desktop/wallpapers';
export type { KernelEvents } from './events';
export { EventBus, events } from './events';
export * from './fs/layout';
export { seedApplications, seedHome, seedSystem } from './fs/seed';
export type { KernelOptions } from './kernel';
export { createKernel, getKernel, Kernel } from './kernel';
export { log, useLogStore } from './log/store';
export { findMenuShortcut, menusClaimShortcut } from './menu/shortcuts';
export { useMenuStore } from './menu/store';
export type { PostNotificationInput } from './notifications/store';
export { selectUnreadCount, useNotificationStore } from './notifications/store';
export type { LoadReading, LoadSubject } from './process/load';
export { stepLoad, systemLoad, targetCpu, targetMemory } from './process/load';
export { useProcessStore } from './process/store';
export * from './selection/marquee';
export {
  autostartServices,
  SERVICES,
  serviceById,
  servicesByCategory,
} from './services/catalogue';
export { useServiceStore } from './services/store';
export type {
  ServiceCategory,
  ServiceDefinition,
  ServiceStartup,
  ServiceState,
  ServiceStatus,
} from './services/types';
export { useSessionStore } from './session/store';
export type { LowPowerOverride } from './settings/runtime';
export {
  isOverriddenByLowPower,
  LOW_POWER_OVERRIDES,
  runtimeSettings,
} from './settings/runtime';
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
