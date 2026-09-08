import { Button, Input, SegmentedControl } from '@lumen/ui';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { formatIso, UTC } from './epoch';
import { decodeTime, generateIds, ID_KIND_LABEL, ID_KINDS, type IdKind } from './ids';
import { CopyButton, Note, Option, Pane } from './panes';
import { type IdsState, MAX_IDS } from './storage';

const KIND_OPTIONS = ID_KINDS.map((kind) => ({ value: kind, label: ID_KIND_LABEL[kind] }));

export interface IdsPanelProps {
  state: IdsState;
  onChange: (next: IdsState) => void;
  onOutput: (text: string) => void;
}

export function IdsPanel({ state, onChange, onOutput }: IdsPanelProps) {
  const countId = useId();
  const set = (change: Partial<IdsState>) => onChange({ ...state, ...change });

  const [ids, setIds] = useState<string[]>([]);
  const generate = useCallback((kind: IdKind, count: number) => {
    setIds(generateIds({ kind, count, now: Date.now }));
  }, []);

  // A new batch whenever the kind or the count changes; the button asks for
  // another batch of the same shape.
  useEffect(() => {
    generate(state.kind, state.count);
  }, [state.kind, state.count, generate]);

  const text = ids.join('\n');
  useEffect(() => onOutput(text), [text, onOutput]);

  return (
    <Pane
      options={
        <>
          <SegmentedControl
            size="sm"
            aria-label="Kind"
            options={KIND_OPTIONS}
            value={state.kind}
            onChange={(kind) => set({ kind })}
          />
          <Option label="How many" htmlFor={countId}>
            <Input
              id={countId}
              size="sm"
              mono
              type="number"
              min={1}
              max={MAX_IDS}
              className="w-20 tabular-nums"
              value={String(state.count)}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next))
                  set({ count: Math.min(MAX_IDS, Math.max(1, Math.round(next))) });
              }}
            />
          </Option>
          <Button
            size="sm"
            icon={<RefreshCw className="size-3.5" />}
            onClick={() => generate(state.kind, state.count)}
          >
            Generate
          </Button>
        </>
      }
    >
      <section className="flex min-h-24 min-w-0 flex-1 flex-col gap-1.5">
        <header className="flex h-6 shrink-0 items-center gap-2">
          <span className="shrink-0 text-sm text-ink-2">{ID_KIND_LABEL[state.kind]}</span>
          <span className="mono tabular-nums text-xs text-ink-3">{ids.length}</span>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <CopyButton text={text} label="Copy output" />
          </div>
        </header>
        <ul
          aria-label={`Generated ${ID_KIND_LABEL[state.kind]}`}
          className="lumen-scroll min-h-16 flex-1 rounded-sm border border-rule bg-canvas"
        >
          {ids.map((id) => {
            const at = state.kind === 'ulid' ? decodeTime(id) : null;
            return (
              <li
                key={id}
                className="flex min-w-0 items-center gap-3 border-b border-rule px-2 py-1 last:border-b-0"
              >
                <span className="mono min-w-0 flex-1 break-all text-sm text-ink">{id}</span>
                {at !== null && (
                  <span className="mono shrink-0 tabular-nums text-2xs text-ink-3">
                    {formatIso(at, UTC)}
                  </span>
                )}
                <CopyButton text={id} label="Copy this id" />
              </li>
            );
          })}
        </ul>
        <Note>
          {state.kind === 'uuid'
            ? '122 random bits from crypto.getRandomValues, version 4.'
            : 'Sortable: the first ten characters are the millisecond it was made.'}
        </Note>
      </section>
    </Pane>
  );
}
