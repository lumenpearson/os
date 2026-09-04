import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from '../cx';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Use the monospace face (paths, values, codes). */
  mono?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { mono, leading, trailing, size = 'md', invalid, className, ...rest },
  ref,
) {
  const h = size === 'sm' ? 'h-6 text-sm' : size === 'lg' ? 'h-9 text-md' : 'h-7';
  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(
        'lumen-control w-full',
        h,
        mono && 'mono',
        invalid && 'border-danger',
        leading ? 'pl-7' : null,
        trailing ? 'pr-7' : null,
        className,
      )}
      {...rest}
    />
  );
  if (!leading && !trailing) return input;
  return (
    <span className="relative block w-full">
      {leading && (
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-3 [&>svg]:size-3.5">
          {leading}
        </span>
      )}
      {input}
      {trailing && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-3 [&>svg]:size-3.5">
          {trailing}
        </span>
      )}
    </span>
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
  invalid?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { mono, invalid, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(
        'lumen-control h-auto min-h-20 resize-y py-1.5 leading-normal',
        mono && 'mono',
        invalid && 'border-danger',
        className,
      )}
      {...rest}
    />
  );
});
