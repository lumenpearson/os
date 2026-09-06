import { cx, EmptyState } from '@lumen/ui';
import { type DirEntry, dirname } from '@lumen/vfs';
import { Search } from 'lucide-react';
import { FileTypeIcon } from '../_sdk';
import { EntryListBox, rowClasses } from './EntryListBox';
import { RenameInput } from './RenameInput';
import type { EntryHandlers, EntryViewState } from './types';

export interface SearchResultsProps extends EntryHandlers, EntryViewState {
  entries: readonly DirEntry[];
  query: string;
  searching: boolean;
}

/** Flat results of a recursive search: name, and the folder it lives in underneath. */
export function SearchResults({
  entries,
  query,
  searching,
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
}: SearchResultsProps) {
  return (
    <EntryListBox
      marquee
      entries={entries}
      selection={selection}
      layout="rows"
      label={`Results for ${query}`}
      className="lumen-scroll flex h-full flex-col gap-px p-1"
      onSelectionChange={onSelectionChange}
      onOpen={onOpen}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      itemClassName={(entry, s) =>
        cx(
          'flex h-10 items-center gap-2.5 rounded-xs px-2',
          rowClasses(s.selected, focused),
          s.cursor && 'outline-2 -outline-offset-2 outline-accent',
          entry.path === dropTarget && 'bg-selection outline-2 -outline-offset-2 outline-accent',
          cutPaths.has(entry.path) && 'opacity-50',
        )
      }
      renderItem={(entry, s) => (
        <>
          <FileTypeIcon entry={entry} size={20} />
          <span className="flex min-w-0 flex-1 flex-col leading-4">
            {renaming === entry.path ? (
              <RenameInput
                path={entry.path}
                onCommit={(name) => onRenameCommit(entry.path, name)}
                onCancel={onRenameCancel}
              />
            ) : (
              <span className="truncate-1 text-base">{entry.name}</span>
            )}
            <span
              className={cx(
                'mono truncate-1 text-xs',
                s.selected && focused ? 'text-accent-ink/80' : 'text-ink-3',
              )}
            >
              {dirname(entry.path)}
            </span>
          </span>
        </>
      )}
    >
      {entries.length === 0 && (
        <EmptyState
          icon={<Search />}
          title={searching ? 'Searching…' : 'No matches'}
          description={searching ? undefined : `Nothing here is named like “${query}”.`}
        />
      )}
    </EntryListBox>
  );
}
