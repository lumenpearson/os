import { cx } from '@lumen/ui';
import type { DirEntry } from '@lumen/vfs';
import type { ReactNode } from 'react';
import { FileTypeIcon } from '../_sdk';
import { EntryListBox } from './EntryListBox';
import { RenameInput } from './RenameInput';
import type { EntryHandlers, EntryViewState } from './types';

export interface GridViewProps extends EntryHandlers, EntryViewState {
  entries: readonly DirEntry[];
  emptyState?: ReactNode;
}

/** Icons in a responsive grid with names under them. */
export function GridView({
  entries,
  emptyState,
  selection,
  renaming,
  cutPaths,
  dropTarget,
  focused,
  onSelectionChange,
  onOpen,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onRenameCommit,
  onRenameCancel,
}: GridViewProps) {
  return (
    <EntryListBox
      entries={entries}
      selection={selection}
      layout="grid"
      label="Files"
      className={cx(
        'lumen-scroll h-full content-start gap-1 p-3',
        entries.length > 0 ? 'grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))]' : 'flex flex-col',
      )}
      onSelectionChange={onSelectionChange}
      onOpen={onOpen}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      itemClassName={(entry, s) =>
        cx(
          'flex flex-col items-center gap-1.5 rounded-sm px-1 pt-2 pb-1.5 text-ink',
          'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
          s.selected && (focused ? 'bg-selection' : 'bg-surface-2'),
          s.cursor && 'outline-2 -outline-offset-2 outline-accent',
          entry.path === dropTarget && 'bg-selection outline-2 -outline-offset-2 outline-accent',
          cutPaths.has(entry.path) && 'opacity-50',
        )
      }
      renderItem={(entry) => (
        <>
          <FileTypeIcon entry={entry} size={48} />
          {renaming === entry.path ? (
            <RenameInput
              path={entry.path}
              align="center"
              className="w-full"
              onCommit={(name) => onRenameCommit(entry.path, name)}
              onCancel={onRenameCancel}
            />
          ) : (
            <span className="line-clamp-2 w-full break-words text-center text-sm leading-4">{entry.name}</span>
          )}
        </>
      )}
    >
      {entries.length === 0 && emptyState}
    </EntryListBox>
  );
}
