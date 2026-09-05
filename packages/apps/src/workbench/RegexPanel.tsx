import { Checkbox, Input, useElementSize } from '@lumen/ui';
import { useEffect, useId, useMemo } from 'react';
import { runRegex } from './derive';
import { paneLayoutFor } from './layout';
import { CopyButton, Editor, Option, Pane, Split } from './panes';
import { FLAG_LABEL, FLAGS, type RegexMatch } from './regex';
import type { RegexState } from './storage';

/** One match: where it is, what it caught, and what each group caught. */
function MatchRow({ match, ordinal }: { match: RegexMatch; ordinal: number }) {
  const groups = match.groups.filter((group) => group.value !== null);
  return (
    <li className="border-b border-rule px-2 py-1 last:border-b-0">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="mono w-8 shrink-0 tabular-nums text-xs text-ink-3">{ordinal}</span>
        <span className="mono w-20 shrink-0 tabular-nums text-xs text-ink-3">
          {match.index}+{match.length}
        </span>
        <span className="mono min-w-0 flex-1 break-all text-sm text-ink">
          {match.text === '' ? '(empty)' : match.text}
        </span>
      </div>
      {groups.length > 0 && (
        <div className="mono flex flex-wrap gap-x-3 gap-y-0.5 pl-10 pt-0.5 text-xs text-ink-2">
          {groups.map((group) => (
            <span key={group.number} className="break-all">
              <span className="text-ink-3">{group.name ?? group.number}</span>
              <span className="text-ink-3">=</span>
              {group.value}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

export interface RegexPanelProps {
  state: RegexState;
  onChange: (next: RegexState) => void;
  onOutput: (text: string) => void;
}

export function RegexPanel({ state, onChange, onOutput }: RegexPanelProps) {
  const [bodyRef, { width }] = useElementSize<HTMLDivElement>();
  const { split } = paneLayoutFor(width);
  const patternId = useId();
  const patternErrorId = useId();
  const replacementId = useId();
  const set = (change: Partial<RegexState>) => onChange({ ...state, ...change });

  const result = useMemo(() => runRegex(state), [state]);
  useEffect(() => onOutput(result.output), [result.output, onOutput]);

  const toggleFlag = (flag: string, on: boolean) =>
    set({
      flags: FLAGS.filter((f) => (f === flag ? on : state.flags.includes(f))).join(''),
    });

  return (
    <Pane
      bodyRef={bodyRef}
      options={
        <>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Option label="Pattern" htmlFor={patternId}>
              <Input
                id={patternId}
                size="sm"
                mono
                className="w-56"
                placeholder="(?<key>\w+)=(\w+)"
                value={state.pattern}
                invalid={result.error !== null}
                aria-describedby={result.error ? patternErrorId : undefined}
                onChange={(event) => set({ pattern: event.target.value })}
              />
            </Option>
            {result.error && (
              <p id={patternErrorId} role="alert" className="text-sm text-danger">
                {result.error}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {FLAGS.map((flag) => (
              <span key={flag} title={FLAG_LABEL[flag]}>
                <Checkbox
                  label={flag}
                  aria-label={`${flag}, ${FLAG_LABEL[flag]}`}
                  className="mono"
                  checked={state.flags.includes(flag)}
                  onChange={(event) => toggleFlag(flag, event.target.checked)}
                />
              </span>
            ))}
          </div>
        </>
      }
    >
      <Split split={split}>
        <Editor
          label="Subject"
          value={state.subject}
          onChange={(subject) => set({ subject })}
          placeholder="a=1 bb=22"
        />
        <section className="flex min-h-20 min-w-0 flex-1 flex-col gap-1.5">
          <header className="flex h-6 shrink-0 items-center gap-2">
            <span className="shrink-0 text-sm text-ink-2">Matches</span>
            {result.note && (
              <span className="mono truncate-1 tabular-nums text-xs text-ink-3">{result.note}</span>
            )}
          </header>
          <div className="lumen-scroll min-h-16 flex-1 rounded-sm border border-rule bg-canvas">
            {result.matches.length === 0 ? (
              <p className="p-2 text-sm text-ink-3">
                {state.pattern === '' ? 'Enter a pattern.' : 'No match.'}
              </p>
            ) : (
              <ul aria-label="Matches">
                {result.matches.map((match, i) => (
                  <MatchRow key={`${match.index}-${i}`} match={match} ordinal={i + 1} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </Split>
      <div className="flex shrink-0 items-center gap-2">
        <label htmlFor={replacementId} className="shrink-0 text-sm text-ink-2">
          Replace with
        </label>
        <Input
          id={replacementId}
          size="sm"
          mono
          className="flex-1"
          placeholder="[$<key>]"
          value={state.replacement}
          onChange={(event) => set({ replacement: event.target.value })}
        />
      </div>
      <Editor
        readOnly
        label="Result"
        value={result.output}
        actions={<CopyButton text={result.output} label="Copy output" />}
      />
    </Pane>
  );
}
