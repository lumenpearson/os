import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cx } from '../cx';
import { useControlId } from '../fieldId';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'onChange' | 'value'> {
  options: ReadonlyArray<SelectOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  mono?: boolean;
}

/** A native select styled as a control; keyboard and screen-reader behaviour comes free. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, value, onChange, size = 'md', mono, className, id, ...rest },
  ref,
) {
  const selectId = useControlId(id);
  return (
    <span
      // The claim goes on the wrapper, not on the `select`: a disabled form
      // control is not what a pointer event reports as its target, and the
      // chevron beside it is just as dead.
      data-cursor={rest.disabled ? 'not-allowed' : undefined}
      className={cx('relative inline-flex shrink-0', className)}
    >
      <select
        ref={ref}
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          // A floor that yields. A plain `min-w-24` is 6rem whatever the box
          // it is in, so a select in a narrower cell overflows it rather than
          // fitting; `min()` says at least 6rem, or all of the room there is,
          // whichever is less.
          'lumen-control appearance-none pr-7 min-w-[min(6rem,100%)]',
          size === 'sm' && 'h-6 text-sm leading-[22px]',
          mono && 'mono',
        )}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-2"
      />
    </span>
  );
}) as <T extends string>(
  props: SelectProps<T> & { ref?: React.Ref<HTMLSelectElement> },
) => React.JSX.Element;
