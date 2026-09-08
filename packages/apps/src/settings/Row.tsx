import { cx, SettingsRow, type SettingsRowProps } from '@lumen/ui';
import { createContext, type ReactNode, useContext } from 'react';

const EMPTY: ReadonlySet<string> = new Set();
const SearchMatchContext = createContext<ReadonlySet<string>>(EMPTY);

/** Provides the ids of rows that match the sidebar search. */
export function SearchMatchProvider({
  matches,
  children,
}: {
  matches: ReadonlySet<string>;
  children: ReactNode;
}) {
  return <SearchMatchContext.Provider value={matches}>{children}</SearchMatchContext.Provider>;
}

export interface RowProps extends SettingsRowProps {
  /** Id from SETTINGS_ROWS (`section.row`). */
  id: string;
}

/**
 * A settings row that knows whether it matches the current search. Matching
 * rows take the selection tint; the page scrolls the first one into view.
 */
export function Row({ id, ...rest }: RowProps) {
  const match = useContext(SearchMatchContext).has(id);
  return (
    <div
      data-row={id}
      data-match={match || undefined}
      className={cx(
        'first:rounded-t-md last:rounded-b-md',
        'transition-colors duration-(--duration-base) ease-(--ease-standard)',
        match && 'bg-selection',
      )}
    >
      <SettingsRow {...rest} />
    </div>
  );
}

/** A read-only value in a row: mono, secondary colour. */
export function Value({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('mono text-sm text-ink-2 tabular-nums select-text', className)}>
      {children}
    </span>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** The visual for this choice. */
  render: (selected: boolean) => ReactNode;
}

export interface ChoiceGroupProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<ChoiceOption<T>>;
  /** Keep the text label for assistive tech only (colour dots). */
  labelHidden?: boolean;
  className?: string;
}

/**
 * A radio group whose options are pictures (theme swatches, accent dots,
 * wallpapers, avatars). Arrow keys move and select; one tab stop.
 */
export function ChoiceGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  labelHidden,
  className,
}: ChoiceGroupProps<T>) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === value);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % options.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (i - 1 + options.length) % options.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = options.length - 1;
    const target = options[next];
    if (!target) return;
    e.preventDefault();
    onChange(target.value);
    const el = e.currentTarget.querySelector<HTMLElement>(`[data-value="${target.value}"]`);
    el?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx('flex flex-wrap gap-3', className)}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={labelHidden ? o.label : undefined}
            title={labelHidden ? o.label : undefined}
            tabIndex={selected ? 0 : -1}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className="flex flex-col items-center gap-1.5 rounded-sm p-1 lumen-focus select-none"
          >
            {o.render(selected)}
            {!labelHidden && (
              <span className={cx('text-sm', selected ? 'text-ink' : 'text-ink-2')}>{o.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
