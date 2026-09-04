/**
 * File operations the Files app performs on the VFS. Each function does the
 * whole job for a batch and reports per-item failures instead of throwing on
 * the first one, so a bad item never blocks the rest.
 */
import { dirname, isInside, normalize, type Vfs, VfsError } from '@lumen/vfs';
import { TEXT_PREVIEW_LIMIT, type TransferOperation } from './logic';

export interface BatchResult {
  done: string[];
  failed: Array<{ path: string; error: string }>;
}

export type DocumentKind = 'text' | 'writer' | 'sheet' | 'slides';

export const DOCUMENT_TEMPLATES: Record<DocumentKind, { label: string; name: string; content: string }> = {
  text: { label: 'Text', name: 'untitled.txt', content: '' },
  writer: { label: 'Writer Document', name: 'Untitled.lwr', content: JSON.stringify({ version: 1, html: '' }) },
  sheet: {
    label: 'Sheet',
    name: 'Untitled.lsd',
    content: JSON.stringify({ version: 1, sheets: [{ name: 'Sheet 1', cells: {} }] }),
  },
  slides: {
    label: 'Slides',
    name: 'Untitled.lsl',
    content: JSON.stringify({ version: 1, title: 'Untitled', slides: [] }),
  },
};

function message(e: unknown): string {
  return VfsError.is(e) ? e.message : e instanceof Error ? e.message : String(e);
}

async function batch(paths: readonly string[], run: (path: string) => Promise<string | null>): Promise<BatchResult> {
  const result: BatchResult = { done: [], failed: [] };
  for (const path of paths) {
    try {
      const out = await run(path);
      if (out !== null) result.done.push(out);
    } catch (e) {
      result.failed.push({ path, error: message(e) });
    }
  }
  return result;
}

export function createDocument(vfs: Vfs, dir: string, kind: DocumentKind): Promise<string> {
  const t = DOCUMENT_TEMPLATES[kind];
  return vfs.createFile(dir, t.name, t.content);
}

/**
 * Move or copy items into a folder. Items that would land inside themselves
 * are reported as failures; a move into the folder they already occupy is
 * skipped silently.
 */
export function transferInto(
  vfs: Vfs,
  sources: readonly string[],
  targetDir: string,
  operation: TransferOperation,
): Promise<BatchResult> {
  const target = normalize(targetDir);
  return batch(sources, async (source) => {
    if (isInside(source, target, true)) throw new VfsError('EINVAL', source, 'A folder cannot be moved into itself.');
    if (operation === 'move' && dirname(source) === target) return null;
    return operation === 'move' ? vfs.moveInto(source, target) : vfs.copyInto(source, target);
  });
}

export function duplicateAll(vfs: Vfs, paths: readonly string[]): Promise<BatchResult> {
  return batch(paths, (p) => vfs.copyInto(p, dirname(p)));
}

export function trashAll(vfs: Vfs, paths: readonly string[]): Promise<BatchResult> {
  return batch(paths, (p) => vfs.trash(p));
}

export function restoreAll(vfs: Vfs, paths: readonly string[]): Promise<BatchResult> {
  return batch(paths, (p) => vfs.restoreFromTrash(p));
}

/** Copy files dropped from the host OS into a folder. */
export async function importHostFiles(vfs: Vfs, dir: string, files: Iterable<File>): Promise<BatchResult> {
  const result: BatchResult = { done: [], failed: [] };
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      result.done.push(await vfs.createFile(dir, file.name || 'untitled', bytes));
    } catch (e) {
      result.failed.push({ path: file.name, error: message(e) });
    }
  }
  return result;
}

/** The first lines of a small text file, or null when it is too large to preview. */
export async function readTextPreview(
  vfs: Vfs,
  path: string,
  options: { maxBytes?: number; maxLines?: number } = {},
): Promise<string | null> {
  const maxBytes = options.maxBytes ?? TEXT_PREVIEW_LIMIT;
  const maxLines = options.maxLines ?? 80;
  const bytes = await vfs.readFile(path);
  if (bytes.byteLength > maxBytes) return null;
  const text = new TextDecoder().decode(bytes);
  const lines = text.split('\n');
  return lines.length > maxLines ? `${lines.slice(0, maxLines).join('\n')}\n…` : text;
}

/** One line for a notification after a batch with failures. */
export function describeFailures(result: BatchResult, verb: string): string | null {
  if (result.failed.length === 0) return null;
  const first = result.failed[0];
  if (result.failed.length === 1 && first) return `Could not ${verb} ${first.path.slice(first.path.lastIndexOf('/') + 1)}: ${first.error}`;
  return `Could not ${verb} ${result.failed.length} items.`;
}
