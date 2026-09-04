import { MemoryAdapter, Vfs } from '@lumen/vfs';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseDocument } from './frontmatter';
import { buildNote } from './notes';
import {
  createNote,
  duplicateNote,
  isNoteFile,
  loadNotes,
  newNoteText,
  notesDir,
  renameNote,
  setPinnedText,
} from './storage';

const HOME = '/home/ada';
const DIR = `${HOME}/Documents/Notes`;
const AT = Date.UTC(2026, 8, 4, 12);

let vfs: Vfs;

beforeEach(async () => {
  vfs = new Vfs(new MemoryAdapter());
  await vfs.mkdir(DIR, { recursive: true });
});

const names = async (dir = DIR) => (await vfs.readDir(dir)).map((e) => e.name);

describe('the notes folder', () => {
  it('lives under Documents in the user home', () => {
    expect(notesDir(HOME)).toBe('/home/ada/Documents/Notes');
  });

  it('takes Markdown files and nothing else', () => {
    expect(isNoteFile('idea.md')).toBe(true);
    expect(isNoteFile('idea.markdown')).toBe(true);
    expect(isNoteFile('IDEA.MD')).toBe(true);
    expect(isNoteFile('idea.txt')).toBe(false);
    expect(isNoteFile('.hidden.md')).toBe(false);
    expect(isNoteFile('README')).toBe(false);
  });
});

describe('loadNotes', () => {
  it('creates the folder on first run and finds nothing in it', async () => {
    const fresh = new Vfs(new MemoryAdapter());
    expect(await loadNotes(fresh, DIR)).toEqual([]);
    expect(await fresh.readDir(DIR)).toEqual([]);
  });

  it('reads every Markdown file and skips the rest', async () => {
    await vfs.writeText(`${DIR}/one.md`, '# One\n');
    await vfs.writeText(`${DIR}/two.markdown`, '# Two\n');
    await vfs.writeText(`${DIR}/notes.txt`, 'not a note');
    await vfs.mkdir(`${DIR}/Archive`);
    const notes = await loadNotes(vfs, DIR);
    expect(notes.map((n) => n.title).sort()).toEqual(['One', 'Two']);
    expect(notes[0]?.path).toBe(`${DIR}/one.md`);
  });

  it('normalises line endings so the editor never sees a carriage return', async () => {
    await vfs.writeText(`${DIR}/crlf.md`, '---\r\ntitle: A\r\n---\r\n# A\r\n\r\nbody\r\n');
    const note = (await loadNotes(vfs, DIR))[0];
    expect(note?.text).not.toContain('\r');
    expect(note?.title).toBe('A');
    expect(note?.bodyLine).toBe(3);
  });
});

describe('createNote', () => {
  it('writes a file with a created stamp and a heading to type over', async () => {
    const path = await createNote(vfs, DIR, 'Untitled', AT);
    expect(path).toBe(`${DIR}/Untitled.md`);
    expect(await vfs.readText(path)).toBe(newNoteText('Untitled', AT));
    const note = buildNote({
      path,
      name: 'Untitled.md',
      text: await vfs.readText(path),
      createdAt: 0,
      modifiedAt: 0,
    });
    expect(note.title).toBe('Untitled');
    expect(note.createdAt).toBe(AT);
  });

  it('never overwrites a note that is already there', async () => {
    await createNote(vfs, DIR, 'Untitled', AT);
    const second = await createNote(vfs, DIR, 'Untitled', AT);
    expect(second).toBe(`${DIR}/Untitled 2.md`);
    expect(await names()).toEqual(['Untitled 2.md', 'Untitled.md']);
    expect(await vfs.readText(second)).toContain('# Untitled 2');
  });

  it('creates the folder if it has been deleted underneath us', async () => {
    await vfs.remove(DIR, { recursive: true });
    expect(await createNote(vfs, DIR, 'Untitled', AT)).toBe(`${DIR}/Untitled.md`);
  });
});

describe('duplicateNote', () => {
  it('copies a note beside the original under a free name and title', async () => {
    const path = await createNote(vfs, DIR, 'Plan', AT);
    await vfs.writeText(path, '---\ncreated: 2020-01-01T00:00:00.000Z\n---\n# Plan\n\nbody\n');
    const note = buildNote({
      path,
      name: 'Plan.md',
      text: await vfs.readText(path),
      createdAt: 0,
      modifiedAt: 0,
    });

    const copy = await duplicateNote(vfs, note, AT);
    expect(copy).toBe(`${DIR}/Plan 2.md`);
    const text = await vfs.readText(copy);
    expect(text).toContain('# Plan 2');
    expect(text).toContain('body');
    expect(parseDocument(text).front?.entries).toContainEqual({
      kind: 'pair',
      key: 'created',
      value: new Date(AT).toISOString(),
    });
    expect(await vfs.readText(path)).toContain('# Plan\n');
  });
});

describe('renameNote', () => {
  const load = async (path: string, name: string) =>
    buildNote({ path, name, text: await vfs.readText(path), createdAt: 0, modifiedAt: 0 });

  it('retitles the document and moves the file to match', async () => {
    const path = await createNote(vfs, DIR, 'Old', AT);
    const next = await renameNote(vfs, await load(path, 'Old.md'), 'Shopping list');
    expect(next).toBe(`${DIR}/Shopping list.md`);
    expect(await names()).toEqual(['Shopping list.md']);
    expect(await vfs.readText(next)).toContain('# Shopping list');
  });

  it('leaves the file where it is when the name would not change', async () => {
    const path = await createNote(vfs, DIR, 'Plan', AT);
    await vfs.writeText(path, '# Old heading\n');
    const next = await renameNote(vfs, await load(path, 'Plan.md'), 'Plan');
    expect(next).toBe(path);
    expect(await vfs.readText(path)).toBe('# Plan\n');
  });

  it('finds a free name when one note is renamed onto another', async () => {
    await createNote(vfs, DIR, 'Taken', AT);
    const path = await createNote(vfs, DIR, 'Other', AT);
    const next = await renameNote(vfs, await load(path, 'Other.md'), 'Taken');
    expect(next).toBe(`${DIR}/Taken 2.md`);
  });

  it('does nothing with a blank title', async () => {
    const path = await createNote(vfs, DIR, 'Plan', AT);
    const before = await vfs.readText(path);
    expect(await renameNote(vfs, await load(path, 'Plan.md'), '   ')).toBe(path);
    expect(await vfs.readText(path)).toBe(before);
  });
});

describe('setPinnedText', () => {
  it('records a pin in the front matter and takes the key away again', () => {
    const pinned = setPinnedText('# A\n', true);
    expect(pinned).toBe('---\npinned: true\n---\n# A\n');
    expect(setPinnedText(pinned, false)).toBe('# A\n');
  });

  it('leaves the other keys alone', () => {
    const text = '---\ntitle: A\ncolour: teal\n---\nbody\n';
    expect(setPinnedText(text, true)).toBe(
      '---\ntitle: A\ncolour: teal\npinned: true\n---\nbody\n',
    );
  });
});
