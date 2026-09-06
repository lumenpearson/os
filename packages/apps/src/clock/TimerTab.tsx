/**
 * The countdown. While it is stopped at its full duration the three fields are
 * on screen and editable; once it is running the ring takes their place, drawn
 * by writing one dash offset per frame. Presets set the fields with one press
 * and are kept in the app's file.
 */

import { Button, cx, IconButton, Label } from '@lumen/ui';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { type CSSProperties, useRef } from 'react';
import {
  type DurationFields,
  describeDuration,
  FIELD_ORDER,
  type FieldName,
  formatCountdown,
  fromFields,
  parseField,
  stepField,
  toFields,
} from './duration';
import { now, useFrames } from './frames';
import { PRESET_LIMIT } from './storage';
import { Ticking } from './Ticking';
import { isIdle, isRunning, progress, remaining, type TimerState } from './timer';

const READOUT: CSSProperties = { fontSize: 'clamp(1.75rem, 13cqw, 4rem)' };
const RING: CSSProperties = { width: 'min(74cqw, 46cqh, 260px)' };

const FIELD_LABEL: Record<FieldName, string> = { hours: 'h', minutes: 'min', seconds: 's' };
const FIELD_NAME: Record<FieldName, string> = {
  hours: 'Hours',
  minutes: 'Minutes',
  seconds: 'Seconds',
};

/** The ring's radius in the 100×100 view box, and the length once round it. */
const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The dash pattern for the arc still to run: one dash as long as the time that
 * is left, then a gap long enough to hide the rest. Writing the pattern rather
 * than an offset keeps the arc's head at twelve o'clock while its tail comes
 * back round to meet it.
 */
function dashes(state: TimerState, at: number): string {
  const left = Math.max(0, 1 - progress(state, at));
  return `${CIRCUMFERENCE * left} ${CIRCUMFERENCE}`;
}

export interface TimerTabProps {
  state: TimerState;
  presets: readonly number[];
  onSetDuration: (ms: number) => void;
  onToggle: () => void;
  onReset: () => void;
  onAddPreset: (ms: number) => void;
  onRemovePreset: (ms: number) => void;
}

export function TimerTab({
  state,
  presets,
  onSetDuration,
  onToggle,
  onReset,
  onAddPreset,
  onRemovePreset,
}: TimerTabProps) {
  const running = isRunning(state);
  const idle = isIdle(state);
  const fields = toFields(state.duration);

  const setField = (field: FieldName, value: number) =>
    onSetDuration(fromFields({ ...fields, [field]: value } as DurationFields));

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-4 p-4"
      style={{ containerType: 'size' }}
    >
      {idle ? (
        <div className="flex items-end gap-2">
          {FIELD_ORDER.map((field) => (
            <Stepper
              key={field}
              field={field}
              value={fields[field]}
              onChange={(value) => setField(field, value)}
            />
          ))}
        </div>
      ) : (
        <Ring state={state} running={running} />
      )}

      {presets.length > 0 && (
        <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5">
          {presets.map((preset) => (
            <span
              key={preset}
              className="flex items-center gap-px rounded-sm border border-rule-strong bg-surface p-px"
            >
              <button
                type="button"
                onClick={() => onSetDuration(preset)}
                className={cx(
                  'mono h-6 rounded-xs px-2 text-sm text-ink-2 tabular-nums lumen-focus',
                  'transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:text-ink',
                  preset === state.duration && 'text-ink',
                )}
              >
                {describeDuration(preset)}
              </button>
              <IconButton
                label={`Remove the ${describeDuration(preset)} preset`}
                size="sm"
                className="size-6 rounded-xs"
                onClick={() => onRemovePreset(preset)}
              >
                <X />
              </IconButton>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="lg" className="min-w-24" disabled={idle} onClick={onReset}>
          Reset
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="min-w-24"
          disabled={!running && state.duration === 0}
          onClick={onToggle}
        >
          {running ? 'Pause' : state.finished ? 'Start again' : 'Start'}
        </Button>
        <IconButton
          label={`Save ${describeDuration(state.duration)} as a preset`}
          variant="outline"
          size="lg"
          disabled={
            state.duration === 0 ||
            presets.includes(state.duration) ||
            presets.length >= PRESET_LIMIT
          }
          onClick={() => onAddPreset(state.duration)}
        >
          <Plus />
        </IconButton>
      </div>
    </div>
  );
}

/** One typed field with a stepper above and below it. */
function Stepper({
  field,
  value,
  onChange,
}: {
  field: FieldName;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <IconButton
        label={`More ${FIELD_NAME[field].toLowerCase()}`}
        size="sm"
        onClick={() => onChange(stepField(value, field, 1))}
      >
        <ChevronUp />
      </IconButton>
      <input
        type="text"
        inputMode="numeric"
        aria-label={FIELD_NAME[field]}
        value={String(value).padStart(2, '0')}
        onChange={(event) => {
          const parsed = parseField(event.target.value, field);
          if (parsed !== null) onChange(parsed);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            onChange(stepField(value, field, 1));
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            onChange(stepField(value, field, -1));
          }
        }}
        onFocus={(event) => event.target.select()}
        className="lumen-control mono h-10 w-14 text-center text-lg tabular-nums"
      />
      <Label>{FIELD_LABEL[field]}</Label>
      <IconButton
        label={`Fewer ${FIELD_NAME[field].toLowerCase()}`}
        size="sm"
        onClick={() => onChange(stepField(value, field, -1))}
      >
        <ChevronDown />
      </IconButton>
    </div>
  );
}

/** The draining ring, with the reading in the middle of it. */
function Ring({ state, running }: { state: TimerState; running: boolean }) {
  const arc = useRef<SVGCircleElement>(null);

  useFrames(running, () => {
    arc.current?.setAttribute('stroke-dasharray', dashes(state, now()));
  });

  return (
    <div className="relative flex items-center justify-center" style={RING}>
      <svg
        viewBox="0 0 100 100"
        className="w-full"
        aria-hidden
        // The ring is the countdown itself: an arc that shrinks back towards
        // twelve o'clock. Not an icon, and its roundness is the drawing.
        // deslop-ignore-next-line 19 24
        fill="none"
      >
        <circle cx="50" cy="50" r={RADIUS} className="stroke-surface-3" strokeWidth="4" />
        <circle
          ref={arc}
          cx="50"
          cy="50"
          r={RADIUS}
          className="stroke-accent"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={dashes(state, now())}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <Ticking
          read={() => formatCountdown(remaining(state, now()))}
          active={running}
          className="mono font-medium leading-none tracking-tight text-ink"
          style={READOUT}
        />
        {state.finished ? <Label>Finished</Label> : !running && <Label>Paused</Label>}
      </div>
    </div>
  );
}
