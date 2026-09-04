import { FileTypeIcon, ManifestIcon } from '@lumen/apps';
import { type AppDefinition, getSettings, searchApps, useRegistryStore } from '@lumen/kernel';
import { useKernel, useVfs } from '@lumen/kernel/react';
import { cx, Kbd, useClickOutside, useDebounced, useEscape } from '@lumen/ui';
import { basename, type DirEntry, dirname } from '@lumen/vfs';
import { Calculator, Lock, Moon, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShellStore } from '../shellStore';
import { evaluateArithmetic } from './arithmetic';

type Result =
  | { kind: 'app'; id: string; label: string; detail: string; app: AppDefinition }
  | { kind: 'installed'; id: string; label: string; detail: string; icon?: string }
  | { kind: 'file'; id: string; label: string; detail: string; entry: DirEntry }
  | { kind: 'calc'; id: string; label: string; detail: string }
  | {
      kind: 'command';
      id: string;
      label: string;
      detail: string;
      icon: React.ReactNode;
      run: () => void;
    };

/** The system search palette (Mod+Space): apps, files, arithmetic, commands. */
export function Spotlight() {
  const kernel = useKernel();
  const vfs = useVfs();
  const open = useShellStore((s) => s.spotlight);
  const toggle = useShellStore((s) => s.toggle);
  const installed = useRegistryStore((s) => s.installed);
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<DirEntry[]>([]);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query, 160);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const refs = useMemo(() => [ref], []);
  useClickOutside(refs, () => toggle('spotlight', false), open);
  useEscape(() => toggle('spotlight', false), open);

  useEffect(() => {
    if (open) {
      setQuery('');
      setFiles([]);
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const q = debounced.trim();
    if (!open || q.length < 2) {
      setFiles([]);
      return;
    }
    const controller = new AbortController();
    vfs
      .search(kernel.home, { query: q, limit: 8, signal: controller.signal })
      .then((hits) => !controller.signal.aborted && setFiles(hits))
      .catch(() => {});
    return () => controller.abort();
  }, [debounced, open, vfs, kernel.home]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const out: Result[] = [];
    const calc = evaluateArithmetic(q);
    if (calc !== null)
      out.push({ kind: 'calc', id: 'calc', label: calc, detail: 'Press Enter to copy' });
    for (const app of searchApps(q, 5))
      out.push({ kind: 'app', id: app.id, label: app.name, detail: app.description, app });
    for (const inst of Object.values(installed)) {
      if (inst.manifest.name.toLowerCase().includes(q.toLowerCase()))
        out.push({
          kind: 'installed',
          id: inst.manifest.id,
          label: inst.manifest.name,
          detail: 'Installed app',
          icon: inst.manifest.icon,
        });
    }
    const commands: Array<Result & { kind: 'command' }> = [
      {
        kind: 'command',
        id: 'lock',
        label: 'Lock Screen',
        detail: 'System',
        icon: <Lock className="size-4" />,
        run: () => kernel.lock(),
      },
      {
        kind: 'command',
        id: 'sleep',
        label: 'Sleep',
        detail: 'System',
        icon: <Moon className="size-4" />,
        run: () => kernel.sleep(),
      },
      {
        kind: 'command',
        id: 'trash',
        label: 'Empty Trash',
        detail: 'Files',
        icon: <Trash2 className="size-4" />,
        run: () => void vfs.emptyTrash(),
      },
    ];
    for (const c of commands) if (c.label.toLowerCase().includes(q.toLowerCase())) out.push(c);
    for (const f of files)
      out.push({ kind: 'file', id: f.path, label: f.name, detail: dirname(f.path), entry: f });
    return out;
  }, [query, files, installed, kernel, vfs]);

  useEffect(() => {
    setActive(0);
  }, [results.length]);

  if (!open) return null;

  const run = (r: Result) => {
    toggle('spotlight', false);
    switch (r.kind) {
      case 'app':
      case 'installed':
        void kernel.launch(r.id);
        break;
      case 'file':
        void kernel.open(r.entry.path);
        break;
      case 'calc':
        navigator.clipboard?.writeText(r.label).catch(() => {});
        break;
      case 'command':
        r.run();
        break;
    }
  };

  const mod = getSettings().keyboard.modifier;

  return (
    <div
      className="absolute inset-0 z-[1250] flex items-start justify-center pt-[16vh]"
      data-testid="spotlight"
    >
      <div
        ref={ref}
        role="dialog"
        aria-label="Search"
        // border and radius are on this same element, so the stroke wraps the arc;
        // overflow-hidden only clips the result list, which has no border of its own.
        // deslop-ignore-next-line 22
        className="w-[min(600px,calc(100vw-32px))] overflow-hidden rounded-lg border border-rule bg-surface shadow-lg lumen-pop-enter"
        style={{ ['--lumen-pop-origin' as string]: 'top center' }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(results.length - 1, i + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === 'Enter') {
            const r = results[active];
            if (r) run(r);
          }
        }}
      >
        <div className="flex items-center gap-3 px-4">
          <Search className="size-5 text-ink-3" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps, files, or calculate"
            aria-label="Search"
            aria-autocomplete="list"
            aria-controls="spotlight-results"
            className="h-12 w-full bg-transparent text-lg text-ink placeholder:text-ink-3 outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>{mod === 'meta' ? 'esc' : 'Esc'}</Kbd>
        </div>
        {results.length > 0 && (
          <ul
            id="spotlight-results"
            role="listbox"
            className="lumen-scroll max-h-[50vh] border-t border-rule p-1"
          >
            {results.map((r, i) => (
              <li
                key={`${r.kind}-${r.id}`}
                role="option"
                aria-selected={i === active}
                onPointerEnter={() => setActive(i)}
                onPointerUp={() => run(r)}
                className={cx(
                  'flex cursor-default items-center gap-3 rounded-sm px-3 py-2',
                  i === active ? 'bg-accent text-accent-ink' : 'text-ink',
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center">
                  {r.kind === 'app' && <r.app.icon size={28} />}
                  {r.kind === 'installed' && (
                    <ManifestIcon size={28} name={r.label} icon={r.icon} />
                  )}
                  {r.kind === 'file' && <FileTypeIcon entry={r.entry} size={24} />}
                  {r.kind === 'calc' && <Calculator className="size-5" />}
                  {r.kind === 'command' && r.icon}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span
                    className={cx('truncate-1', r.kind === 'calc' ? 'mono text-md' : 'text-base')}
                  >
                    {r.label}
                  </span>
                  <span
                    className={cx(
                      'truncate-1 text-sm',
                      i === active ? 'text-accent-ink/75' : 'text-ink-3',
                      r.kind === 'file' && 'mono text-xs',
                    )}
                  >
                    {r.detail}
                  </span>
                </span>
                {/* deslop-ignore-next-line 15 — U+21A9 is the keyboard's Return glyph, the standard hint that Enter activates the row; not decorative emoji. */}
                {i === active && <span className="mono ml-auto text-xs opacity-70">↩</span>}
              </li>
            ))}
          </ul>
        )}
        {query.trim().length > 0 && results.length === 0 && (
          <p className="border-t border-rule px-4 py-6 text-center text-sm text-ink-3">
            Nothing found for “{query}” · {basename(kernel.home)}
          </p>
        )}
      </div>
    </div>
  );
}
