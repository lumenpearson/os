// biome-ignore-all lint/a11y/useFocusableInteractive: the listbox is driven by
// aria-activedescendant from the input, so focus never leaves the field and the
// options must not be tab stops. Giving them tabIndex would break the pattern
// the rule exists to protect.
/**
 * The unit picker: a text field with a listbox of matches under it, following
 * the ARIA combobox pattern — the field keeps focus and owns the keyboard, the
 * highlighted row is named by `aria-activedescendant`, and the pointer only
 * moves the highlight.
 *
 * Closed, the field reads the selected unit's name. Typing replaces it with a
 * query; leaving without choosing puts the name back.
 */

import { cx, Input, useClickOutside } from '@lumen/ui';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Unit, UnitId } from './catalogue';
import { searchUnits } from './search';

export interface UnitComboboxProps {
  /** The units on offer, in catalogue order. */
  units: readonly Unit[];
  value: UnitId;
  onChange: (id: UnitId) => void;
  /** Names the field for screen readers, e.g. "Convert from". */
  label: string;
  /**
   * Which way the list opens. The lower field opens upwards so that both
   * pickers stay inside a window at its minimum height.
   */
  direction?: 'down' | 'up';
}

export function UnitCombobox({
  units,
  value,
  onChange,
  label,
  direction = 'down',
}: UnitComboboxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const outside = useMemo(() => [root], []);

  const selected = units.find((unit) => unit.id === value);
  const results = useMemo(() => searchUnits(units, query ?? ''), [units, query]);

  const dismiss = useCallback(() => {
    setOpen(false);
    setQuery(null);
  }, []);
  useClickOutside(outside, dismiss, open);

  /**
   * Keep the highlighted row in view. It reads the list through a ref and
   * takes the index as an argument, so it has no reactive inputs and can be
   * stable — which lets the effects below depend on it honestly.
   */
  const reveal = useCallback((index: number) => {
    const option = list.current?.children.item(index);
    if (option instanceof HTMLElement) option.scrollIntoView({ block: 'nearest' });
  }, []);

  // A new set of matches starts at the top, except the untouched list, which
  // starts on the unit already chosen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the query and the open state are what reset the highlight
  useEffect(() => {
    if (!open) return;
    const index = query === null ? results.findIndex((unit) => unit.id === value) : 0;
    const next = index < 0 ? 0 : index;
    setActive(next);
    reveal(next);
  }, [open, query, reveal]);

  const choose = (unit: Unit | undefined) => {
    if (!unit) return;
    onChange(unit.id);
    setOpen(false);
    setQuery(null);
  };

  const move = (delta: number) => {
    setActive((index) => {
      const next = Math.min(results.length - 1, Math.max(0, index + delta));
      reveal(next);
      return next;
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        else move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) setOpen(true);
        else move(-1);
        break;
      case 'Home':
        if (!open) return;
        event.preventDefault();
        move(-results.length);
        break;
      case 'End':
        if (!open) return;
        event.preventDefault();
        move(results.length);
        break;
      case 'Enter':
        if (!open) return;
        event.preventDefault();
        choose(results[active]);
        break;
      case 'Escape':
        event.preventDefault();
        dismiss();
        break;
      case 'Tab':
        dismiss();
        break;
      default:
        break;
    }
  };

  const expanded = open && results.length > 0;
  const text = query ?? selected?.name ?? '';

  return (
    <div ref={root} className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${id}-option-${active}` : undefined}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        value={text}
        placeholder="Search units"
        trailing={
          query === null && selected ? (
            <span className="mono pointer-events-none text-xs text-ink-3">{selected.symbol}</span>
          ) : undefined
        }
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={(event) => {
          setOpen(true);
          event.target.select();
        }}
        onKeyDown={onKeyDown}
      />
      {expanded && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          className={cx(
            'lumen-scroll absolute inset-x-0 z-20 max-h-48 rounded-md border border-rule bg-surface p-1 shadow-md',
            direction === 'up' ? 'bottom-8' : 'top-8',
          )}
        >
          {results.map((unit, index) => {
            const current = index === active;
            return (
              <li
                key={unit.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={current}
                onPointerEnter={() => setActive(index)}
                onPointerUp={() => choose(unit)}
                className={cx(
                  'flex cursor-default items-baseline gap-2 rounded-sm px-2 py-1',
                  current ? 'bg-accent text-accent-ink' : 'text-ink',
                )}
              >
                <span className="truncate-1 text-base">{unit.name}</span>
                {unit.note && (
                  <span
                    className={cx(
                      'truncate-1 text-sm',
                      current ? 'text-accent-ink/75' : 'text-ink-3',
                    )}
                  >
                    {unit.note}
                  </span>
                )}
                <span
                  className={cx(
                    'mono ml-auto shrink-0 text-xs',
                    current ? 'text-accent-ink/75' : 'text-ink-3',
                  )}
                >
                  {unit.symbol}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {open && results.length === 0 && (
        <p
          className={cx(
            'absolute inset-x-0 z-20 rounded-md border border-rule bg-surface px-3 py-2 text-sm text-ink-3 shadow-md',
            direction === 'up' ? 'bottom-8' : 'top-8',
          )}
        >
          No unit matches “{(query ?? '').trim()}”.
        </p>
      )}
    </div>
  );
}
