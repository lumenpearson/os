import { MemoryAdapter, Vfs } from '@lumen/vfs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createShellState, type ShellState } from './commands';
import { applyCompletion, commonPrefix, complete, fragmentAt, isCommandPosition } from './complete';

const HOME = '/Users/ada';

let vfs: Vfs;
let state: ShellState;

beforeEach(async () => {
  vfs = new Vfs(new MemoryAdapter());
  await vfs.ensureDir(`${HOME}/Documents`);
  await vfs.ensureDir(`${HOME}/Downloads`);
  await vfs.writeText(`${HOME}/Documents/notes.txt`, '');
  await vfs.writeText(`${HOME}/Documents/nothing.txt`, '');
  await vfs.writeText(`${HOME}/report.pdf`, '');
  await vfs.writeText(`${HOME}/.profile`, '');
  state = createShellState({ home: HOME, user: 'ada', cwd: HOME });
});

/** Complete at the end of a line. */
const at = (line: string) => complete({ vfs, state, line, cursor: line.length });

describe('fragmentAt', () => {
  it('finds the word under the cursor', () => {
    expect(fragmentAt('ls Doc', 6)).toMatchObject({ start: 3, text: 'Doc' });
    expect(fragmentAt('ls ', 3)).toMatchObject({ start: 3, text: '' });
    expect(fragmentAt('ls', 2)).toMatchObject({ start: 0, text: 'ls' });
  });

  it('starts a new word after an operator', () => {
    expect(fragmentAt('cat a | gr', 10).start).toBe(8);
    expect(fragmentAt('echo x > fi', 11).start).toBe(9);
  });

  it('keeps an escaped space inside the word', () => {
    expect(fragmentAt('ls my\\ fi', 9)).toMatchObject({ start: 3, text: 'my\\ fi' });
  });
});

describe('isCommandPosition', () => {
  it('is true at the start and after a pipe or separator', () => {
    expect(isCommandPosition('gr', 0)).toBe(true);
    expect(isCommandPosition('ls | gr', 5)).toBe(true);
    expect(isCommandPosition('ls; gr', 4)).toBe(true);
    expect(isCommandPosition('ls Doc', 3)).toBe(false);
  });
});

describe('commonPrefix', () => {
  it('returns the longest shared start', () => {
    expect(commonPrefix(['notes', 'nothing'])).toBe('not');
    expect(commonPrefix(['abc'])).toBe('abc');
    expect(commonPrefix(['abc', 'xyz'])).toBe('');
    expect(commonPrefix([])).toBe('');
  });
});

describe('command completion', () => {
  it('completes a unique command name and adds a space', async () => {
    const c = await at('whoa');
    expect(c.replacement).toBe('whoami');
    expect(c.trailingSpace).toBe(true);
    expect(applyCompletion('whoa', c).line).toBe('whoami ');
  });

  it('lists candidates and fills the common prefix when ambiguous', async () => {
    const c = await at('t');
    expect(c.candidates).toContain('tree');
    expect(c.candidates).toContain('touch');
    expect(c.candidates.length).toBeGreaterThan(2);
    expect(c.trailingSpace).toBe(false);
  });

  it('extends to the common prefix', async () => {
    const c = await at('un');
    expect(c.candidates).toEqual(['unalias', 'uname', 'uniq', 'unset']);
    expect(c.replacement).toBe('un');
  });

  it('includes aliases among command candidates', async () => {
    state.aliases.ll = 'ls -l';
    const c = await at('l');
    expect(c.candidates).toContain('ll');
    expect(c.candidates).toContain('ls');
  });

  it('leaves the line alone when nothing matches', async () => {
    const c = await at('zzz');
    expect(c.replacement).toBe('zzz');
    expect(c.candidates).toEqual([]);
  });

  it('completes after a pipe as a command', async () => {
    const c = await at('cat x | grep');
    expect(c.replacement).toBe('grep');
    expect(c.start).toBe(8);
  });
});

describe('path completion', () => {
  it('completes a directory with a trailing slash and no space', async () => {
    const c = await at('cd Doc');
    expect(c.replacement).toBe('Documents/');
    expect(c.trailingSpace).toBe(false);
    expect(applyCompletion('cd Doc', c).line).toBe('cd Documents/');
  });

  it('completes a file and adds a space', async () => {
    const c = await at('cat rep');
    expect(c.replacement).toBe('report.pdf');
    expect(c.trailingSpace).toBe(true);
  });

  it('lists candidates inside a directory', async () => {
    const c = await at('cat Documents/n');
    expect(c.candidates).toEqual(['notes.txt', 'nothing.txt']);
    expect(c.replacement).toBe('Documents/not');
  });

  it('completes inside a directory given by an absolute path', async () => {
    const c = await at('ls /Users/ada/Doc');
    expect(c.replacement).toBe('/Users/ada/Documents/');
  });

  it('expands ~ when completing', async () => {
    const c = await at('ls ~/Down');
    expect(c.replacement).toBe('~/Downloads/');
  });

  it('hides dotfiles unless the fragment starts with a dot', async () => {
    const listing = await at('ls ');
    expect(listing.candidates).not.toContain('.profile');
    const dotted = await at('ls .pro');
    expect(dotted.replacement).toBe('.profile');
  });

  it('lists every entry for an empty fragment', async () => {
    const c = await at('ls ');
    expect(c.candidates).toEqual(['Documents/', 'Downloads/', 'report.pdf']);
    expect(c.start).toBe(3);
  });

  it('treats a fragment with a slash as a path even in command position', async () => {
    const c = await at('./Doc');
    expect(c.replacement).toBe('./Documents/');
  });

  it('escapes spaces in a completed name', async () => {
    await vfs.writeText(`${HOME}/my file.txt`, '');
    const c = await at('cat my');
    expect(c.replacement).toBe('my\\ file.txt');
    expect(applyCompletion('cat my', c).line).toBe('cat my\\ file.txt ');
  });

  it('returns the fragment unchanged for a missing directory', async () => {
    const c = await at('ls nowhere/x');
    expect(c.candidates).toEqual([]);
    expect(c.replacement).toBe('nowhere/x');
  });
});

describe('applyCompletion', () => {
  it('replaces only the fragment and keeps the tail', async () => {
    const c = await complete({ vfs, state, line: 'cat Doc extra', cursor: 7 });
    const applied = applyCompletion('cat Doc extra', c);
    expect(applied.line).toBe('cat Documents/ extra');
    expect(applied.cursor).toBe(14);
  });
});
