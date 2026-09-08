import { IconButton, Label } from '@lumen/ui';
import { Trash2 } from 'lucide-react';
import type { TapeEntry } from './storage';

export interface TapeProps {
  entries: readonly TapeEntry[];
  /** Put a past result back on the line. */
  onUse: (entry: TapeEntry) => void;
  onClear: () => void;
}

/** Every completed calculation, newest first. A line puts its result back to work. */
export function Tape({ entries, onUse, onClear }: TapeProps) {
  return (
    <section
      aria-label="Tape"
      className="flex min-h-0 shrink basis-36 flex-col border-b border-rule bg-canvas"
    >
      <header className="flex h-6 shrink-0 items-center justify-between gap-2 px-2">
        <Label>Tape</Label>
        <IconButton label="Clear tape" size="sm" disabled={entries.length === 0} onClick={onClear}>
          <Trash2 />
        </IconButton>
      </header>
      {entries.length === 0 ? (
        <p className="px-2 pb-2 text-sm text-ink-3">Completed calculations are listed here.</p>
      ) : (
        <ul className="lumen-scroll min-h-0 flex-1 px-1 pb-1">
          {entries.map((entry) => (
            <li key={`${entry.at}-${entry.expression}`}>
              <button
                type="button"
                onClick={() => onUse(entry)}
                title={`Use ${entry.result}`}
                className="flex w-full items-baseline justify-between gap-3 rounded-xs px-1.5 py-0.5 text-left hover:bg-surface-2 lumen-focus"
              >
                <span className="mono truncate-1 text-xs text-ink-3">{entry.expression}</span>
                <span className="mono shrink-0 text-base tabular-nums text-ink">
                  {entry.result}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
