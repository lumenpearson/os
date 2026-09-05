/**
 * Regular expressions: build one without letting a bad pattern throw into the
 * UI, list every match with its groups, and preview a replacement.
 *
 * A pattern typed one character at a time is a pattern that is wrong most of
 * the time, so `buildRegex` never throws and the message it returns is the
 * engine's reason without the "Invalid regular expression: /…/:" wrapper.
 *
 * The scan is capped three ways — subject length, match count and elapsed time
 * — because the engine cannot be interrupted once `exec` is running. The caps
 * cannot save a single catastrophically backtracking `exec`, but they do stop
 * the far commoner case of a pattern that matches everywhere from filling the
 * window with a hundred thousand rows. Whatever cap was hit is reported, so
 * the count on screen is never quietly wrong.
 */

export const FLAGS = ['g', 'i', 'm', 's', 'u', 'y'] as const;

export type Flag = (typeof FLAGS)[number];

export const FLAG_LABEL: Record<Flag, string> = {
  g: 'global',
  i: 'ignore case',
  m: 'multiline',
  s: 'dot matches newline',
  u: 'unicode',
  y: 'sticky',
};

export type RegexBuild = { ok: true; regex: RegExp } | { ok: false; error: string };

/** The engine's reason, without the wrapper that repeats the pattern back. */
export function cleanRegexError(message: string): string {
  const marker = 'Invalid regular expression: ';
  if (!message.startsWith(marker)) return message;
  const rest = message.slice(marker.length);
  const colon = rest.indexOf(': ');
  return colon === -1 ? rest : rest.slice(colon + 2);
}

function checkFlags(flags: string): string | null {
  const seen = new Set<string>();
  for (const flag of flags) {
    if (!(FLAGS as readonly string[]).includes(flag)) return `Unknown flag '${flag}'`;
    if (seen.has(flag)) return `Repeated flag '${flag}'`;
    seen.add(flag);
  }
  return null;
}

/** Compile a pattern. Any failure comes back as a message, never as a throw. */
export function buildRegex(pattern: string, flags: string): RegexBuild {
  const flagError = checkFlags(flags);
  if (flagError) return { ok: false, error: flagError };
  try {
    return { ok: true, regex: new RegExp(pattern, flags) };
  } catch (error) {
    return {
      ok: false,
      error: cleanRegexError(error instanceof Error ? error.message : 'Invalid pattern'),
    };
  }
}

/**
 * The name of every capturing group, in order, so a match can be labelled
 * without asking the engine. Non-capturing groups, lookarounds and anything
 * inside a character class or behind a backslash are skipped.
 */
export function captureNames(pattern: string): Array<string | null> {
  const names: Array<string | null> = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern.charAt(i);
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      continue;
    }
    if (ch !== '(') continue;
    if (pattern.charAt(i + 1) !== '?') {
      names.push(null);
      continue;
    }
    if (pattern.charAt(i + 2) === '<' && !'=!'.includes(pattern.charAt(i + 3))) {
      const close = pattern.indexOf('>', i + 3);
      if (close === -1) continue;
      names.push(pattern.slice(i + 3, close));
    }
  }
  return names;
}

export interface RegexGroup {
  /** 1-based capture number. */
  number: number;
  name: string | null;
  /** `null` when the group did not take part in the match. */
  value: string | null;
  /** Start offset in the subject, or `null` when the group did not participate. */
  index: number | null;
}

export interface RegexMatch {
  index: number;
  length: number;
  text: string;
  groups: RegexGroup[];
}

export interface MatchLimits {
  /** Characters of the subject examined. */
  maxSubject: number;
  maxMatches: number;
  /** Wall-clock budget for the whole scan. */
  timeBudgetMs: number;
}

export const DEFAULT_LIMITS: MatchLimits = {
  maxSubject: 100_000,
  maxMatches: 500,
  timeBudgetMs: 250,
};

/** Which cap ended the scan, if any. */
export type Cap = null | 'subject' | 'matches' | 'time';

export interface MatchRun {
  matches: RegexMatch[];
  cap: Cap;
  /** Characters of the subject that were scanned. */
  scanned: number;
  /** True when the pattern has neither `g` nor `y`, so only the first match counts. */
  single: boolean;
}

export type RegexSearch = { ok: true; run: MatchRun } | { ok: false; error: string };

export interface ScanOptions {
  limits?: Partial<MatchLimits>;
  /** Injected so the time cap is testable. */
  now?: () => number;
}

const withIndices = (flags: string, global: boolean) =>
  [...new Set([...flags, 'd', ...(global ? ['g'] : [])])].join('');

/** Explain a cap in one line, for the note under the field. */
export function capNote(run: MatchRun, limits: MatchLimits = DEFAULT_LIMITS): string | null {
  switch (run.cap) {
    case 'matches':
      return `Stopped at ${limits.maxMatches} matches.`;
    case 'subject':
      return `Stopped after ${limits.maxSubject.toLocaleString()} characters.`;
    case 'time':
      return `Stopped after ${limits.timeBudgetMs} ms.`;
    default:
      return null;
  }
}

/** Every match in the subject, with its groups. Capped, and it says so. */
export function findMatches(
  pattern: string,
  flags: string,
  subject: string,
  options: ScanOptions = {},
): RegexSearch {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const now = options.now ?? Date.now;
  const built = buildRegex(pattern, flags);
  if (!built.ok) return built;

  const single = !flags.includes('g') && !flags.includes('y');
  let cap: Cap = null;
  let text = subject;
  if (subject.length > limits.maxSubject) {
    text = subject.slice(0, limits.maxSubject);
    cap = 'subject';
  }

  const names = captureNames(pattern);
  const scanner = new RegExp(pattern, withIndices(flags, !single));
  const matches: RegexMatch[] = [];
  const started = now();

  for (;;) {
    const found = scanner.exec(text);
    if (!found) break;
    const indices = (found as RegExpExecArray & { indices?: Array<[number, number] | undefined> })
      .indices;
    matches.push({
      index: found.index,
      length: found[0].length,
      text: found[0],
      groups: found.slice(1).map((value, i) => ({
        number: i + 1,
        name: names[i] ?? null,
        value: value ?? null,
        index: indices?.[i + 1]?.[0] ?? null,
      })),
    });
    if (single) break;
    // A zero-length match leaves lastIndex where it is; step over it by hand
    // or the loop never ends.
    if (found[0].length === 0) scanner.lastIndex += 1;
    if (scanner.lastIndex > text.length) break;
    if (matches.length >= limits.maxMatches) {
      cap = 'matches';
      break;
    }
    if (now() - started > limits.timeBudgetMs) {
      cap = 'time';
      break;
    }
  }

  return { ok: true, run: { matches, cap, scanned: text.length, single } };
}

// ── replacement ───────────────────────────────────────────────────────────

const groupByNumber = (match: RegexMatch, n: number) =>
  match.groups.find((g) => g.number === n) ?? null;

/**
 * Expand `$1`, `$<name>`, `$&`, ``$` ``, `$'` and `$$` against one match.
 * A reference to a group the pattern does not have stays as literal text: a
 * typo in a replacement should be visible in the preview, not swallowed.
 */
export function expandReplacement(template: string, match: RegexMatch, subject: string): string {
  let out = '';
  for (let i = 0; i < template.length; i += 1) {
    const ch = template.charAt(i);
    if (ch !== '$') {
      out += ch;
      continue;
    }
    const next = template.charAt(i + 1);
    if (next === '$') {
      out += '$';
      i += 1;
      continue;
    }
    if (next === '&') {
      out += match.text;
      i += 1;
      continue;
    }
    if (next === '`') {
      out += subject.slice(0, match.index);
      i += 1;
      continue;
    }
    if (next === "'") {
      out += subject.slice(match.index + match.length);
      i += 1;
      continue;
    }
    if (next === '<') {
      const close = template.indexOf('>', i + 2);
      const name = close === -1 ? null : template.slice(i + 2, close);
      const group = name === null ? null : (match.groups.find((g) => g.name === name) ?? null);
      if (!group) {
        out += '$';
        continue;
      }
      out += group.value ?? '';
      i = close;
      continue;
    }
    if (next >= '0' && next <= '9') {
      const two = template.slice(i + 1, i + 3);
      if (/^\d\d$/.test(two) && groupByNumber(match, Number(two))) {
        out += groupByNumber(match, Number(two))?.value ?? '';
        i += 2;
        continue;
      }
      const one = groupByNumber(match, Number(next));
      if (one) {
        out += one.value ?? '';
        i += 1;
        continue;
      }
    }
    out += '$';
  }
  return out;
}

export interface ReplaceRun {
  text: string;
  count: number;
  cap: Cap;
}

export type RegexReplace = { ok: true; run: ReplaceRun } | { ok: false; error: string };

/**
 * The subject with every match replaced. Text past the scan cap is copied
 * through untouched, so the preview is still the whole document.
 */
export function replaceMatches(
  pattern: string,
  flags: string,
  subject: string,
  replacement: string,
  options: ScanOptions = {},
): RegexReplace {
  const search = findMatches(pattern, flags, subject, options);
  if (!search.ok) return search;
  const { matches, cap } = search.run;
  let out = '';
  let last = 0;
  for (const match of matches) {
    out += subject.slice(last, match.index);
    out += expandReplacement(replacement, match, subject);
    last = match.index + match.length;
  }
  out += subject.slice(last);
  return { ok: true, run: { text: out, count: matches.length, cap } };
}
