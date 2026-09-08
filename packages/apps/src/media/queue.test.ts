import { describe, expect, it } from 'vitest';
import {
  currentTrack,
  cycleLoop,
  dropTarget,
  EMPTY_QUEUE,
  mediaKind,
  moveItem,
  nextSeed,
  playbackOrder,
  type QueueState,
  queueReducer,
  shuffleOrder,
  step,
  type Track,
  trackFor,
  tracksFor,
} from './queue';

const track = (name: string): Track => ({
  path: `/Users/ada/Music/${name}.mp3`,
  name: `${name}.mp3`,
  kind: 'audio',
});

function queue(names: string[], patch: Partial<QueueState> = {}): QueueState {
  return { ...EMPTY_QUEUE, tracks: names.map(track), index: names.length ? 0 : -1, ...patch };
}

describe('mediaKind', () => {
  it('recognises the audio and video extensions the app claims', () => {
    expect(mediaKind('/a/song.mp3')).toBe('audio');
    expect(mediaKind('/a/song.OPUS')).toBe('audio');
    expect(mediaKind('/a/clip.mp4')).toBe('video');
    expect(mediaKind('/a/clip.m4v')).toBe('video');
  });

  it('rejects everything else', () => {
    expect(mediaKind('/a/notes.txt')).toBeNull();
    expect(mediaKind('/a/song')).toBeNull();
    expect(trackFor('/a/notes.txt')).toBeNull();
  });

  it('builds a track from the file name only', () => {
    expect(trackFor('/Users/ada/Music/Prelude.mp3')).toEqual({
      path: '/Users/ada/Music/Prelude.mp3',
      name: 'Prelude.mp3',
      kind: 'audio',
    });
    expect(tracksFor(['/a/x.mp3', '/a/readme.md', '/a/y.mp4'])).toHaveLength(2);
  });
});

describe('shuffleOrder', () => {
  it('is a permutation of every index', () => {
    const order = shuffleOrder(12, 7);
    expect([...order].sort((a, b) => a - b)).toEqual([...Array(12).keys()]);
  });

  it('is the same for the same seed and differs across seeds', () => {
    expect(shuffleOrder(20, 42)).toEqual(shuffleOrder(20, 42));
    expect(shuffleOrder(20, 42)).not.toEqual(shuffleOrder(20, nextSeed(42)));
  });

  it('handles the empty and single cases', () => {
    expect(shuffleOrder(0, 1)).toEqual([]);
    expect(shuffleOrder(1, 1)).toEqual([0]);
    expect(shuffleOrder(-3, 1)).toEqual([]);
  });

  it('gives a non-zero next seed', () => {
    expect(nextSeed(0)).toBeGreaterThan(0);
    expect(nextSeed(1)).not.toBe(1);
  });

  it('plays in queue order until shuffle is on', () => {
    expect(playbackOrder(queue(['a', 'b', 'c']))).toEqual([0, 1, 2]);
    const shuffled = playbackOrder(queue(['a', 'b', 'c'], { shuffle: true, seed: 5 }));
    expect([...shuffled].sort()).toEqual([0, 1, 2]);
  });
});

describe('step', () => {
  it('stops at both ends with loop off', () => {
    const q = queue(['a', 'b', 'c'], { index: 2 });
    expect(step(q, 1)).toEqual({ index: null, restart: false, seed: q.seed });
    expect(step({ ...q, index: 0 }, -1)).toEqual({ index: null, restart: false, seed: q.seed });
  });

  it('walks forward and back', () => {
    const q = queue(['a', 'b', 'c'], { index: 1 });
    expect(step(q, 1).index).toBe(2);
    expect(step(q, -1).index).toBe(0);
  });

  it('wraps around with loop all', () => {
    const q = queue(['a', 'b', 'c'], { index: 2, loop: 'all' });
    expect(step(q, 1).index).toBe(0);
    expect(step({ ...q, index: 0 }, -1).index).toBe(2);
  });

  it('repeats the track when loop one ends it, but steps when asked', () => {
    const q = queue(['a', 'b', 'c'], { index: 1, loop: 'one' });
    expect(step(q, 1, { auto: true })).toEqual({ index: 1, restart: true, seed: q.seed });
    expect(step(q, 1).index).toBe(2);
    expect(step({ ...q, index: 2 }, 1).index).toBe(0);
  });

  it('restarts a single-track queue that wraps', () => {
    const q = queue(['only'], { loop: 'all' });
    expect(step(q, 1)).toEqual({ index: 0, restart: true, seed: q.seed });
  });

  it('restarts the current track when Previous comes late', () => {
    const q = queue(['a', 'b'], { index: 1 });
    expect(step(q, -1, { elapsed: 9 })).toEqual({ index: 1, restart: true, seed: q.seed });
    expect(step(q, -1, { elapsed: 1 }).index).toBe(0);
  });

  it('does nothing with an empty queue', () => {
    expect(step(EMPTY_QUEUE, 1)).toEqual({ index: null, restart: false, seed: 1 });
    expect(step(EMPTY_QUEUE, -1, { auto: true })).toEqual({ index: null, restart: false, seed: 1 });
  });

  it('starts at the first track when nothing is selected', () => {
    const q = queue(['a', 'b', 'c'], { index: -1 });
    expect(step(q, 1).index).toBe(0);
    expect(step(q, -1).index).toBe(2);
  });

  it('plays every shuffled track once before repeating', () => {
    const q = queue(['a', 'b', 'c', 'd', 'e'], { index: -1, shuffle: true, seed: 99, loop: 'all' });
    const seen: number[] = [];
    let state = q;
    for (let i = 0; i < 5; i++) {
      const result = step(state, 1);
      expect(result.index).not.toBeNull();
      seen.push(result.index as number);
      state = { ...state, index: result.index as number, seed: result.seed };
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('reshuffles when a shuffled pass wraps', () => {
    const q = queue(['a', 'b', 'c', 'd'], { shuffle: true, seed: 3, loop: 'all' });
    const order = playbackOrder(q);
    const last = { ...q, index: order[order.length - 1] as number };
    const result = step(last, 1);
    expect(result.seed).toBe(nextSeed(3));
    expect(result.index).toBe(shuffleOrder(4, nextSeed(3))[0]);
  });
});

describe('queueReducer', () => {
  it('appends new tracks and skips ones already queued', () => {
    const start = queueReducer(EMPTY_QUEUE, { type: 'add', tracks: [track('a'), track('b')] });
    expect(start.tracks.map((t) => t.name)).toEqual(['a.mp3', 'b.mp3']);
    expect(start.index).toBe(0);
    const again = queueReducer(start, { type: 'add', tracks: [track('b'), track('c')] });
    expect(again.tracks.map((t) => t.name)).toEqual(['a.mp3', 'b.mp3', 'c.mp3']);
    expect(again.index).toBe(0);
    expect(queueReducer(again, { type: 'add', tracks: [track('a')] })).toBe(again);
  });

  it('keeps the current track when something before it is removed', () => {
    const q = queue(['a', 'b', 'c'], { index: 2 });
    const after = queueReducer(q, { type: 'remove', index: 0 });
    expect(currentTrack(after)?.name).toBe('c.mp3');
    expect(after.index).toBe(1);
  });

  it('moves to the following track when the current one is removed', () => {
    const q = queue(['a', 'b', 'c'], { index: 1 });
    const after = queueReducer(q, { type: 'remove', index: 1 });
    expect(after.index).toBe(1);
    expect(currentTrack(after)?.name).toBe('c.mp3');
  });

  it('clamps to the last track when the final one is removed', () => {
    const q = queue(['a', 'b'], { index: 1 });
    const after = queueReducer(q, { type: 'remove', index: 1 });
    expect(after.index).toBe(0);
  });

  it('empties out to no selection', () => {
    const one = queueReducer(queue(['a']), { type: 'remove', index: 0 });
    expect(one).toEqual({ ...EMPTY_QUEUE, tracks: [], index: -1 });
    expect(queueReducer(queue(['a', 'b']), { type: 'clear' }).index).toBe(-1);
    expect(queueReducer(queue(['a']), { type: 'remove', index: 4 }).tracks).toHaveLength(1);
  });

  it('reorders and follows the current track', () => {
    const q = queue(['a', 'b', 'c', 'd'], { index: 2 });
    const down = queueReducer(q, { type: 'reorder', from: 0, to: 3 });
    expect(down.tracks.map((t) => t.name)).toEqual(['b.mp3', 'c.mp3', 'd.mp3', 'a.mp3']);
    expect(currentTrack(down)?.name).toBe('c.mp3');
    const up = queueReducer(q, { type: 'reorder', from: 3, to: 0 });
    expect(currentTrack(up)?.name).toBe('c.mp3');
    const self = queueReducer(q, { type: 'reorder', from: 2, to: 0 });
    expect(self.index).toBe(0);
    expect(queueReducer(q, { type: 'reorder', from: 1, to: 1 })).toBe(q);
    expect(queueReducer(q, { type: 'reorder', from: 9, to: 0 })).toBe(q);
  });

  it('selects only real rows', () => {
    const q = queue(['a', 'b'], { index: 0 });
    expect(queueReducer(q, { type: 'select', index: 1 }).index).toBe(1);
    expect(queueReducer(q, { type: 'select', index: 7 }).index).toBe(0);
    expect(queueReducer(q, { type: 'select', index: 1, seed: 12 }).seed).toBe(12);
  });

  it('changes loop and shuffle, reshuffling when shuffle turns on', () => {
    const q = queue(['a', 'b'], { seed: 4 });
    expect(queueReducer(q, { type: 'loop', mode: 'one' }).loop).toBe('one');
    const on = queueReducer(q, { type: 'shuffle', on: true });
    expect(on.shuffle).toBe(true);
    expect(on.seed).toBe(nextSeed(4));
    expect(queueReducer(on, { type: 'shuffle', on: false }).seed).toBe(on.seed);
  });

  it('cycles the loop button off → all → one → off', () => {
    expect(cycleLoop('off')).toBe('all');
    expect(cycleLoop('all')).toBe('one');
    expect(cycleLoop('one')).toBe('off');
  });
});

describe('dragging rows', () => {
  it('moves an item and leaves the rest in order', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a'], 3, 0)).toEqual(['a']);
  });

  it('turns a drag distance into a row', () => {
    expect(dropTarget(1, 0, 24, 5)).toBe(1);
    expect(dropTarget(1, 26, 24, 5)).toBe(2);
    expect(dropTarget(1, -30, 24, 5)).toBe(0);
    expect(dropTarget(1, 1000, 24, 5)).toBe(4);
    expect(dropTarget(1, 30, 0, 5)).toBe(1);
    expect(dropTarget(1, Number.NaN, 24, 5)).toBe(1);
  });
});
