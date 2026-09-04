import { useVfs } from '@lumen/kernel/react';
import { cx } from '@lumen/ui';
import { basename, type FileStat, formatBytes, VfsError } from '@lumen/vfs';
import { useEffect, useState } from 'react';
import { FileTypeIcon, formatDateTime, useObjectUrl } from '../_sdk';
import { kindLabel, previewKind } from './logic';
import { readTextPreview } from './operations';

export interface FilePreviewProps {
  path: string;
  /** Quick Look sizing: bigger image, more text. */
  large?: boolean;
}

/** Icon or image, name, kind, size, dates, and the head of small text files. */
export function FilePreview({ path, large }: FilePreviewProps) {
  const vfs = useVfs();
  const [stat, setStat] = useState<FileStat | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = stat ? previewKind(stat) : 'none';
  const { url } = useObjectUrl(kind === 'image' ? path : null);

  useEffect(() => {
    let cancelled = false;
    setStat(null);
    setText(null);
    setError(null);
    (async () => {
      try {
        const st = await vfs.stat(path);
        if (cancelled) return;
        setStat(st);
        if (previewKind(st) === 'text') {
          const t = await readTextPreview(vfs, path, { maxLines: large ? 400 : 60 });
          if (!cancelled) setText(t);
        }
      } catch (e) {
        if (!cancelled) setError(VfsError.is(e) ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vfs, path, large]);

  const name = basename(path);
  return (
    <div className="lumen-scroll flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-center py-2">
        {kind === 'image' && url ? (
          <img
            src={url}
            alt={name}
            className={cx('rounded-sm border border-rule object-contain', large ? 'max-h-[52vh]' : 'max-h-44')}
          />
        ) : (
          <FileTypeIcon entry={{ kind: stat?.kind ?? 'file', path }} size={large ? 96 : 64} />
        )}
      </div>
      <div className="min-w-0">
        <p className={cx('break-words font-medium text-ink', large ? 'text-md' : 'text-base')}>{name}</p>
        {stat && <p className="text-sm text-ink-2">{kindLabel(stat)}</p>}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {stat && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-3">Size</dt>
          <dd className="mono tabular-nums text-ink-2">{stat.kind === 'directory' ? '—' : formatBytes(stat.size)}</dd>
          <dt className="text-ink-3">Created</dt>
          <dd className="mono tabular-nums text-ink-2">{formatDateTime(stat.createdAt)}</dd>
          <dt className="text-ink-3">Modified</dt>
          <dd className="mono tabular-nums text-ink-2">{formatDateTime(stat.modifiedAt)}</dd>
        </dl>
      )}
      {text !== null && (
        <pre className="mono whitespace-pre-wrap break-words rounded-sm border border-rule bg-canvas p-2 text-xs leading-4 text-ink-2">
          {text}
        </pre>
      )}
    </div>
  );
}
