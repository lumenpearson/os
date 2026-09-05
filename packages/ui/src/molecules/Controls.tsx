// biome-ignore-all lint/a11y/useFocusableInteractive: a row inside a grid or listbox is not a tab stop; the container owns focus
import { Search, X } from 'lucide-react';
import { forwardRef, type HTMLAttributes, type ReactNode, useId } from 'react';
import { IconButton } from '../atoms/IconButton';
import { Input, type InputProps } from '../atoms/Input';
import { cx } from '../cx';

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  /** Put the label and control on one row (settings pages). */
  inline?: boolean;
  className?: string;
  htmlFor?: string;
}

/** Label + control + hint/error. */
export function Field({ label, hint, error, children, inline, className, htmlFor }: FieldProps) {
  const id = useId();
  return (
    <div
      className={cx(
        inline
          ? 'grid grid-cols-[minmax(120px,1fr)_2fr] items-center gap-x-4 gap-y-1'
          : 'flex flex-col gap-1',
        className,
      )}
    >
      <label htmlFor={htmlFor ?? id} className={cx('text-base text-ink', inline && 'text-ink-2')}>
        {label}
      </label>
      <div className="flex flex-col gap-1">{children}</div>
      {(hint || error) && (
        <p className={cx('text-sm', error ? 'text-danger' : 'text-ink-3', inline && 'col-start-2')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export interface SearchFieldProps extends Omit<InputProps, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, onClear, className, ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      type="search"
      role="searchbox"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      leading={<Search />}
      trailing={
        value ? (
          <IconButton
            label="Clear"
            size="sm"
            onClick={() => {
              onChange('');
              onClear?.();
            }}
          >
            <X />
          </IconButton>
        ) : undefined
      }
      className={cx('[&::-webkit-search-cancel-button]:hidden', className)}
      {...rest}
    />
  );
});

export interface SegmentedOption<T extends string> {
  value: T;
  label?: string;
  icon?: ReactNode;
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

/** A radio group drawn as connected segments. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ...rest
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      className={cx(
        'inline-flex shrink-0 rounded-sm border border-rule-strong bg-surface-2 p-0.5',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title ?? o.label}
            aria-label={o.label ?? o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex items-center justify-center gap-1.5 rounded-xs px-2.5 text-ink-2 lumen-focus select-none',
              'transition-[background-color,color,box-shadow] duration-(--duration-fast) ease-(--ease-standard)',
              size === 'sm' ? 'h-5 text-sm [&>svg]:size-3.5' : 'h-6 text-base [&>svg]:size-4',
              active ? 'bg-surface text-ink shadow-sm' : 'hover:text-ink',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabsProps<T extends string> {
  tabs: ReadonlyArray<{ id: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: TabsProps<T>) {
  return (
    <div role="tablist" className={cx('flex gap-1 border-b border-rule', className)}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const i = tabs.findIndex((x) => x.id === value);
              if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length]?.id ?? value);
              if (e.key === 'ArrowLeft')
                onChange(tabs[(i - 1 + tabs.length) % tabs.length]?.id ?? value);
            }}
            className={cx(
              'relative -mb-px inline-flex h-8 items-center gap-1.5 px-2.5 text-base lumen-focus rounded-t-xs select-none',
              'transition-colors duration-(--duration-fast)',
              active
                ? 'text-ink border-b-2 border-accent'
                : 'text-ink-2 hover:text-ink border-b-2 border-transparent',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Compact height for window toolbars. */
  dense?: boolean;
}

export function Toolbar({ dense, className, children, ...rest }: ToolbarProps) {
  return (
    <div
      role="toolbar"
      className={cx(
        'flex shrink-0 items-center gap-1 border-b border-rule bg-canvas px-2',
        dense ? 'h-9' : 'h-11',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function ToolbarGroup({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('flex shrink-0 items-center gap-0.5', className)}>{children}</div>;
}

export function ToolbarSpacer() {
  return <div className="flex-1" />;
}

export interface BreadcrumbProps {
  items: Array<{ label: string; onSelect?: () => void; icon?: ReactNode }>;
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Location" className={cx('flex min-w-0 items-center text-base', className)}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${it.label}-${i}`} className="flex min-w-0 items-center">
            {i > 0 && (
              <span aria-hidden className="mx-1 text-ink-3">
                /
              </span>
            )}
            <button
              type="button"
              onClick={it.onSelect}
              disabled={!it.onSelect || last}
              aria-current={last ? 'location' : undefined}
              className={cx(
                'inline-flex min-w-0 items-center gap-1 rounded-xs px-1 lumen-focus truncate-1',
                last ? 'text-ink font-medium' : 'text-ink-2 hover:text-ink hover:bg-surface-2',
              )}
            >
              {it.icon}
              <span className="truncate-1">{it.label}</span>
            </button>
          </span>
        );
      })}
    </nav>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        'flex h-full flex-col items-center justify-center gap-2 p-8 text-center',
        className,
      )}
    >
      {icon && <div className="text-ink-3 [&>svg]:size-8 [&>svg]:stroke-[1.5]">{icon}</div>}
      <p className="text-md font-medium text-ink">{title}</p>
      {description && <p className="max-w-64 text-base text-ink-2">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export interface ListRowProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  focused?: boolean;
  columns?: string;
}

export const ListRow = forwardRef<HTMLDivElement, ListRowProps>(function ListRow(
  { selected, focused, columns, className, style, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      role="row"
      aria-selected={selected}
      data-focused={focused || undefined}
      className={cx('lumen-list-row', className)}
      style={{ gridTemplateColumns: columns, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
});
