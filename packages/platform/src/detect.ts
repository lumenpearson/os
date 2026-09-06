import type { PlatformKind } from './types';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  }
}

export function detectPlatformKind(): PlatformKind {
  if (typeof window !== 'undefined' && (window.__TAURI_INTERNALS__ || window.__TAURI__))
    return 'tauri';
  return 'web';
}

export function isTauri(): boolean {
  return detectPlatformKind() === 'tauri';
}
