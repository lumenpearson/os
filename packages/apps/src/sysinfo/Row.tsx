import { cx } from '@lumen/ui';
import { NO_VALUE } from './probe';
import type { FactRow } from './sections';

/**
 * One reading: the label in the UI face, the value monospaced and tabular so
 * a figure that ticks does not shift the column.
 *
 * A row this platform cannot fill in prints an em-dash and the one line
 * saying why. That is not an error state to hide — it is most of what this
 * window has to tell you, and it reads exactly like the rows that did answer.
 */
export function Row({ row }: { row: FactRow }) {
  const { fact, note } = row;
  const detail = fact.available ? note : fact.reason;
  return (
    <div
      data-row={row.id}
      data-available={fact.available}
      className="flex flex-wrap items-baseline gap-x-4 px-4 py-2"
    >
      <dt className="w-44 shrink-0 text-base text-ink-2">{row.label}</dt>
      <dd className="flex min-w-40 flex-1 flex-col gap-0.5">
        <span
          className={cx(
            'mono text-base tabular-nums break-words select-text',
            fact.available ? 'text-ink' : 'text-ink-3',
          )}
        >
          {fact.available ? fact.value : NO_VALUE}
        </span>
        {detail && <span className="text-sm text-ink-3">{detail}</span>}
      </dd>
    </div>
  );
}
