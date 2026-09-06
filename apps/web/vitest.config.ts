import { defineVitestConfig } from '@lumen/config-vitest';
import { defineConfig } from 'vitest/config';

const base = defineVitestConfig({ dom: true });

/**
 * Without this file Vitest ran on its own defaults, which glob every
 * `*.spec.ts` in the package — including `e2e/os.spec.ts`. That file is a
 * Playwright suite: loaded by Vitest it throws on the first `test.describe`.
 * The shared config keeps collection inside `src/`, so the two runners stop
 * fighting over the same glob; Playwright owns `e2e/` and has its own CI job.
 *
 * `passWithNoTests` is deliberate rather than a placeholder test: `src/` here
 * is a thirteen-line entry point, and the logic it mounts is tested in the
 * kernel, shell and apps packages that own it.
 */
export default defineConfig({
  ...base,
  test: { ...base.test, passWithNoTests: true },
});
