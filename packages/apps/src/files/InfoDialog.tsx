import { type AppManifest, parseManifest } from '@lumen/kernel';
import { useVfs } from '@lumen/kernel/react';
import { Dialog } from '@lumen/ui';
import { basename, dirname, extname, type FileStat, formatBytes, VfsError } from '@lumen/vfs';
import { useEffect, useState } from 'react';
import { FileTypeIcon, formatDateTime, useApp } from '../_sdk';
import { kindLabel } from './logic';

export interface InfoDialogProps {
  path: string;
  onClose: () => void;
}

/** Get Info: kind, size (folders are summed), location, dates, and app manifest details. */
export function InfoDialog({ path, onClose }: InfoDialogProps) {
  const vfs = useVfs();
  const { container } = useApp();
  const [stat, setStat] = useState<FileStat | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await vfs.stat(path);
        if (cancelled) return;
        setStat(st);
        if (st.kind === 'directory') {
          const total = await vfs.du(path);
          if (!cancelled) setSize(total);
        } else {
          setSize(st.size);
          if (extname(path) === '.app') {
            try {
              const m = parseManifest(await vfs.readText(path));
              if (!cancelled) setManifest(m);
            } catch {
              /* not a valid manifest: show the plain file info */
            }
          }
        }
      } catch (e) {
        if (!cancelled) setError(VfsError.is(e) ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vfs, path]);

  const name = basename(path) || path;
  const rows: Array<[string, string]> = [];
  if (stat) {
    rows.push(['Kind', kindLabel(stat)]);
    rows.push(['Size', size === null ? 'Calculating…' : formatBytes(size)]);
    rows.push(['Where', dirname(path)]);
    rows.push(['Created', formatDateTime(stat.createdAt)]);
    rows.push(['Modified', formatDateTime(stat.modifiedAt)]);
  }
  if (manifest) {
    rows.push(['App ID', manifest.id]);
    if (manifest.description) rows.push(['Description', manifest.description]);
    if (manifest.version) rows.push(['Version', manifest.version]);
  }

  return (
    <Dialog open onClose={onClose} title="Info" width={380} container={container}>
      <div className="flex items-center gap-3 pb-3">
        <FileTypeIcon entry={{ kind: stat?.kind ?? 'file', path }} size={40} />
        <div className="min-w-0">
          <p className="truncate-1 text-md font-medium text-ink">{name}</p>
          {size !== null && (
            <p className="mono text-sm tabular-nums text-ink-2">{formatBytes(size)}</p>
          )}
        </div>
      </div>
      {error && <p className="pb-2 text-sm text-danger">{error}</p>}
      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 border-t border-rule pt-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-3">{label}</dt>
            <dd className="mono break-all tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
