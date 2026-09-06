import { cx, useElementSize } from '@lumen/ui';
import { useEffect, useMemo } from 'react';
import { runDiff } from './derive';
import { paneLayoutFor } from './layout';
import { CopyButton, Editor, Note, Pane, Split } from './panes';
import type { DiffState } from './storage';
import type { DiffRow } from './textdiff';

const MARKER: Record<DiffRow['op'], string> = {
  equal: ' ',
  added: '+',
  removed: '−',
  changed: '~',
};

/**
 * Added lines carry the one accent, removed lines a neutral surface, and every
 * row carries a marker — so the diff still reads when the tints do not.
 */
function tone(op: DiffRow['op'], side: 'left' | 'right'): string {
  if (op === 'equal') return '';
  if (side === 'right') return 'bg-accent-soft';
  return 'bg-surface-2';
}

function Gutter({ number }: { number: number | null }) {
  return (
    <span className="mono w-8 shrink-0 select-none pr-2 text-right tabular-nums text-2xs text-ink-3">
      {number ?? ''}
    </span>
  );
}

function Cell({
  text,
  number,
  op,
  side,
}: {
  text: string | null;
  number: number | null;
  op: DiffRow['op'];
  side: 'left' | 'right';
}) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-1 items-start border-r border-rule last:border-r-0',
        text === null ? 'bg-canvas' : tone(op, side),
      )}
    >
      <Gutter number={number} />
      <span className="mono min-w-0 flex-1 whitespace-pre-wrap break-all py-px pr-2 text-xs text-ink">
        {text ?? ''}
      </span>
    </div>
  );
}

function Rows({ rows, columns }: { rows: DiffRow[]; columns: boolean }) {
  if (columns)
    return (
      <>
        {rows.map((row, i) => (
          <div key={i} className="flex min-w-0 border-b border-rule last:border-b-0">
            <Cell text={row.left} number={row.leftNumber} op={row.op} side="left" />
            <Cell text={row.right} number={row.rightNumber} op={row.op} side="right" />
          </div>
        ))}
      </>
    );

  return (
    <>
      {rows.flatMap((row, i) => {
        const parts: Array<{ op: DiffRow['op']; text: string; number: number | null }> = [];
        if (row.op === 'equal')
          parts.push({ op: 'equal', text: row.left ?? '', number: row.leftNumber });
        else {
          if (row.left !== null)
            parts.push({ op: 'removed', text: row.left, number: row.leftNumber });
          if (row.right !== null)
            parts.push({ op: 'added', text: row.right, number: row.rightNumber });
        }
        return parts.map((part, n) => (
          <div
            key={`${i}-${n}`}
            className={cx(
              'flex min-w-0 items-start',
              part.op === 'added' && 'bg-accent-soft',
              part.op === 'removed' && 'bg-surface-2',
            )}
          >
            <span className="mono w-4 shrink-0 select-none text-center text-2xs text-ink-3">
              {MARKER[part.op]}
            </span>
            <Gutter number={part.number} />
            <span className="mono min-w-0 flex-1 whitespace-pre-wrap break-all py-px pr-2 text-xs text-ink">
              {part.text}
            </span>
          </div>
        ));
      })}
    </>
  );
}

export interface DiffPanelProps {
  state: DiffState;
  onChange: (next: DiffState) => void;
  onOutput: (text: string) => void;
}

export function DiffPanel({ state, onChange, onOutput }: DiffPanelProps) {
  const [bodyRef, { width }] = useElementSize<HTMLDivElement>();
  const { split, columns } = paneLayoutFor(width);
  const set = (change: Partial<DiffState>) => onChange({ ...state, ...change });

  const result = useMemo(() => runDiff(state), [state]);
  useEffect(() => onOutput(result.output), [result.output, onOutput]);

  return (
    <Pane bodyRef={bodyRef}>
      <Split split={split}>
        <Editor
          label="Original"
          value={state.left}
          onChange={(left) => set({ left })}
          placeholder="The first text"
        />
        <Editor
          label="Changed"
          value={state.right}
          onChange={(right) => set({ right })}
          placeholder="The second text"
        />
      </Split>

      <section className="flex min-h-32 min-w-0 flex-1 flex-col gap-1.5">
        <header className="flex h-6 shrink-0 items-center gap-2">
          <span className="shrink-0 text-sm text-ink-2">Difference</span>
          {result.note && (
            <span className="mono tabular-nums text-xs text-ink-3">{result.note}</span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <CopyButton text={result.output} label="Copy output" />
          </div>
        </header>
        <div className="lumen-scroll min-h-16 flex-1 rounded-sm border border-rule bg-canvas">
          {result.rows.length === 0 ? (
            <p className="p-2 text-sm text-ink-3">Nothing to compare yet.</p>
          ) : (
            <Rows rows={result.rows} columns={columns} />
          )}
        </div>
        {result.capped && (
          <Note>Too large to align exactly: the middle is shown as one replacement.</Note>
        )}
      </section>
    </Pane>
  );
}
