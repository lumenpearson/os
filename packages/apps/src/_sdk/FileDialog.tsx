import { APPLICATIONS_DIR, TRASH_DIR } from '@lumen/kernel';
import { useKernel, useVfs } from '@lumen/kernel/react';
import { Button, cx, Dialog, Input, ListRow, Sidebar, type SidebarSection } from '@lumen/ui';
import { basename, type DirEntry, dirname, extname, isValidName, join } from '@lumen/vfs';
import { ArrowUp, FolderPlus } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useApp } from './context';
import { FileTypeIcon } from './FileTypeIcon';
import { useDirectory } from './files';

export interface FilePickerOptions {
  mode: 'open' | 'save' | 'folder';
  title?: string;
  /** Directory to start in; defaults to the home directory. */
  startDir?: string;
  /** Extensions (with dot) shown in open mode; folders always show. */
  extensions?: string[];
  /** Suggested file name for save mode. */
  defaultName?: string;
  multiple?: boolean;
  confirmLabel?: string;
}

type PickerResult = string | string[] | null;

interface Pending {
  options: FilePickerOptions;
  resolve: (r: PickerResult) => void;
}

const FilePickerContext = createContext<
  ((options: FilePickerOptions) => Promise<PickerResult>) | null
>(null);

/** Mounted once per app window by AppHost. */
export function FileDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pick = useCallback(
    (options: FilePickerOptions) =>
      new Promise<PickerResult>((resolve) => setPending({ options, resolve })),
    [],
  );
  return (
    <FilePickerContext.Provider value={pick}>
      {children}
      {pending && (
        <FilePickerDialog
          options={pending.options}
          onDone={(r) => {
            pending.resolve(r);
            setPending(null);
          }}
        />
      )}
    </FilePickerContext.Provider>
  );
}

/**
 * Open / Save / Choose-folder dialogs over the VFS.
 * `const path = await pick({ mode: 'save', defaultName: 'Untitled.txt' })`.
 */
export function useFilePicker() {
  const pick = useContext(FilePickerContext);
  if (!pick) throw new Error('useFilePicker must be used inside an app window');
  return pick;
}

function FilePickerDialog({
  options,
  onDone,
}: {
  options: FilePickerOptions;
  onDone: (r: PickerResult) => void;
}) {
  const kernel = useKernel();
  const vfs = useVfs();
  const { container } = useApp();
  const home = kernel.home;
  const [dir, setDir] = useState(options.startDir ?? home);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState(options.defaultName ?? '');
  const { entries, loading } = useDirectory(dir);

  const visible = useMemo(() => {
    return entries.filter((e) => {
      if (e.kind === 'directory') return true;
      if (options.mode === 'folder') return false;
      if (!options.extensions || options.extensions.length === 0) return true;
      return options.extensions.includes(extname(e.name));
    });
  }, [entries, options.mode, options.extensions]);

  useEffect(() => {
    setSelected(new Set());
  }, [dir]);

  const places: SidebarSection[] = [
    {
      id: 'places',
      title: 'Places',
      items: [
        { id: home, label: 'Home', onSelect: () => setDir(home) },
        {
          id: join(home, 'Desktop'),
          label: 'Desktop',
          onSelect: () => setDir(join(home, 'Desktop')),
        },
        {
          id: join(home, 'Documents'),
          label: 'Documents',
          onSelect: () => setDir(join(home, 'Documents')),
        },
        {
          id: join(home, 'Downloads'),
          label: 'Downloads',
          onSelect: () => setDir(join(home, 'Downloads')),
        },
        {
          id: join(home, 'Pictures'),
          label: 'Pictures',
          onSelect: () => setDir(join(home, 'Pictures')),
        },
        { id: APPLICATIONS_DIR, label: 'Applications', onSelect: () => setDir(APPLICATIONS_DIR) },
        { id: '/', label: 'This Computer', onSelect: () => setDir('/') },
      ],
    },
  ];

  const canConfirm = (() => {
    if (options.mode === 'save') return isValidName(name.trim());
    if (options.mode === 'folder') return true;
    return [...selected].some((p) => entries.find((e) => e.path === p)?.kind === 'file');
  })();

  const confirm = () => {
    if (options.mode === 'save') {
      const n = name.trim();
      if (!isValidName(n)) return;
      onDone(join(dir, n));
      return;
    }
    if (options.mode === 'folder') {
      const chosen = [...selected].find(
        (p) => entries.find((e) => e.path === p)?.kind === 'directory',
      );
      onDone(chosen ?? dir);
      return;
    }
    const files = [...selected].filter((p) => entries.find((e) => e.path === p)?.kind === 'file');
    onDone(options.multiple ? files : (files[0] ?? null));
  };

  const activate = (entry: DirEntry) => {
    if (entry.kind === 'directory') {
      setDir(entry.path);
      return;
    }
    if (options.mode === 'save') {
      setName(entry.name);
      return;
    }
    onDone(options.multiple ? [entry.path] : entry.path);
  };

  const newFolder = async () => {
    const path = await vfs.createFolder(dir);
    setSelected(new Set([path]));
  };

  const title =
    options.title ??
    (options.mode === 'save' ? 'Save As' : options.mode === 'folder' ? 'Choose Folder' : 'Open');

  return (
    <Dialog
      open
      onClose={() => onDone(null)}
      title={title}
      width={720}
      container={container}
      className="h-[520px]"
      actions={
        <>
          <Button onClick={() => onDone(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!canConfirm}
            onClick={confirm}
            data-autofocus={options.mode !== 'save'}
          >
            {options.confirmLabel ??
              (options.mode === 'save' ? 'Save' : options.mode === 'folder' ? 'Choose' : 'Open')}
          </Button>
        </>
      }
    >
      <div className="flex h-[360px] -mx-4 border-y border-rule">
        <Sidebar sections={places} activeId={dir} width={170} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 items-center gap-1 border-b border-rule px-2">
            <Button
              size="sm"
              variant="ghost"
              icon={<ArrowUp className="size-3.5" />}
              disabled={dir === '/'}
              onClick={() => setDir(dirname(dir))}
            >
              Up
            </Button>
            <span className="mono ml-1 truncate-1 text-sm text-ink-2">{dir}</span>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              icon={<FolderPlus className="size-3.5" />}
              onClick={newFolder}
            >
              New Folder
            </Button>
          </div>
          <div className="lumen-scroll flex-1 p-1" role="listbox" aria-label="Files">
            {!loading && visible.length === 0 && (
              <p className="p-4 text-center text-sm text-ink-3">Empty folder</p>
            )}
            {visible.map((entry) => (
              <ListRow
                key={entry.path}
                selected={selected.has(entry.path)}
                focused
                columns="1fr"
                onPointerDown={(e) => {
                  const next = e.ctrlKey || e.metaKey ? new Set(selected) : new Set<string>();
                  if (next.has(entry.path)) next.delete(entry.path);
                  else next.add(entry.path);
                  if (!options.multiple && !(e.ctrlKey || e.metaKey)) {
                    next.clear();
                    next.add(entry.path);
                  }
                  setSelected(next);
                  if (options.mode === 'save' && entry.kind === 'file') setName(entry.name);
                }}
                onDoubleClick={() => activate(entry)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') activate(entry);
                }}
                tabIndex={0}
                className={cx(
                  'cursor-default',
                  entry.kind === 'file' && options.mode === 'folder' && 'opacity-50',
                )}
              >
                <span className="flex items-center gap-2 truncate-1">
                  <FileTypeIcon entry={entry} size={16} />
                  <span className="truncate-1">{entry.name}</span>
                </span>
              </ListRow>
            ))}
          </div>
        </div>
      </div>
      {options.mode === 'save' && (
        <form
          className="flex items-center gap-3 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <label htmlFor="lumen-save-name" className="text-ink-2">
            Save as
          </label>
          <Input
            id="lumen-save-name"
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            invalid={name.length > 0 && !isValidName(name.trim())}
            ref={(el) => {
              if (el && !el.dataset.selected) {
                el.dataset.selected = '1';
                const stem = basename(name, true).length;
                requestAnimationFrame(() => el.setSelectionRange(0, stem));
              }
            }}
          />
        </form>
      )}
    </Dialog>
  );
}

export { TRASH_DIR };
