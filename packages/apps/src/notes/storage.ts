/**
 * Notes are ordinary Markdown files under ~/Documents/Notes, so Files can see
 * them and the Text Editor can open them. Everything here is file work; the
 * shape of a note itself lives in notes.ts.
 */
import { basename, join, type Vfs } from '@lumen/vfs';
import { formatCreated, withEntry } from './frontmatter';
import { buildNote, fileNameForTitle, type Note, retitle } from './library';

export const NOTE_EXTENSIONS = ['.md', '.markdown'] as const;

/** The folder a fresh install keeps notes in. */
export function notesDir(home: string): string {
  return join(home, 'Documents', 'Notes');
}

export function isNoteFile(name: string): boolean {
  const lower = name.toLowerCase();
  return !name.startsWith('.') && NOTE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Files keep `\r\n` from other systems; the editor and the parser want `\n`. */
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export async function loadNotes(vfs: Vfs, dir: string): Promise<Note[]> {
  await vfs.ensureDir(dir);
  const entries = await vfs.readDir(dir);
  const notes: Note[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'file' || !isNoteFile(entry.name)) continue;
    let text: string;
    try {
      text = normalizeNewlines(await vfs.readText(entry.path));
    } catch {
      continue;
    }
    notes.push(
      buildNote({
        path: entry.path,
        name: entry.name,
        text,
        createdAt: entry.createdAt,
        modifiedAt: entry.modifiedAt,
      }),
    );
  }
  return notes;
}

/** A new note: a `created` stamp and a first heading to type over. */
export function newNoteText(title: string, at: number): string {
  return `---\ncreated: ${formatCreated(at)}\n---\n\n# ${title}\n\n`;
}

export async function createNote(
  vfs: Vfs,
  dir: string,
  title = 'Untitled',
  at = Date.now(),
): Promise<string> {
  await vfs.ensureDir(dir);
  const name = await vfs.freeName(dir, fileNameForTitle(title));
  const path = join(dir, name);
  await vfs.writeText(path, newNoteText(basename(name, true), at), { recursive: true });
  return path;
}

/**
 * A copy beside the original. The file name is freed first and the title is
 * taken from it, so the list never shows two notes with the same name.
 */
export async function duplicateNote(vfs: Vfs, note: Note, at = Date.now()): Promise<string> {
  const dir = note.path.slice(0, note.path.lastIndexOf('/')) || '/';
  const name = await vfs.freeName(dir, fileNameForTitle(note.title));
  const path = join(dir, name);
  const titled = retitle(note.text, basename(name, true));
  await vfs.writeText(path, withEntry(titled, 'created', formatCreated(at)), { recursive: true });
  return path;
}

/** Rename retitles the document and moves the file to match. */
export async function renameNote(vfs: Vfs, note: Note, title: string): Promise<string> {
  const trimmed = title.trim();
  if (!trimmed) return note.path;
  const dir = note.path.slice(0, note.path.lastIndexOf('/')) || '/';
  const text = retitle(note.text, trimmed);
  await vfs.writeText(note.path, text);
  const wanted = fileNameForTitle(trimmed);
  if (wanted === note.name) return note.path;
  const name = await vfs.freeName(dir, wanted);
  const path = join(dir, name);
  await vfs.rename(note.path, path);
  return path;
}

export function setPinnedText(text: string, pinned: boolean): string {
  return withEntry(text, 'pinned', pinned ? 'true' : null);
}
