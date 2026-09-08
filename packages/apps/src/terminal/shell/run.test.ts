import { MemoryAdapter, Vfs } from '@lumen/vfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createShellState, type ShellState } from './commands';
import { Shell } from './run';

const HOME = '/Users/ada';

interface Harness {
  vfs: Vfs;
  state: ShellState;
  shell: Shell;
  out: () => string;
  err: () => string;
  run: (source: string, signal?: AbortSignal) => Promise<number>;
}

async function harness(): Promise<Harness> {
  const vfs = new Vfs(new MemoryAdapter());
  await vfs.ensureDir(`${HOME}/Documents`);
  await vfs.writeText(`${HOME}/Documents/notes.txt`, 'pear\napple\npear\n');
  await vfs.writeText(`${HOME}/a.txt`, 'A\n');
  await vfs.writeText(`${HOME}/b.txt`, 'B\n');
  let out = '';
  let err = '';
  const state = createShellState({ home: HOME, user: 'ada', cwd: HOME });
  const shell = new Shell({
    vfs,
    state,
    columns: 80,
    io: { stdout: (t) => (out += t), stderr: (t) => (err += t) },
  });
  return {
    vfs,
    state,
    shell,
    out: () => out,
    err: () => err,
    run: async (source, signal) => {
      out = '';
      err = '';
      return shell.run(source, signal);
    },
  };
}

describe('pipes', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it('feeds stdout into the next command', async () => {
    await h.run('cat Documents/notes.txt | grep pear');
    expect(h.out()).toBe('pear\npear\n');
  });

  it('chains three stages', async () => {
    await h.run('cat Documents/notes.txt | sort | uniq -c | wc -l');
    expect(h.out().trim()).toBe('2');
  });

  it('returns the exit code of the last stage', async () => {
    expect(await h.run('echo hi | grep nothing')).toBe(1);
    expect(await h.run('echo hi | grep hi')).toBe(0);
  });

  it('sends stderr from a middle stage to the terminal', async () => {
    await h.run('cat missing.txt | wc -l');
    expect(h.err()).toContain('No such file');
    expect(h.out().trim()).toBe('0');
  });
});

describe('redirection', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it('> writes stdout to a file and truncates it', async () => {
    await h.run('echo first > out.txt');
    expect(await h.vfs.readText(`${HOME}/out.txt`)).toBe('first\n');
    await h.run('echo second > out.txt');
    expect(await h.vfs.readText(`${HOME}/out.txt`)).toBe('second\n');
    expect(h.out()).toBe('');
  });

  it('>> appends', async () => {
    await h.run('echo one > log.txt; echo two >> log.txt');
    expect(await h.vfs.readText(`${HOME}/log.txt`)).toBe('one\ntwo\n');
  });

  it('creates parent directories for the target', async () => {
    await h.run('echo hi > deep/nested/file.txt');
    expect(await h.vfs.readText(`${HOME}/deep/nested/file.txt`)).toBe('hi\n');
  });

  it('< reads stdin from a file', async () => {
    await h.run('grep pear < Documents/notes.txt');
    expect(h.out()).toBe('pear\npear\n');
    await h.run('wc -l < Documents/notes.txt');
    expect(h.out().trim()).toBe('3');
  });

  it('reports a missing input file', async () => {
    expect(await h.run('wc -l < nope.txt')).toBe(1);
    expect(h.err()).toContain('No such file');
  });

  it('combines a redirect with a pipeline', async () => {
    await h.run('cat Documents/notes.txt | sort -u > sorted.txt');
    expect(await h.vfs.readText(`${HOME}/sorted.txt`)).toBe('apple\npear\n');
  });
});

describe('sequencing', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it('; runs both regardless of status', async () => {
    await h.run('false; echo after');
    expect(h.out()).toBe('after\n');
  });

  it('&& runs the second only on success', async () => {
    await h.run('true && echo yes');
    expect(h.out()).toBe('yes\n');
    await h.run('false && echo no');
    expect(h.out()).toBe('');
  });

  it('|| runs the second only on failure', async () => {
    await h.run('false || echo recovered');
    expect(h.out()).toBe('recovered\n');
    await h.run('true || echo skipped');
    expect(h.out()).toBe('');
  });

  it('chains && and ||', async () => {
    await h.run('true && false || echo fallback');
    expect(h.out()).toBe('fallback\n');
  });

  it('runs each line of a multi-line script and skips comments', async () => {
    await h.run('# a comment\necho one\n\necho two\n');
    expect(h.out()).toBe('one\ntwo\n');
  });
});

describe('$? and variables', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it('exposes the last exit code as $?', async () => {
    await h.run('false; echo $?');
    expect(h.out()).toBe('1\n');
    await h.run('true; echo $?');
    expect(h.out()).toBe('0\n');
  });

  it('keeps exported variables across commands', async () => {
    await h.run('export NAME=Ada; echo "hello $NAME"');
    expect(h.out()).toBe('hello Ada\n');
  });

  it('tracks PWD as the directory changes', async () => {
    await h.run('cd Documents; echo $PWD');
    expect(h.out()).toBe(`${HOME}/Documents\n`);
  });
});

describe('command substitution', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it('captures stdout of the inner command', async () => {
    await h.run('echo "user is $(whoami)"');
    expect(h.out()).toBe('user is ada\n');
  });

  it('works with pwd and nested pipelines', async () => {
    await h.run('cd Documents; echo $(pwd)');
    expect(h.out()).toBe(`${HOME}/Documents\n`);
    // The `cd` above persists in the session, so address the file from home.
    await h.run('echo $(cat ~/Documents/notes.txt | sort -u | wc -l)');
    expect(h.out()).toBe('2\n');
  });

  it('does not leak the inner exit code into $?', async () => {
    await h.run('true; echo $(false) $?');
    expect(h.out()).toBe('0\n');
  });

  it('substitutes into a redirect target', async () => {
    await h.run('echo hi > $(echo named).txt');
    expect(await h.vfs.readText(`${HOME}/named.txt`)).toBe('hi\n');
  });
});

describe('globbing and aliases', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it('expands a glob to matching file names', async () => {
    await h.run('cat *.txt');
    expect(h.out()).toBe('A\nB\n');
  });

  it('applies an alias, including its arguments', async () => {
    await h.run('alias ll="ls -l"; ll Documents');
    expect(h.out()).toContain('notes.txt');
    expect(h.out()).toMatch(/^- /m);
  });

  it('does not recurse when an alias names itself', async () => {
    await h.run('alias echo="echo prefix"; echo tail');
    expect(h.out()).toBe('prefix tail\n');
  });
});

describe('errors and interruption', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it('reports an unknown command with status 127', async () => {
    expect(await h.run('nosuchcommand')).toBe(127);
    expect(h.err()).toBe('lsh: nosuchcommand: command not found\n');
  });

  it('prints usage for bad arguments with status 2', async () => {
    expect(await h.run('mkdir')).toBe(2);
    expect(h.err()).toContain('usage: mkdir [-p] dir…');
  });

  it('reports a syntax error without running anything', async () => {
    expect(await h.run('echo hi |')).toBe(2);
    expect(h.err()).toContain('lsh:');
    expect(h.out()).toBe('');
  });

  it('stops a running command on abort with status 130', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const done = h.run('sleep 5 && echo never', controller.signal);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    expect(await done).toBe(130);
    expect(h.out()).toBe('');
    vi.useRealTimers();
  });

  it('skips later statements once aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await h.run('echo one; echo two', controller.signal)).toBe(130);
    expect(h.out()).toBe('');
  });
});
