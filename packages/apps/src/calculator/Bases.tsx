import { cx, SegmentedControl } from '@lumen/ui';
import { BASE_LABEL, BASES, type Base, formatBase, WORD_SIZES, type WordSize } from './bases';

export interface BasesProps {
  value: bigint;
  base: Base;
  wordSize: WordSize;
  onSelectBase: (base: Base) => void;
  onSelectWordSize: (size: WordSize) => void;
}

const SIZE_OPTIONS = WORD_SIZES.map((size) => ({ value: String(size), label: String(size) }));

const SIZE_BY_LABEL: Record<string, WordSize> = { '8': 8, '16': 16, '32': 32, '64': 64 };

/** The same value in all four bases at once; clicking a row types in that base. */
export function Bases({ value, base, wordSize, onSelectBase, onSelectWordSize }: BasesProps) {
  return (
    <div className="shrink-0 border-b border-rule bg-canvas px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm text-ink-2">Word size</span>
        <SegmentedControl
          size="sm"
          aria-label="Word size"
          options={SIZE_OPTIONS}
          value={String(wordSize)}
          onChange={(next) => onSelectWordSize(SIZE_BY_LABEL[next] ?? wordSize)}
        />
      </div>
      <div role="radiogroup" aria-label="Number base" className="flex flex-col">
        {BASES.map((item) => {
          const text = formatBase(value, item, wordSize, { group: true });
          const active = item === base;
          return (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelectBase(item)}
              className={cx(
                'flex items-baseline gap-3 rounded-xs px-1.5 py-0.5 text-left lumen-focus',
                'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
                active ? 'bg-selection' : 'hover:bg-surface-2',
              )}
            >
              <span
                className={cx(
                  'mono w-8 shrink-0 text-2xs tracking-[0.08em]',
                  active ? 'text-accent' : 'text-ink-3',
                )}
              >
                {BASE_LABEL[item]}
              </span>
              <span
                title={text}
                className={cx(
                  'mono min-w-0 flex-1 truncate-1 text-right tabular-nums text-ink',
                  item === 'bin' ? 'text-2xs' : 'text-base',
                )}
              >
                {text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
