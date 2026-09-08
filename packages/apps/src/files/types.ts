import type { DirEntry } from '@lumen/vfs';
import type { DragEvent, MouseEvent } from 'react';
import type { Selection } from './logic';

/** Callbacks every view (list, grid, columns, search results) reports through. */
export interface EntryHandlers {
  onSelectionChange: (sel: Selection) => void;
  onOpen: (entry: DirEntry) => void;
  onContextMenu: (entry: DirEntry | null, e: MouseEvent) => void;
  onDragStart: (entry: DirEntry, e: DragEvent) => void;
  onDragOver: (entry: DirEntry, e: DragEvent) => void;
  onDrop: (entry: DirEntry, e: DragEvent) => void;
  onRenameCommit: (path: string, name: string) => void;
  onRenameCancel: () => void;
}

/** Display state shared by the views. */
export interface EntryViewState {
  selection: Selection;
  renaming: string | null;
  /** Items on the clipboard after Cut: drawn dimmed. */
  cutPaths: ReadonlySet<string>;
  /** Folder currently under a drag. */
  dropTarget: string | null;
  /** Whether the window has focus: selection turns from grey to accent. */
  focused: boolean;
}
