/**
 * The store's own settings, as data.
 *
 * These live in one place because two screens show them: Settings > Store,
 * which is where a person looks for a system setting, and the Software
 * Center's own Settings section, which is where they look while they are
 * already in the store. Both write the same `store` and `updates` settings —
 * there is one catalogue address, not two — so what is shared here is the
 * vocabulary, and each screen keeps its own chrome.
 */

import type { SelectOption } from '@lumen/ui';

/**
 * Minutes, as strings: a `Select` carries string values, and the number is
 * what the setting holds. Only these four, because a free-text interval is a
 * field a person can put a wrong number in for no gain.
 */
export const SYNC_INTERVALS: ReadonlyArray<SelectOption<string>> = [
  { value: '0', label: 'Only when asked' },
  { value: '60', label: 'Every hour' },
  { value: '360', label: 'Every six hours' },
  { value: '1440', label: 'Every day' },
];

/**
 * A moment as a date, or the sentence given for "there has not been one".
 *
 * The sentence is the caller's, because the same absence reads differently
 * depending on what is missing: a catalogue has not been fetched, a check has
 * not been run.
 */
export function syncedAt(at: number | null, locale: string, never = 'Not yet fetched'): string {
  if (at === null) return never;
  return new Date(at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * How the catalogue in hand got here, in one sentence.
 *
 * The storefront already says this at the top of Discover; the settings
 * section says it again because that is where a person goes when they want to
 * know whether the address they typed is working.
 */
export function describeOrigin(
  origin: 'network' | 'cache' | 'bundled' | null,
  fetchedAt: number | null,
  locale: string,
): string {
  switch (origin) {
    // The date is left as the locale wrote it: lower-casing a sentence that
    // ends in "Sep 7, 2026" turns a month into a word.
    case 'network':
      return `Fetched from the address above on ${syncedAt(fetchedAt, locale, 'an unknown date')}.`;
    case 'cache':
      return `Kept from a previous session, fetched ${syncedAt(fetchedAt, locale, 'at an unknown time')}.`;
    case 'bundled':
      return 'The copy that ships beside Lumen. The address above did not answer.';
    case null:
      return 'Nothing has been fetched yet.';
  }
}
