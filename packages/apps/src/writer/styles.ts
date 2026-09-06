/**
 * The page itself: a sheet of paper on the canvas. These rules style content
 * the editor creates at runtime (headings, lists, quotes, code), which
 * utility classes cannot reach, so they ship as one scoped stylesheet.
 *
 * deslop-ignore-file 09 34 — the underline here is a link and the mono is a
 * code block; both are document content the writer asked for.
 */
import type { HighlightNames } from './find';

const PAGE_CSS = `
.writer-scroll { container-type: inline-size; }
.writer-page {
  --writer-pad: 64px;
  position: relative;
  min-height: 360px;
  padding: var(--writer-pad);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.6;
  color: var(--lumen-ink);
  user-select: text;
  -webkit-user-select: text;
}
@container (max-width: 640px) { .writer-page { --writer-pad: 28px; } }
.writer-page:focus { outline: none; }
.writer-page[data-empty="true"]::after {
  content: "Start writing";
  position: absolute;
  top: var(--writer-pad);
  left: var(--writer-pad);
  color: var(--lumen-ink-3);
  pointer-events: none;
}
.writer-page > :first-child { margin-top: 0; }
.writer-page > :last-child { margin-bottom: 0; }
.writer-page p { margin: 0 0 12px; }
.writer-page h1 { font-size: 28px; line-height: 34px; font-weight: 600; letter-spacing: -0.01em; margin: 28px 0 12px; }
.writer-page h2 { font-size: 20px; line-height: 26px; font-weight: 600; margin: 24px 0 10px; }
.writer-page h3 { font-size: 16px; line-height: 22px; font-weight: 600; margin: 20px 0 8px; }
.writer-page ul, .writer-page ol { margin: 0 0 12px; padding-left: 26px; }
.writer-page li { margin: 3px 0; }
.writer-page blockquote {
  margin: 16px 0;
  padding-left: 16px;
  border-left: 2px solid var(--lumen-rule-strong);
  color: var(--lumen-ink-2);
}
.writer-page pre {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.55;
  background: var(--lumen-surface-2);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  margin: 16px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.writer-page code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: var(--lumen-surface-2);
  border-radius: var(--radius-xs);
  padding: 1px 4px;
}
.writer-page pre code { background: none; padding: 0; font-size: inherit; }
.writer-page a { color: var(--lumen-accent); text-decoration: underline; text-underline-offset: 2px; }
.writer-page hr { border: 0; border-top: 1px solid var(--lumen-rule-strong); margin: 24px 0; }
`;

/** The page rules plus this window's two find highlights. */
export function writerCss(names: HighlightNames): string {
  return `${PAGE_CSS}
::highlight(${names.all}) { background-color: var(--lumen-selection); }
::highlight(${names.current}) { background-color: var(--lumen-accent); color: var(--lumen-accent-ink); }
`;
}
