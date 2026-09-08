/**
 * The Format menu, as pure text edits. Each command takes the textarea's value
 * and selection and returns the new value with the selection the caret should
 * end up with, so the component only has to write both back.
 */

export interface Selection {
  start: number;
  end: number;
}

export interface EditResult {
  text: string;
  selection: Selection;
}

export type InlineFormat = 'bold' | 'italic' | 'code' | 'strike';

export const MARKERS: Record<InlineFormat, string> = {
  bold: '**',
  italic: '*',
  code: '`',
  strike: '~~',
};

/** A `*` next to another `*` belongs to a bold run, not an italic one. */
function isItalicRun(text: string, start: number, end: number): boolean {
  return text.slice(Math.max(0, start - 2), start) !== '**' && text.slice(end + 1, end + 2) !== '*';
}

function surrounds(text: string, sel: Selection, marker: string): boolean {
  const before = text.slice(Math.max(0, sel.start - marker.length), sel.start);
  const after = text.slice(sel.end, sel.end + marker.length);
  if (before !== marker || after !== marker) return false;
  return marker === '*' ? isItalicRun(text, sel.start, sel.end) : true;
}

function selfWraps(text: string, sel: Selection, marker: string): boolean {
  const inner = text.slice(sel.start, sel.end);
  if (inner.length < marker.length * 2) return false;
  if (!inner.startsWith(marker) || !inner.endsWith(marker)) return false;
  return marker === '*' ? !inner.startsWith('**') && !inner.endsWith('**') : true;
}

function splice(text: string, start: number, end: number, insert: string): string {
  return text.slice(0, start) + insert + text.slice(end);
}

/**
 * Wrap the selection in the format's markers, or unwrap it when it is already
 * wrapped — whether the markers are inside the selection or just outside it.
 * With nothing selected, the markers are inserted and the caret lands between.
 */
export function toggleInline(text: string, sel: Selection, format: InlineFormat): EditResult {
  const marker = MARKERS[format];
  const width = marker.length;
  const range = normalize(sel);

  if (selfWraps(text, range, marker)) {
    const inner = text.slice(range.start + width, range.end - width);
    return {
      text: splice(text, range.start, range.end, inner),
      selection: { start: range.start, end: range.start + inner.length },
    };
  }

  if (surrounds(text, range, marker)) {
    const inner = text.slice(range.start, range.end);
    return {
      text: splice(text, range.start - width, range.end + width, inner),
      selection: { start: range.start - width, end: range.end - width },
    };
  }

  if (range.start === range.end) {
    return {
      text: splice(text, range.start, range.start, marker + marker),
      selection: { start: range.start + width, end: range.start + width },
    };
  }

  // Keep whitespace at the edges of the selection outside the markers, so
  // selecting a word plus its trailing space still produces valid Markdown.
  const selected = text.slice(range.start, range.end);
  const lead = /^\s*/.exec(selected)?.[0].length ?? 0;
  const trail = /\s*$/.exec(selected)?.[0].length ?? 0;
  const core = selected.slice(lead, selected.length - trail);
  if (!core) {
    return {
      text: splice(text, range.start, range.end, marker + selected + marker),
      selection: { start: range.start + width, end: range.end + width },
    };
  }
  const rebuilt =
    selected.slice(0, lead) + marker + core + marker + selected.slice(selected.length - trail);
  const start = range.start + lead + width;
  return {
    text: splice(text, range.start, range.end, rebuilt),
    selection: { start, end: start + core.length },
  };
}

const URL_LIKE = /^(https?:\/\/|mailto:)\S+$/i;
const URL_PLACEHOLDER = 'url';
const LABEL_PLACEHOLDER = 'link';

/**
 * `[label](url)`. A selected URL becomes the target and the caret goes to the
 * label; anything else becomes the label and the caret goes to the target.
 */
export function insertLink(text: string, sel: Selection): EditResult {
  const range = normalize(sel);
  const selected = text.slice(range.start, range.end).trim();

  if (URL_LIKE.test(selected)) {
    const inserted = `[${LABEL_PLACEHOLDER}](${selected})`;
    return {
      text: splice(text, range.start, range.end, inserted),
      selection: { start: range.start + 1, end: range.start + 1 + LABEL_PLACEHOLDER.length },
    };
  }

  const label = selected || LABEL_PLACEHOLDER;
  const inserted = `[${label}](${URL_PLACEHOLDER})`;
  const start = range.start + label.length + 3;
  return {
    text: splice(text, range.start, range.end, inserted),
    selection: { start, end: start + URL_PLACEHOLDER.length },
  };
}

// ── line commands ─────────────────────────────────────────────────────────

interface LineSpan {
  /** Offset of the first character of the first line. */
  from: number;
  /** Offset of the last character of the last line. */
  to: number;
  lines: string[];
}

function normalize(sel: Selection): Selection {
  return sel.start <= sel.end ? sel : { start: sel.end, end: sel.start };
}

/** The whole lines a selection touches. */
export function lineSpan(text: string, sel: Selection): LineSpan {
  const range = normalize(sel);
  // `lastIndexOf` from position 0 would find a leading newline and put the
  // span on the second line, so the first line is handled on its own.
  const from = range.start === 0 ? 0 : text.lastIndexOf('\n', range.start - 1) + 1;
  const nextBreak = text.indexOf('\n', range.end);
  const to = nextBreak === -1 ? text.length : nextBreak;
  return { from, to, lines: text.slice(from, to).split('\n') };
}

function replaceLines(text: string, span: LineSpan, lines: string[]): EditResult {
  const body = lines.join('\n');
  return {
    text: splice(text, span.from, span.to, body),
    selection: { start: span.from, end: span.from + body.length },
  };
}

const HEADING_PREFIX = /^([ \t]*)(#{1,6})(?:[ \t]+|$)/;

/**
 * Set every touched line to a heading level, or to body text with level 0.
 * Asking for the level a line already has removes it, so the same menu item
 * turns a heading back into a paragraph.
 */
export function setHeading(text: string, sel: Selection, level: number): EditResult {
  const span = lineSpan(text, sel);
  const meaningful = span.lines.filter((line) => line.trim() !== '');
  const target = span.lines.some((line) => line.trim() !== '') ? meaningful : span.lines;
  const already =
    level > 0 &&
    target.length > 0 &&
    target.every((line) => (HEADING_PREFIX.exec(line)?.[2]?.length ?? 0) === level);
  const next = already ? 0 : level;

  const lines = span.lines.map((line) => {
    if (line.trim() === '' && span.lines.length > 1) return line;
    const indent = HEADING_PREFIX.exec(line)?.[1] ?? /^[ \t]*/.exec(line)?.[0] ?? '';
    const bare = line.replace(HEADING_PREFIX, '').trimStart();
    return next === 0 ? indent + bare : `${indent}${'#'.repeat(next)} ${bare}`;
  });
  return replaceLines(text, span, lines);
}

export type ListStyle = 'bullet' | 'number' | 'task';

const ANY_MARKER = /^([ \t]*)(?:[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d{1,9}[.)][ \t]+)/;
const BULLET_MARKER = /^[ \t]*[-*+][ \t]+/;
const TASK_MARKER = /^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/;
const NUMBER_MARKER = /^[ \t]*\d{1,9}[.)][ \t]+/;

function hasStyle(line: string, style: ListStyle): boolean {
  switch (style) {
    case 'task':
      return TASK_MARKER.test(line);
    case 'bullet':
      return BULLET_MARKER.test(line) && !TASK_MARKER.test(line);
    case 'number':
      return NUMBER_MARKER.test(line);
  }
}

/** Turn the touched lines into a list, or back into plain lines. */
export function toggleList(text: string, sel: Selection, style: ListStyle): EditResult {
  const span = lineSpan(text, sel);
  const meaningful = span.lines.filter((line) => line.trim() !== '');
  const target = meaningful.length > 0 ? meaningful : span.lines;
  const remove = target.every((line) => hasStyle(line, style));

  let counter = 0;
  const lines = span.lines.map((line) => {
    if (line.trim() === '' && span.lines.length > 1) return line;
    const indent = ANY_MARKER.exec(line)?.[1] ?? /^[ \t]*/.exec(line)?.[0] ?? '';
    // A line with no marker keeps its indent in `bare`, so trim it: the indent
    // is put back once, in front of the new marker.
    const bare = line.replace(ANY_MARKER, '').trimStart();
    if (remove) return indent + bare;
    counter += 1;
    const marker = style === 'number' ? `${counter}. ` : style === 'task' ? '- [ ] ' : '- ';
    return indent + marker + bare;
  });
  return replaceLines(text, span, lines);
}
