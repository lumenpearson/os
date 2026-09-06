// biome-ignore-all lint/a11y/useFocusableInteractive: the listbox is driven by
// aria-activedescendant from the input, so focus never leaves the field and the
// options must not be focusable. Giving them tabIndex would break the pattern
// this rule is trying to protect.
/**
 * The zone picker: a text field with a listbox of matches under it, following
 * the ARIA combobox pattern the way the shell's Spotlight does — the field
 * keeps focus and owns the keyboard, the highlighted row is named by
 * `aria-activedescendant`, and the mouse only moves the highlight.
 */

import { cx, Input, useClickOutside } from '@lumen/ui';
import { Search } from 'lucide-react';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { formatOffset, offsetMinutes, searchZones, zoneLabel, zoneRegion } from './zones';

/** Rows kept in the list: enough to scroll through, not the whole database. */
const SHOWN = 40;

export interface ZoneComboboxProps {
  /** The zones on offer, already without the ones on the list. */
  zones: readonly string[];
  /** The instant the offsets are read at. */
  at: number;
  onSelect: (zone: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ZoneCombobox({
  zones,
  at,
  onSelect,
  placeholder = 'Add a city',
  disabled,
}: ZoneComboboxProps) {
  const id = useId();
  const listId = `${id}-zones`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const outside = useMemo(() => [root], []);

  const results = useMemo(() => searchZones(zones, query, SHOWN), [zones, query]);
  useClickOutside(outside, () => setOpen(false), open);

  // A new set of matches starts at the top; the highlight never points past
  // the end of a list that has just got shorter.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the query is what resets the highlight
  useEffect(() => {
    setActive(0);
  }, [query]);

  /**
   * Keep the highlighted row inside the scroll box. It reads the list through
   * a ref and takes everything else as an argument, so it has no reactive
   * inputs and can be stable — which is what lets the effect below depend on
   * it honestly instead of leaving it out of the list.
   */
  const reveal = useCallback((index: number) => {
    const option = list.current?.children.item(index);
    if (option instanceof HTMLElement) option.scrollIntoView({ block: 'nearest' });
  }, []);

  useEffect(() => {
    if (open) reveal(0);
  }, [open, reveal]);

  const choose = (zone: string | undefined) => {
    if (!zone) return;
    onSelect(zone);
    setQuery('');
    setOpen(false);
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
        move(-1);
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
        if (open) setOpen(false);
        else setQuery('');
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const expanded = open && results.length > 0;

  return (
    <div ref={root} className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${id}-option-${active}` : undefined}
        aria-label="Add a time zone"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        leading={<Search />}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {expanded && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Time zones"
          className="lumen-scroll absolute inset-x-0 top-9 z-10 max-h-64 rounded-md border border-rule bg-surface p-1 shadow-md"
        >
          {results.map((zone, index) => {
            const current = index === active;
            const region = zoneRegion(zone);
            return (
              <li
                key={zone}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={current}
                data-active={current || undefined}
                onPointerEnter={() => setActive(index)}
                onPointerUp={() => choose(zone)}
                className={cx(
                  'flex cursor-default items-baseline gap-2 rounded-sm px-2 py-1',
                  current ? 'bg-accent text-accent-ink' : 'text-ink',
                )}
              >
                <span className="truncate-1 text-base">{zoneLabel(zone)}</span>
                {region && (
                  <span
                    className={cx(
                      'truncate-1 text-sm',
                      current ? 'text-accent-ink/75' : 'text-ink-3',
                    )}
                  >
                    {region}
                  </span>
                )}
                <span
                  className={cx(
                    'mono ml-auto shrink-0 text-xs',
                    current ? 'text-accent-ink/75' : 'text-ink-3',
                  )}
                >
                  {formatOffset(offsetMinutes(zone, at))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {open && results.length === 0 && query.trim() !== '' && (
        <p className="absolute inset-x-0 top-9 z-10 rounded-md border border-rule bg-surface px-3 py-2 text-sm text-ink-3 shadow-md">
          No zone matches “{query.trim()}”.
        </p>
      )}
    </div>
  );
}
