/**
 * The built-in commands of the Lumen shell. Every command is a plain async
 * function over a `CommandContext`: the file system, the mutable session
 * state (cwd, env, aliases, history), stdin text, stdout/stderr sinks and,
 * when running inside the OS, a few kernel hooks. Commands return an exit
 * code; the executor turns thrown errors into messages and codes.
 */

import {
  type Authority,
  basename,
  dirname,
  elevate,
  extname,
  formatBytes,
  isProtectedPath,
  join,
  resolve,
  type Vfs,
  VfsError,
} from '@lumen/vfs';

import { CalcError, evaluate, formatNumber } from './calc';
import {
  calendar,
  columns,
  defaultDate,
  formatDate,
  formatDuration,
  groupDigits,
  listingDate,
  table,
} from './format';
import { globToRegExp } from './parse';
import { formatValue, parseValue, readPath, settingsPaths } from './settingsPath';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface ShellState {
  cwd: string;
  previousCwd: string | null;
  home: string;
  user: string;
  hostname: string;
  env: Record<string, string>;
  aliases: Record<string, string>;
  history: string[];
  lastStatus: number;
  startedAt: number;
  /**
   * Authority to change the paths the system owns, held for the length of one
   * `sudo` command and dropped again when it returns. It is not an environment
   * variable on purpose: `LUMEN_SUDO` is a string a script could set for
   * itself, this is a token the VFS only accepts from `elevate`.
   */
  elevation: Authority['elevation'];
}

export interface ShellInit {
  home: string;
  user: string;
  hostname?: string;
  cwd?: string;
}

export function createShellState(init: ShellInit): ShellState {
  const hostname = init.hostname ?? 'lumen';
  const cwd = init.cwd ?? init.home;
  return {
    cwd,
    previousCwd: null,
    home: init.home,
    user: init.user,
    hostname,
    env: {
      HOME: init.home,
      USER: init.user,
      HOSTNAME: hostname,
      PWD: cwd,
      SHELL: 'lsh',
      TERM: 'lumen',
      LANG: 'en_US.UTF-8',
    },
    aliases: {},
    history: [],
    lastStatus: 0,
    startedAt: Date.now(),
    elevation: undefined,
  };
}

export interface ShellProcess {
  pid: number;
  appId: string;
  name: string;
  cpu: number;
  memory: number;
  startedAt: number;
}

export interface ShellSystemInfo {
  os: string;
  kernel: string;
  host: string;
  /** Seconds. */
  uptime: number;
  cpu: string;
  memory: { total: number; available: number };
  resolution: string;
}

/** What the OS lends the shell. Absent in tests; commands then say so. */
export interface ShellKernel {
  version: string;
  open: (path: string) => Promise<unknown> | unknown;
  launch: (appId: string, args?: Record<string, unknown>) => { pid: number } | null;
  apps: () => Array<{ id: string; name: string }>;
  ps: () => ShellProcess[];
  kill: (pid: number) => boolean;
  theme: (mode?: ThemeMode) => ThemeMode;
  lock: () => void;
  exit: () => void;
  clear: () => void;
  sysinfo: () => Promise<ShellSystemInfo>;
  firstDayOfWeek?: 0 | 1;
  /** Every setting, as one object, for `lumenctl`. */
  settings: () => object;
  /** Write one leaf by its dotted path. Returns false when the path is unknown. */
  setSetting: (path: string, value: unknown) => boolean;
  /** Put one section, or everything, back to its default. */
  resetSettings: (section?: string) => boolean;
  services: () => ShellService[];
  /** start, stop or restart a service. Returns why not, or null on success. */
  serviceControl: (id: string, action: 'start' | 'stop' | 'restart') => string | null;
  /** True when the account has a password, which is what sudo needs. */
  hasPassword: () => boolean;
  /** Check a password. */
  authenticate: (password: string) => Promise<boolean>;
  /** End the session: everything closes and the screen locks. */
  endSession: (reason: string) => void;
}

export interface ShellService {
  id: string;
  name: string;
  category: string;
  state: string;
  implemented: boolean;
  description: string;
}

export interface CommandContext {
  vfs: Vfs;
  state: ShellState;
  stdin: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  signal?: AbortSignal;
  kernel?: ShellKernel;
  /** Run shell source in the same session, writing to this command's stdout. */
  execute: (source: string) => Promise<number>;
  /** Width of the terminal in characters, for column layouts. */
  columns: number;
  /**
   * Ask for a password without echoing it. Absent where there is nobody to
   * ask — a script, a test — and sudo refuses rather than assuming.
   */
  password?: (prompt: string) => Promise<string | null>;
}

export type CommandGroup = 'files' | 'text' | 'system' | 'apps' | 'shell';

export interface CommandSpec {
  name: string;
  usage: string;
  summary: string;
  group: CommandGroup;
  run: (args: string[], ctx: CommandContext) => Promise<number> | number;
}

/** Thrown for bad arguments; the executor prints the usage line and returns 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export function abortError(): Error {
  const e = new Error('interrupted');
  e.name = 'AbortError';
  return e;
}

export function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw abortError();
}

// ── helpers ──────────────────────────────────────────────────────────────

export interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string>;
  rest: string[];
}

/**
 * POSIX-ish option parsing: `-la`, `-n 5`, `-n5`, `--` ends options. With
 * `numeric`, a bare `-5` is the value of that option (`head -5`).
 */
export function parseArgs(
  args: string[],
  options: { value?: string[]; numeric?: string } = {},
): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const rest: string[] = [];
  let positionalOnly = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (positionalOnly || a === '-' || !a.startsWith('-')) {
      rest.push(a);
      continue;
    }
    if (a === '--') {
      positionalOnly = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) values.set(a.slice(2, eq), a.slice(eq + 1));
      else flags.add(a.slice(2));
      continue;
    }
    if (options.numeric && /^-\d+$/.test(a)) {
      values.set(options.numeric, a.slice(1));
      continue;
    }
    const cluster = a.slice(1);
    for (let j = 0; j < cluster.length; j++) {
      const f = cluster.charAt(j);
      if (options.value?.includes(f)) {
        const inline = cluster.slice(j + 1);
        if (inline) values.set(f, inline);
        else {
          const next = args[++i];
          if (next === undefined) throw new UsageError(`option -${f} needs a value`);
          values.set(f, next);
        }
        break;
      }
      flags.add(f);
    }
  }
  return { flags, values, rest };
}

/** A message for an error without the command name: "No such file or directory". */
export function describeError(e: unknown): string {
  if (VfsError.is(e)) {
    switch (e.code) {
      case 'ENOENT':
        return 'No such file or directory';
      case 'EEXIST':
        return 'File exists';
      case 'ENOTDIR':
        return 'Not a directory';
      case 'EISDIR':
        return 'Is a directory';
      case 'ENOTEMPTY':
        return 'Directory not empty';
      case 'EACCES':
        // A refused system path explains itself in a sentence; a bare EACCES
        // from an adapter does not, and gets the usual words.
        return e.message.startsWith('EACCES') ? 'Permission denied' : e.message;
      case 'ENOSPC':
        return 'No space left on device';
      case 'EINVAL':
        return e.message.startsWith('EINVAL') ? 'Invalid argument' : e.message;
      default:
        return 'Input/output error';
    }
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Resolve a user-typed path against the session: `~`, absolute, or relative to cwd. */
export function resolvePath(state: ShellState, input: string): string {
  if (input === '~') return state.home;
  if (input.startsWith('~/')) return join(state.home, input.slice(2));
  return resolve(state.cwd, input);
}

/** Whatever authority the session holds, in the shape a VFS call takes it. */
export function authority(state: ShellState): Authority {
  return state.elevation ? { elevation: state.elevation } : {};
}

/**
 * The line to print instead of doing it, or null to go ahead.
 *
 * The VFS is what enforces this — the shell asks it the same question early so
 * that the refusal can name the command that would work. It asks about the
 * path rather than the operation on purpose: the VFS lets the kernel rewrite
 * its own state files under /System, and a person typing at a prompt is not
 * the kernel.
 */
export function systemRefusal(
  ctx: CommandContext,
  command: string,
  args: readonly string[],
  shown: string,
  path: string,
): string | null {
  if (ctx.state.elevation) return null;
  if (!isProtectedPath(path)) return null;
  return `${command}: ${shown}: system files are protected. Try: sudo ${[command, ...args].join(' ')}\n`;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byName = (a: { name: string }, b: { name: string }) => collator.compare(a.name, b.name);

/** Split text into lines, ignoring the newline that ends the last one. */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface InputItem {
  /** File name for multi-file output, null for stdin. */
  label: string | null;
  text: string;
}

/** Read the named files (or stdin when none / `-`), reporting missing ones. */
async function readInputs(
  ctx: CommandContext,
  name: string,
  files: string[],
): Promise<{ items: InputItem[]; status: number }> {
  if (files.length === 0) return { items: [{ label: null, text: ctx.stdin }], status: 0 };
  const items: InputItem[] = [];
  let status = 0;
  for (const f of files) {
    throwIfAborted(ctx.signal);
    if (f === '-') {
      items.push({ label: null, text: ctx.stdin });
      continue;
    }
    try {
      items.push({ label: f, text: await ctx.vfs.readText(resolvePath(ctx.state, f)) });
    } catch (e) {
      ctx.stderr(`${name}: ${f}: ${describeError(e)}\n`);
      status = 1;
    }
  }
  return { items, status };
}

function unescapeText(text: string): string {
  return text.replace(/\\(n|t|r|\\|a|0|e)/g, (_, c: string) => {
    switch (c) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case '\\':
        return '\\';
      case '0':
        return '\0';
      case 'e':
        return '';
      default:
        return '';
    }
  });
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((res, rej) => {
    if (signal?.aborted) {
      rej(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      rej(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      res();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function needKernel(ctx: CommandContext, name: string): ShellKernel {
  if (!ctx.kernel) throw new Error(`${name} needs the OS and is not available here`);
  return ctx.kernel;
}

const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Wrap an argument so the parser reads it back as the one word it was. */
function quoteArg(arg: string): string {
  return `'${arg.replaceAll("'", `'\\''`)}'`;
}

function timeOfDay(ms: number): string {
  return formatDate(new Date(ms), '%H:%M:%S');
}

// ── the registry ─────────────────────────────────────────────────────────

const list: CommandSpec[] = [];
function define(spec: CommandSpec) {
  list.push(spec);
}

// files ───────────────────────────────────────────────────────────────────

define({
  name: 'ls',
  usage: 'ls [-l] [-a] [-h] [path…]',
  summary: 'list a directory',
  group: 'files',
  async run(args, ctx) {
    const { flags, rest } = parseArgs(args);
    const long = flags.has('l');
    const all = flags.has('a');
    const human = flags.has('h');
    const targets = rest.length > 0 ? rest : ['.'];
    let status = 0;
    const listings: Array<{
      label: string;
      entries: Array<{
        name: string;
        kind: 'file' | 'directory';
        size: number;
        modifiedAt: number;
      }>;
    }> = [];
    for (const t of targets) {
      throwIfAborted(ctx.signal);
      const path = resolvePath(ctx.state, t);
      try {
        const st = await ctx.vfs.stat(path);
        if (st.kind === 'file') {
          listings.push({ label: t, entries: [{ ...st, name: t }] });
          continue;
        }
        const entries = (await ctx.vfs.readDir(path))
          .filter((e) => all || !e.name.startsWith('.'))
          .sort(byName);
        listings.push({ label: t, entries });
      } catch (e) {
        ctx.stderr(`ls: ${t}: ${describeError(e)}\n`);
        status = 1;
      }
    }
    listings.forEach((listing, i) => {
      if (targets.length > 1) ctx.stdout(`${i > 0 ? '\n' : ''}${listing.label}:\n`);
      const named = listing.entries.map((e) => ({
        ...e,
        display: e.kind === 'directory' ? `${e.name}/` : e.name,
      }));
      if (!long) {
        ctx.stdout(
          columns(
            named.map((e) => e.display),
            ctx.columns,
          ),
        );
        return;
      }
      const sizes = named.map((e) =>
        e.kind === 'directory' ? '-' : human ? formatBytes(e.size) : String(e.size),
      );
      const width = Math.max(1, ...sizes.map((s) => s.length));
      named.forEach((e, idx) => {
        const kind = e.kind === 'directory' ? 'd' : '-';
        ctx.stdout(
          `${kind} ${(sizes[idx] as string).padStart(width)}  ${listingDate(e.modifiedAt)}  ${e.display}\n`,
        );
      });
    });
    return status;
  },
});

define({
  name: 'cd',
  usage: 'cd [dir | -]',
  summary: 'change the working directory (no argument: home, "-": previous)',
  group: 'files',
  async run(args, ctx) {
    const { state } = ctx;
    let target: string;
    if (args.length === 0) target = state.home;
    else if (args[0] === '-') {
      if (!state.previousCwd) {
        ctx.stderr('cd: no previous directory\n');
        return 1;
      }
      target = state.previousCwd;
      ctx.stdout(`${target}\n`);
    } else target = resolvePath(state, args[0] as string);
    try {
      const st = await ctx.vfs.stat(target);
      if (st.kind !== 'directory') {
        ctx.stderr(`cd: ${args[0]}: Not a directory\n`);
        return 1;
      }
    } catch (e) {
      ctx.stderr(`cd: ${args[0] ?? target}: ${describeError(e)}\n`);
      return 1;
    }
    state.previousCwd = state.cwd;
    state.cwd = target;
    state.env.OLDPWD = state.previousCwd;
    state.env.PWD = target;
    return 0;
  },
});

define({
  name: 'pwd',
  usage: 'pwd',
  summary: 'print the working directory',
  group: 'files',
  run(_args, ctx) {
    ctx.stdout(`${ctx.state.cwd}\n`);
    return 0;
  },
});

define({
  name: 'cat',
  usage: 'cat [-n] [file…]',
  summary: 'print files (or stdin) in order',
  group: 'files',
  async run(args, ctx) {
    const { flags, rest } = parseArgs(args);
    const { items, status } = await readInputs(ctx, 'cat', rest);
    for (const item of items) {
      if (flags.has('n')) {
        splitLines(item.text).forEach((line, i) => {
          ctx.stdout(`${String(i + 1).padStart(6)}  ${line}\n`);
        });
      } else ctx.stdout(item.text);
    }
    return status;
  },
});

define({
  name: 'mkdir',
  usage: 'mkdir [-p] dir…',
  summary: 'create directories (-p: parents too, no error if present)',
  group: 'files',
  async run(args, ctx) {
    const { flags, rest } = parseArgs(args);
    if (rest.length === 0) throw new UsageError('missing operand');
    let status = 0;
    for (const d of rest) {
      const path = resolvePath(ctx.state, d);
      const refusal = systemRefusal(ctx, 'mkdir', args, d, path);
      if (refusal) {
        ctx.stderr(refusal);
        status = 1;
        continue;
      }
      try {
        if (flags.has('p')) await ctx.vfs.ensureDir(path, authority(ctx.state));
        else await ctx.vfs.mkdir(path, authority(ctx.state));
      } catch (e) {
        ctx.stderr(`mkdir: ${d}: ${describeError(e)}\n`);
        status = 1;
      }
    }
    return status;
  },
});

define({
  name: 'touch',
  usage: 'touch file…',
  summary: 'create empty files or update their modification time',
  group: 'files',
  async run(args, ctx) {
    if (args.length === 0) throw new UsageError('missing operand');
    let status = 0;
    for (const f of args) {
      const path = resolvePath(ctx.state, f);
      const refusal = systemRefusal(ctx, 'touch', args, f, path);
      if (refusal) {
        ctx.stderr(refusal);
        status = 1;
        continue;
      }
      const grant = authority(ctx.state);
      try {
        if (await ctx.vfs.exists(path)) {
          const st = await ctx.vfs.stat(path);
          if (st.kind === 'file')
            await ctx.vfs.writeFile(path, await ctx.vfs.readFile(path), grant);
        } else await ctx.vfs.writeText(path, '', grant);
      } catch (e) {
        ctx.stderr(`touch: ${f}: ${describeError(e)}\n`);
        status = 1;
      }
    }
    return status;
  },
});

define({
  name: 'rm',
  usage: 'rm [-r] [-f] path…',
  summary: 'remove files (-r: directories and their contents, -f: ignore missing)',
  group: 'files',
  async run(args, ctx) {
    const { flags, rest } = parseArgs(args);
    if (rest.length === 0) throw new UsageError('missing operand');
    let status = 0;
    for (const p of rest) {
      throwIfAborted(ctx.signal);
      const path = resolvePath(ctx.state, p);
      const refusal = systemRefusal(ctx, 'rm', args, p, path);
      if (refusal) {
        ctx.stderr(refusal);
        status = 1;
        continue;
      }
      try {
        const st = await ctx.vfs.stat(path);
        if (st.kind === 'directory' && !flags.has('r')) {
          ctx.stderr(`rm: ${p}: Is a directory\n`);
          status = 1;
          continue;
        }
        await ctx.vfs.remove(path, { recursive: true, ...authority(ctx.state) });
      } catch (e) {
        if (flags.has('f') && VfsError.is(e, 'ENOENT')) continue;
        ctx.stderr(`rm: ${p}: ${describeError(e)}\n`);
        status = 1;
      }
    }
    return status;
  },
});

define({
  name: 'rmdir',
  usage: 'rmdir dir…',
  summary: 'remove empty directories',
  group: 'files',
  async run(args, ctx) {
    if (args.length === 0) throw new UsageError('missing operand');
    let status = 0;
    for (const d of args) {
      const path = resolvePath(ctx.state, d);
      try {
        const st = await ctx.vfs.stat(path);
        if (st.kind !== 'directory') {
          ctx.stderr(`rmdir: ${d}: Not a directory\n`);
          status = 1;
          continue;
        }
        if ((await ctx.vfs.readDir(path)).length > 0) {
          ctx.stderr(`rmdir: ${d}: Directory not empty\n`);
          status = 1;
          continue;
        }
        await ctx.vfs.remove(path, authority(ctx.state));
      } catch (e) {
        ctx.stderr(`rmdir: ${d}: ${describeError(e)}\n`);
        status = 1;
      }
    }
    return status;
  },
});

/** Destination for mv/cp: into `dest` when it is a directory, else `dest` itself. */
async function destinationFor(ctx: CommandContext, source: string, dest: string): Promise<string> {
  const target = resolvePath(ctx.state, dest);
  if (await ctx.vfs.isDirectory(target)) return join(target, basename(source));
  return target;
}

define({
  name: 'mv',
  usage: 'mv source… dest',
  summary: 'move or rename files and directories',
  group: 'files',
  async run(args, ctx) {
    const { rest } = parseArgs(args);
    if (rest.length < 2) throw new UsageError('needs a source and a destination');
    const dest = rest[rest.length - 1] as string;
    const sources = rest.slice(0, -1);
    const destPath = resolvePath(ctx.state, dest);
    if (sources.length > 1 && !(await ctx.vfs.isDirectory(destPath))) {
      ctx.stderr(`mv: ${dest}: Not a directory\n`);
      return 1;
    }
    let status = 0;
    for (const s of sources) {
      const from = resolvePath(ctx.state, s);
      const grant = authority(ctx.state);
      try {
        const to = await destinationFor(ctx, from, dest);
        if (to === from) continue;
        // Both ends: moving a system file away and moving something onto one
        // are the same loss.
        const refusal =
          systemRefusal(ctx, 'mv', args, s, from) ?? systemRefusal(ctx, 'mv', args, dest, to);
        if (refusal) {
          ctx.stderr(refusal);
          status = 1;
          continue;
        }
        const existing = await ctx.vfs.exists(to);
        if (
          existing &&
          (await ctx.vfs.stat(to)).kind === 'file' &&
          (await ctx.vfs.stat(from)).kind === 'file'
        ) {
          await ctx.vfs.remove(to, grant);
        }
        await ctx.vfs.rename(from, to, grant);
      } catch (e) {
        ctx.stderr(`mv: ${s}: ${describeError(e)}\n`);
        status = 1;
      }
    }
    return status;
  },
});

define({
  name: 'cp',
  usage: 'cp [-r] source… dest',
  summary: 'copy files (-r: directories too)',
  group: 'files',
  async run(args, ctx) {
    const { flags, rest } = parseArgs(args);
    if (rest.length < 2) throw new UsageError('needs a source and a destination');
    const dest = rest[rest.length - 1] as string;
    const sources = rest.slice(0, -1);
    const destPath = resolvePath(ctx.state, dest);
    if (sources.length > 1 && !(await ctx.vfs.isDirectory(destPath))) {
      ctx.stderr(`cp: ${dest}: Not a directory\n`);
      return 1;
    }
    let status = 0;
    for (const s of sources) {
      throwIfAborted(ctx.signal);
      const from = resolvePath(ctx.state, s);
      try {
        const st = await ctx.vfs.stat(from);
        if (st.kind === 'directory' && !flags.has('r')) {
          ctx.stderr(`cp: ${s}: Is a directory (use -r)\n`);
          status = 1;
          continue;
        }
        const to = await destinationFor(ctx, from, dest);
        if (to === from) {
          ctx.stderr(`cp: ${s} and ${dest} are the same file\n`);
          status = 1;
          continue;
        }
        // Reading a system file is fine; landing on one is not.
        const refusal = systemRefusal(ctx, 'cp', args, dest, to);
        if (refusal) {
          ctx.stderr(refusal);
          status = 1;
          continue;
        }
        await ctx.vfs.copy(from, to, authority(ctx.state));
      } catch (e) {
        ctx.stderr(`cp: ${s}: ${describeError(e)}\n`);
        status = 1;
      }
    }
    return status;
  },
});

define({
  name: 'find',
  usage: 'find [path] [-name pattern] [-type f|d] [-maxdepth n]',
  summary: 'walk a tree and print matching paths',
  group: 'files',
  async run(args, ctx) {
    let root = '.';
    let namePattern: RegExp | null = null;
    let type: 'file' | 'directory' | null = null;
    let maxDepth = Number.POSITIVE_INFINITY;
    for (let i = 0; i < args.length; i++) {
      const a = args[i] as string;
      if (a === '-name' || a === '-iname') {
        const p = args[++i];
        if (p === undefined) throw new UsageError(`${a} needs a pattern`);
        namePattern = a === '-iname' ? new RegExp(globToRegExp(p).source, 'i') : globToRegExp(p);
      } else if (a === '-type') {
        const t = args[++i];
        if (t === 'f') type = 'file';
        else if (t === 'd') type = 'directory';
        else throw new UsageError('-type needs f or d');
      } else if (a === '-maxdepth') {
        const n = Number(args[++i]);
        if (!Number.isInteger(n) || n < 0) throw new UsageError('-maxdepth needs a whole number');
        maxDepth = n;
      } else if (a.startsWith('-')) throw new UsageError(`unknown option ${a}`);
      else root = a;
    }
    const rootPath = resolvePath(ctx.state, root);
    let rootStat: Awaited<ReturnType<Vfs['stat']>>;
    try {
      rootStat = await ctx.vfs.stat(rootPath);
    } catch (e) {
      ctx.stderr(`find: ${root}: ${describeError(e)}\n`);
      return 1;
    }
    const display = root.replace(/\/+$/, '') || '/';
    const matches = (name: string, kind: 'file' | 'directory') =>
      (!namePattern || namePattern.test(name)) && (!type || type === kind);
    if (matches(rootStat.name || '/', rootStat.kind)) ctx.stdout(`${display}\n`);
    if (rootStat.kind !== 'directory') return 0;
    const walk = async (dir: string, shown: string, depth: number) => {
      if (depth > maxDepth) return;
      const entries = (await ctx.vfs.readDir(dir)).sort(byName);
      for (const e of entries) {
        throwIfAborted(ctx.signal);
        const path = shown === '/' ? `/${e.name}` : `${shown}/${e.name}`;
        if (matches(e.name, e.kind)) ctx.stdout(`${path}\n`);
        if (e.kind === 'directory') await walk(e.path, path, depth + 1);
      }
    };
    await walk(rootPath, display, 1);
    return 0;
  },
});

define({
  name: 'tree',
  usage: 'tree [-a] [-L depth] [path]',
  summary: 'draw a directory as a tree',
  group: 'files',
  async run(args, ctx) {
    const { flags, values, rest } = parseArgs(args, { value: ['L'] });
    const maxDepth = values.has('L') ? Number(values.get('L')) : Number.POSITIVE_INFINITY;
    if (Number.isNaN(maxDepth) || maxDepth < 1)
      throw new UsageError('-L needs a depth of 1 or more');
    const root = rest[0] ?? '.';
    const rootPath = resolvePath(ctx.state, root);
    if (!(await ctx.vfs.isDirectory(rootPath))) {
      ctx.stderr(`tree: ${root}: Not a directory\n`);
      return 1;
    }
    const counts = { dirs: 0, files: 0 };
    const lines: string[] = [root];
    const draw = async (dir: string, prefix: string, depth: number) => {
      const entries = (await ctx.vfs.readDir(dir))
        .filter((e) => flags.has('a') || !e.name.startsWith('.'))
        .sort(byName);
      for (let i = 0; i < entries.length; i++) {
        throwIfAborted(ctx.signal);
        const e = entries[i] as (typeof entries)[number];
        const last = i === entries.length - 1;
        lines.push(`${prefix}${last ? '└── ' : '├── '}${e.name}`);
        if (e.kind === 'directory') {
          counts.dirs++;
          if (depth < maxDepth) await draw(e.path, `${prefix}${last ? '    ' : '│   '}`, depth + 1);
        } else counts.files++;
      }
    };
    await draw(rootPath, '', 1);
    lines.push(
      '',
      `${counts.dirs} ${counts.dirs === 1 ? 'directory' : 'directories'}, ${counts.files} ${counts.files === 1 ? 'file' : 'files'}`,
    );
    ctx.stdout(`${lines.join('\n')}\n`);
    return 0;
  },
});

define({
  name: 'stat',
  usage: 'stat path…',
  summary: 'show kind, size and dates of a path',
  group: 'files',
  async run(args, ctx) {
    if (args.length === 0) throw new UsageError('missing operand');
    let status = 0;
    for (const p of args) {
      try {
        const st = await ctx.vfs.stat(resolvePath(ctx.state, p));
        const kind =
          st.kind === 'directory'
            ? 'directory'
            : `file${extname(st.name) ? ` (${extname(st.name).slice(1)})` : ''}`;
        ctx.stdout(
          [
            `    File: ${st.path}`,
            `    Kind: ${kind}`,
            `    Size: ${groupDigits(st.size)} bytes${st.size >= 1024 ? ` (${formatBytes(st.size)})` : ''}`,
            `Modified: ${formatDate(new Date(st.modifiedAt), '%F %T')}`,
            ` Created: ${formatDate(new Date(st.createdAt), '%F %T')}`,
            '',
          ].join('\n'),
        );
      } catch (e) {
        ctx.stderr(`stat: ${p}: ${describeError(e)}\n`);
        status = 1;
      }
    }
    return status;
  },
});

define({
  name: 'du',
  usage: 'du [-s] [-h] [path…]',
  summary: 'disk usage of a tree (-s: total only, -h: readable sizes)',
  group: 'files',
  async run(args, ctx) {
    const { flags, rest } = parseArgs(args);
    const targets = rest.length > 0 ? rest : ['.'];
    const size = (n: number) => (flags.has('h') ? formatBytes(n) : String(n));
    let status = 0;
    for (const t of targets) {
      const path = resolvePath(ctx.state, t);
      try {
        if (!flags.has('s') && (await ctx.vfs.isDirectory(path))) {
          for (const e of (await ctx.vfs.readDir(path)).sort(byName)) {
            throwIfAborted(ctx.signal);
            ctx.stdout(
              `${size(await ctx.vfs.du(e.path)).padStart(8)}  ${t === '.' ? e.name : `${t.replace(/\/+$/, '')}/${e.name}`}\n`,
            );
          }
        }
        ctx.stdout(`${size(await ctx.vfs.du(path)).padStart(8)}  ${t}\n`);
      } catch (e) {
        ctx.stderr(`du: ${t}: ${describeError(e)}\n`);
        status = 1;
      }
    }
    return status;
  },
});

define({
  name: 'df',
  usage: 'df',
  summary: 'storage used and available',
  group: 'files',
  async run(_args, ctx) {
    const { used, quota } = await ctx.vfs.usage();
    const pct = quota ? `${Math.round((used / quota) * 100)}%` : '-';
    ctx.stdout(
      table(
        [
          { label: 'Filesystem' },
          { label: 'Size', align: 'right' },
          { label: 'Used', align: 'right' },
          { label: 'Avail', align: 'right' },
          { label: 'Use%', align: 'right' },
          { label: 'Mounted on' },
        ],
        [
          [
            'lumen-vfs',
            quota ? formatBytes(quota) : '-',
            formatBytes(used),
            quota ? formatBytes(Math.max(0, quota - used)) : '-',
            pct,
            '/',
          ],
        ],
      ),
    );
    return 0;
  },
});

define({
  name: 'basename',
  usage: 'basename path [suffix]',
  summary: 'the last part of a path',
  group: 'files',
  run(args, ctx) {
    const [path, suffix] = args;
    if (path === undefined) throw new UsageError('missing operand');
    let name = basename(path) || '/';
    if (suffix && name.endsWith(suffix) && name !== suffix) name = name.slice(0, -suffix.length);
    ctx.stdout(`${name}\n`);
    return 0;
  },
});

define({
  name: 'dirname',
  usage: 'dirname path',
  summary: 'the directory part of a path',
  group: 'files',
  run(args, ctx) {
    const path = args[0];
    if (path === undefined) throw new UsageError('missing operand');
    ctx.stdout(`${path.includes('/') ? dirname(path) : '.'}\n`);
    return 0;
  },
});

// text ────────────────────────────────────────────────────────────────────

define({
  name: 'echo',
  usage: 'echo [-n] [-e] [text…]',
  summary: 'print text (-n: no newline, -e: interpret \\n and \\t)',
  group: 'text',
  run(args, ctx) {
    let i = 0;
    let newline = true;
    let escapes = false;
    while (i < args.length && /^-[ne]+$/.test(args[i] as string)) {
      const a = args[i] as string;
      if (a.includes('n')) newline = false;
      if (a.includes('e')) escapes = true;
      i++;
    }
    let text = args.slice(i).join(' ');
    if (escapes) text = unescapeText(text);
    ctx.stdout(newline ? `${text}\n` : text);
    return 0;
  },
});

define({
  name: 'printf',
  usage: 'printf format [args…]',
  summary: 'formatted output with %s %d %f %% and \\n escapes',
  group: 'text',
  run(args, ctx) {
    const format = args[0];
    if (format === undefined) throw new UsageError('missing format');
    const values = args.slice(1);
    let consumed = 0;
    const render = (): string => {
      let out = '';
      const re = /%(-)?(\d+)?(?:\.(\d+))?([sdifx%])/g;
      let last = 0;
      for (let m = re.exec(format); m; m = re.exec(format)) {
        out += format.slice(last, m.index);
        last = m.index + m[0].length;
        const [, left, widthText, precisionText, conv] = m;
        if (conv === '%') {
          out += '%';
          continue;
        }
        const arg = values[consumed++] ?? '';
        let text: string;
        if (conv === 's') text = precisionText ? arg.slice(0, Number(precisionText)) : arg;
        else if (conv === 'f')
          text = Number(arg || 0).toFixed(precisionText ? Number(precisionText) : 6);
        else if (conv === 'x') text = Math.trunc(Number(arg || 0)).toString(16);
        else text = String(Math.trunc(Number(arg || 0)) || 0);
        if (widthText) {
          const width = Number(widthText);
          text = left
            ? text.padEnd(width)
            : text.padStart(width, widthText.startsWith('0') && conv !== 's' ? '0' : ' ');
        }
        out += text;
      }
      out += format.slice(last);
      return unescapeText(out);
    };
    ctx.stdout(render());
    // Like POSIX printf, reuse the format while arguments remain.
    while (consumed > 0 && consumed < values.length) ctx.stdout(render());
    return 0;
  },
});

define({
  name: 'head',
  usage: 'head [-n lines] [file…]',
  summary: 'the first lines of input (default 10)',
  group: 'text',
  async run(args, ctx) {
    const { values, rest } = parseArgs(args, { value: ['n'], numeric: 'n' });
    const n = values.has('n') ? Number(values.get('n')) : 10;
    if (!Number.isInteger(n) || n < 0) throw new UsageError('-n needs a whole number');
    const { items, status } = await readInputs(ctx, 'head', rest);
    items.forEach((item, i) => {
      if (items.length > 1) ctx.stdout(`${i > 0 ? '\n' : ''}==> ${item.label ?? 'stdin'} <==\n`);
      const lines = splitLines(item.text).slice(0, n);
      if (lines.length) ctx.stdout(`${lines.join('\n')}\n`);
    });
    return status;
  },
});

define({
  name: 'tail',
  usage: 'tail [-n lines] [file…]',
  summary: 'the last lines of input (default 10)',
  group: 'text',
  async run(args, ctx) {
    const { values, rest } = parseArgs(args, { value: ['n'], numeric: 'n' });
    const n = values.has('n') ? Number(values.get('n')) : 10;
    if (!Number.isInteger(n) || n < 0) throw new UsageError('-n needs a whole number');
    const { items, status } = await readInputs(ctx, 'tail', rest);
    items.forEach((item, i) => {
      if (items.length > 1) ctx.stdout(`${i > 0 ? '\n' : ''}==> ${item.label ?? 'stdin'} <==\n`);
      const all = splitLines(item.text);
      const lines = n === 0 ? [] : all.slice(-n);
      if (lines.length) ctx.stdout(`${lines.join('\n')}\n`);
    });
    return status;
  },
});

define({
  name: 'wc',
  usage: 'wc [-l] [-w] [-c] [file…]',
  summary: 'count lines, words and bytes',
  group: 'text',
  async run(args, ctx) {
    const { flags, rest } = parseArgs(args);
    const which =
      flags.has('l') || flags.has('w') || flags.has('c') ? flags : new Set(['l', 'w', 'c']);
    const { items, status } = await readInputs(ctx, 'wc', rest);
    const rows: Array<{ counts: number[]; label: string | null }> = [];
    const totals = [0, 0, 0];
    for (const item of items) {
      const counts = [
        (item.text.match(/\n/g) ?? []).length,
        item.text.split(/\s+/).filter(Boolean).length,
        encoder.encode(item.text).length,
      ];
      counts.forEach((c, i) => {
        totals[i] = (totals[i] ?? 0) + c;
      });
      rows.push({ counts, label: item.label });
    }
    if (items.length > 1) rows.push({ counts: totals, label: 'total' });
    const pick = (counts: number[]) =>
      ['l', 'w', 'c']
        .filter((k) => which.has(k))
        .map((k) => counts[['l', 'w', 'c'].indexOf(k)] as number);
    const width = Math.max(1, ...rows.flatMap((r) => pick(r.counts).map((n) => String(n).length)));
    for (const r of rows) {
      ctx.stdout(
        `${pick(r.counts)
          .map((n) => String(n).padStart(width))
          .join(' ')}${r.label ? ` ${r.label}` : ''}\n`,
      );
    }
    return status;
  },
});

define({
  name: 'grep',
  usage: 'grep [-i] [-n] [-v] pattern [file…]',
  summary: 'print lines matching a regular expression (-i: ignore case, -n: numbers, -v: invert)',
  group: 'text',
  async run(args, ctx) {
    const { flags, rest } = parseArgs(args);
    const [pattern, ...files] = rest;
    if (pattern === undefined) throw new UsageError('missing pattern');
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags.has('i') ? 'i' : '');
    } catch {
      re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags.has('i') ? 'i' : '');
    }
    const { items, status } = await readInputs(ctx, 'grep', files);
    let found = false;
    for (const item of items) {
      splitLines(item.text).forEach((line, i) => {
        if (re.test(line) === flags.has('v')) return;
        found = true;
        const prefix = `${items.length > 1 && item.label ? `${item.label}:` : ''}${flags.has('n') ? `${i + 1}:` : ''}`;
        ctx.stdout(`${prefix}${line}\n`);
      });
    }
    if (status !== 0) return 2;
    return found ? 0 : 1;
  },
});

define({
  name: 'sort',
  usage: 'sort [-r] [-n] [-u] [file…]',
  summary: 'sort lines (-r: reverse, -n: numeric, -u: unique)',
  group: 'text',
  async run(args, ctx) {
    const { flags, rest } = parseArgs(args);
    const { items, status } = await readInputs(ctx, 'sort', rest);
    let lines = items.flatMap((i) => splitLines(i.text));
    const cmp = flags.has('n')
      ? (a: string, b: string) =>
          (Number.parseFloat(a) || 0) - (Number.parseFloat(b) || 0) || a.localeCompare(b)
      : (a: string, b: string) => a.localeCompare(b);
    lines.sort(cmp);
    if (flags.has('r')) lines.reverse();
    if (flags.has('u')) lines = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
    if (lines.length) ctx.stdout(`${lines.join('\n')}\n`);
    return status;
  },
});

define({
  name: 'uniq',
  usage: 'uniq [-c] [file]',
  summary: 'collapse repeated adjacent lines (-c: prefix counts)',
  group: 'text',
  async run(args, ctx) {
    const { flags, rest } = parseArgs(args);
    const { items, status } = await readInputs(ctx, 'uniq', rest);
    const lines = items.flatMap((i) => splitLines(i.text));
    const groups: Array<{ line: string; count: number }> = [];
    for (const line of lines) {
      const last = groups[groups.length - 1];
      if (last && last.line === line) last.count++;
      else groups.push({ line, count: 1 });
    }
    for (const g of groups)
      ctx.stdout(flags.has('c') ? `${String(g.count).padStart(7)} ${g.line}\n` : `${g.line}\n`);
    return status;
  },
});

define({
  name: 'cut',
  usage: 'cut -d delim -f fields [file…]',
  summary: 'pick delimited fields, e.g. cut -d , -f 1,3',
  group: 'text',
  async run(args, ctx) {
    const { values, rest } = parseArgs(args, { value: ['d', 'f'] });
    const delim = values.get('d') ?? '\t';
    const fieldSpec = values.get('f');
    if (!fieldSpec) throw new UsageError('-f needs a field list');
    const wanted = new Set<number>();
    for (const part of fieldSpec.split(',')) {
      const range = /^(\d+)?-(\d+)?$/.exec(part);
      if (range) {
        const from = Number(range[1] ?? 1);
        const to = Number(range[2] ?? 999);
        for (let i = from; i <= to; i++) wanted.add(i);
      } else if (/^\d+$/.test(part) && Number(part) > 0) wanted.add(Number(part));
      else throw new UsageError(`bad field list: ${fieldSpec}`);
    }
    const { items, status } = await readInputs(ctx, 'cut', rest);
    for (const item of items) {
      for (const line of splitLines(item.text)) {
        const fields = line.split(delim);
        ctx.stdout(`${fields.filter((_, i) => wanted.has(i + 1)).join(delim)}\n`);
      }
    }
    return status;
  },
});

/** Expand `a-z` ranges and `\n`-style escapes into a list of characters. */
function charSet(spec: string): string[] {
  const chars = [...unescapeText(spec)];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] as string;
    const next = chars[i + 1];
    const after = chars[i + 2];
    if (next === '-' && after !== undefined) {
      const from = c.codePointAt(0) as number;
      const to = after.codePointAt(0) as number;
      for (let cp = from; cp <= to; cp++) out.push(String.fromCodePoint(cp));
      i += 2;
    } else out.push(c);
  }
  return out;
}

define({
  name: 'tr',
  usage: 'tr [-d] set1 [set2]',
  summary: 'translate characters (a-z ranges allowed; -d: delete set1)',
  group: 'text',
  run(args, ctx) {
    const { flags, rest } = parseArgs(args);
    const [set1, set2] = rest;
    if (set1 === undefined) throw new UsageError('missing set');
    const from = charSet(set1);
    if (flags.has('d')) {
      const drop = new Set(from);
      ctx.stdout([...ctx.stdin].filter((c) => !drop.has(c)).join(''));
      return 0;
    }
    if (set2 === undefined) throw new UsageError('missing second set');
    const to = charSet(set2);
    const map = new Map<string, string>();
    from.forEach((c, i) => {
      map.set(c, to[Math.min(i, to.length - 1)] ?? c);
    });
    ctx.stdout([...ctx.stdin].map((c) => map.get(c) ?? c).join(''));
    return 0;
  },
});

define({
  name: 'json',
  usage: 'json [file] [path.to.key]',
  summary: 'pretty-print JSON from a file or stdin, or pick a value by path',
  group: 'text',
  async run(args, ctx) {
    const { rest } = parseArgs(args);
    let source = ctx.stdin;
    let path: string | undefined;
    const [first, second] = rest;
    if (first !== undefined && first !== '-') {
      const filePath = resolvePath(ctx.state, first);
      if (await ctx.vfs.exists(filePath)) {
        source = await ctx.vfs.readText(filePath);
        path = second;
      } else if (second === undefined && ctx.stdin) path = first;
      else {
        ctx.stderr(`json: ${first}: No such file or directory\n`);
        return 1;
      }
    } else path = second;
    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch (e) {
      ctx.stderr(`json: ${(e as Error).message}\n`);
      return 1;
    }
    if (path) {
      const keys = path.split(/\.|\[|\]/).filter(Boolean);
      for (const k of keys) {
        if (value === null || typeof value !== 'object') {
          value = undefined;
          break;
        }
        value = (value as Record<string, unknown>)[k];
      }
      if (value === undefined) {
        ctx.stderr(`json: no value at ${path}\n`);
        return 1;
      }
    }
    ctx.stdout(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
    return 0;
  },
});

function toBase64(text: string): string {
  const bytes = encoder.encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): string {
  const binary = atob(text.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return decoder.decode(bytes);
}

define({
  name: 'b64',
  usage: 'b64 encode|decode [text]',
  summary: 'Base64 encode or decode text (or stdin)',
  group: 'text',
  run(args, ctx) {
    const [mode, ...rest] = args;
    if (mode !== 'encode' && mode !== 'decode')
      throw new UsageError('first argument must be encode or decode');
    const input = rest.length > 0 ? rest.join(' ') : ctx.stdin.replace(/\n$/, '');
    try {
      ctx.stdout(`${mode === 'encode' ? toBase64(input) : fromBase64(input)}\n`);
      return 0;
    } catch {
      ctx.stderr('b64: input is not valid Base64\n');
      return 1;
    }
  },
});

define({
  name: 'calc',
  usage: 'calc expression',
  summary: 'evaluate arithmetic: + - * / % ^ ( ) and sqrt, pi, …',
  group: 'text',
  run(args, ctx) {
    const expr = (args.length > 0 ? args.join(' ') : ctx.stdin).trim();
    if (!expr) throw new UsageError('missing expression');
    try {
      ctx.stdout(`${formatNumber(evaluate(expr))}\n`);
      return 0;
    } catch (e) {
      if (e instanceof CalcError) {
        ctx.stderr(`calc: ${e.message}\n`);
        return 1;
      }
      throw e;
    }
  },
});

define({
  name: 'seq',
  usage: 'seq [first [step]] last',
  summary: 'print a sequence of numbers',
  group: 'text',
  run(args, ctx) {
    const nums = args.map(Number);
    if (nums.length === 0 || nums.length > 3 || nums.some(Number.isNaN))
      throw new UsageError('needs one to three numbers');
    const [first, step, last] =
      nums.length === 1
        ? [1, 1, nums[0] as number]
        : nums.length === 2
          ? [nums[0] as number, 1, nums[1] as number]
          : (nums as [number, number, number]);
    if (step === 0) throw new UsageError('step must not be zero');
    const out: string[] = [];
    for (let v = first; step > 0 ? v <= last : v >= last; v += step) {
      out.push(formatNumber(v));
      if (out.length > 100_000) break;
    }
    if (out.length) ctx.stdout(`${out.join('\n')}\n`);
    return 0;
  },
});

// system ──────────────────────────────────────────────────────────────────

define({
  name: 'date',
  usage: 'date [+format]',
  summary: 'the current date and time (+%Y-%m-%d style formats)',
  group: 'system',
  run(args, ctx) {
    const now = new Date();
    const fmt = args[0];
    if (fmt !== undefined && !fmt.startsWith('+')) throw new UsageError('format must start with +');
    ctx.stdout(`${fmt ? formatDate(now, fmt.slice(1)) : defaultDate(now)}\n`);
    return 0;
  },
});

define({
  name: 'cal',
  usage: 'cal [month year]',
  summary: 'a calendar of this month',
  group: 'system',
  run(args, ctx) {
    const today = new Date();
    let month = today;
    if (args.length === 2) {
      const m = Number(args[0]);
      const y = Number(args[1]);
      if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y))
        throw new UsageError('expects month (1-12) and year');
      month = new Date(y, m - 1, 1);
    } else if (args.length !== 0) throw new UsageError('expects no arguments or month and year');
    ctx.stdout(calendar(month, ctx.kernel?.firstDayOfWeek ?? 1, today));
    return 0;
  },
});

define({
  name: 'whoami',
  usage: 'whoami',
  summary: 'the signed-in user name',
  group: 'system',
  run(_args, ctx) {
    ctx.stdout(`${ctx.state.user}\n`);
    return 0;
  },
});

define({
  name: 'hostname',
  usage: 'hostname',
  summary: 'the machine name',
  group: 'system',
  run(_args, ctx) {
    ctx.stdout(`${ctx.state.hostname}\n`);
    return 0;
  },
});

define({
  name: 'uname',
  usage: 'uname [-a]',
  summary: 'the operating system name (-a: kernel and host too)',
  group: 'system',
  async run(args, ctx) {
    if (!args.includes('-a')) {
      ctx.stdout('Lumen\n');
      return 0;
    }
    const info = ctx.kernel ? await ctx.kernel.sysinfo() : null;
    ctx.stdout(`Lumen ${ctx.state.hostname} ${info ? `${info.kernel} ${info.os}` : 'lsh'}\n`);
    return 0;
  },
});

async function uptimeSeconds(ctx: CommandContext): Promise<number> {
  if (ctx.kernel) return (await ctx.kernel.sysinfo()).uptime;
  return (Date.now() - ctx.state.startedAt) / 1000;
}

define({
  name: 'uptime',
  usage: 'uptime',
  summary: 'how long the system has been running',
  group: 'system',
  async run(_args, ctx) {
    ctx.stdout(`${timeOfDay(Date.now())} up ${formatDuration(await uptimeSeconds(ctx))}, 1 user\n`);
    return 0;
  },
});

define({
  name: 'sysinfo',
  usage: 'sysinfo',
  summary: 'a summary of the machine',
  group: 'system',
  async run(_args, ctx) {
    const info = ctx.kernel ? await ctx.kernel.sysinfo() : null;
    const title = `${ctx.state.user}@${ctx.state.hostname}`;
    const rows: string[] = [title, '-'.repeat(title.length)];
    rows.push(`OS: Lumen OS ${ctx.kernel?.version ?? ''}`.trimEnd());
    if (info) {
      rows.push(`Kernel: ${info.kernel}`);
      rows.push(`Host: ${info.host}`);
      rows.push(`Uptime: ${formatDuration(info.uptime)}`);
      rows.push(`CPU: ${info.cpu}`);
      rows.push(
        `Memory: ${formatBytes(info.memory.total - info.memory.available)} / ${formatBytes(info.memory.total)}`,
      );
      rows.push(`Resolution: ${info.resolution}`);
    } else rows.push(`Uptime: ${formatDuration(await uptimeSeconds(ctx))}`);
    rows.push('Shell: lsh');
    const logo = ['###', '###', '###', '###', '###', '#########', '#########'];
    const width = 12;
    const height = Math.max(logo.length, rows.length);
    const lines: string[] = [];
    for (let i = 0; i < height; i++)
      lines.push(`  ${(logo[i] ?? '').padEnd(width)}${rows[i] ?? ''}`.trimEnd());
    ctx.stdout(`${lines.join('\n')}\n`);
    return 0;
  },
});

define({
  name: 'env',
  usage: 'env',
  summary: 'list environment variables',
  group: 'system',
  run(_args, ctx) {
    const names = Object.keys(ctx.state.env).sort();
    for (const n of names) ctx.stdout(`${n}=${ctx.state.env[n]}\n`);
    return 0;
  },
});

define({
  name: 'export',
  usage: 'export NAME=value…',
  summary: 'set environment variables',
  group: 'system',
  run(args, ctx) {
    if (args.length === 0) return (commands.env as CommandSpec).run([], ctx);
    for (const a of args) {
      const eq = a.indexOf('=');
      const name = eq < 0 ? a : a.slice(0, eq);
      if (!VALID_NAME.test(name)) throw new UsageError(`'${name}' is not a valid name`);
      if (eq >= 0) ctx.state.env[name] = a.slice(eq + 1);
      else if (!(name in ctx.state.env)) ctx.state.env[name] = '';
    }
    return 0;
  },
});

define({
  name: 'unset',
  usage: 'unset NAME…',
  summary: 'remove environment variables',
  group: 'system',
  run(args, ctx) {
    if (args.length === 0) throw new UsageError('missing name');
    for (const n of args) delete ctx.state.env[n];
    return 0;
  },
});

define({
  name: 'sleep',
  usage: 'sleep seconds',
  summary: 'wait (Ctrl+C interrupts)',
  group: 'system',
  async run(args, ctx) {
    const seconds = Number(args[0]);
    if (args.length !== 1 || Number.isNaN(seconds) || seconds < 0)
      throw new UsageError('needs a number of seconds');
    await wait(seconds * 1000, ctx.signal);
    return 0;
  },
});

define({
  name: 'theme',
  usage: 'theme [light|dark|auto]',
  summary: 'show or set the appearance',
  group: 'system',
  run(args, ctx) {
    const kernel = needKernel(ctx, 'theme');
    const mode = args[0];
    if (mode === undefined) {
      ctx.stdout(`${kernel.theme()}\n`);
      return 0;
    }
    if (mode !== 'light' && mode !== 'dark' && mode !== 'auto')
      throw new UsageError('expects light, dark or auto');
    kernel.theme(mode);
    return 0;
  },
});

define({
  name: 'lock',
  usage: 'lock',
  summary: 'lock the screen',
  group: 'system',
  run(_args, ctx) {
    needKernel(ctx, 'lock').lock();
    return 0;
  },
});

// apps ────────────────────────────────────────────────────────────────────

define({
  name: 'open',
  usage: 'open path|url|app-id',
  summary: 'open a file or folder with its app, a URL in the browser, or launch an app',
  group: 'apps',
  async run(args, ctx) {
    const kernel = needKernel(ctx, 'open');
    const target = args[0];
    if (target === undefined) throw new UsageError('missing target');
    if (/^https?:\/\//i.test(target)) {
      if (!kernel.launch('lumen.browser', { url: target })) {
        ctx.stderr('open: no browser is installed\n');
        return 1;
      }
      return 0;
    }
    const path = resolvePath(ctx.state, target);
    if (await ctx.vfs.exists(path)) {
      await kernel.open(path);
      return 0;
    }
    if (kernel.apps().some((a) => a.id === target)) {
      return kernel.launch(target) ? 0 : 1;
    }
    ctx.stderr(`open: ${target}: no such file, URL or app\n`);
    return 1;
  },
});

define({
  name: 'apps',
  usage: 'apps',
  summary: 'list installed apps',
  group: 'apps',
  run(_args, ctx) {
    const apps = needKernel(ctx, 'apps').apps();
    ctx.stdout(
      table(
        [{ label: 'ID' }, { label: 'NAME' }],
        apps.map((a) => [a.id, a.name]),
      ),
    );
    return 0;
  },
});

define({
  name: 'launch',
  usage: 'launch app-id [key=value…]',
  summary: 'start an app with arguments, e.g. launch lumen.editor path=~/notes.md',
  group: 'apps',
  run(args, ctx) {
    const kernel = needKernel(ctx, 'launch');
    const [appId, ...pairs] = args;
    if (appId === undefined) throw new UsageError('missing app id');
    const launchArgs: Record<string, unknown> = {};
    for (const p of pairs) {
      const eq = p.indexOf('=');
      if (eq <= 0) throw new UsageError(`expected key=value, got '${p}'`);
      const key = p.slice(0, eq);
      const raw = p.slice(eq + 1);
      launchArgs[key] = key === 'path' || key === 'cwd' ? resolvePath(ctx.state, raw) : raw;
    }
    const proc = kernel.launch(appId, launchArgs);
    if (!proc) {
      ctx.stderr(`launch: ${appId}: no such app\n`);
      return 1;
    }
    ctx.stdout(`${appId} started (pid ${proc.pid})\n`);
    return 0;
  },
});

define({
  name: 'ps',
  usage: 'ps',
  summary: 'list running processes',
  group: 'apps',
  run(_args, ctx) {
    const procs = needKernel(ctx, 'ps').ps();
    ctx.stdout(
      table(
        [
          { label: 'PID', align: 'right' },
          { label: 'APP' },
          { label: 'CPU%', align: 'right' },
          { label: 'MEM', align: 'right' },
          { label: 'STARTED' },
          { label: 'NAME' },
        ],
        procs.map((p) => [
          String(p.pid),
          p.appId,
          p.cpu.toFixed(1),
          formatBytes(p.memory, 0),
          timeOfDay(p.startedAt),
          p.name,
        ]),
      ),
    );
    return 0;
  },
});

define({
  name: 'lumenctl',
  usage: 'lumenctl list [prefix] | get path | set path value | reset [section]',
  summary: 'read and write any system setting',
  group: 'system',
  run(args, ctx) {
    const kernel = needKernel(ctx, 'lumenctl');
    const [action, path, ...rest] = args;
    const settings = kernel.settings();

    if (action === undefined || action === 'list') {
      const prefix = path ?? '';
      const paths = settingsPaths(settings).filter((p) => p.startsWith(prefix));
      if (paths.length === 0) {
        ctx.stderr(`lumenctl: nothing under "${prefix}"\n`);
        return 1;
      }
      const width = Math.max(...paths.map((p) => p.length));
      for (const each of paths) {
        const read = readPath(settings, each);
        ctx.stdout(`${each.padEnd(width)}  ${read.ok ? formatValue(read.value) : '?'}\n`);
      }
      return 0;
    }

    if (action === 'get') {
      if (!path) throw new UsageError('missing path');
      const read = readPath(settings, path);
      if (!read.ok) {
        ctx.stderr(`lumenctl: ${read.error}\n`);
        return 1;
      }
      ctx.stdout(`${formatValue(read.value)}\n`);
      return 0;
    }

    if (action === 'set') {
      if (!path) throw new UsageError('missing path');
      if (rest.length === 0) throw new UsageError('missing value');
      const read = readPath(settings, path);
      if (!read.ok) {
        ctx.stderr(`lumenctl: ${read.error}\n`);
        return 1;
      }
      const parsed = parseValue(read.value, rest.join(' '));
      if (!parsed.ok) {
        ctx.stderr(`lumenctl: ${path}: ${parsed.error}\n`);
        return 1;
      }
      if (!kernel.setSetting(path, parsed.value)) {
        ctx.stderr(`lumenctl: ${path}: refused\n`);
        return 1;
      }
      ctx.stdout(`${path} = ${formatValue(parsed.value)}\n`);
      return 0;
    }

    if (action === 'reset') {
      if (!kernel.resetSettings(path)) {
        ctx.stderr(`lumenctl: no section named "${path}"\n`);
        return 1;
      }
      ctx.stdout(path ? `${path} reset to defaults\n` : 'settings reset to defaults\n');
      return 0;
    }

    throw new UsageError(`unknown action "${action}"`);
  },
});

define({
  name: 'service',
  usage: 'service list [category] | status id | start id | stop id | restart id',
  summary: 'list and control system services',
  group: 'system',
  run(args, ctx) {
    const kernel = needKernel(ctx, 'service');
    const [action = 'list', id] = args;
    const services = kernel.services();

    if (action === 'list') {
      const shown = id ? services.filter((s) => s.category === id) : services;
      if (shown.length === 0) {
        ctx.stderr(`service: no services in "${id}"\n`);
        return 1;
      }
      const width = Math.max(...shown.map((s) => s.id.length));
      for (const service of shown) {
        const kind = service.implemented ? '' : ' (declared)';
        ctx.stdout(
          `${service.id.padEnd(width)}  ${service.state.padEnd(10)}${service.name}${kind}\n`,
        );
      }
      return 0;
    }

    if (!id) throw new UsageError('missing service id');
    const service = services.find((s) => s.id === id);
    if (!service) {
      ctx.stderr(`service: no service named "${id}"\n`);
      return 1;
    }
    if (action === 'status') {
      ctx.stdout(`${service.name}\n${service.state}\n${service.description}\n`);
      return 0;
    }
    if (action === 'start' || action === 'stop' || action === 'restart') {
      const refusal = kernel.serviceControl(id, action);
      if (refusal) {
        ctx.stderr(`service: ${refusal}\n`);
        return 1;
      }
      ctx.stdout(
        `${id} ${action === 'stop' ? 'stopped' : action === 'start' ? 'started' : 'restarted'}\n`,
      );
      return 0;
    }
    throw new UsageError(`unknown action "${action}"`);
  },
});

define({
  name: 'kill',
  usage: 'kill [-9] pid…',
  summary: 'end a process; -9 does not let it come back',
  group: 'apps',
  run(args, ctx) {
    const kernel = needKernel(ctx, 'kill');
    const force = args.includes('-9') || args.includes('-KILL');
    const pids = args.filter((a) => !a.startsWith('-'));
    if (pids.length === 0) throw new UsageError('missing pid');
    let status = 0;
    for (const a of pids) {
      const pid = Number(a);
      if (!Number.isInteger(pid)) {
        ctx.stderr(`kill: ${a}: no such process\n`);
        status = 1;
        continue;
      }
      const process = kernel.ps().find((p) => p.pid === pid);
      // The file manager owns the desktop. Ending it restarts it; ending it
      // for good ends the session, which is the only way to be rid of it and
      // takes everything else with it.
      if (process?.appId === 'lumen.files' && force) {
        if (!ctx.state.env.LUMEN_SUDO) {
          ctx.stderr('kill: the file manager can only be forced under sudo\n');
          status = 1;
          continue;
        }
        ctx.stdout('the session is ending\n');
        kernel.endSession(`kill -9 ${pid}`);
        return 0;
      }
      if (!kernel.kill(pid)) {
        ctx.stderr(`kill: ${a}: no such process\n`);
        status = 1;
      }
    }
    return status;
  },
});

define({
  name: 'sudo',
  usage: 'sudo command [args…]',
  summary: 'run one command with administrator rights',
  group: 'system',
  async run(args, ctx) {
    const kernel = needKernel(ctx, 'sudo');
    if (args.length === 0) throw new UsageError('missing command');
    if (!kernel.hasPassword()) {
      ctx.stderr(
        'sudo: this account has no password, so there is nothing to check.\n' +
          'sudo: set one in Settings > Security before using sudo.\n',
      );
      return 1;
    }
    if (!ctx.password) {
      ctx.stderr('sudo: no way to ask for a password here\n');
      return 1;
    }
    const password = await ctx.password('Password:');
    if (password === null) {
      ctx.stderr('sudo: cancelled\n');
      return 1;
    }
    if (!(await kernel.authenticate(password))) {
      ctx.stderr('sudo: wrong password\n');
      return 1;
    }
    // The grant lasts for this command and no longer. Two things carry it:
    // LUMEN_SUDO, which commands and scripts can read, and the elevation the
    // VFS accepts for a protected path — minted here, where the password has
    // just been checked, and dropped again below whatever the command does.
    const before = ctx.state.env.LUMEN_SUDO;
    const beforeElevation = ctx.state.elevation;
    ctx.state.env.LUMEN_SUDO = '1';
    ctx.state.elevation = elevate(`sudo ${args.join(' ')}`);
    try {
      return await ctx.execute(args.map(quoteArg).join(' '));
    } finally {
      if (before === undefined) delete ctx.state.env.LUMEN_SUDO;
      else ctx.state.env.LUMEN_SUDO = before;
      ctx.state.elevation = beforeElevation;
    }
  },
});

define({
  name: 'edit',
  usage: 'edit file',
  summary: 'open a file in the text editor, creating it if needed',
  group: 'apps',
  async run(args, ctx) {
    const kernel = needKernel(ctx, 'edit');
    const file = args[0];
    if (file === undefined) throw new UsageError('missing file');
    const path = resolvePath(ctx.state, file);
    if (!(await ctx.vfs.exists(path))) await ctx.vfs.writeText(path, '');
    else if (await ctx.vfs.isDirectory(path)) {
      ctx.stderr(`edit: ${file}: Is a directory\n`);
      return 1;
    }
    return kernel.launch('lumen.editor', { path }) ? 0 : 1;
  },
});

// shell ───────────────────────────────────────────────────────────────────

define({
  name: 'help',
  usage: 'help [command]',
  summary: 'list commands, or show how to use one',
  group: 'shell',
  run(args, ctx) {
    const name = args[0];
    if (name !== undefined) {
      const spec = commands[name];
      if (!spec) {
        ctx.stderr(`help: no command named '${name}'\n`);
        return 1;
      }
      ctx.stdout(`usage: ${spec.usage}\n  ${spec.summary}\n`);
      return 0;
    }
    const groups: Array<[CommandGroup, string]> = [
      ['files', 'Files'],
      ['text', 'Text'],
      ['system', 'System'],
      ['apps', 'Apps'],
      ['shell', 'Shell'],
    ];
    const width = Math.max(...list.map((c) => c.name.length)) + 2;
    const out: string[] = [];
    for (const [group, label] of groups) {
      out.push(`${label}`);
      for (const c of list.filter((c) => c.group === group))
        out.push(`  ${c.name.padEnd(width)}${c.summary}`);
      out.push('');
    }
    out.push('Pipes (|), redirects (> >> <), && || ; and $(command) work as in a POSIX shell.');
    out.push('Type help <command> for its usage.');
    ctx.stdout(`${out.join('\n')}\n`);
    return 0;
  },
});

define({
  name: 'alias',
  usage: 'alias [name[=value]]',
  summary: 'define or list command aliases',
  group: 'shell',
  run(args, ctx) {
    const { aliases } = ctx.state;
    const show = (n: string) => ctx.stdout(`alias ${n}='${aliases[n]}'\n`);
    if (args.length === 0) {
      for (const n of Object.keys(aliases).sort()) show(n);
      return 0;
    }
    let status = 0;
    for (const a of args) {
      const eq = a.indexOf('=');
      if (eq < 0) {
        if (a in aliases) show(a);
        else {
          ctx.stderr(`alias: ${a}: not found\n`);
          status = 1;
        }
        continue;
      }
      const name = a.slice(0, eq);
      if (!/^[A-Za-z_][\w.-]*$/.test(name))
        throw new UsageError(`'${name}' is not a valid alias name`);
      aliases[name] = a.slice(eq + 1);
    }
    return status;
  },
});

define({
  name: 'unalias',
  usage: 'unalias [-a] name…',
  summary: 'remove aliases (-a: all)',
  group: 'shell',
  run(args, ctx) {
    const { flags, rest } = parseArgs(args);
    if (flags.has('a')) {
      for (const n of Object.keys(ctx.state.aliases)) delete ctx.state.aliases[n];
      return 0;
    }
    if (rest.length === 0) throw new UsageError('missing name');
    let status = 0;
    for (const n of rest) {
      if (n in ctx.state.aliases) delete ctx.state.aliases[n];
      else {
        ctx.stderr(`unalias: ${n}: not found\n`);
        status = 1;
      }
    }
    return status;
  },
});

define({
  name: 'history',
  usage: 'history [-c]',
  summary: 'show earlier commands (-c: forget them)',
  group: 'shell',
  run(args, ctx) {
    if (args.includes('-c')) {
      ctx.state.history.length = 0;
      return 0;
    }
    const width = String(ctx.state.history.length).length;
    ctx.state.history.forEach((line, i) => {
      ctx.stdout(`${String(i + 1).padStart(width + 2)}  ${line}\n`);
    });
    return 0;
  },
});

define({
  name: 'which',
  usage: 'which name…',
  summary: 'tell whether a name is a command or an alias',
  group: 'shell',
  run(args, ctx) {
    if (args.length === 0) throw new UsageError('missing name');
    let status = 0;
    for (const n of args) {
      if (n in ctx.state.aliases) ctx.stdout(`${n}: aliased to '${ctx.state.aliases[n]}'\n`);
      else if (commands[n]) ctx.stdout(`${n}: shell built-in command\n`);
      else {
        ctx.stderr(`${n} not found\n`);
        status = 1;
      }
    }
    return status;
  },
});

define({
  name: 'type',
  usage: 'type name…',
  summary: 'describe how a name would be interpreted',
  group: 'shell',
  run(args, ctx) {
    if (args.length === 0) throw new UsageError('missing name');
    let status = 0;
    for (const n of args) {
      if (n in ctx.state.aliases) ctx.stdout(`${n} is aliased to '${ctx.state.aliases[n]}'\n`);
      else if (commands[n]) ctx.stdout(`${n} is a shell builtin\n`);
      else {
        ctx.stderr(`${n}: not found\n`);
        status = 1;
      }
    }
    return status;
  },
});

define({
  name: 'run',
  usage: 'run script.lsh',
  summary: 'run a Lumen shell script file',
  group: 'shell',
  async run(args, ctx) {
    const file = args[0];
    if (file === undefined) throw new UsageError('missing script');
    let source: string;
    try {
      source = await ctx.vfs.readText(resolvePath(ctx.state, file));
    } catch (e) {
      ctx.stderr(`run: ${file}: ${describeError(e)}\n`);
      return 1;
    }
    return ctx.execute(source);
  },
});

define({
  name: 'clear',
  usage: 'clear',
  summary: 'clear the screen',
  group: 'shell',
  run(_args, ctx) {
    ctx.kernel?.clear();
    return 0;
  },
});

define({
  name: 'exit',
  usage: 'exit [code]',
  summary: 'close the terminal',
  group: 'shell',
  run(args, ctx) {
    const code = args[0] === undefined ? 0 : Number(args[0]);
    ctx.kernel?.exit();
    return Number.isInteger(code) ? code : 1;
  },
});

define({
  name: 'true',
  usage: 'true',
  summary: 'succeed',
  group: 'shell',
  run: () => 0,
});

define({
  name: 'false',
  usage: 'false',
  summary: 'fail',
  group: 'shell',
  run: () => 1,
});

/** Every command by name. */
export const commands: Record<string, CommandSpec> = Object.fromEntries(
  list.map((c) => [c.name, c]),
);

export function commandNames(): string[] {
  return list.map((c) => c.name).sort();
}
