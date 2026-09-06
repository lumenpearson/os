/**
 * The score sheet: the moves so far in numbered pairs, the one on screen
 * marked, and every move a button that goes back to the position after it.
 */

import { cx } from '@lumen/ui';
import { useEffect, useRef } from 'react';
import type { MoveRow } from './game';

export interface MoveListProps {
  rows: readonly MoveRow[];
  /** The ply on screen: the length of the game unless someone is looking back. */
  at: number;
  /** The result token, written under the moves as a score sheet ends. */
  result?: string;
  onSelect: (ply: number) => void;
}

export function MoveList({ rows, at, result, onSelect }: MoveListProps) {
  const active = useRef<HTMLButtonElement>(null);

  // Follow the game as it is played, and follow the person as they step back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the move on screen is read through a ref, so `at` is the trigger
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  if (rows.length === 0) {
    return <p className="px-3 py-2 text-sm text-ink-3">No moves yet.</p>;
  }

  return (
    <div className="lumen-scroll min-h-0 flex-1">
      <ol className="py-1">
        {rows.map((row) => (
          <li
            key={row.number}
            className="grid grid-cols-[2.25rem_1fr_1fr] items-center gap-1 px-2 py-px"
          >
            <span className="mono text-right text-xs tabular-nums text-ink-3">{row.number}.</span>
            {[row.white, row.black].map((cell, index) => {
              const side = index === 0 ? 'w' : 'b';
              if (!cell) return <span key={side} />;
              const current = cell.ply === at;
              return (
                <button
                  key={side}
                  ref={current ? active : null}
                  type="button"
                  aria-current={current ? 'true' : undefined}
                  onClick={() => onSelect(cell.ply)}
                  className={cx(
                    'mono rounded-xs px-1.5 py-0.5 text-left text-xs tabular-nums lumen-focus',
                    'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
                    current
                      ? 'bg-selection text-ink'
                      : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  {cell.san}
                </button>
              );
            })}
          </li>
        ))}
      </ol>
      {result && (
        <p className="mono px-2 pb-2 pt-1 text-center text-xs tabular-nums text-ink-3">{result}</p>
      )}
    </div>
  );
}
