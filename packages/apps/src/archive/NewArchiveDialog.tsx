/**
 * Choosing what goes into a new archive. The file picker opens files or a
 * folder but not both at once, so this sheet holds the list between picks and
 * shows what the archive will be called at the top level — including the
 * renames `planRoots` makes when two picks share a name.
 */

import { Button, Dialog, IconButton } from '@lumen/ui';
import { FilePlus, FolderPlus, X } from 'lucide-react';
import { useState } from 'react';
import { useFilePicker } from '../_sdk';
import { planRoots, suggestArchiveName } from './sources';

export interface NewArchiveDialogProps {
  container: HTMLElement | null;
  onCancel: () => void;
  onCreate: (paths: string[]) => void;
}

export function NewArchiveDialog({ container, onCancel, onCreate }: NewArchiveDialogProps) {
  const pick = useFilePicker();
  const [paths, setPaths] = useState<string[]>([]);
  const roots = planRoots(paths);

  const addFiles = async () => {
    const picked = await pick({ mode: 'open', multiple: true, title: 'Add Files' });
    const list = Array.isArray(picked) ? picked : picked ? [picked] : [];
    if (list.length > 0) setPaths((current) => [...current, ...list]);
  };

  const addFolder = async () => {
    const picked = await pick({ mode: 'folder', title: 'Add Folder', confirmLabel: 'Add' });
    if (typeof picked === 'string') setPaths((current) => [...current, picked]);
  };

  return (
    <Dialog
      open
      onClose={onCancel}
      title="New Archive"
      width={520}
      container={container}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={roots.length === 0}
            data-autofocus
            onClick={() => onCreate(roots.map((root) => root.path))}
          >
            Choose Destination…
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" icon={<FilePlus className="size-3.5" />} onClick={addFiles}>
            Add Files…
          </Button>
          <Button size="sm" icon={<FolderPlus className="size-3.5" />} onClick={addFolder}>
            Add Folder…
          </Button>
          <span className="mono ml-auto text-sm text-ink-3 tabular-nums">
            {roots.length === 0 ? 'nothing chosen' : suggestArchiveName(roots)}
          </span>
        </div>

        <div className="lumen-scroll h-52 rounded-sm border border-rule bg-canvas p-1">
          {roots.length === 0 && (
            <p className="p-6 text-center text-sm text-ink-3">
              Files and folders you add appear here.
            </p>
          )}
          {roots.map((root) => (
            <div
              key={root.path}
              className="flex items-center gap-2 rounded-xs px-2 py-1 hover:bg-surface-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate-1 text-base">{root.name}</span>
                <span className="mono truncate-1 text-2xs text-ink-3">{root.path}</span>
              </span>
              <IconButton
                size="sm"
                label={`Remove ${root.name}`}
                onClick={() => setPaths((current) => current.filter((p) => p !== root.path))}
              >
                <X />
              </IconButton>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
