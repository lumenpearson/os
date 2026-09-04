import { detectPlatformKind } from './detect';
import type { Platform } from './types';
import { createWebPlatform } from './web';

export { detectPlatformKind, isTauri } from './detect';
export type {
  DiskInfo,
  HostConfig,
  HostProcess,
  Platform,
  PlatformCapabilities,
  PlatformKind,
  PlatformWindow,
  SystemInfo,
  SystemMetrics,
} from './types';
export { createWebPlatform, KERNEL_VERSION } from './web';

/** Pick the right host bridge for the current runtime. */
export async function createPlatform(appVersion?: string): Promise<Platform> {
  if (detectPlatformKind() === 'tauri') {
    const { createTauriPlatform } = await import('./tauri');
    return createTauriPlatform(appVersion);
  }
  return createWebPlatform(appVersion);
}
