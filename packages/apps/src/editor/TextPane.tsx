import { cx } from '@lumen/ui';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { lineCount, lineHeightFor } from './editing';

/** Padding inside the text area; the gutter repeats the vertical part. */
export const TEXT_PAD_Y = 8;
const PAD_X = 12;

export interface TextPaneProps {
  text: string;
  fontSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  readOnly: boolean;
  /** Zero-based line of the caret; its number is drawn in full ink. */
  currentLine: number;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  gutterRef: RefObject<HTMLDivElement | null>;
  rowsRef: RefObject<HTMLDivElement | null>;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSelectionChange: () => void;
  onScroll: () => void;
}

/**
 * The text area and its line-number gutter. When wrapping is on each gutter
 * row carries a hidden copy of its line at the text area's content width, so
 * the browser gives the row exactly the height of the wrapped line and the
 * numbers stay aligned without measuring anything in JavaScript.
 */
export function TextPane({
  text,
  fontSize,
  wordWrap,
  lineNumbers,
  readOnly,
  currentLine,
  textareaRef,
  gutterRef,
  rowsRef,
  onChange,
  onKeyDown,
  onSelectionChange,
  onScroll,
}: TextPaneProps) {
  const lineHeight = lineHeightFor(fontSize);
  const total = useMemo(() => lineCount(text), [text]);
  const wrapped = useMemo(() => (wordWrap ? text.split('\n') : null), [text, wordWrap]);
  const showGutter = lineNumbers || wordWrap;
  const digits = Math.max(2, String(total).length);

  const rows = useMemo(() => {
    if (!showGutter) return null;
    const count = wrapped ? wrapped.length : total;
    const items = new Array<ReactElement>(count);
    for (let i = 0; i < count; i++) {
      items[i] = (
        <div key={i} className="flex items-start" style={{ minHeight: lineHeight }}>
          {lineNumbers && (
            <span className="shrink-0 text-right tabular-nums" style={{ width: `${digits}ch` }}>
              {i + 1}
            </span>
          )}
          {wrapped && (
            <span
              aria-hidden
              className="invisible shrink-0 break-words whitespace-pre-wrap"
              style={{ width: 'var(--wrap-width, 0px)' }}
            >
              {wrapped[i] || ' '}
            </span>
          )}
        </div>
      );
    }
    return items;
  }, [showGutter, wrapped, total, lineNumbers, lineHeight, digits]);

  // Move the "current line" mark by hand: re-rendering every row for a caret
  // move would be wasteful in a long document.
  const marked = useRef<Element | null>(null);
  useEffect(() => {
    const next = rowsRef.current?.children.item(currentLine) ?? null;
    if (marked.current === next) return;
    marked.current?.removeAttribute('data-current');
    next?.setAttribute('data-current', 'true');
    marked.current = next;
  });

  // The hidden mirror needs the text area's content width, in pixels.
  useEffect(() => {
    const area = textareaRef.current;
    const gutter = gutterRef.current;
    if (!area || !gutter || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const style = getComputedStyle(area);
      const width =
        area.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      gutter.style.setProperty('--wrap-width', `${Math.max(0, Math.round(width))}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [textareaRef, gutterRef]);

  const metrics = {
    // deslop-ignore-next-line 34 — a text editor's document face: code and plain text belong in mono.
    fontFamily: 'var(--font-mono)',
    fontSize,
    lineHeight: `${lineHeight}px`,
    tabSize: 2,
  } as const;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-surface">
      {showGutter && (
        <div
          ref={gutterRef}
          aria-hidden
          className={cx(
            'shrink-0 overflow-hidden bg-canvas select-none',
            lineNumbers && 'border-r border-rule',
          )}
          style={{
            ...metrics,
            width: lineNumbers ? `calc(${digits}ch + 16px)` : 0,
          }}
        >
          <div
            ref={rowsRef}
            className="text-ink-3 [&>[data-current]]:text-ink"
            style={{
              paddingTop: TEXT_PAD_Y,
              paddingBottom: TEXT_PAD_Y,
              paddingInline: lineNumbers ? 8 : 0,
            }}
          >
            {rows}
          </div>
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={text}
        readOnly={readOnly}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        wrap={wordWrap ? 'soft' : 'off'}
        aria-label="Document text"
        aria-readonly={readOnly || undefined}
        className="lumen-scroll min-w-0 flex-1 resize-none border-0 bg-transparent text-ink outline-none"
        style={{
          ...metrics,
          padding: `${TEXT_PAD_Y}px ${PAD_X}px`,
          whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
          overflowWrap: 'break-word',
          wordBreak: 'normal',
          caretColor: 'var(--lumen-accent)',
        }}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onSelect={onSelectionChange}
        onScroll={onScroll}
      />
    </div>
  );
}
