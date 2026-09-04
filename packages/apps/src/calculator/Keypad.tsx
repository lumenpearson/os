import { cx } from '@lumen/ui';
import { Delete } from 'lucide-react';
import type { KeyDef, KeyTone, Layout } from './keys';

/** What a key looks like right now, when that depends on state. */
export interface KeyOverride {
  label?: string;
  name?: string;
  disabled?: boolean;
  /** A toggle that is currently on (2nd, hyp). */
  active?: boolean;
}

export interface KeypadProps {
  layout: Layout;
  onPress: (key: KeyDef) => void;
  /** The key to show as pressed, so a keystroke lights its button. */
  flash?: string | null;
  override?: (key: KeyDef) => KeyOverride;
}

const TONES: Record<KeyTone, string> = {
  digit: 'bg-surface-2 text-ink hover:bg-surface-3 text-md',
  operator: 'bg-surface-3 text-ink hover:bg-surface-2 text-md',
  function: 'bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink text-sm',
  accent: 'bg-accent text-accent-ink hover:brightness-110 text-md',
};

/** The pressed state, held for a moment when the keystroke came from the keyboard. */
const FLASHES: Record<KeyTone, string> = {
  digit: 'bg-surface-3',
  operator: 'bg-surface-2',
  function: 'bg-surface-2 text-ink',
  accent: 'brightness-110',
};

/** A grid of buttons that divides the space it is given; it never overflows. */
export function Keypad({ layout, onPress, flash, override }: KeypadProps) {
  return (
    <div
      className="grid min-h-0 flex-1 gap-1 p-1.5"
      style={{
        gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
        gridAutoRows: 'minmax(0, 1fr)',
      }}
    >
      {layout.keys.map((key) => {
        const patch = override?.(key) ?? {};
        const tone = key.tone ?? 'function';
        const label = patch.label ?? key.label;
        const name = patch.name ?? key.name;
        return (
          <button
            key={key.id}
            type="button"
            data-key={key.id}
            data-flash={flash === key.id || undefined}
            disabled={patch.disabled}
            aria-label={key.icon || name ? (name ?? label) : undefined}
            aria-pressed={patch.active}
            title={name && name !== label ? name : undefined}
            onClick={() => onPress(key)}
            style={key.span ? { gridColumn: `span ${key.span}` } : undefined}
            className={cx(
              'mono flex min-w-0 items-center justify-center rounded-sm select-none lumen-focus',
              'transition-[background-color,color,filter] duration-(--duration-fast) ease-(--ease-standard)',
              'disabled:opacity-35 disabled:pointer-events-none',
              TONES[tone],
              flash === key.id && FLASHES[tone],
              patch.active && 'bg-selection text-ink',
            )}
          >
            {key.icon === 'backspace' ? (
              <Delete className="size-4" aria-hidden />
            ) : (
              <span className="truncate-1 px-1">{label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
