/**
 * Tokenizer, parser and word expansion for the Lumen shell (`lsh`).
 *
 * Parsing is synchronous and pure: a source string becomes a list of
 * statements, each a pipeline of commands whose words are kept as *parts*
 * (literal text, bare text, `$VAR`, `$(…)`, `~`). Expansion is a separate
 * async step so command substitution and globbing can consult the executor
 * and the file system through callbacks.
 */

export type WordPart =
  /** Quoted or escaped text: never expanded, never globbed. */
  | { kind: 'lit'; value: string }
  /** Bare text: may contain `*` and `?` glob characters. */
  | { kind: 'raw'; value: string }
  /** `$NAME`, `${NAME}` or `$?`. Unquoted values are split into fields. */
  | { kind: 'var'; name: string; quoted: boolean }
  /** `$(command)`. Unquoted output is split into fields. */
  | { kind: 'subst'; source: string; quoted: boolean }
  /** A bare `~` at the start of a word. */
  | { kind: 'home' };

export interface WordAst {
  parts: WordPart[];
}

export type RedirectOp = '>' | '>>' | '<';

export interface RedirectAst {
  op: RedirectOp;
  target: WordAst;
}

export interface CommandAst {
  words: WordAst[];
  redirects: RedirectAst[];
}

export type RunCondition = 'always' | 'if-success' | 'if-failure';

export interface Statement {
  pipeline: CommandAst[];
  /** How this statement is joined to the previous one: `;`, `&&` or `||`. */
  run: RunCondition;
}

export type Operator = '|' | ';' | '&&' | '||' | '>' | '>>' | '<' | '\n';

export type Token = { type: 'word'; word: WordAst } | { type: 'op'; op: Operator };

export class ShellSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShellSyntaxError';
  }
}

const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_]/;

// ── tokenizer ────────────────────────────────────────────────────────────

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let parts: WordPart[] = [];
  let raw = '';
  let inWord = false;

  const flushRaw = () => {
    if (raw) {
      parts.push({ kind: 'raw', value: raw });
      raw = '';
    }
  };
  const pushPart = (part: WordPart) => {
    flushRaw();
    const last = parts[parts.length - 1];
    if (part.kind === 'lit' && last?.kind === 'lit') last.value += part.value;
    else parts.push(part);
    inWord = true;
  };
  const endWord = () => {
    flushRaw();
    if (inWord) tokens.push({ type: 'word', word: { parts } });
    parts = [];
    inWord = false;
  };
  const pushOp = (op: Operator) => {
    endWord();
    tokens.push({ type: 'op', op });
  };

  let i = 0;
  while (i < source.length) {
    const c = source.charAt(i);

    if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
      i++;
      continue;
    }
    if (c === '\n') {
      pushOp('\n');
      i++;
      continue;
    }
    if (c === '#' && !inWord && raw === '') {
      while (i < source.length && source.charAt(i) !== '\n') i++;
      continue;
    }
    if (c === "'") {
      const end = source.indexOf("'", i + 1);
      if (end < 0) throw new ShellSyntaxError('unterminated single quote');
      pushPart({ kind: 'lit', value: source.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (c === '"') {
      i = readDoubleQuoted(source, i + 1, pushPart);
      continue;
    }
    if (c === '\\') {
      const next = source.charAt(i + 1);
      if (next === '') throw new ShellSyntaxError('trailing backslash');
      if (next !== '\n') pushPart({ kind: 'lit', value: next });
      i += 2;
      continue;
    }
    if (c === '$') {
      const read = readDollar(source, i, false);
      if (read) {
        pushPart(read.part);
        i = read.next;
        continue;
      }
    }
    if (c === '~' && !inWord && raw === '') {
      const next = source.charAt(i + 1);
      if (next === '' || next === '/' || isWordBoundary(next)) {
        pushPart({ kind: 'home' });
        i++;
        continue;
      }
    }
    if (c === '|') {
      if (source.charAt(i + 1) === '|') {
        pushOp('||');
        i += 2;
      } else {
        pushOp('|');
        i++;
      }
      continue;
    }
    if (c === '&') {
      if (source.charAt(i + 1) !== '&') {
        throw new ShellSyntaxError("background jobs ('&') are not supported");
      }
      pushOp('&&');
      i += 2;
      continue;
    }
    if (c === ';') {
      pushOp(';');
      i++;
      continue;
    }
    if (c === '>') {
      if (source.charAt(i + 1) === '>') {
        pushOp('>>');
        i += 2;
      } else {
        pushOp('>');
        i++;
      }
      continue;
    }
    if (c === '<') {
      pushOp('<');
      i++;
      continue;
    }

    raw += c;
    inWord = true;
    i++;
  }
  endWord();
  return tokens;
}

function isWordBoundary(c: string): boolean {
  return (
    c === ' ' ||
    c === '\t' ||
    c === '\n' ||
    c === '|' ||
    c === ';' ||
    c === '&' ||
    c === '>' ||
    c === '<'
  );
}

function readDoubleQuoted(source: string, start: number, push: (p: WordPart) => void): number {
  let i = start;
  let lit = '';
  // An empty pair of quotes still produces a word.
  let produced = false;
  const flush = () => {
    push({ kind: 'lit', value: lit });
    lit = '';
    produced = true;
  };
  while (i < source.length) {
    const c = source.charAt(i);
    if (c === '"') {
      if (lit || !produced) flush();
      return i + 1;
    }
    if (c === '\\') {
      const next = source.charAt(i + 1);
      if (next === '"' || next === '\\' || next === '$' || next === '`') {
        lit += next;
        i += 2;
      } else if (next === '\n') {
        i += 2;
      } else {
        lit += c;
        i++;
      }
      continue;
    }
    if (c === '$') {
      const read = readDollar(source, i, true);
      if (read) {
        if (lit) flush();
        push(read.part);
        produced = true;
        i = read.next;
        continue;
      }
    }
    lit += c;
    i++;
  }
  throw new ShellSyntaxError('unterminated double quote');
}

function readDollar(
  source: string,
  i: number,
  quoted: boolean,
): { part: WordPart; next: number } | null {
  const next = source.charAt(i + 1);
  if (next === '(') {
    const end = matchParen(source, i + 1);
    return { part: { kind: 'subst', source: source.slice(i + 2, end), quoted }, next: end + 1 };
  }
  if (next === '{') {
    const end = source.indexOf('}', i + 2);
    if (end < 0) throw new ShellSyntaxError("missing '}' in variable expansion");
    const name = source.slice(i + 2, end);
    if (!/^([A-Za-z_][A-Za-z0-9_]*|\?)$/.test(name))
      throw new ShellSyntaxError(`bad substitution: \${${name}}`);
    return { part: { kind: 'var', name, quoted }, next: end + 1 };
  }
  if (next === '?') return { part: { kind: 'var', name: '?', quoted }, next: i + 2 };
  if (NAME_START.test(next)) {
    let j = i + 1;
    while (j < source.length && NAME_CHAR.test(source.charAt(j))) j++;
    return { part: { kind: 'var', name: source.slice(i + 1, j), quoted }, next: j };
  }
  return null;
}

/** Index of the `)` that closes the `(` at `open`, honouring nesting and quotes. */
function matchParen(source: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < source.length; i++) {
    const c = source.charAt(i);
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new ShellSyntaxError("missing ')' in command substitution");
}

// ── parser ───────────────────────────────────────────────────────────────

export function parseScript(source: string): Statement[] {
  const tokens = tokenize(source);
  const statements: Statement[] = [];
  let run: RunCondition = 'always';
  let pipeline: CommandAst[] = [];
  let cmd: CommandAst = { words: [], redirects: [] };
  const cmdEmpty = () => cmd.words.length === 0 && cmd.redirects.length === 0;

  const closePipeline = (op: string) => {
    if (cmdEmpty()) {
      if (pipeline.length > 0)
        throw new ShellSyntaxError(`syntax error near unexpected token '${op}'`);
      return false;
    }
    pipeline.push(cmd);
    statements.push({ pipeline, run });
    pipeline = [];
    cmd = { words: [], redirects: [] };
    return true;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as Token;
    if (token.type === 'word') {
      cmd.words.push(token.word);
      continue;
    }
    switch (token.op) {
      case '>':
      case '>>':
      case '<': {
        const next = tokens[i + 1];
        if (!next || next.type !== 'word')
          throw new ShellSyntaxError(`expected a file name after '${token.op}'`);
        cmd.redirects.push({ op: token.op, target: next.word });
        i++;
        break;
      }
      case '|':
        if (cmdEmpty()) throw new ShellSyntaxError("syntax error near unexpected token '|'");
        pipeline.push(cmd);
        cmd = { words: [], redirects: [] };
        while (tokens[i + 1]?.type === 'op' && (tokens[i + 1] as { op: Operator }).op === '\n') i++;
        break;
      case ';':
      case '\n':
        closePipeline(token.op === '\n' ? 'newline' : ';');
        run = 'always';
        break;
      case '&&':
      case '||':
        if (!closePipeline(token.op))
          throw new ShellSyntaxError(`syntax error near unexpected token '${token.op}'`);
        run = token.op === '&&' ? 'if-success' : 'if-failure';
        while (tokens[i + 1]?.type === 'op' && (tokens[i + 1] as { op: Operator }).op === '\n') i++;
        break;
    }
  }
  if (!cmdEmpty()) {
    pipeline.push(cmd);
    statements.push({ pipeline, run });
  } else if (pipeline.length > 0) {
    throw new ShellSyntaxError("syntax error: unexpected end of input after '|'");
  } else if (run !== 'always') {
    throw new ShellSyntaxError(
      `syntax error: unexpected end of input after '${run === 'if-success' ? '&&' : '||'}'`,
    );
  }
  return statements;
}

/** Parse a fragment that must be plain words (alias values). */
export function parseWords(source: string): WordAst[] {
  const out: WordAst[] = [];
  for (const t of tokenize(source)) {
    if (t.type === 'op')
      throw new ShellSyntaxError(`unexpected '${t.op === '\n' ? 'newline' : t.op}' in alias`);
    out.push(t.word);
  }
  return out;
}

/** The plain text of a word if it has no expansions (used for alias lookup). */
export function literalWord(word: WordAst): string | null {
  let text = '';
  for (const p of word.parts) {
    if (p.kind === 'lit' || p.kind === 'raw') text += p.value;
    else return null;
  }
  return text;
}

// ── expansion ────────────────────────────────────────────────────────────

export interface ExpandContext {
  /** Value of a variable, or undefined when unset. */
  lookup: (name: string) => string | undefined;
  home: string;
  cwd: string;
  /** Names inside a directory, for globbing. Resolve errors to an empty list. */
  listDir: (path: string) => Promise<string[]>;
  /** Run a command and return its standard output. */
  substitute: (source: string) => Promise<string>;
}

export interface ExpandedCommand {
  args: string[];
  redirects: Array<{ op: RedirectOp; target: string }>;
}

interface Segment {
  text: string;
  /** Glob characters inside this segment are active. */
  glob: boolean;
}

export async function expandCommand(cmd: CommandAst, ctx: ExpandContext): Promise<ExpandedCommand> {
  const args: string[] = [];
  for (const w of cmd.words) args.push(...(await expandWord(w, ctx)));
  const redirects: ExpandedCommand['redirects'] = [];
  for (const r of cmd.redirects) {
    const fields = await expandWord(r.target, ctx);
    if (fields.length !== 1) throw new ShellSyntaxError(`ambiguous redirect near '${r.op}'`);
    redirects.push({ op: r.op, target: fields[0] as string });
  }
  return { args, redirects };
}

/** Expand a word into zero or more fields. */
export async function expandWord(word: WordAst, ctx: ExpandContext): Promise<string[]> {
  const fields: Segment[][] = [];
  let current: Segment[] = [];
  let started = false;
  const push = (seg: Segment) => {
    current.push(seg);
    started = true;
  };
  const splitInto = (value: string) => {
    const pieces = value.split(/[ \t\n]+/);
    // "a b" → a joins the current field, b starts a new one.
    pieces.forEach((piece, idx) => {
      if (idx > 0) {
        if (started) fields.push(current);
        current = [];
        started = false;
      }
      if (piece) push({ text: piece, glob: false });
    });
  };

  for (const part of word.parts) {
    switch (part.kind) {
      case 'lit':
        push({ text: part.value, glob: false });
        break;
      case 'raw':
        push({ text: part.value, glob: true });
        break;
      case 'home':
        push({ text: ctx.home, glob: false });
        break;
      case 'var': {
        const value = ctx.lookup(part.name) ?? '';
        if (part.quoted) push({ text: value, glob: false });
        else splitInto(value);
        break;
      }
      case 'subst': {
        const value = (await ctx.substitute(part.source)).replace(/\n+$/, '');
        if (part.quoted) push({ text: value, glob: false });
        else splitInto(value);
        break;
      }
    }
  }
  if (started) fields.push(current);

  const out: string[] = [];
  for (const field of fields) {
    const hasGlob = field.some((s) => s.glob && /[*?]/.test(s.text));
    if (!hasGlob) {
      out.push(field.map((s) => s.text).join(''));
      continue;
    }
    const pattern = field.map((s) => (s.glob ? s.text : escapeGlob(s.text))).join('');
    const matches = await expandGlob(pattern, ctx);
    if (matches.length > 0) out.push(...matches);
    else out.push(field.map((s) => s.text).join(''));
  }
  return out;
}

function escapeGlob(text: string): string {
  return text.replace(/[*?\\]/g, (c) => `\\${c}`);
}

/** Expand a pattern whose last path segment holds the wildcards. */
async function expandGlob(pattern: string, ctx: ExpandContext): Promise<string[]> {
  const slash = pattern.lastIndexOf('/');
  const prefix = slash >= 0 ? pattern.slice(0, slash + 1) : '';
  const base = slash >= 0 ? pattern.slice(slash + 1) : pattern;
  if (!/[*?]/.test(base)) return [];
  const dirText = unescapeGlob(prefix) || '.';
  const dir = dirText.startsWith('/') ? dirText : `${ctx.cwd.replace(/\/$/, '')}/${dirText}`;
  const names = await ctx.listDir(dir);
  const re = globToRegExp(base);
  const wantHidden = base.startsWith('.');
  return names
    .filter((n) => (wantHidden || !n.startsWith('.')) && re.test(n))
    .sort((a, b) => collator.compare(a, b))
    .map((n) => unescapeGlob(prefix) + n);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function unescapeGlob(text: string): string {
  return text.replace(/\\([*?\\])/g, '$1');
}

/** Convert a shell glob (`*`, `?`, `\` escapes) into an anchored regular expression. */
export function globToRegExp(glob: string): RegExp {
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob.charAt(i);
    if (c === '\\' && i + 1 < glob.length) {
      re += escapeRegExp(glob.charAt(i + 1));
      i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += escapeRegExp(c);
  }
  return new RegExp(`${re}$`);
}

function escapeRegExp(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
