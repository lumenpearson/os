/**
 * Drag-and-drop plumbing. Browsers hide the payload during `dragover`, so
 * drags that start in a Files window are also remembered here; that lets
 * drop targets validate before the drop happens.
 */
import type { DragEvent } from 'react';
import { DRAG_MIME, parseDragPaths, type TransferOperation } from './logic';

let inFlight: string[] = [];

export function beginDrag(e: DragEvent, paths: string[]): void {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(paths));
  e.dataTransfer.setData('text/plain', paths.join('\n'));
  e.dataTransfer.effectAllowed = 'copyMove';
  inFlight = paths;
}

export function endDrag(): void {
  inFlight = [];
}

/** Paths being dragged, known before the drop only for drags that started here. */
export function draggedPaths(e: DragEvent): string[] {
  const types = Array.from(e.dataTransfer.types);
  if (!types.includes(DRAG_MIME)) return [];
  const fromData = parseDragPaths(e.dataTransfer.getData(DRAG_MIME));
  return fromData.length > 0 ? fromData : inFlight;
}

export function hasHostFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}

export function hasPayload(e: DragEvent): boolean {
  const types = Array.from(e.dataTransfer.types);
  return types.includes(DRAG_MIME) || types.includes('Files');
}

/** Ctrl (Windows/Linux) or Alt/Option (macOS) held → copy instead of move. */
export function operationFor(e: { ctrlKey: boolean; altKey: boolean }): TransferOperation {
  return e.ctrlKey || e.altKey ? 'copy' : 'move';
}
