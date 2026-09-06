/**
 * The pseudo-programs that ship with the OS.
 *
 * Each one is a complete `.app` manifest — the same JSON a person would write
 * by hand — so installing one from the store window and installing a file take
 * exactly the same path through the kernel. `storefront.ts` folds them into
 * the shelves the fetched catalogue draws, which is what gives the window
 * something to show with no network at all. They are small HTML programs that
 * run in `lumen.webapp`'s sandboxed frame.
 */

import type { AppManifest } from '@lumen/kernel';
import { COLOUR } from './programs/colour';
import { CONVERTER } from './programs/converter';
import { JSON_FORMATTER } from './programs/json';
import { MARKDOWN } from './programs/markdown';
import { POMODORO } from './programs/pomodoro';

export const CATALOGUE: readonly AppManifest[] = [
  CONVERTER,
  COLOUR,
  MARKDOWN,
  JSON_FORMATTER,
  POMODORO,
];
