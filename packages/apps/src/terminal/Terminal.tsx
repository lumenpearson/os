import {
  currentUser,
  defaultSettings,
  getSettings,
  SERVICES,
  type ThemeMode,
  useClipboardStore,
  useProcessStore,
  useRegistryStore,
  useServiceStore,
  useSettingsStore,
  verifyPassword,
} from '@lumen/kernel';
import { useKernel, usePlatform, useVfs } from '@lumen/kernel/react';
import { KERNEL_VERSION } from '@lumen/platform';
import { cx, useDialogs } from '@lumen/ui';
import { join } from '@lumen/vfs';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useAppMenus,
  useArgs,
  useJsonFile,
  useLauncher,
  useTitle,
  useWindowControls,
} from '../_sdk';
import {
  applyChunks,
  type Block,
  type Chunk,
  MAX_LINES,
  promptFor,
  trimBlocks,
  windowTitle,
} from './log';
import { createShellState, type ShellKernel } from './shell/commands';
import { applyCompletion, complete } from './shell/complete';
import { columns as layoutColumns } from './shell/format';
import { Shell } from './shell/run';

const HISTORY_LIMIT = 500;
const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24];
const DEFAULT_FONT_SIZE = 13;
/** Bump the log at most this often while a command floods stdout. */
const FLUSH_MS = 40;

interface HistoryFile {
  entries: string[];
  fontSize: number;
}

export default function Terminal({ args: initialArgs }: AppProps) {
  const args = useArgs(initialArgs);
  const kernel = useKernel();
  const dialogs = useDialogs();
  const vfs = useVfs();
  const platform = usePlatform();
  const { launch } = useLauncher();
  const { close } = useWindowControls();

  const home = kernel.home;
  const user = currentUser()?.username ?? 'user';
  const [stored, setStored] = useJsonFile<HistoryFile>(
    join(home, '.config', 'terminal-history.json'),
    {
      entries: [],
      fontSize: DEFAULT_FONT_SIZE,
    },
  );

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [cwd, setCwd] = useState(home);
  const [running, setRunning] = useState(false);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const abort = useRef<AbortController | null>(null);
  /** Output arrives faster than React should re-render; buffer and flush on a timer. */
  const pending = useRef<Array<{ id: number; chunk: Chunk }>>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const draft = useRef('');
  const started = useRef(false);

  const state = useMemo(
    () =>
      createShellState({
        home,
        user,
        hostname: 'lumen',
        cwd: typeof args.cwd === 'string' ? args.cwd : home,
      }),
    [home, user, args.cwd],
  );

  const flush = useCallback(() => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    const queued = pending.current;
    if (queued.length === 0) return;
    pending.current = [];
    setBlocks((prev) => trimBlocks(applyChunks(prev, queued), MAX_LINES));
  }, []);

  const write = useCallback(
    (id: number, chunk: Chunk) => {
      pending.current.push({ id, chunk });
      if (!flushTimer.current) flushTimer.current = setTimeout(flush, FLUSH_MS);
    },
    [flush],
  );

  const clearScreen = useCallback(() => {
    pending.current = [];
    setBlocks([]);
  }, []);

  // The kernel hooks the shell may call. Rebuilt rarely; commands read it per run.
  const shellKernel = useMemo<ShellKernel>(
    () => ({
      version: KERNEL_VERSION,
      open: (path: string) => kernel.open(path),
      launch: (appId: string, launchArgs?: Record<string, unknown>) => launch(appId, launchArgs),
      apps: () =>
        Object.values(useRegistryStore.getState().apps)
          .filter((a) => !a.hidden)
          .map((a) => ({ id: a.id, name: a.name }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      ps: () =>
        Object.values(useProcessStore.getState().processes).map((p) => ({
          pid: p.pid,
          appId: p.appId,
          name: p.name,
          cpu: p.cpu,
          memory: p.memory,
          startedAt: p.startedAt,
        })),
      kill: (pid: number) => {
        if (!useProcessStore.getState().processes[pid]) return false;
        kernel.kill(pid);
        return true;
      },
      theme: (mode?: ThemeMode) => {
        if (mode) useSettingsStore.getState().patch('appearance', { theme: mode });
        return getSettings().appearance.theme;
      },
      lock: () => kernel.lock(),
      settings: () => getSettings(),
      setSetting: (path: string, value: unknown) => {
        try {
          // The store's path type is the union of every known leaf; lumenctl
          // has already checked that the path exists and that the value has
          // the type the setting holds, so the cast is the truth by then.
          useSettingsStore.getState().set(path as never, value as never);
          return true;
        } catch {
          return false;
        }
      },
      resetSettings: (section?: string) => {
        const store = useSettingsStore.getState();
        if (!section) {
          store.reset();
          return true;
        }
        const defaults = defaultSettings() as unknown as Record<string, unknown>;
        if (!(section in defaults)) return false;
        store.patch(section as Parameters<typeof store.patch>[0], defaults[section] as never);
        return true;
      },
      services: () => {
        const statuses = useServiceStore.getState().statuses;
        return SERVICES.map((service) => ({
          id: service.id,
          name: service.name,
          category: service.category,
          state: statuses[service.id]?.state ?? 'stopped',
          implemented: service.implemented,
          description: service.description,
        }));
      },
      serviceControl: (id: string, action: 'start' | 'stop' | 'restart') => {
        const store = useServiceStore.getState();
        if (action !== 'start' && store.isEssential(id)) {
          return `${id} is required by the system and cannot be stopped`;
        }
        const ok =
          action === 'start'
            ? store.start(id, Date.now())
            : action === 'stop'
              ? store.stop(id)
              : store.restart(id, Date.now());
        return ok ? null : `${id} could not be ${action}ed`;
      },
      // sudo needs a password to ask for; an account without one cannot use it.
      hasPassword: () => currentUser()?.passwordHash !== null,
      authenticate: async (password: string) => {
        const user = currentUser();
        return user ? verifyPassword(user, password) : false;
      },
      endSession: (reason: string) => void kernel.endSession(reason),
      exit: () => void close(),
      clear: clearScreen,
      sysinfo: async () => {
        const info = await platform.system.info();
        return {
          os: `${info.os.name}${info.os.version ? ` ${info.os.version}` : ''} (${info.os.arch})`,
          kernel: info.kernel,
          host: info.host,
          uptime: info.uptime,
          cpu: info.cpu.model,
          memory: info.memory,
          resolution: `${info.display.width}x${info.display.height}`,
        };
      },
      firstDayOfWeek: getSettings().region.firstDayOfWeek,
    }),
    [kernel, launch, close, clearScreen, platform],
  );

  /** Width of the output pane in characters, for `ls` columns. */
  const measureColumns = useCallback(() => {
    const el = scroller.current;
    if (!el) return 80;
    // The mono face is measured once per call; 0.6em is the fallback ratio.
    const charWidth = fontSize * 0.6;
    return Math.max(20, Math.floor((el.clientWidth - 24) / charWidth));
  }, [fontSize]);

  const execute = useCallback(
    async (source: string, options: { echo?: boolean } = {}) => {
      const id = nextId.current++;
      const prompt = promptFor(user, 'lumen', state.cwd, home);
      setBlocks((prev) =>
        trimBlocks(
          [...prev, { id, prompt, command: options.echo === false ? null : source, chunks: [] }],
          MAX_LINES,
        ),
      );
      const controller = new AbortController();
      abort.current = controller;
      setRunning(true);
      const runner = new Shell({
        vfs,
        state,
        kernel: shellKernel,
        columns: measureColumns(),
        // sudo asks here. The dialog belongs to this window, so it cannot be
        // mistaken for a request from somewhere else.
        password: (title: string) =>
          dialogs.prompt({ title, password: true, mono: true, confirmLabel: 'Continue' }),
        io: {
          stdout: (text) => write(id, { kind: 'out', text }),
          stderr: (text) => write(id, { kind: 'err', text }),
        },
      });
      try {
        await runner.run(source, controller.signal);
      } catch (e) {
        write(id, { kind: 'err', text: `lsh: ${e instanceof Error ? e.message : String(e)}\n` });
      } finally {
        abort.current = null;
        setRunning(false);
        setCwd(state.cwd);
        flush();
      }
    },
    [user, state, home, vfs, shellKernel, measureColumns, write, flush, dialogs.prompt],
  );

  // Banner, then the launch script, once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const id = nextId.current++;
    const version = shellKernel.version;
    setBlocks([
      {
        id,
        prompt: null,
        command: null,
        chunks: [{ kind: 'info', text: `Lumen OS ${version} · type help\n` }],
      },
    ]);
    const script = typeof args.script === 'string' ? args.script : null;
    if (script) void execute(script, { echo: false });
  }, [args.script, execute, shellKernel.version]);

  // Adopt a directory passed as `path` when it is one.
  useEffect(() => {
    const path = typeof args.path === 'string' ? args.path : null;
    if (!path) return;
    let cancelled = false;
    void vfs.isDirectory(path).then((isDir) => {
      if (cancelled || !isDir) return;
      state.cwd = path;
      state.env.PWD = path;
      setCwd(path);
    });
    return () => {
      cancelled = true;
    };
  }, [args.path, vfs, state]);

  // Restore history and font size once the file has loaded.
  useEffect(() => {
    history.current = stored.entries.slice(-HISTORY_LIMIT);
    state.history = history.current;
    if (FONT_SIZES.includes(stored.fontSize)) setFontSize(stored.fontSize);
  }, [stored, state]);

  useEffect(() => () => flush(), [flush]);

  useTitle(windowTitle(cwd, home, typeof args.title === 'string' ? args.title : undefined));

  // Keep the newest output in view unless the user has scrolled up.
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !pinned.current || blocks.length === 0) return;
    el.scrollTop = el.scrollHeight;
  }, [blocks]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);

  const remember = useCallback(
    (line: string) => {
      if (!line.trim()) return;
      const entries = [...history.current.filter((h) => h !== line), line].slice(-HISTORY_LIMIT);
      history.current = entries;
      state.history = entries;
      setStored((prev) => ({ ...prev, entries }));
    },
    [setStored, state],
  );

  const submit = useCallback(() => {
    const el = input.current;
    if (!el) return;
    const line = el.value;
    el.value = '';
    historyIndex.current = -1;
    draft.current = '';
    pinned.current = true;
    if (!line.trim()) {
      const id = nextId.current++;
      const prompt = promptFor(user, 'lumen', state.cwd, home);
      setBlocks((prev) =>
        trimBlocks([...prev, { id, prompt, command: '', chunks: [] }], MAX_LINES),
      );
      return;
    }
    remember(line);
    void execute(line);
  }, [execute, remember, user, state, home]);

  const setLine = useCallback((text: string, cursor = text.length) => {
    const el = input.current;
    if (!el) return;
    el.value = text;
    el.setSelectionRange(cursor, cursor);
  }, []);

  const runTabCompletion = useCallback(async () => {
    const el = input.current;
    if (!el) return;
    const line = el.value;
    const cursor = el.selectionStart ?? line.length;
    const result = await complete({ vfs, state, line, cursor });
    if (result.candidates.length > 1) {
      const id = nextId.current++;
      setBlocks((prev) =>
        trimBlocks(
          [
            ...prev,
            {
              id,
              prompt: null,
              command: null,
              chunks: [{ kind: 'out', text: layoutColumns(result.candidates, measureColumns()) }],
            },
          ],
          MAX_LINES,
        ),
      );
      pinned.current = true;
    }
    if (result.replacement !== line.slice(result.start, result.end) || result.trailingSpace) {
      const next = applyCompletion(line, result);
      setLine(next.line, next.cursor);
    }
  }, [vfs, state, measureColumns, setLine]);

  const copySelection = useCallback(() => {
    const text = window.getSelection()?.toString() ?? '';
    if (text) useClipboardStore.getState().copyText(text);
  }, []);

  const paste = useCallback(async () => {
    const el = input.current;
    if (!el) return;
    let text = useClipboardStore.getState().item?.text ?? '';
    try {
      const fromHost = await navigator.clipboard?.readText();
      if (fromHost) text = fromHost;
    } catch {
      /* the browser may refuse without a user gesture */
    }
    if (!text) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const cleaned = text.replace(/\r/g, '').replace(/\n+$/, '');
    setLine(el.value.slice(0, start) + cleaned + el.value.slice(end), start + cleaned.length);
  }, [setLine]);

  const interrupt = useCallback(() => {
    if (abort.current) {
      abort.current.abort();
      return;
    }
    const el = input.current;
    if (!el) return;
    const line = el.value;
    const id = nextId.current++;
    const prompt = promptFor(user, 'lumen', state.cwd, home);
    setBlocks((prev) =>
      trimBlocks([...prev, { id, prompt, command: `${line}^C`, chunks: [] }], MAX_LINES),
    );
    setLine('');
    historyIndex.current = -1;
  }, [user, state, home, setLine]);

  const stepHistory = useCallback(
    (direction: -1 | 1) => {
      const el = input.current;
      if (!el) return;
      const entries = history.current;
      if (entries.length === 0) return;
      if (historyIndex.current === -1) {
        if (direction === 1) return;
        draft.current = el.value;
        historyIndex.current = entries.length - 1;
      } else {
        const next = historyIndex.current + direction;
        if (next >= entries.length) {
          historyIndex.current = -1;
          setLine(draft.current);
          return;
        }
        historyIndex.current = Math.max(0, next);
      }
      setLine(entries[historyIndex.current] ?? '');
    },
    [setLine],
  );

  const changeFontSize = useCallback(
    (direction: -1 | 0 | 1) => {
      setFontSize((prev) => {
        const next =
          direction === 0
            ? DEFAULT_FONT_SIZE
            : (FONT_SIZES[
                Math.max(0, Math.min(FONT_SIZES.length - 1, FONT_SIZES.indexOf(prev) + direction))
              ] ?? prev);
        setStored((s) => ({ ...s, fontSize: next }));
        return next;
      });
    },
    [setStored],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        void runTabCompletion();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        stepHistory(-1);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        stepHistory(1);
        return;
      }
      if (e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'c' && !e.shiftKey) {
          // With a selection, Ctrl+C copies; otherwise it interrupts.
          if (window.getSelection()?.toString()) {
            e.preventDefault();
            copySelection();
            return;
          }
          e.preventDefault();
          interrupt();
          return;
        }
        if (key === 'l') {
          e.preventDefault();
          clearScreen();
          return;
        }
        if (key === 'u') {
          e.preventDefault();
          setLine(el.value.slice(el.selectionStart ?? 0), 0);
          return;
        }
        if (key === 'a') {
          // Readline's "start of line" wins over Select All at the input;
          // Select All stays available from the Edit menu.
          e.preventDefault();
          el.setSelectionRange(0, 0);
          return;
        }
        if (key === 'e') {
          e.preventDefault();
          el.setSelectionRange(el.value.length, el.value.length);
          return;
        }
        if (key === 'd' && el.value === '') {
          e.preventDefault();
          void close();
          return;
        }
      }
      if (e.key === 'Home') {
        e.preventDefault();
        el.setSelectionRange(0, 0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    },
    [submit, runTabCompletion, stepHistory, copySelection, interrupt, clearScreen, setLine, close],
  );

  // Ctrl+Shift+C / Ctrl+Shift+V, which the browser would otherwise swallow.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'c') {
        e.preventDefault();
        copySelection();
      } else if (key === 'v') {
        e.preventDefault();
        void paste();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [copySelection, paste]);

  const focusInput = useCallback(() => {
    // A drag that selected text keeps its selection; a plain click does not.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    input.current?.focus();
  }, []);

  const shortcutMod = 'Mod';
  useAppMenus(
    [
      {
        id: 'shell',
        label: 'Shell',
        items: [
          {
            id: 'new-window',
            label: 'New Window',
            shortcut: `${shortcutMod}+N`,
            onSelect: () => launch('lumen.terminal', { cwd: state.cwd }),
          },
          { type: 'separator' },
          {
            id: 'close',
            label: 'Close',
            shortcut: `${shortcutMod}+W`,
            onSelect: () => void close(),
          },
        ],
      },
      {
        id: 'edit',
        label: 'Edit',
        items: [
          {
            id: 'copy',
            label: 'Copy',
            shortcut: `Shift+${shortcutMod}+C`,
            onSelect: copySelection,
          },
          {
            id: 'paste',
            label: 'Paste',
            shortcut: `Shift+${shortcutMod}+V`,
            onSelect: () => void paste(),
          },
          { type: 'separator' },
          { id: 'clear', label: 'Clear', shortcut: `${shortcutMod}+K`, onSelect: clearScreen },
          {
            id: 'select-all',
            label: 'Select All',
            shortcut: `${shortcutMod}+A`,
            onSelect: () => {
              const el = scroller.current;
              if (!el) return;
              const range = document.createRange();
              range.selectNodeContents(el);
              const selection = window.getSelection();
              selection?.removeAllRanges();
              selection?.addRange(range);
            },
          },
        ],
      },
      {
        id: 'view',
        label: 'View',
        items: [
          {
            id: 'bigger',
            label: 'Bigger',
            shortcut: `${shortcutMod}+=`,
            onSelect: () => changeFontSize(1),
          },
          {
            id: 'smaller',
            label: 'Smaller',
            shortcut: `${shortcutMod}+-`,
            onSelect: () => changeFontSize(-1),
          },
          {
            id: 'actual',
            label: 'Actual Size',
            shortcut: `${shortcutMod}+0`,
            onSelect: () => changeFontSize(0),
          },
        ],
      },
      {
        id: 'help',
        label: 'Help',
        items: [{ id: 'commands', label: 'Commands', onSelect: () => void execute('help') }],
      },
    ],
    [state, launch, close, copySelection, paste, clearScreen, changeFontSize, execute],
  );

  const prompt = promptFor(user, 'lumen', cwd, home);

  return (
    <div
      className="flex h-full w-full flex-col bg-canvas text-ink"
      style={{ fontSize, lineHeight: 1.45 }}
      onPointerDown={focusInput}
      // Pointer-down alone is not enough: the browser moves focus after it, to
      // the body, because the surface under the pointer cannot hold focus. The
      // click that follows puts it back on the prompt.
      onClick={focusInput}
    >
      <div
        ref={scroller}
        onScroll={onScroll}
        className="lumen-scroll mono flex-1 select-text px-3 py-2"
        role="log"
        aria-label="Terminal output"
        aria-live="polite"
      >
        {blocks.map((block) => (
          <div key={block.id}>
            {block.command !== null && (
              <div className="whitespace-pre-wrap break-words">
                <PromptLabel
                  user={block.prompt?.user ?? prompt.user}
                  path={block.prompt?.path ?? prompt.path}
                />
                <span>{block.command}</span>
              </div>
            )}
            {block.chunks.map((chunk, i) => (
              <div
                key={i}
                className={cx(
                  'whitespace-pre-wrap break-words',
                  chunk.kind === 'err'
                    ? 'text-danger'
                    : chunk.kind === 'info'
                      ? 'text-ink-2'
                      : 'text-ink',
                )}
              >
                {chunk.text.replace(/\n$/, '')}
              </div>
            ))}
          </div>
        ))}
        <div className="flex items-baseline whitespace-pre-wrap">
          <span className="shrink-0">
            <PromptLabel user={prompt.user} path={prompt.path} />
          </span>
          <input
            ref={input}
            type="text"
            aria-label="Command"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-busy={running}
            className="mono min-w-0 flex-1 border-0 bg-transparent p-0 text-ink caret-accent outline-none"
            style={{ fontSize, lineHeight: 1.45 }}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </div>
  );
}

function PromptLabel({ user, path }: { user: string; path: string }) {
  return (
    <span aria-hidden className="select-none">
      <span className="text-accent">{user}</span>
      <span className="text-ink-3">:</span>
      <span className="text-ink-2">{path}</span>
      <span className="text-ink-3">$ </span>
    </span>
  );
}
