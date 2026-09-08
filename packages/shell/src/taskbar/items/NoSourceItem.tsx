/**
 * Weather and news, honestly.
 *
 * Lumen has no weather service and no news feed: nothing in this system
 * fetches either, and a forecast or a headline made up to fill the space
 * would be a fabricated number dressed as information. So the piece says what
 * is true — there is no source — and shows nothing else. Neither id is in the
 * default `taskbar.items`; they draw this only if someone adds them.
 */

import { cx } from '@lumen/ui';
import { groupClass, type TaskbarItemProps } from './types';

const LABELS = {
  weather: { long: 'No weather source', short: 'No weather' },
  news: { long: 'No news source', short: 'No news' },
} as const;

export function NoSourceItem({ id, vertical }: TaskbarItemProps & { id: 'weather' | 'news' }) {
  const label = LABELS[id];
  return (
    <div data-taskbar-item={id} className={groupClass(vertical)}>
      <span
        data-testid={`taskbar-${id}`}
        className={cx(
          'mono whitespace-nowrap px-1.5 text-ink-3',
          vertical ? 'text-2xs' : 'text-xs',
        )}
      >
        {vertical ? label.short : label.long}
      </span>
    </div>
  );
}
