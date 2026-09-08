/**
 * One side of the conversion: a label, the value, and the unit it is in. Both
 * sides are editable — typing in either one converts into the other — so
 * neither field is read-only and neither is the "answer".
 */

import { cx } from '@lumen/ui';
import { type KeyboardEvent, useId } from 'react';
import type { Unit, UnitId } from './catalogue';
import { UnitCombobox } from './UnitCombobox';

export interface ValueFieldProps {
  label: string;
  value: string;
  onChange: (text: string) => void;
  /** Enter keeps the conversion in the recents list. */
  onCommit: () => void;
  units: readonly Unit[];
  unit: UnitId;
  onUnitChange: (id: UnitId) => void;
  /** The text is not a number the converter can read. */
  invalid?: boolean;
  /** Value and unit share a row instead of stacking. */
  pairRow: boolean;
  /** Which way the unit list opens, so it stays inside the window. */
  direction?: 'down' | 'up';
}

export function ValueField({
  label,
  value,
  onChange,
  onCommit,
  units,
  unit,
  onUnitChange,
  invalid,
  pairRow,
  direction,
}: ValueFieldProps) {
  const id = useId();
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit();
    }
  };
  return (
    <section className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-ink-2">
        {label}
      </label>
      <div className={cx('flex gap-2', pairRow ? 'flex-row items-center' : 'flex-col')}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          className={cx(
            'lumen-control mono h-11 w-full text-xl leading-none tabular-nums',
            pairRow && 'flex-1',
            invalid && 'border-danger',
          )}
        />
        <div className={cx(pairRow ? 'w-52 shrink-0' : 'w-full')}>
          <UnitCombobox
            units={units}
            value={unit}
            onChange={onUnitChange}
            label={`${label} unit`}
            direction={direction}
          />
        </div>
      </div>
    </section>
  );
}
