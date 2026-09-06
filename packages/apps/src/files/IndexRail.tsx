import { cx } from '@lumen/ui';
import type { DirEntry } from '@lumen/vfs';
import { useMemo } from 'react';
import { firstWithLetter, indexLetter, railLetters } from './logic';

export interface IndexRailProps {
  entries: readonly DirEntry[];
  /** The path the cursor is on, so the rail can mark the letter you are in. */
  cursor: string | null;
  /** Selects the first item under a letter; the view scrolls to it. */
  onJump: (path: string) => void;
}

/**
 * A column of the initials present in this folder. Clicking one selects the
 * first item under it; the file view scrolls the selection into view.
 */
export function IndexRail({ entries, cursor, onJump }: IndexRailProps) {
  const letters = useMemo(() => railLetters(entries), [entries]);
  const here = useMemo(() => {
    const entry = cursor === null ? undefined : entries.find((e) => e.path === cursor);
    return entry ? indexLetter(entry.name) : null;
  }, [entries, cursor]);

  if (letters.length === 0) return null;
  return (
    <nav
      aria-label="Jump to letter"
      className="flex w-6 shrink-0 flex-col items-center justify-center gap-px border-l border-rule py-2"
    >
      {letters.map((letter) => (
        <button
          key={letter}
          type="button"
          title={`Jump to ${letter}`}
          onClick={() => {
            const target = firstWithLetter(entries, letter);
            if (target) onJump(target);
          }}
          className={cx(
            'mono flex h-4 w-4 items-center justify-center rounded-xs text-2xs lumen-focus',
            'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
            letter === here ? 'bg-selection text-ink' : 'text-ink-3 hover:text-ink',
          )}
        >
          {letter}
        </button>
      ))}
    </nav>
  );
}
