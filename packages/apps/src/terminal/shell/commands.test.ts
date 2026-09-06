import { elevate, MemoryAdapter, Vfs } from '@lumen/vfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createShellState,
  parseArgs,
  resolvePath,
  type ShellKernel,
  type ShellState,
  splitLines,
} from './commands';
import { Shell } from './run';

const HOME = '/Users/ada';

async function seed(): Promise<Vfs> {
  const vfs = new Vfs(new MemoryAdapter());
  await vfs.ensureDir(`${HOME}/Documents`);
  await vfs.ensureDir(`${HOME}/Projects/site`);
  await vfs.writeText(`${HOME}/Documents/notes.txt`, 'beta\nalpha\nbeta\ngamma\n');
  await vfs.writeText(`${HOME}/Documents/todo.txt`, 'buy milk\nwrite tests\n');
  await vfs.writeText(`${HOME}/Documents/data.csv`, 'name,age\nada,36\nalan,41\n');
  await vfs.writeText(`${HOME}/Projects/site/index.html`, '<h1>Hi</h1>\n');
  await vfs.writeText(`${HOME}/Projects/hello.lsh`, '# a script\necho from script\n');
  await vfs.writeText(`${HOME}/.profile`, 'hidden\n');
  await vfs.writeJson(`${HOME}/Documents/app.json`, { name: 'Lumen', window: { width: 800 } });
  return vfs;
}

interface Harness {
  vfs: Vfs;
  state: ShellState;
  out: () => string;
  err: () => string;
  run: (source: string) => Promise<number>;
  kernel: ShellKernel;
}

/**
 * `password` stands in for the person at the keyboard. Leave it out and there
 * is nobody to ask, which is how sudo behaves in a script.
 */
function harness(
  kernelOverrides: Partial<ShellKernel> = {},
  vfs?: Vfs,
  password?: (prompt: string) => Promise<string | null>,
): Harness {
  let out = '';
  let err = '';
  const state = createShellState({ home: HOME, user: 'ada', cwd: HOME });
  const kernel: ShellKernel = {
    version: '0.1.0',
    open: vi.fn(),
    launch: vi.fn(() => ({ pid: 101 })),
    apps: () => [
      { id: 'lumen.files', name: 'Files' },
      { id: 'lumen.editor', name: 'Text Editor' },
    ],
    ps: () => [
      {
        pid: 100,
        appId: 'lumen.terminal',
        name: 'Terminal',
        cpu: 2.5,
        memory: 32 * 1024 * 1024,
        startedAt: Date.parse('2026-09-04T10:00:00Z'),
      },
    ],
    kill: vi.fn((pid: number) => pid === 100),
    theme: vi.fn(() => 'dark' as const),
    lock: vi.fn(),
    exit: vi.fn(),
    clear: vi.fn(),
    sysinfo: async () => ({
      os: 'Linux',
      kernel: 'lumen 0.1.0 (web)',
      host: 'web',
      uptime: 3661,
      cpu: '8-core x64',
      memory: { total: 8 * 1024 ** 3, available: 4 * 1024 ** 3 },
      resolution: '1920x1080',
    }),
    settings: () => ({
      appearance: { theme: 'auto', blur: 14, reduceMotion: false },
      taskbar: { size: 44, items: ['start', 'search'] },
    }),
    setSetting: vi.fn(() => true),
    resetSettings: vi.fn(() => true),
    services: () => [
      {
        id: 'com.lumen.dock',
        name: 'Dock',
        category: 'shell',
        state: 'running',
        implemented: true,
        description: 'Draws the taskbar.',
      },
      {
        id: 'com.lumen.printd',
        name: 'Print Spooler',
        category: 'printing',
        state: 'on-demand',
        implemented: false,
        description: 'Queues documents.',
      },
    ],
    serviceControl: vi.fn(() => null),
    hasPassword: () => true,
    authenticate: async (password: string) => password === 'secret',
    endSession: vi.fn(),
    ...kernelOverrides,
  };
  const filesystem = vfs as Vfs;
  const shell = new Shell({
    vfs: filesystem,
    state,
    kernel,
    columns: 80,
    io: { stdout: (t) => (out += t), stderr: (t) => (err += t) },
    ...(password ? { password } : {}),
  });
  return {
    vfs: filesystem,
    state,
    kernel,
    out: () => out,
    err: () => err,
    run: async (source) => {
      out = '';
      err = '';
      return shell.run(source);
    },
  };
}

describe('parseArgs', () => {
  it('splits clustered flags and reads option values', () => {
    const a = parseArgs(['-la', '-n', '5', 'file'], { value: ['n'] });
    expect([...a.flags]).toEqual(['l', 'a']);
    expect(a.values.get('n')).toBe('5');
    expect(a.rest).toEqual(['file']);
  });

  it('accepts attached and bare numeric values', () => {
    expect(parseArgs(['-n3'], { value: ['n'] }).values.get('n')).toBe('3');
    expect(parseArgs(['-5'], { numeric: 'n' }).values.get('n')).toBe('5');
  });

  it('stops option parsing at --', () => {
    expect(parseArgs(['--', '-x']).rest).toEqual(['-x']);
  });
});

describe('splitLines', () => {
  it('ignores the newline that ends the last line', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
    expect(splitLines('a\nb')).toEqual(['a', 'b']);
    expect(splitLines('')).toEqual([]);
  });
});

describe('resolvePath', () => {
  it('resolves ~, absolute and relative paths', () => {
    const state = createShellState({ home: HOME, user: 'ada', cwd: `${HOME}/Documents` });
    expect(resolvePath(state, '~')).toBe(HOME);
    expect(resolvePath(state, '~/x')).toBe(`${HOME}/x`);
    expect(resolvePath(state, '/etc')).toBe('/etc');
    expect(resolvePath(state, 'a/b')).toBe(`${HOME}/Documents/a/b`);
    expect(resolvePath(state, '..')).toBe(HOME);
  });
});

describe('file commands', () => {
  let h: Harness;
  beforeEach(async () => {
    h = harness({}, await seed());
  });

  it('ls lists names in columns and marks directories', async () => {
    await h.run('ls');
    expect(h.out()).toContain('Documents/');
    expect(h.out()).toContain('Projects/');
    expect(h.out()).not.toContain('.profile');
  });

  it('ls -a includes dotfiles, ls -l shows kind, size and date', async () => {
    await h.run('ls -a');
    expect(h.out()).toContain('.profile');
    await h.run('ls -l Documents');
    const line = splitLines(h.out()).find((l) => l.endsWith('notes.txt')) as string;
    expect(line.startsWith('- ')).toBe(true);
    expect(line).toContain('22');
  });

  it('ls -h prints readable sizes and reports missing paths', async () => {
    await h.run('ls -lh Documents/notes.txt');
    expect(h.out()).toContain('22 B');
    expect(await h.run('ls nope')).toBe(1);
    expect(h.err()).toBe('ls: nope: No such file or directory\n');
  });

  it('cd changes directory, remembers the previous one and rejects files', async () => {
    await h.run('cd Documents');
    expect(h.state.cwd).toBe(`${HOME}/Documents`);
    await h.run('cd -');
    expect(h.state.cwd).toBe(HOME);
    await h.run('cd');
    expect(h.state.cwd).toBe(HOME);
    expect(await h.run('cd Documents/notes.txt')).toBe(1);
    expect(h.err()).toContain('Not a directory');
  });

  it('pwd prints the working directory', async () => {
    await h.run('cd Projects/site; pwd');
    expect(h.out().trim()).toBe(`${HOME}/Projects/site`);
  });

  it('cat prints files and reports missing ones', async () => {
    await h.run('cat Documents/todo.txt');
    expect(h.out()).toBe('buy milk\nwrite tests\n');
    expect(await h.run('cat missing.txt')).toBe(1);
    expect(h.err()).toContain('No such file');
  });

  it('mkdir -p creates parents; plain mkdir fails on a missing parent', async () => {
    expect(await h.run('mkdir -p a/b/c')).toBe(0);
    expect(await h.vfs.isDirectory(`${HOME}/a/b/c`)).toBe(true);
    expect(await h.run('mkdir x/y')).toBe(1);
  });

  it('touch creates a file and leaves content alone', async () => {
    await h.run('touch fresh.txt');
    expect(await h.vfs.readText(`${HOME}/fresh.txt`)).toBe('');
    await h.run('touch Documents/todo.txt');
    expect(await h.vfs.readText(`${HOME}/Documents/todo.txt`)).toBe('buy milk\nwrite tests\n');
  });

  it('rm needs -r for directories and -f ignores missing files', async () => {
    expect(await h.run('rm Projects')).toBe(1);
    expect(await h.run('rm -r Projects/site')).toBe(0);
    expect(await h.vfs.exists(`${HOME}/Projects/site`)).toBe(false);
    expect(await h.run('rm gone.txt')).toBe(1);
    expect(await h.run('rm -f gone.txt')).toBe(0);
  });

  it('rmdir only removes empty directories', async () => {
    expect(await h.run('rmdir Documents')).toBe(1);
    await h.run('mkdir empty && rmdir empty');
    expect(await h.vfs.exists(`${HOME}/empty`)).toBe(false);
  });

  it('mv renames and moves into a directory', async () => {
    await h.run('mv Documents/todo.txt Documents/tasks.txt');
    expect(await h.vfs.exists(`${HOME}/Documents/tasks.txt`)).toBe(true);
    await h.run('mv Documents/tasks.txt Projects');
    expect(await h.vfs.exists(`${HOME}/Projects/tasks.txt`)).toBe(true);
  });

  it('cp copies a file and needs -r for a tree', async () => {
    await h.run('cp Documents/notes.txt copy.txt');
    expect(await h.vfs.readText(`${HOME}/copy.txt`)).toContain('alpha');
    expect(await h.run('cp Projects backup')).toBe(1);
    expect(await h.run('cp -r Projects backup')).toBe(0);
    expect(await h.vfs.exists(`${HOME}/backup/site/index.html`)).toBe(true);
  });

  it('find filters by name and type', async () => {
    await h.run('find . -name "*.txt"');
    expect(splitLines(h.out()).sort()).toEqual(['./Documents/notes.txt', './Documents/todo.txt']);
    await h.run('find Projects -type d');
    expect(splitLines(h.out())).toEqual(['Projects', 'Projects/site']);
  });

  it('tree draws the hierarchy and honours -L', async () => {
    await h.run('tree Projects');
    expect(h.out()).toContain('└── ');
    expect(h.out()).toContain('index.html');
    expect(h.out()).toContain('1 directory, 2 files');
    await h.run('tree -L 1 Projects');
    expect(h.out()).not.toContain('index.html');
  });

  it('stat reports kind, size and dates', async () => {
    await h.run('stat Documents/notes.txt');
    expect(h.out()).toContain('Kind: file (txt)');
    expect(h.out()).toContain('Size: 22 bytes');
  });

  it('du totals a tree and df reports usage', async () => {
    await h.run('du -s Documents');
    expect(Number(splitLines(h.out())[0]?.trim().split(/\s+/)[0])).toBeGreaterThan(0);
    await h.run('df');
    expect(h.out()).toContain('Mounted on');
    expect(h.out()).toContain('lumen-vfs');
  });

  it('basename and dirname split a path', async () => {
    await h.run('basename /a/b/c.txt; dirname /a/b/c.txt; basename /a/b/c.txt .txt');
    expect(splitLines(h.out())).toEqual(['c.txt', '/a/b', 'c']);
  });
});

describe('text commands', () => {
  let h: Harness;
  beforeEach(async () => {
    h = harness({}, await seed());
  });

  it('echo prints, -n omits the newline, -e reads escapes', async () => {
    await h.run('echo hello world');
    expect(h.out()).toBe('hello world\n');
    await h.run('echo -n bare');
    expect(h.out()).toBe('bare');
    await h.run('echo -e "a\\tb"');
    expect(h.out()).toBe('a\tb\n');
  });

  it('printf formats %s and %d', async () => {
    await h.run('printf "%s is %d\\n" ada 36');
    expect(h.out()).toBe('ada is 36\n');
    await h.run('printf "%5s|%-5s|\\n" ab cd');
    expect(h.out()).toBe('   ab|cd   |\n');
  });

  it('head and tail take -n', async () => {
    await h.run('head -n 2 Documents/notes.txt');
    expect(h.out()).toBe('beta\nalpha\n');
    await h.run('tail -1 Documents/notes.txt');
    expect(h.out()).toBe('gamma\n');
  });

  it('wc counts lines, words and bytes', async () => {
    await h.run('wc -l Documents/notes.txt');
    expect(h.out().trim().split(/\s+/)).toEqual(['4', 'Documents/notes.txt']);
    await h.run('wc -w Documents/todo.txt');
    expect(h.out().trim().startsWith('4')).toBe(true);
  });

  it('grep matches, inverts, numbers and ignores case', async () => {
    await h.run('grep beta Documents/notes.txt');
    expect(h.out()).toBe('beta\nbeta\n');
    await h.run('grep -n alpha Documents/notes.txt');
    expect(h.out()).toBe('2:alpha\n');
    await h.run('grep -v beta Documents/notes.txt');
    expect(h.out()).toBe('alpha\ngamma\n');
    await h.run('grep -i BETA Documents/notes.txt');
    expect(h.out()).toBe('beta\nbeta\n');
    expect(await h.run('grep nothing Documents/notes.txt')).toBe(1);
  });

  it('sort and uniq work over stdin', async () => {
    await h.run('sort Documents/notes.txt');
    expect(h.out()).toBe('alpha\nbeta\nbeta\ngamma\n');
    await h.run('sort -r Documents/notes.txt');
    expect(h.out()).toBe('gamma\nbeta\nbeta\nalpha\n');
    await h.run('sort Documents/notes.txt | uniq -c');
    expect(splitLines(h.out()).map((l) => l.trim())).toEqual(['1 alpha', '2 beta', '1 gamma']);
  });

  it('sort -n orders numerically', async () => {
    await h.run('printf "10\\n9\\n100\\n" | sort -n');
    expect(h.out()).toBe('9\n10\n100\n');
  });

  it('cut selects delimited fields', async () => {
    await h.run('cut -d , -f 1 Documents/data.csv');
    expect(h.out()).toBe('name\nada\nalan\n');
    await h.run('cut -d , -f 1,2 Documents/data.csv | tail -n 1');
    expect(h.out()).toBe('alan,41\n');
  });

  it('tr translates and deletes characters', async () => {
    await h.run('echo hello | tr a-z A-Z');
    expect(h.out()).toBe('HELLO\n');
    await h.run('echo hello | tr -d l');
    expect(h.out()).toBe('heo\n');
  });

  it('seq counts with an optional step', async () => {
    await h.run('seq 3');
    expect(h.out()).toBe('1\n2\n3\n');
    await h.run('seq 1 2 5');
    expect(h.out()).toBe('1\n3\n5\n');
  });

  it('json pretty-prints and picks a value by path', async () => {
    await h.run('json Documents/app.json name');
    expect(h.out()).toBe('Lumen\n');
    await h.run('json Documents/app.json window.width');
    expect(h.out()).toBe('800\n');
    expect(await h.run('json Documents/app.json missing.key')).toBe(1);
  });

  it('b64 round-trips', async () => {
    await h.run('b64 encode hello');
    expect(h.out()).toBe('aGVsbG8=\n');
    await h.run('b64 decode aGVsbG8=');
    expect(h.out()).toBe('hello\n');
    expect(await h.run('b64 decode !!!')).toBe(1);
  });

  it('calc evaluates arithmetic and reports errors', async () => {
    // `*` between spaces is a glob, so an expression with spaces needs quoting.
    await h.run('calc "2 + 3 * 4"');
    expect(h.out()).toBe('14\n');
    await h.run('calc 2*3+1');
    expect(h.out()).toBe('7\n');
    await h.run('calc "(2+3)^2 % 7"');
    expect(h.out()).toBe('4\n');
    expect(await h.run('calc 1/0')).toBe(1);
    expect(h.err()).toContain('division by zero');
  });
});

describe('system and shell commands', () => {
  let h: Harness;
  beforeEach(async () => {
    h = harness({}, await seed());
  });

  it('whoami, hostname and uname report identity', async () => {
    await h.run('whoami; hostname; uname');
    expect(splitLines(h.out())).toEqual(['ada', 'lumen', 'Lumen']);
    await h.run('uname -a');
    expect(h.out()).toContain('lumen 0.1.0 (web)');
  });

  it('date accepts a + format', async () => {
    await h.run('date +%Y');
    expect(h.out().trim()).toMatch(/^\d{4}$/);
    expect(await h.run('date %Y')).toBe(2);
  });

  it('cal prints a month grid', async () => {
    await h.run('cal 9 2026');
    const lines = splitLines(h.out());
    expect(lines[0]).toContain('September 2026');
    expect(lines[1]).toBe('Mo Tu We Th Fr Sa Su');
  });

  it('uptime and sysinfo summarise the machine', async () => {
    await h.run('uptime');
    expect(h.out()).toContain('up 1:01');
    await h.run('sysinfo');
    expect(h.out()).toContain('ada@lumen');
    expect(h.out()).toContain('Resolution: 1920x1080');
    expect(h.out()).toContain('Shell: lsh');
  });

  it('export, env and unset manage variables', async () => {
    await h.run('export GREETING=hi');
    expect(h.state.env.GREETING).toBe('hi');
    await h.run('echo $GREETING');
    expect(h.out()).toBe('hi\n');
    await h.run('env');
    expect(h.out()).toContain('GREETING=hi');
    await h.run('unset GREETING');
    expect(h.state.env.GREETING).toBeUndefined();
    expect(await h.run('export 9bad=1')).toBe(2);
  });

  it('sleep resolves and can be interrupted', async () => {
    vi.useFakeTimers();
    const done = h.run('sleep 0.05');
    await vi.advanceTimersByTimeAsync(60);
    expect(await done).toBe(0);
    vi.useRealTimers();
  });

  it('alias, unalias, which and type describe names', async () => {
    await h.run('alias ll="ls -l"');
    expect(h.state.aliases.ll).toBe('ls -l');
    await h.run('alias');
    expect(h.out()).toBe(`alias ll='ls -l'\n`);
    await h.run('which ll; which ls; type ls');
    expect(h.out()).toContain("ll: aliased to 'ls -l'");
    expect(h.out()).toContain('ls: shell built-in command');
    expect(h.out()).toContain('ls is a shell builtin');
    await h.run('unalias ll');
    expect(h.state.aliases.ll).toBeUndefined();
    expect(await h.run('which nope')).toBe(1);
  });

  it('help lists commands and explains one', async () => {
    await h.run('help');
    expect(h.out()).toContain('Files');
    expect(h.out()).toContain('grep');
    await h.run('help grep');
    expect(h.out()).toContain('usage: grep [-i] [-n] [-v] pattern [file…]');
    expect(await h.run('help nope')).toBe(1);
  });

  it('true and false set the exit code', async () => {
    expect(await h.run('true')).toBe(0);
    expect(await h.run('false')).toBe(1);
  });

  it('run executes a script file', async () => {
    expect(await h.run('run Projects/hello.lsh')).toBe(0);
    expect(h.out()).toBe('from script\n');
    expect(await h.run('run missing.lsh')).toBe(1);
  });

  it('history records commands', async () => {
    h.state.history.push('ls', 'pwd');
    await h.run('history');
    expect(splitLines(h.out()).map((l) => l.trim())).toEqual(['1  ls', '2  pwd']);
  });
});

describe('kernel-backed commands', () => {
  let h: Harness;
  beforeEach(async () => {
    h = harness({}, await seed());
  });

  it('apps lists installed apps', async () => {
    await h.run('apps');
    expect(h.out()).toContain('lumen.editor');
    expect(h.out()).toContain('Text Editor');
  });

  it('launch starts an app with key=value arguments', async () => {
    await h.run('launch lumen.editor path=Documents/notes.txt');
    expect(h.kernel.launch).toHaveBeenCalledWith('lumen.editor', {
      path: `${HOME}/Documents/notes.txt`,
    });
    expect(h.out()).toContain('pid 101');
    expect(await h.run('launch lumen.editor bad')).toBe(2);
  });

  it('ps prints a process table and kill ends one', async () => {
    await h.run('ps');
    expect(h.out()).toContain('PID');
    expect(h.out()).toContain('lumen.terminal');
    expect(await h.run('kill 100')).toBe(0);
    expect(await h.run('kill 999')).toBe(1);
  });

  it('open routes files, URLs and app ids', async () => {
    await h.run('open Documents/notes.txt');
    expect(h.kernel.open).toHaveBeenCalledWith(`${HOME}/Documents/notes.txt`);
    await h.run('open https://example.com');
    expect(h.kernel.launch).toHaveBeenCalledWith('lumen.browser', { url: 'https://example.com' });
    await h.run('open lumen.files');
    expect(h.kernel.launch).toHaveBeenCalledWith('lumen.files');
    expect(await h.run('open nowhere')).toBe(1);
  });

  it('edit creates a missing file and opens the editor', async () => {
    await h.run('edit fresh.md');
    expect(await h.vfs.exists(`${HOME}/fresh.md`)).toBe(true);
    expect(h.kernel.launch).toHaveBeenCalledWith('lumen.editor', { path: `${HOME}/fresh.md` });
    expect(await h.run('edit Documents')).toBe(1);
  });

  it('theme reads and sets the appearance', async () => {
    await h.run('theme');
    expect(h.out()).toBe('dark\n');
    await h.run('theme light');
    expect(h.kernel.theme).toHaveBeenCalledWith('light');
    expect(await h.run('theme neon')).toBe(2);
  });

  it('lock, clear and exit call the kernel', async () => {
    await h.run('lock');
    expect(h.kernel.lock).toHaveBeenCalled();
    await h.run('clear');
    expect(h.kernel.clear).toHaveBeenCalled();
    await h.run('exit');
    expect(h.kernel.exit).toHaveBeenCalled();
  });

  it('explains that a command needs the OS when it is missing', async () => {
    let err = '';
    const state = createShellState({ home: HOME, user: 'ada' });
    const shell = new Shell({
      vfs: h.vfs,
      state,
      io: { stdout: () => {}, stderr: (t) => (err += t) },
    });
    expect(await shell.run('ps')).toBe(1);
    expect(err).toContain('needs the OS');
  });
});

describe('lumenctl', () => {
  it('lists every setting with its value', async () => {
    const h = harness();
    expect(await h.run('lumenctl list appearance')).toBe(0);
    expect(h.out()).toContain('appearance.theme');
    expect(h.out()).toContain('auto');
    expect(h.out()).not.toContain('taskbar.size');
  });

  it('reads one setting', async () => {
    const h = harness();
    expect(await h.run('lumenctl get taskbar.size')).toBe(0);
    expect(h.out().trim()).toBe('44');
  });

  it('refuses a section, and a path that is not there', async () => {
    const h = harness();
    expect(await h.run('lumenctl get appearance')).toBe(1);
    expect(h.err()).toContain('is a section');
    expect(await h.run('lumenctl get appearance.nonsense')).toBe(1);
    expect(h.err()).toContain('no setting named');
  });

  it('writes a setting through the kernel, in the type it already has', async () => {
    const setSetting = vi.fn(() => true);
    const h = harness({ setSetting });
    expect(await h.run('lumenctl set appearance.blur 20')).toBe(0);
    expect(setSetting).toHaveBeenCalledWith('appearance.blur', 20);
    expect(await h.run('lumenctl set appearance.reduceMotion on')).toBe(0);
    expect(setSetting).toHaveBeenCalledWith('appearance.reduceMotion', true);
  });

  it('refuses a value of the wrong type without calling the kernel', async () => {
    const setSetting = vi.fn(() => true);
    const h = harness({ setSetting });
    expect(await h.run('lumenctl set appearance.blur wide')).toBe(1);
    expect(h.err()).toContain('expected a number');
    expect(setSetting).not.toHaveBeenCalled();
  });
});

describe('service', () => {
  it('lists the services and marks the declared ones', async () => {
    const h = harness();
    expect(await h.run('service list')).toBe(0);
    expect(h.out()).toContain('com.lumen.dock');
    expect(h.out()).toContain('(declared)');
  });

  it('filters by category and explains an empty one', async () => {
    const h = harness();
    expect(await h.run('service list printing')).toBe(0);
    expect(h.out()).toContain('com.lumen.printd');
    expect(h.out()).not.toContain('com.lumen.dock');
    expect(await h.run('service list nonsense')).toBe(1);
  });

  it('passes start, stop and restart to the kernel', async () => {
    const serviceControl = vi.fn(() => null);
    const h = harness({ serviceControl });
    expect(await h.run('service restart com.lumen.dock')).toBe(0);
    expect(serviceControl).toHaveBeenCalledWith('com.lumen.dock', 'restart');
  });

  it("reports a refusal in the kernel's words", async () => {
    const h = harness({ serviceControl: () => 'com.lumen.dock is required by the system' });
    expect(await h.run('service stop com.lumen.dock')).toBe(1);
    expect(h.err()).toContain('required by the system');
  });
});

describe('sudo', () => {
  it('says plainly that an account without a password cannot use it', async () => {
    const h = harness({ hasPassword: () => false });
    expect(await h.run('sudo whoami')).toBe(1);
    expect(h.err()).toContain('no password');
    expect(h.err()).toContain('Settings > Security');
  });

  it('refuses where there is nobody to ask', async () => {
    const h = harness();
    expect(await h.run('sudo whoami')).toBe(1);
    expect(h.err()).toContain('no way to ask');
  });
});

describe('the paths the system owns', () => {
  const fixture = () => ({ elevation: elevate('commands test fixture') });

  async function seeded(): Promise<Vfs> {
    const vfs = await seed();
    await vfs.ensureDir(`${SYSTEM}/Wallpapers`, fixture());
    await vfs.writeText(`${SYSTEM}/kernel.bin`, 'boot', fixture());
    await vfs.writeJson(`${SYSTEM}/settings.json`, { theme: 'dark' }, fixture());
    return vfs;
  }

  const SYSTEM = '/System';

  it('refuses rm and says which command would work', async () => {
    const vfs = await seeded();
    const h = harness({}, vfs);

    expect(await h.run('rm -r /System')).toBe(1);

    expect(h.err()).toContain('system files are protected');
    expect(h.err()).toContain('sudo rm -r /System');
    expect(await vfs.exists(`${SYSTEM}/kernel.bin`)).toBe(true);
  });

  it('refuses mv, cp and a redirection onto a system path', async () => {
    const vfs = await seeded();
    const h = harness({}, vfs);

    expect(await h.run('mv /System/kernel.bin ~/kernel.bin')).toBe(1);
    // The hint repeats the line as the shell resolved it, `~` and all.
    expect(h.err()).toContain('sudo mv /System/kernel.bin /Users/ada/kernel.bin');
    expect(await h.run('mv ~/Documents/notes.txt /System/notes.txt')).toBe(1);
    expect(await h.run('cp ~/Documents/notes.txt /System/notes.txt')).toBe(1);
    expect(h.err()).toContain('sudo cp /Users/ada/Documents/notes.txt /System/notes.txt');
    expect(await h.run('mkdir /System/Extra')).toBe(1);
    expect(await h.run('touch /System/marker')).toBe(1);

    expect(await h.run('echo hi > /System/hi.txt')).toBe(1);
    // A redirection is the shell's own doing and cannot be elevated, so the
    // message names something that can be.
    expect(h.err()).toContain('sudo cp');

    expect(await vfs.exists(`${SYSTEM}/kernel.bin`)).toBe(true);
    expect(await vfs.exists(`${SYSTEM}/notes.txt`)).toBe(false);
    expect(await vfs.exists(`${SYSTEM}/hi.txt`)).toBe(false);
    expect(await vfs.exists(`${SYSTEM}/Extra`)).toBe(false);
  });

  it('refuses to write the files the kernel rewrites for itself', async () => {
    // The VFS lets the kernel save its own settings; a person at a prompt is
    // not the kernel.
    const vfs = await seeded();
    const h = harness({}, vfs);

    expect(await h.run('echo {} > /System/settings.json')).toBe(1);
    expect(await h.run('cp ~/Documents/notes.txt /System/settings.json')).toBe(1);

    expect(await vfs.readText(`${SYSTEM}/settings.json`)).toContain('dark');
  });

  it('reads them without complaint', async () => {
    const h = harness({}, await seeded());
    expect(await h.run('cat /System/kernel.bin')).toBe(0);
    expect(h.out()).toBe('boot');
    expect(await h.run('ls /System')).toBe(0);
    expect(h.out()).toContain('Wallpapers/');
    expect(await h.run('cp /System/kernel.bin ~/kernel.bin')).toBe(0);
  });
});

describe('sudo with a password to give', () => {
  const ask = (answer: string | null) => async () => answer;

  async function seeded(): Promise<Vfs> {
    const vfs = await seed();
    await vfs.ensureDir('/System', { elevation: elevate('sudo test fixture') });
    await vfs.writeText('/System/kernel.bin', 'boot', {
      elevation: elevate('sudo test fixture'),
    });
    return vfs;
  }

  it('runs the wrapped command once the password checks out', async () => {
    const authenticate = vi.fn(async (password: string) => password === 'secret');
    const h = harness({ authenticate }, await seed(), ask('secret'));

    expect(await h.run('sudo whoami')).toBe(0);

    expect(h.out()).toBe('ada\n');
    expect(authenticate).toHaveBeenCalledWith('secret');
  });

  it('grants the file system authority for that one command', async () => {
    const vfs = await seeded();
    const h = harness({}, vfs, ask('secret'));

    expect(await h.run('sudo rm /System/kernel.bin')).toBe(0);
    expect(await vfs.exists('/System/kernel.bin')).toBe(false);

    expect(await h.run('sudo cp ~/Documents/notes.txt /System/notes.txt')).toBe(0);
    expect(await vfs.readText('/System/notes.txt')).toContain('alpha');
    expect(await h.run('sudo mkdir /System/Extra')).toBe(0);
  });

  it('takes the authority away again when the command returns', async () => {
    const vfs = await seeded();
    const h = harness({}, vfs, ask('secret'));

    expect(await h.run('sudo echo done')).toBe(0);
    expect(h.state.elevation).toBeUndefined();
    expect(h.state.env.LUMEN_SUDO).toBeUndefined();

    expect(await h.run('rm -r /System')).toBe(1);
    expect(await vfs.exists('/System/kernel.bin')).toBe(true);
  });

  it('does not elevate on a wrong password, and does not run the command', async () => {
    const vfs = await seeded();
    const h = harness({}, vfs, ask('hunter2'));

    expect(await h.run('sudo rm /System/kernel.bin')).toBe(1);

    expect(h.err()).toContain('wrong password');
    expect(await vfs.exists('/System/kernel.bin')).toBe(true);
    expect(h.state.elevation).toBeUndefined();
  });

  it('does nothing when the prompt is dismissed', async () => {
    const vfs = await seeded();
    const h = harness({}, vfs, ask(null));

    expect(await h.run('sudo rm /System/kernel.bin')).toBe(1);

    expect(h.err()).toContain('cancelled');
    expect(await vfs.exists('/System/kernel.bin')).toBe(true);
  });
});
