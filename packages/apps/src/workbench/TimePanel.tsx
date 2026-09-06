import { Button, Input, Select, useElementSize } from '@lumen/ui';
import { useEffect, useId, useMemo, useState } from 'react';
import { runTime, TIME_ROWS } from './derive';
import { EPOCH_UNIT_LABEL, EPOCH_UNITS, listZones } from './epoch';
import { paneLayoutFor } from './layout';
import { CopyButton, Option, Pane, Split, ValueRow } from './panes';
import type { TimeState } from './storage';

const UNIT_OPTIONS = EPOCH_UNITS.map((unit) => ({ value: unit, label: EPOCH_UNIT_LABEL[unit] }));

/** The relative line only needs re-reading about once a minute. */
const TICK_MS = 30_000;

export interface TimePanelProps {
  state: TimeState;
  /** The zone the pane works in, already resolved against the system. */
  zone: string;
  locale: string;
  onChange: (next: TimeState) => void;
  onOutput: (text: string) => void;
}

export function TimePanel({ state, zone, locale, onChange, onOutput }: TimePanelProps) {
  const [bodyRef, { width }] = useElementSize<HTMLDivElement>();
  const { split } = paneLayoutFor(width);
  const unitId = useId();
  const zoneId = useId();
  const inputId = useId();
  const set = (change: Partial<TimeState>) => onChange({ ...state, ...change });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const zones = useMemo(() => listZones().map((id) => ({ value: id, label: id })), []);
  const result = useMemo(() => runTime(state, zone, now, locale), [state, zone, now, locale]);
  useEffect(() => onOutput(result.output), [result.output, onOutput]);

  return (
    <Pane
      bodyRef={bodyRef}
      options={
        <>
          <Option label="A number is" htmlFor={unitId}>
            <Select
              id={unitId}
              size="sm"
              options={UNIT_OPTIONS}
              value={state.unit}
              onChange={(unit) => set({ unit })}
            />
          </Option>
          <Option label="Zone" htmlFor={zoneId}>
            <Select
              id={zoneId}
              size="sm"
              mono
              className="max-w-56"
              options={zones}
              value={zone}
              onChange={(next) => set({ zone: next })}
            />
          </Option>
          <Button size="sm" onClick={() => set({ input: String(Date.now()) })}>
            Now
          </Button>
        </>
      }
    >
      <Split split={split}>
        <section className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={inputId} className="flex h-6 shrink-0 items-center text-sm text-ink-2">
            Timestamp or date
          </label>
          <Input
            id={inputId}
            mono
            className="tabular-nums"
            placeholder="1700000000 or 2023-11-14T22:13:20Z"
            value={state.input}
            invalid={result.error !== null}
            onChange={(event) => set({ input: event.target.value })}
          />
          {result.error ? (
            <p role="alert" className="text-sm text-danger">
              {result.error}
            </p>
          ) : (
            result.relative && <p className="mono text-sm text-ink-3">{result.relative}</p>
          )}
        </section>

        <section className="flex min-w-0 flex-1 flex-col gap-1.5">
          <header className="flex h-6 shrink-0 items-center gap-2">
            <span className="shrink-0 text-sm text-ink-2">In {zone}</span>
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <CopyButton text={result.output} label="Copy output" />
            </div>
          </header>
          <div className="rounded-sm border border-rule bg-canvas px-2">
            {result.view ? (
              TIME_ROWS.map(([label, key]) => (
                <ValueRow key={key} label={label} value={result.view?.[key] ?? ''} />
              ))
            ) : (
              <p className="py-2 text-sm text-ink-3">Enter a timestamp or a date.</p>
            )}
          </div>
        </section>
      </Split>
    </Pane>
  );
}
