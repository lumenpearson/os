import { cx, useElementSize } from '@lumen/ui';
import type { ChangeEvent, RefObject } from 'react';
import { MarkdownView } from './MarkdownView';
import type { ViewMode } from './notes';

/** Under this the split view stacks instead of sitting side by side. */
export const SPLIT_STACK_WIDTH = 620;

export interface NoteEditorProps {
  /** The note without its front matter: what the writer sees and edits. */
  body: string;
  /** Line the body starts on in the file, so preview lines address the file. */
  bodyLine: number;
  view: ViewMode;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (body: string) => void;
  onBlur: () => void;
  onToggleTask: (line: number) => void;
}

/** The right pane: the Markdown source, its rendering, or both. */
export function NoteEditor({
  body,
  bodyLine,
  view,
  textareaRef,
  onChange,
  onBlur,
  onToggleTask,
}: NoteEditorProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const stacked = view === 'split' && size.width > 0 && size.width < SPLIT_STACK_WIDTH;

  return (
    <div
      ref={ref}
      className={cx('flex min-h-0 min-w-0 flex-1 bg-surface', stacked ? 'flex-col' : 'flex-row')}
    >
      {view !== 'preview' && (
        <textarea
          ref={textareaRef}
          value={body}
          spellCheck
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          aria-label="Note text"
          placeholder="Write in Markdown."
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          onBlur={onBlur}
          className={cx(
            'lumen-scroll min-h-0 min-w-0 flex-1 resize-none border-0 bg-transparent px-5 py-4',
            // deslop-ignore-next-line 34 — Markdown source is code; the rendered half beside it is not.
            'mono text-base leading-6 text-ink outline-none placeholder:text-ink-3',
          )}
          style={{ tabSize: 2, caretColor: 'var(--lumen-accent)' }}
        />
      )}
      {view === 'split' && (
        <div aria-hidden className={cx('shrink-0 bg-rule', stacked ? 'h-px' : 'w-px')} />
      )}
      {view !== 'edit' && (
        <MarkdownView
          source={body}
          lineOffset={bodyLine}
          onToggleTask={onToggleTask}
          className="lumen-scroll min-h-0 min-w-0 flex-1 bg-canvas"
        />
      )}
    </div>
  );
}
