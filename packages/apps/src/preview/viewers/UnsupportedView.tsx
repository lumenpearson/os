import { Button } from '@lumen/ui';
import { basename, formatBytes, typeInfo } from '@lumen/vfs';
import { FolderOpen } from 'lucide-react';
import { FileTypeIcon } from '../../_sdk';

export interface UnsupportedViewProps {
  path: string;
  /** Bytes on disk, or null while the file has not been measured. */
  size: number | null;
  onReveal: () => void;
}

/** What Preview says about a file it cannot draw: what it is, and how big. */
export function UnsupportedView({ path, size, onReveal }: UnsupportedViewProps) {
  const info = typeInfo(path);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface p-8 text-center">
      <FileTypeIcon entry={{ kind: 'file', path }} size={40} />
      <p className="text-md font-medium text-ink">Preview cannot read this file</p>
      <dl className="mono flex items-center gap-4 text-xs text-ink-2">
        <div className="flex items-center gap-1.5">
          <dt className="text-ink-3">Name</dt>
          <dd className="truncate-1 max-w-48">{basename(path)}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-ink-3">Type</dt>
          <dd>{info.label}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-ink-3">Size</dt>
          <dd className="tabular-nums">{size === null ? '—' : formatBytes(size)}</dd>
        </div>
      </dl>
      <Button className="mt-2" icon={<FolderOpen />} onClick={onReveal}>
        Reveal in Files
      </Button>
    </div>
  );
}
