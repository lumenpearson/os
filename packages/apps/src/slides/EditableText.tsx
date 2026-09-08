import { cx } from '@lumen/ui';
import { type CSSProperties, type KeyboardEvent, useEffect, useRef } from 'react';

export interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  /** Shown in place of the text while it is empty. */
  placeholder: string;
  label: string;
  editable: boolean;
  /** Enter inserts a line break instead of being swallowed. */
  multiline?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * One text region of a slide. The DOM owns the text while it is being typed —
 * React only writes into it when the value arrives from elsewhere (a different
 * slide, an undo) — so the caret never jumps mid-word.
 */
export function EditableText({
  value,
  onChange,
  placeholder,
  label,
  editable,
  multiline = false,
  className,
  style,
}: EditableTextProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== value) el.textContent = value;
  }, [value]);

  if (!editable) {
    return (
      <div className={cx('whitespace-pre-wrap', className)} style={style}>
        {value}
      </div>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !multiline) event.preventDefault();
    // Escape hands focus back to the slide so the next shortcut is not typed.
    if (event.key === 'Escape') event.currentTarget.blur();
  };

  return (
    <div className={cx('relative', className)} style={style}>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={label}
        aria-multiline={multiline}
        tabIndex={0}
        spellCheck
        onKeyDown={onKeyDown}
        onInput={(event) => onChange(event.currentTarget.textContent ?? '')}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain');
          const flat = multiline ? text : text.replace(/\s+/g, ' ');
          document.execCommand('insertText', false, flat);
        }}
        className="min-h-[1em] whitespace-pre-wrap break-words outline-none lumen-focus"
      />
      {value.length === 0 && (
        <span aria-hidden className="pointer-events-none absolute inset-0 opacity-40">
          {placeholder}
        </span>
      )}
    </div>
  );
}
