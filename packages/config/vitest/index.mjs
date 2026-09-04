import { fileURLToPath } from 'node:url';

/**
 * Shared Vitest configuration for every workspace package.
 * @param {{ dom?: boolean, setupFiles?: string[], include?: string[] }} [options]
 */
export function defineVitestConfig(options = {}) {
  const { dom = true, setupFiles = [], include } = options;
  return {
    test: {
      environment: dom ? 'happy-dom' : 'node',
      globals: false,
      include: include ?? ['src/**/*.test.{ts,tsx}'],
      setupFiles: [fileURLToPath(new URL('./setup.ts', import.meta.url)), ...setupFiles],
      css: false,
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/**/index.ts'],
      },
    },
  };
}
