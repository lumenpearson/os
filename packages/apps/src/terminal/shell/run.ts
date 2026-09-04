/**
 * The executor: turns shell source into effects. It expands words (variables,
 * `$(…)`, globs, `~`), applies aliases, connects a pipeline's stdout to the
 * next command's stdin, performs `>`/`>>`/`<` against the VFS, and honours
 * `;`, `&&` and `||` with exit codes in `$?`.
 */

import { dirname, type Vfs } from '@lumen/vfs';
import {
  type CommandContext,
  commands,
  describeError,
  isAbortError,
  resolvePath,
  type ShellKernel,
  type ShellState,
  UsageError,
} from './commands';
import {
  type CommandAst,
  type ExpandContext,
  expandCommand,
  literalWord,
  parseScript,
  parseWords,
  ShellSyntaxError,
  type Statement,
} from './parse';

export interface ShellIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface ShellOptions {
  vfs: Vfs;
  state: ShellState;
  io: ShellIo;
  kernel?: ShellKernel;
  signal?: AbortSignal;
  /** Terminal width in characters, for `ls` columns. */
  columns?: number;
}

/** Guards against `alias ls='ls -l'` recursing forever. */
const MAX_ALIAS_DEPTH = 16;

export class Shell {
  readonly state: ShellState;
  private readonly vfs: Vfs;
  private readonly io: ShellIo;
  private readonly kernel?: ShellKernel;
  private readonly width: number;
  signal?: AbortSignal;

  constructor(options: ShellOptions) {
    this.vfs = options.vfs;
    this.state = options.state;
    this.io = options.io;
    this.kernel = options.kernel;
    this.width = options.columns ?? 80;
    this.signal = options.signal;
  }

  /** Run shell source and return the exit code of the last statement. */
  async run(source: string, signal?: AbortSignal): Promise<number> {
    if (signal) this.signal = signal;
    let statements: Statement[];
    try {
      statements = parseScript(source);
    } catch (e) {
      if (e instanceof ShellSyntaxError) {
        this.io.stderr(`lsh: ${e.message}\n`);
        this.state.lastStatus = 2;
        return 2;
      }
      throw e;
    }
    return this.runStatements(statements, this.io);
  }

  private async runStatements(statements: Statement[], io: ShellIo): Promise<number> {
    let status = this.state.lastStatus;
    let first = true;
    for (const statement of statements) {
      if (this.signal?.aborted) return 130;
      if (!first) {
        if (statement.run === 'if-success' && status !== 0) continue;
        if (statement.run === 'if-failure' && status === 0) continue;
      }
      first = false;
      status = await this.runPipeline(statement.pipeline, io);
      this.state.lastStatus = status;
      this.state.env.PWD = this.state.cwd;
    }
    return status;
  }

  /** Command substitution: run the inner source with stdout collected. */
  private async capture(source: string, io: ShellIo): Promise<string> {
    let out = '';
    const inner: ShellIo = { stdout: (t) => (out += t), stderr: io.stderr };
    let statements: Statement[];
    try {
      statements = parseScript(source);
    } catch (e) {
      if (e instanceof ShellSyntaxError) {
        io.stderr(`lsh: ${e.message}\n`);
        return '';
      }
      throw e;
    }
    const saved = this.state.lastStatus;
    await this.runStatements(statements, inner);
    this.state.lastStatus = saved;
    return out;
  }

  private contextFor(io: ShellIo): ExpandContext {
    return {
      home: this.state.home,
      cwd: this.state.cwd,
      lookup: (name) => (name === '?' ? String(this.state.lastStatus) : this.state.env[name]),
      listDir: async (path) => {
        try {
          return (await this.vfs.readDir(resolvePath(this.state, path))).map((e) => e.name);
        } catch {
          return [];
        }
      },
      // A substitution's stderr still reaches the terminal; only stdout is captured.
      substitute: (source) => this.capture(source, io),
    };
  }

  /** Replace a leading alias with its definition, repeatedly. */
  private async resolveAlias(cmd: CommandAst, io: ShellIo): Promise<CommandAst> {
    let current = cmd;
    const seen = new Set<string>();
    for (let depth = 0; depth < MAX_ALIAS_DEPTH; depth++) {
      const head = current.words[0];
      if (!head) return current;
      const name = literalWord(head);
      if (name === null || seen.has(name)) return current;
      const value = this.state.aliases[name];
      if (value === undefined) return current;
      seen.add(name);
      try {
        const words = parseWords(value);
        if (words.length === 0) return { ...current, words: current.words.slice(1) };
        current = { ...current, words: [...words, ...current.words.slice(1)] };
      } catch (e) {
        io.stderr(`lsh: alias ${name}: ${(e as Error).message}\n`);
        return current;
      }
    }
    return current;
  }

  private async runPipeline(pipeline: CommandAst[], io: ShellIo): Promise<number> {
    let stdin = '';
    let status = 0;
    for (let i = 0; i < pipeline.length; i++) {
      if (this.signal?.aborted) return 130;
      const last = i === pipeline.length - 1;
      let piped = '';
      const stage: ShellIo = last ? io : { stdout: (t) => (piped += t), stderr: io.stderr };
      status = await this.runCommand(pipeline[i] as CommandAst, stdin, stage, io);
      stdin = piped;
    }
    return status;
  }

  private async runCommand(
    ast: CommandAst,
    stdin: string,
    io: ShellIo,
    errIo: ShellIo,
  ): Promise<number> {
    const resolved = await this.resolveAlias(ast, errIo);
    let args: string[];
    let redirects: Array<{ op: '>' | '>>' | '<'; target: string }>;
    try {
      const expanded = await expandCommand(resolved, this.contextFor(errIo));
      args = expanded.args;
      redirects = expanded.redirects;
    } catch (e) {
      if (isAbortError(e)) return 130;
      errIo.stderr(`lsh: ${e instanceof Error ? e.message : String(e)}\n`);
      return 2;
    }

    const name = args[0];
    if (name === undefined) {
      // Only redirections: `> file` creates or truncates it.
      for (const r of redirects) {
        if (r.op === '<') continue;
        try {
          await this.writeRedirect(r.op, r.target, '');
        } catch (e) {
          errIo.stderr(`lsh: ${r.target}: ${describeError(e)}\n`);
          return 1;
        }
      }
      return 0;
    }

    const spec = commands[name];
    if (!spec) {
      errIo.stderr(`lsh: ${name}: command not found\n`);
      return 127;
    }

    let input = stdin;
    for (const r of redirects) {
      if (r.op !== '<') continue;
      try {
        input = await this.vfs.readText(resolvePath(this.state, r.target));
      } catch (e) {
        errIo.stderr(`lsh: ${r.target}: ${describeError(e)}\n`);
        return 1;
      }
    }

    const outputs = redirects.filter((r) => r.op !== '<');
    let captured = '';
    const stdout = outputs.length > 0 ? (t: string) => (captured += t) : io.stdout;

    const ctx: CommandContext = {
      vfs: this.vfs,
      state: this.state,
      stdin: input,
      stdout,
      stderr: errIo.stderr,
      signal: this.signal,
      kernel: this.kernel,
      columns: this.width,
      execute: (source) => this.runNested(source, { stdout, stderr: errIo.stderr }),
    };

    let status: number;
    try {
      status = await spec.run(args.slice(1), ctx);
    } catch (e) {
      if (isAbortError(e)) return 130;
      if (e instanceof UsageError) {
        errIo.stderr(`${name}: ${e.message}\nusage: ${spec.usage}\n`);
        return 2;
      }
      errIo.stderr(`${name}: ${describeError(e)}\n`);
      return 1;
    }

    for (const r of outputs) {
      try {
        await this.writeRedirect(r.op, r.target, captured);
      } catch (e) {
        errIo.stderr(`lsh: ${r.target}: ${describeError(e)}\n`);
        return 1;
      }
    }
    return status;
  }

  /** `run script.lsh` and command substitution share the session but not the sinks. */
  private async runNested(source: string, io: ShellIo): Promise<number> {
    let statements: Statement[];
    try {
      statements = parseScript(source);
    } catch (e) {
      if (e instanceof ShellSyntaxError) {
        io.stderr(`lsh: ${e.message}\n`);
        return 2;
      }
      throw e;
    }
    return this.runStatements(statements, io);
  }

  private async writeRedirect(op: '>' | '>>', target: string, text: string): Promise<void> {
    const path = resolvePath(this.state, target);
    await this.vfs.ensureDir(dirname(path));
    if (op === '>') {
      await this.vfs.writeText(path, text);
      return;
    }
    let existing = '';
    try {
      existing = await this.vfs.readText(path);
    } catch {
      existing = '';
    }
    await this.vfs.writeText(path, existing + text);
  }
}

/** Convenience for tests and one-off runs. */
export async function runSource(source: string, options: ShellOptions): Promise<number> {
  return new Shell(options).run(source);
}
