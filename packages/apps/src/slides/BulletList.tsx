import { cx } from '@lumen/ui';
import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useRef } from 'react';

export interface BulletListProps {
  bullets: readonly string[];
  onChange: (bullets: string[]) => void;
  placeholder: string;
  editable: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Left indent of the marker column, in slide pixels. */
const INDENT = 34;

const LIST_STYLE: CSSProperties = {
  listStyleType: 'square',
  listStylePosition: 'outside',
  paddingLeft: INDENT,
  margin: 0,
};

function readBullets(list: HTMLUListElement): string[] {
  const items = list.querySelectorAll('li');
  if (items.length === 0) {
    const stray = list.textContent ?? '';
    return stray.length > 0 ? [stray] : [];
  }
  return Array.from(items, (item) => item.textContent ?? '');
}

function writeBullets(list: HTMLUListElement, bullets: readonly string[]) {
  list.replaceChildren(
    ...bullets.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }),
  );
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** The bullet the caret sits in, and how many characters precede it. */
function caretItem(list: HTMLUListElement): { item: HTMLLIElement; offset: number } | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  const host = node instanceof Element ? node : node.parentElement;
  const item = host?.closest('li');
  if (!item || !list.contains(item)) return null;
  const measure = range.cloneRange();
  measure.selectNodeContents(item);
  measure.setEnd(range.startContainer, range.startOffset);
  return { item, offset: measure.toString().length };
}

function placeCaret(item: HTMLLIElement, offset: number) {
  const selection = document.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const text = item.firstChild;
  if (text && text.nodeType === Node.TEXT_NODE) {
    range.setStart(text, Math.min(offset, text.textContent?.length ?? 0));
  } else {
    range.setStart(item, 0);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * The bullets of a slide as one editable list: Enter splits the current bullet
 * in two, Backspace at the start of an empty one removes it. The `<li>`
 * elements are the model while the list has focus, so React never rewrites
 * them mid-edit.
 */
export function BulletList({
  bullets,
  onChange,
  placeholder,
  editable,
  className,
  style,
}: BulletListProps) {
  const ref = useRef<HTMLUListElement>(null);
  const lines = useMemo(() => (bullets.length > 0 ? bullets : ['']), [bullets]);
  const empty = lines.every((line) => line.length === 0);

  useEffect(() => {
    const list = ref.current;
    if (list && !same(readBullets(list), lines)) writeBullets(list, lines);
  }, [lines]);

  if (!editable) {
    const written = bullets.filter((line) => line.trim().length > 0);
    if (written.length === 0) return null;
    return (
      <ul className={className} style={{ ...LIST_STYLE, ...style }}>
        {written.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ul>
    );
  }

  const commit = () => {
    const list = ref.current;
    if (list) onChange(readBullets(list));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const list = ref.current;
    if (!list) return;
    if (event.key === 'Escape') {
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const at = caretItem(list);
      if (!at) return;
      const text = at.item.textContent ?? '';
      at.item.textContent = text.slice(0, at.offset);
      const created = document.createElement('li');
      created.textContent = text.slice(at.offset);
      at.item.after(created);
      placeCaret(created, 0);
      commit();
      return;
    }
    if (event.key !== 'Backspace') return;
    const at = caretItem(list);
    if (!at || at.offset > 0) return;
    const text = at.item.textContent ?? '';
    const previous = at.item.previousElementSibling;
    if (!(previous instanceof HTMLLIElement)) {
      // The first bullet only goes away when it is empty and not the last one.
      const following = at.item.nextElementSibling;
      if (text.length > 0 || !(following instanceof HTMLLIElement)) return;
      event.preventDefault();
      at.item.remove();
      placeCaret(following, 0);
      commit();
      return;
    }
    event.preventDefault();
    const head = previous.textContent ?? '';
    previous.textContent = head + text;
    at.item.remove();
    placeCaret(previous, head.length);
    commit();
  };

  return (
    <div className={cx('relative', className)} style={style}>
      {/* biome-ignore lint/a11y/useFocusableInteractive: contentEditable makes the list a tab stop */}
      <ul
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Bullets"
        aria-multiline="true"
        spellCheck
        style={LIST_STYLE}
        className="break-words outline-none lumen-focus"
        onKeyDown={onKeyDown}
        onInput={commit}
        onBlur={commit}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain').replace(/\s*\n\s*/g, ' ');
          document.execCommand('insertText', false, text);
        }}
      />
      {empty && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 opacity-40"
          style={{ left: INDENT }}
        >
          {placeholder}
        </span>
      )}
    </div>
  );
}
