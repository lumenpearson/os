// deslop-ignore-file 34 — the only monospace here is on <code> and <pre>, which is the rule, not a violation of it.
import { useMemo } from 'react';
import { renderMarkdown } from './markdown';

/**
 * Typography for the rendered tree. The renderer emits plain elements, so the
 * look lives here rather than in the parser.
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
  '[&_code]:rounded-xs [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm',
  '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-rule [&_pre]:bg-surface-2 [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-sm',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-rule-strong [&_blockquote]:pl-3 [&_blockquote]:text-ink-2',
  '[&_hr]:my-5 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-rule',
  '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
  '[&_th]:border [&_th]:border-rule [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium',
  '[&_td]:border [&_td]:border-rule [&_td]:px-2 [&_td]:py-1 [&_td]:tabular-nums',
  // Every other body row takes a faint wash, so the eye can carry a value
  // across a wide table without losing its line.
  '[&_tbody_tr:nth-child(even)]:bg-stripe',
].join(' ');

/** The read-only half of the split view. */
export function MarkdownPreview({ source }: { source: string }) {
  const content = useMemo(() => renderMarkdown(source), [source]);
  return (
    <div className="lumen-scroll h-full min-w-0 border-l border-rule bg-canvas">
      <div className={`mx-auto max-w-2xl px-6 py-5 ${PROSE}`}>{content}</div>
    </div>
  );
}
