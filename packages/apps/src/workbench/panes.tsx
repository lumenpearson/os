/**
 * The pieces every tool pane is built from: an options row, a labelled text
 * area, a value row and the Copy control. Keeping them here is what makes the
 * seven panes look like one window rather than seven.
 */

import { useClipboard } from '@lumen/kernel/react';
import { cx, IconButton } from '@lumen/ui';
import { Check, Copy } from 'lucide-react';
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react';

/** How long the Copy control shows that it worked. */
const COPIED_MS = 1200;

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const { copyText } = useClipboard();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <IconButton
      label={copied ? 'Copied' : label}
      size="sm"
      disabled={text === ''}
      onClick={() => {
        copyText(text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      }}
    >
      {copied ? <Check /> : <Copy />}
    </IconButton>
  );
}

export interface PaneProps {
  /** Controls above the rule: selects, toggles, the pattern field. */
  options?: ReactNode;
  children: ReactNode;
  /** Measured to decide whether the panes sit side by side. */
  bodyRef?: RefObject<HTMLDivElement | null>;
}

export function Pane({ options, children, bodyRef }: PaneProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {options && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-3 py-2">
          {options}
        </div>
      )}
      <div ref={bodyRef} className="lumen-scroll flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3">
        {children}
      </div>
    </div>
  );
}

/** A label in front of one control in the options row. */
export function Option({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor={htmlFor} className="shrink-0 text-sm text-ink-2">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Two regions, side by side when there is room and stacked when there is not. */
export function Split({ split, children }: { split: boolean; children: ReactNode }) {
  return (
    <div className={cx('flex min-h-0 min-w-0 flex-1 gap-3', split ? 'flex-row' : 'flex-col')}>
      {children}
    </div>
  );
}

export interface EditorProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  error?: string | null;
  /** A measured fact about the field: a count, a position, a status. */
  note?: string | null;
  actions?: ReactNode;
  /** Long lines scroll sideways instead of wrapping. */
  nowrap?: boolean;
}

/** A labelled monospace field. The text area fills whatever height is left. */
export function Editor({
  label,
  value,
  onChange,
  placeholder,
  readOnly,
  error,
  note,
  actions,
  nowrap,
}: EditorProps) {
  const id = useId();
  return (
    <section className="flex min-h-20 min-w-0 flex-1 flex-col gap-1.5">
      <header className="flex h-6 shrink-0 items-center gap-2">
        <label htmlFor={id} className="shrink-0 text-sm text-ink-2">
          {label}
        </label>
        {note && (
          <span className="mono truncate-1 tabular-nums text-xs text-ink-3" title={note}>
            {note}
          </span>
        )}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-0.5">{actions}</div>}
      </header>
      <textarea
        id={id}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        wrap={nowrap ? 'off' : 'soft'}
        aria-invalid={error ? true : undefined}
        className={cx(
          'lumen-control lumen-scroll mono h-auto min-h-0 flex-1 resize-none py-1.5 text-sm leading-relaxed',
          readOnly && 'bg-canvas',
          error && 'border-danger',
        )}
      />
      {error && (
        <p role="alert" className="shrink-0 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

/** One named value with its own Copy control. */
export function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-rule py-1 last:border-b-0">
      <span className="w-28 shrink-0 text-sm text-ink-2">{label}</span>
      <span className="mono truncate-1 min-w-0 flex-1 tabular-nums text-sm text-ink" title={value}>
        {value}
      </span>
      <CopyButton text={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

/** A line of explanation under a field: why a scan stopped, what a count is. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="shrink-0 text-sm text-ink-3">{children}</p>;
}
