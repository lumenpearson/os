// deslop-ignore-file 19 — a switch track and knob are round by convention.
// The checkbox and radio in this file use the shared radius scale.
import { Check, Minus } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, useId } from 'react';
import { cx } from '../cx';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
}

/** An on/off switch. Renders as a real checkbox for keyboard and screen readers. */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, description, className, id, checked, disabled, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label
      htmlFor={inputId}
      className={cx(
        'inline-flex items-center gap-3 select-none',
        disabled && 'opacity-50',
        className,
      )}
    >
      <span className="relative inline-flex shrink-0">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          // biome-ignore lint/a11y/useAriaPropsForRole: a native checkbox maps its checked state to aria-checked
          role="switch"
          className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-default"
          checked={checked}
          disabled={disabled}
          {...rest}
        />
        <span
          aria-hidden
          className={cx(
            'block h-5 w-8.5 rounded-full border border-rule-strong bg-surface-3',
            'transition-[background-color,border-color] duration-(--duration-base) ease-(--ease-standard)',
            'peer-checked:bg-accent peer-checked:border-accent',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2',
            'after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm',
            'after:transition-transform after:duration-(--duration-base) after:ease-(--ease-standard)',
            'peer-checked:after:translate-x-3.5',
          )}
        />
      </span>
      {(label || description) && (
        <span className="flex flex-col">
          {label && <span className="text-base text-ink">{label}</span>}
          {description && <span className="text-sm text-ink-2">{description}</span>}
        </span>
      )}
    </label>
  );
});

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, indeterminate, className, id, disabled, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label
      htmlFor={inputId}
      className={cx(
        'inline-flex items-center gap-2 select-none',
        disabled && 'opacity-50',
        className,
      )}
    >
      <span className="relative inline-flex">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-default"
          disabled={disabled}
          aria-checked={indeterminate ? 'mixed' : undefined}
          {...rest}
        />
        <span
          aria-hidden
          className={cx(
            'flex size-4 items-center justify-center rounded-xs border border-rule-strong bg-surface text-accent-ink',
            'transition-[background-color,border-color] duration-(--duration-fast)',
            'peer-checked:bg-accent peer-checked:border-accent',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2',
            '[&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100',
            indeterminate && 'bg-accent border-accent [&>svg]:opacity-100',
          )}
        >
          {indeterminate ? (
            <Minus className="size-3" strokeWidth={3} />
          ) : (
            <Check className="size-3" strokeWidth={3} />
          )}
        </span>
      </span>
      {label && <span className="text-base">{label}</span>}
    </label>
  );
});

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, description, className, id, disabled, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label
      htmlFor={inputId}
      className={cx(
        'inline-flex items-start gap-2 select-none',
        disabled && 'opacity-50',
        className,
      )}
    >
      <span className="relative inline-flex pt-0.5">
        <input
          ref={ref}
          id={inputId}
          type="radio"
          className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-default"
          disabled={disabled}
          {...rest}
        />
        <span
          aria-hidden
          className={cx(
            'relative block size-4 rounded-full border border-rule-strong bg-surface',
            'transition-[background-color,border-color] duration-(--duration-fast)',
            'peer-checked:bg-accent peer-checked:border-accent',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2',
            'after:absolute after:inset-[5px] after:rounded-full after:bg-white after:opacity-0 peer-checked:after:opacity-100',
          )}
        />
      </span>
      {(label || description) && (
        <span className="flex flex-col">
          {label && <span className="text-base">{label}</span>}
          {description && <span className="text-sm text-ink-2">{description}</span>}
        </span>
      )}
    </label>
  );
});
