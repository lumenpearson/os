import { cx, useElementSize } from '@lumen/ui';
import type { ChangeEvent, RefObject } from 'react';
import { displayFontSize } from './format';

export interface DisplayProps {
  /** The line being edited: the expression, or the value in programmer mode. */
  value: string;
  /** Accessible name of the field. */
  label: string;
  /** The quiet line above: the running result, or the pending operation. */
  hint?: string;
  error?: string | null;
  /** Standing indicators, left to right: memory, angle unit, base. */
  marks?: readonly string[];
  readOnly?: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * The value line. Right aligned, monospaced and tabular, and it gives up font
 * size rather than clipping: a 40-digit answer shrinks to fit the window.
 */
export function Display({
  value,
  label,
  hint,
  error,
  marks = [],
  readOnly,
  inputRef,
  onChange,
}: DisplayProps) {
  const [frame, size] = useElementSize<HTMLDivElement>();
  const fontSize = displayFontSize(Math.max(value.length, 1), size.width);

  return (
    <div className="shrink-0 border-b border-rule bg-canvas px-3 pt-1.5 pb-2 has-[input:focus]:border-accent">
      <div className="mono flex h-4 items-center gap-2 text-2xs">
        {marks.map((mark) => (
          <span key={mark} className="tracking-[0.08em] text-ink-3">
            {mark}
          </span>
        ))}
        <span
          className={cx('ml-auto truncate-1 text-xs', error ? 'text-danger' : 'text-ink-2')}
          role={error ? 'alert' : undefined}
        >
          {error ?? hint ?? ''}
        </span>
      </div>
      <div ref={frame}>
        <input
          ref={inputRef}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          aria-label={label}
          placeholder="0"
          autoComplete="off"
          spellCheck={false}
          className="mono w-full bg-transparent text-right tabular-nums text-ink caret-accent outline-none placeholder:text-ink-3"
          style={{ fontSize, lineHeight: 1.3 }}
        />
      </div>
    </div>
  );
}
