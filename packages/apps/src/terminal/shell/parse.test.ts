import { describe, expect, it } from 'vitest';
import {
  type ExpandContext,
  expandCommand,
  expandWord,
  globToRegExp,
  literalWord,
  parseScript,
  parseWords,
  ShellSyntaxError,
  tokenize,
  type WordAst,
} from './parse';

const ctx = (overrides: Partial<ExpandContext> = {}): ExpandContext => ({
  home: '/Users/ada',
  cwd: '/Users/ada/Projects',
  lookup: (n) => ({ NAME: 'Ada', EMPTY: '', LIST: 'a b c', '?': '0' })[n],
  listDir: async () => ['one.txt', 'two.txt', 'three.md', '.hidden', 'notes'],
  substitute: async (src) => (src === 'whoami' ? 'ada\n' : `[${src}]`),
  ...overrides,
});

/** Expand a single-word source string into fields. */
async function fields(source: string, overrides: Partial<ExpandContext> = {}): Promise<string[]> {
  const statements = parseScript(source);
  const cmd = statements[0]?.pipeline[0];
  if (!cmd) return [];
  const out: string[] = [];
  for (const w of cmd.words) out.push(...(await expandWord(w, ctx(overrides))));
  return out;
}

describe('tokenize', () => {
  it('splits on whitespace', () => {
    const tokens = tokenize('ls -l  /tmp');
    expect(tokens).toHaveLength(3);
    expect(tokens.every((t) => t.type === 'word')).toBe(true);
  });

  it('keeps quoted spans together', () => {
    const tokens = tokenize(`echo 'a b' "c d"`);
    expect(tokens).toHaveLength(3);
  });

  it('reads operators', () => {
    const ops = tokenize('a | b && c ; d > e >> f < g || h')
      .filter((t) => t.type === 'op')
      .map((t) => (t.type === 'op' ? t.op : ''));
    expect(ops).toEqual(['|', '&&', ';', '>', '>>', '<', '||']);
  });

  it('drops comments but not # inside a word or quotes', () => {
    expect(tokenize('ls # a comment')).toHaveLength(1);
    expect(literalWord((tokenize('a#b')[0] as { word: WordAst }).word)).toBe('a#b');
    expect(literalWord((tokenize(`'# not a comment'`)[0] as { word: WordAst }).word)).toBe(
      '# not a comment',
    );
  });

  it('rejects unterminated quotes and a lone &', () => {
    expect(() => tokenize(`echo 'x`)).toThrow(ShellSyntaxError);
    expect(() => tokenize('echo "x')).toThrow(ShellSyntaxError);
    expect(() => tokenize('sleep 5 &')).toThrow(ShellSyntaxError);
  });
});

describe('parseScript', () => {
  it('builds a pipeline', () => {
    const [statement] = parseScript('cat a | grep b | wc -l');
    expect(statement?.pipeline).toHaveLength(3);
  });

  it('records how statements are joined', () => {
    const statements = parseScript('a; b && c || d');
    expect(statements.map((s) => s.run)).toEqual(['always', 'always', 'if-success', 'if-failure']);
  });

  it('treats newlines as separators and allows blank lines', () => {
    expect(parseScript('a\n\nb\n')).toHaveLength(2);
  });

  it('attaches redirects to their command', () => {
    const [statement] = parseScript('grep x < in.txt >> out.txt');
    const cmd = statement?.pipeline[0];
    expect(cmd?.redirects.map((r) => r.op)).toEqual(['<', '>>']);
    expect(cmd?.words).toHaveLength(2);
  });

  it('continues a pipeline or && across a newline', () => {
    expect(parseScript('a |\n b')).toHaveLength(1);
    expect(parseScript('a &&\n b')).toHaveLength(2);
  });

  it('rejects dangling operators', () => {
    expect(() => parseScript('| ls')).toThrow(ShellSyntaxError);
    expect(() => parseScript('ls |')).toThrow(ShellSyntaxError);
    expect(() => parseScript('ls &&')).toThrow(ShellSyntaxError);
    expect(() => parseScript('ls >')).toThrow(ShellSyntaxError);
  });
});

describe('expansion', () => {
  it('expands a bare and a braced variable', async () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax, not a JS template
    const source = 'echo $NAME ${NAME}s';
    expect(await fields(source)).toEqual(['echo', 'Ada', 'Adas']);
  });

  it('drops unset variables but keeps quoted empties', async () => {
    expect(await fields('echo $MISSING')).toEqual(['echo']);
    expect(await fields('echo "$MISSING"')).toEqual(['echo', '']);
  });

  it('splits unquoted values into fields and keeps quoted ones whole', async () => {
    expect(await fields('echo $LIST')).toEqual(['echo', 'a', 'b', 'c']);
    expect(await fields('echo "$LIST"')).toEqual(['echo', 'a b c']);
  });

  it('does not expand inside single quotes', async () => {
    expect(await fields(`echo '$NAME'`)).toEqual(['echo', '$NAME']);
  });

  it('expands ~ only at the start of a word', async () => {
    expect(await fields('ls ~')).toEqual(['ls', '/Users/ada']);
    expect(await fields('ls ~/Documents')).toEqual(['ls', '/Users/ada/Documents']);
    expect(await fields('echo a~b')).toEqual(['echo', 'a~b']);
    expect(await fields(`echo '~'`)).toEqual(['echo', '~']);
  });

  it('runs command substitution and trims trailing newlines', async () => {
    expect(await fields('echo $(whoami)')).toEqual(['echo', 'ada']);
    expect(await fields('echo "user: $(whoami)"')).toEqual(['echo', 'user: ada']);
  });

  it('handles nested parentheses in a substitution', async () => {
    expect(await fields('echo "$(calc (1+2)*3)"')).toEqual(['echo', '[calc (1+2)*3]']);
    // Unquoted, the same output is split into fields.
    expect(await fields('echo $(calc (1+2)*3)')).toEqual(['echo', '[calc', '(1+2)*3]']);
  });

  it('applies backslash escapes', async () => {
    expect(await fields('echo a\\ b')).toEqual(['echo', 'a b']);
    expect(await fields('echo \\$NAME')).toEqual(['echo', '$NAME']);
  });

  it('expands globs against the directory listing', async () => {
    expect(await fields('ls *.txt')).toEqual(['ls', 'one.txt', 'two.txt']);
    expect(await fields('ls ???.txt')).toEqual(['ls', 'one.txt', 'two.txt']);
  });

  it('leaves a glob alone when nothing matches, and skips dotfiles', async () => {
    expect(await fields('ls *.zip')).toEqual(['ls', '*.zip']);
    expect(await fields('ls *')).toEqual(['ls', 'notes', 'one.txt', 'three.md', 'two.txt']);
  });

  it('does not glob quoted wildcards', async () => {
    expect(await fields(`ls '*.txt'`)).toEqual(['ls', '*.txt']);
  });

  it('expands redirect targets', async () => {
    const [statement] = parseScript('echo hi > $NAME.txt');
    const expanded = await expandCommand(statement?.pipeline[0] as never, ctx());
    expect(expanded.redirects).toEqual([{ op: '>', target: 'Ada.txt' }]);
  });

  it('rejects an ambiguous redirect', async () => {
    const [statement] = parseScript('echo hi > $LIST');
    await expect(expandCommand(statement?.pipeline[0] as never, ctx())).rejects.toThrow(
      ShellSyntaxError,
    );
  });
});

describe('parseWords and globToRegExp', () => {
  it('parses an alias body', () => {
    expect(parseWords('ls -l -a')).toHaveLength(3);
    expect(() => parseWords('ls | grep x')).toThrow(ShellSyntaxError);
  });

  it('anchors patterns and escapes regex characters', () => {
    expect(globToRegExp('*.txt').test('a.txt')).toBe(true);
    expect(globToRegExp('*.txt').test('a.txt.bak')).toBe(false);
    expect(globToRegExp('a.b').test('axb')).toBe(false);
    expect(globToRegExp('a?c').test('abc')).toBe(true);
  });
});
