import type { UserConfig } from 'vitest/config';

export interface LumenVitestOptions {
  dom?: boolean;
  setupFiles?: string[];
  include?: string[];
}

export function defineVitestConfig(options?: LumenVitestOptions): UserConfig;
