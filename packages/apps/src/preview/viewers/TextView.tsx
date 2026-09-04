import { cx } from '@lumen/ui';
import { useMemo } from 'react';
import { renderMarkdown } from '../../editor/markdown';

export interface TextViewProps {
  text: string;
  /** Markdown is rendered; everything else is shown as it was written. */
  markdown?: boolean;
  /** Characters cut from the end of a very large file. */
  dropped?: number;
  /** The file name: the accessible name of the reading area. */
  name: string;
}

/**
 * Typography for the rendered Markdown tree. The renderer emits plain
 * elements — there is no HTML path in or out — so the look lives here.
 */
const PROSE = [
  'text-base leading-6 text-ink',
  '[&>*:first-child]:mt-0',
  '[&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:tracking-tight',
  '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-md [&_h2]:font-semibold',
  '[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold',
  '[&_h4]:mt-4 [&_h4]:mb-1.5 [&_h4]:font-medium [&_h5]:font-medium [&_h6]:font-medium',
  '[&_p]:my-2',
  '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_code]:rounded-xs [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm',
  '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-rule [&_pre]:bg-surface-2 [&_pre]:p-3 [&_pre]:text-sm',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-rule-strong [&_blockquote]:pl-3 [&_blockquote]:text-ink-2',
  '[&_hr]:my-5 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-rule',
  '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
  '[&_th]:border [&_th]:border-rule [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium',
  '[&_td]:border [&_td]:border-rule [&_td]:px-2 [&_td]:py-1 [&_td]:tabular-nums',
].join(' ');

/** Read-only text: plain files and source as written, Markdown rendered. */
export function TextView({ text, markdown, dropped = 0, name }: TextViewProps) {
  const rendered = useMemo(() => (markdown ? renderMarkdown(text) : null), [markdown, text]);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region needs the keyboard to scroll it
        tabIndex={0}
        role="document"
        aria-label={name}
        className={cx('lumen-scroll min-h-0 flex-1 lumen-focus focus-visible:-outline-offset-2')}
      >
        {rendered ? (
          <div className={cx('mx-auto max-w-2xl px-6 py-5', PROSE)}>{rendered}</div>
        ) : (
          <pre className="min-w-0 px-4 py-3 text-sm leading-5 whitespace-pre-wrap text-ink">
            {text}
          </pre>
        )}
      </div>
      {dropped > 0 && <Truncation dropped={dropped} />}
    </div>
  );
}

export function Truncation({ dropped }: { dropped: number }) {
  return (
    <p className="mono shrink-0 border-t border-rule bg-canvas px-4 py-1.5 text-xs text-ink-3">
      <span className="tabular-nums">{dropped.toLocaleString()}</span> more characters in the file
      than this window shows.
    </p>
  );
}
