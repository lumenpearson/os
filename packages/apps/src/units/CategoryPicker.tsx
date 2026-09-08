/**
 * Choosing the kind of quantity. Three shapes for one radio group, picked by
 * how much room the window has: a list down the side, a strip of tabs that
 * scrolls inside the toolbar rather than widening it, or a native select when
 * neither fits.
 *
 * The buttons follow the radio-group keyboard: one tab stop for the group,
 * arrows to move within it. Fourteen categories would otherwise be fourteen
 * tab stops between the window and the fields.
 */

import { cx, Select } from '@lumen/ui';
import { type KeyboardEvent, useRef } from 'react';
import { CATEGORIES, type CategoryId, isCategoryId } from './catalogue';
import type { CategoryPicker as PickerShape } from './layout';

export interface CategoryPickerProps {
  shape: PickerShape;
  value: CategoryId;
  onChange: (id: CategoryId) => void;
}

const OPTIONS = CATEGORIES.map((category) => ({ value: category.id, label: category.name }));

/** How far a key moves the selection, or zero for a key the group ignores. */
function stepFor(key: string, count: number): number {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return 1;
    case 'ArrowLeft':
    case 'ArrowUp':
      return -1;
    case 'Home':
      return -count;
    case 'End':
      return count;
    default:
      return 0;
  }
}

export function CategoryPicker({ shape, value, onChange }: CategoryPickerProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  if (shape === 'select') {
    return (
      <Select
        aria-label="Category"
        size="sm"
        options={OPTIONS}
        value={value}
        onChange={(next) => {
          if (isCategoryId(next)) onChange(next);
        }}
      />
    );
  }

  const sidebar = shape === 'sidebar';
  const current = CATEGORIES.findIndex((category) => category.id === value);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = stepFor(event.key, CATEGORIES.length);
    if (step === 0) return;
    event.preventDefault();
    const index = Math.min(CATEGORIES.length - 1, Math.max(0, current + step));
    const next = CATEGORIES[index];
    if (!next || next.id === value) return;
    onChange(next.id);
    // The button stays mounted through the change; only its tab stop moves,
    // so focus has to be carried across by hand.
    buttons.current[index]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Category"
      onKeyDown={onKeyDown}
      className={cx(
        'lumen-scroll flex',
        sidebar
          ? 'w-44 shrink-0 flex-col gap-0.5 border-r border-rule bg-surface-2 p-2'
          : 'min-w-0 flex-1 items-center gap-0.5',
      )}
    >
      {CATEGORIES.map((category, index) => {
        const active = category.id === value;
        return (
          <button
            key={category.id}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(category.id)}
            className={cx(
              'shrink-0 whitespace-nowrap rounded-sm px-2.5 text-base lumen-focus select-none',
              'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
              sidebar ? 'h-7 text-left' : 'h-6',
              active ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
            )}
          >
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
