/** The moves so far, in pairs, with the one being looked at marked. */

import { cx } from '@lumen/ui';
import { useEffect, useRef } from 'react';
import type { MoveRow } from './game';

export interface MoveListProps {
  rows: readonly MoveRow[];
  /** The ply on screen: the length of the game unless someone is looking back. */
  at: number;
  onSelect: (ply: number) => void;
}

export function MoveList({ rows, at, onSelect }: MoveListProps) {
  const active = useRef<HTMLButtonElement>(null);

  // Follow the game as it is played, and follow the person as they step back.
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  if (rows.length === 0) {
    return <p className="px-3 py-2 text-sm text-ink-3">No moves yet.</p>;
  }

  return (
    <ol className="lumen-scroll min-h-0 flex-1 py-1">
      {rows.map((row) => (
        <li key={row.number} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-1 px-2">
          <span className="mono text-right text-xs tabular-nums text-ink-3">{row.number}.</span>
          {[row.white, row.black].map((cell, index) => {
            if (!cell) return <span key={index === 0 ? 'w' : 'b'} />;
            const current = cell.ply === at;
            return (
              <button
                key={index === 0 ? 'w' : 'b'}
                ref={current ? active : null}
                type="button"
                aria-current={current ? 'true' : undefined}
                onClick={() => onSelect(cell.ply)}
                className={cx(
                  'mono rounded-xs px-1.5 py-0.5 text-left text-xs lumen-focus',
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
  );
}
