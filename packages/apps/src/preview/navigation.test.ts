import type { DirEntry } from '@lumen/vfs';
import { describe, expect, it } from 'vitest';
import {
  hasStep,
  imageSiblings,
  positionLabel,
  previewableSiblings,
  stepIndex,
  thumbnailWindow,
} from './navigation';

const entry = (name: string, kind: 'file' | 'directory' = 'file'): DirEntry => ({
  path: `/home/ada/Pictures/${name}`,
  name,
  kind,
  size: 10,
  modifiedAt: 0,
  createdAt: 0,
});

const folder: DirEntry[] = [
  entry('zebra.png'),
  entry('Album', 'directory'),
  entry('notes.txt'),
  entry('budget.xlsx'),
  entry('.hidden.png'),
  entry('apple.jpg'),
];

describe('previewableSiblings', () => {
  const place = previewableSiblings(folder, '/home/ada/Pictures/apple.jpg');

  it('keeps only files Preview can open', () => {
    expect(place.items.map((p) => p.split('/').pop())).toEqual([
      'apple.jpg',
      'notes.txt',
      'zebra.png',
    ]);
  });

  it('locates the open file', () => {
    expect(place.index).toBe(0);
  });

  it('reports no position for a file outside the folder', () => {
    expect(previewableSiblings(folder, '/elsewhere/other.png').index).toBe(-1);
    expect(previewableSiblings(folder, null).index).toBe(-1);
  });

  it('handles an empty folder', () => {
    expect(previewableSiblings([], '/a.png')).toEqual({ items: [], index: -1 });
  });
});

describe('imageSiblings', () => {
  it('keeps the files the filmstrip can draw', () => {
    const items = previewableSiblings(folder, null).items;
    expect(imageSiblings(items).map((p) => p.split('/').pop())).toEqual(['apple.jpg', 'zebra.png']);
  });
});

describe('stepIndex', () => {
  it('moves within the sequence', () => {
    expect(stepIndex(0, 3, 1)).toBe(1);
    expect(stepIndex(2, 3, -1)).toBe(1);
  });

  it('stops at both ends rather than wrapping', () => {
    expect(stepIndex(2, 3, 1)).toBeNull();
    expect(stepIndex(0, 3, -1)).toBeNull();
  });

  it('enters the sequence from outside it', () => {
    expect(stepIndex(-1, 3, 1)).toBe(0);
    expect(stepIndex(-1, 3, -1)).toBe(2);
  });

  it('has nowhere to go in an empty folder', () => {
    expect(stepIndex(-1, 0, 1)).toBeNull();
  });
});

describe('hasStep', () => {
  it('drives the enabled state of the arrows', () => {
    const place = { items: ['/a.png', '/b.png'], index: 0 };
    expect(hasStep(place, -1)).toBe(false);
    expect(hasStep(place, 1)).toBe(true);
    expect(hasStep({ ...place, index: 1 }, 1)).toBe(false);
  });
});

describe('positionLabel', () => {
  it('counts from one', () => {
    expect(positionLabel(0, 12)).toBe('1 of 12');
    expect(positionLabel(11, 12)).toBe('12 of 12');
  });

  it('says nothing when there is nothing to step through', () => {
    expect(positionLabel(0, 1)).toBe('');
    expect(positionLabel(-1, 4)).toBe('');
  });
});

describe('thumbnailWindow', () => {
  it('covers everything when the strip is short', () => {
    expect(thumbnailWindow(0, 5, 10)).toEqual({ start: 0, end: 5 });
  });

  it('centres on the open picture', () => {
    expect(thumbnailWindow(50, 200, 4)).toEqual({ start: 46, end: 55 });
  });

  it('keeps a full window at both ends', () => {
    expect(thumbnailWindow(0, 200, 4)).toEqual({ start: 0, end: 9 });
    expect(thumbnailWindow(199, 200, 4)).toEqual({ start: 191, end: 200 });
  });

  it('reads a missing position as the first item', () => {
    expect(thumbnailWindow(-1, 200, 2)).toEqual({ start: 0, end: 5 });
  });

  it('has no window over an empty strip', () => {
    expect(thumbnailWindow(0, 0, 4)).toEqual({ start: 0, end: 0 });
  });
});
