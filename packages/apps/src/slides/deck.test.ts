import { describe, expect, it } from 'vitest';
import {
  applyAction,
  canRedo,
  canUndo,
  createDeck,
  createHistory,
  type Deck,
  type DeckAction,
  fitScale,
  HISTORY_LIMIT,
  MIN_SLIDE_WIDTH,
  nextSelection,
  nextSlideId,
  normalizeDeck,
  pushHistory,
  redo,
  reduceDeck,
  SLIDE_WIDTH,
  serializeDeck,
  trimTrailingBullets,
  undo,
} from './deck';

function deck(): Deck {
  return {
    version: 1,
    title: 'Roadmap',
    slides: [
      { id: 's1', layout: 'title', title: 'Roadmap', subtitle: 'What ships next' },
      { id: 's2', layout: 'bullets', title: 'This quarter', bullets: ['Files', 'Terminal'] },
      { id: 's3', layout: 'bullets', title: 'Later', bullets: ['Multi-user'] },
    ],
  };
}

function ids(value: Deck): string[] {
  return value.slides.map((s) => s.id);
}

describe('nextSlideId', () => {
  it('starts at s1 for an empty deck', () => {
    expect(nextSlideId([])).toBe('s1');
  });

  it('continues past the highest number, not the count', () => {
    expect(nextSlideId(['s1', 's7', 's3'])).toBe('s8');
  });

  it('ignores ids that are not numbered', () => {
    expect(nextSlideId(['intro', 'outro'])).toBe('s1');
  });
});

describe('normalizeDeck', () => {
  it('reads the seeded document unchanged', () => {
    const parsed = normalizeDeck(JSON.parse(JSON.stringify(deck())));
    expect(parsed.title).toBe('Roadmap');
    expect(ids(parsed)).toEqual(['s1', 's2', 's3']);
    expect(parsed.slides[1]?.bullets).toEqual(['Files', 'Terminal']);
  });

  it('falls back for a file that is not a deck', () => {
    const parsed = normalizeDeck(42, 'Recovered');
    expect(parsed).toEqual({ version: 1, title: 'Recovered', theme: undefined, slides: [] });
  });

  it('repairs missing, duplicate and unknown values', () => {
    const parsed = normalizeDeck({
      title: 'Broken',
      theme: 'sepia',
      slides: [
        { id: 's1', layout: 'title' },
        { id: 's1', layout: 'wobble' },
        { bullets: ['a', 7, 'b'] },
      ],
    });
    expect(parsed.theme).toBeUndefined();
    expect(ids(parsed)).toEqual(['s1', 's2', 's3']);
    expect(parsed.slides[1]?.layout).toBe('blank');
    expect(parsed.slides[2]?.bullets).toEqual(['a', 'b']);
  });
});

describe('reduceDeck', () => {
  it('adds a slide after the given index with a fresh id', () => {
    const next = reduceDeck(deck(), { type: 'add', index: 0, layout: 'text' });
    expect(ids(next)).toEqual(['s1', 's4', 's2', 's3']);
    expect(next.slides[1]).toEqual({ id: 's4', layout: 'text', title: '', text: '' });
  });

  it('adds at the end when the index is past the deck', () => {
    const next = reduceDeck(deck(), { type: 'add', index: 99, layout: 'blank' });
    expect(ids(next)).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('duplicates a slide next to it, copying bullets by value', () => {
    const source = deck();
    const next = reduceDeck(source, { type: 'duplicate', index: 1 });
    expect(ids(next)).toEqual(['s1', 's2', 's4', 's3']);
    expect(next.slides[2]?.title).toBe('This quarter');
    expect(next.slides[2]?.bullets).not.toBe(source.slides[1]?.bullets);
    expect(next.slides[2]?.bullets).toEqual(['Files', 'Terminal']);
  });

  it('deletes by index and leaves the rest alone', () => {
    expect(ids(reduceDeck(deck(), { type: 'delete', index: 1 }))).toEqual(['s1', 's3']);
  });

  it('ignores actions that point outside the deck', () => {
    const source = deck();
    expect(reduceDeck(source, { type: 'delete', index: 9 })).toBe(source);
    expect(reduceDeck(source, { type: 'duplicate', index: -1 })).toBe(source);
    expect(reduceDeck(source, { type: 'update', index: 9, patch: { title: 'x' } })).toBe(source);
    expect(reduceDeck(source, { type: 'move', from: 9, to: 0 })).toBe(source);
  });

  it('moves a slide forwards and backwards', () => {
    expect(ids(reduceDeck(deck(), { type: 'move', from: 0, to: 2 }))).toEqual(['s2', 's3', 's1']);
    expect(ids(reduceDeck(deck(), { type: 'move', from: 2, to: 0 }))).toEqual(['s3', 's1', 's2']);
  });

  it('clamps a move to the ends and returns the same deck for a no-op', () => {
    expect(ids(reduceDeck(deck(), { type: 'move', from: 1, to: 40 }))).toEqual(['s1', 's3', 's2']);
    const source = deck();
    expect(reduceDeck(source, { type: 'move', from: 1, to: 1 })).toBe(source);
  });

  it('updates fields and leaves the other slides identical', () => {
    const source = deck();
    const next = reduceDeck(source, {
      type: 'update',
      index: 2,
      patch: { title: 'Next year', notes: 'Slow down here' },
    });
    expect(next.slides[2]).toEqual({
      id: 's3',
      layout: 'bullets',
      title: 'Next year',
      bullets: ['Multi-user'],
      notes: 'Slow down here',
    });
    expect(next.slides[0]).toBe(source.slides[0]);
  });

  it('sets the deck title and theme', () => {
    expect(reduceDeck(deck(), { type: 'setTitle', title: 'Plan' }).title).toBe('Plan');
    expect(reduceDeck(deck(), { type: 'setTheme', theme: 'dark' }).theme).toBe('dark');
  });
});

describe('nextSelection', () => {
  const source = deck();
  const cases: Array<[DeckAction, number, number]> = [
    [{ type: 'add', index: 0, layout: 'blank' }, 0, 1],
    [{ type: 'duplicate', index: 2 }, 2, 3],
    [{ type: 'delete', index: 2 }, 2, 1],
    [{ type: 'delete', index: 0 }, 0, 0],
    [{ type: 'move', from: 0, to: 2 }, 0, 2],
    [{ type: 'setTheme', theme: 'dark' }, 1, 1],
  ];
  for (const [action, current, expected] of cases) {
    it(`follows ${action.type} to slide ${expected + 1}`, () => {
      expect(nextSelection(action, source, current)).toBe(expected);
    });
  }
});

describe('history', () => {
  it('starts empty and records each action', () => {
    const start = createHistory(deck());
    expect(canUndo(start)).toBe(false);
    expect(canRedo(start)).toBe(false);
    const next = applyAction(start, { type: 'delete', index: 0 });
    expect(canUndo(next)).toBe(true);
    expect(ids(next.present)).toEqual(['s2', 's3']);
  });

  it('undoes and redoes back to the same deck', () => {
    const start = createHistory(deck());
    const changed = applyAction(start, { type: 'add', index: 0, layout: 'blank' });
    const back = undo(changed);
    expect(ids(back.present)).toEqual(['s1', 's2', 's3']);
    expect(canRedo(back)).toBe(true);
    expect(ids(redo(back).present)).toEqual(ids(changed.present));
  });

  it('drops the redo stack once a new action lands', () => {
    const start = applyAction(createHistory(deck()), { type: 'delete', index: 0 });
    const back = undo(start);
    const forked = applyAction(back, { type: 'setTitle', title: 'Fork' });
    expect(canRedo(forked)).toBe(false);
  });

  it('ignores an action that changes nothing', () => {
    const start = createHistory(deck());
    expect(applyAction(start, { type: 'delete', index: 9 })).toBe(start);
    expect(undo(start)).toBe(start);
    expect(redo(start)).toBe(start);
  });

  it(`keeps at most ${HISTORY_LIMIT} snapshots`, () => {
    let history = createHistory(createDeck());
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) {
      history = pushHistory(history, { ...history.present, title: `Take ${i}` });
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]?.title).toBe('Take 19');
    expect(history.present.title).toBe(`Take ${HISTORY_LIMIT + 19}`);
  });
});

describe('serializeDeck', () => {
  it('writes a stable document with empty fields dropped', () => {
    const value = serializeDeck({
      version: 1,
      title: 'Plan',
      slides: [{ id: 's1', layout: 'title', title: 'Plan', subtitle: '', notes: '' }],
    });
    expect(JSON.parse(value)).toEqual({
      version: 1,
      title: 'Plan',
      slides: [{ id: 's1', layout: 'title', title: 'Plan' }],
    });
    expect(value.endsWith('\n')).toBe(true);
  });

  it('is unchanged by the key order of the source object', () => {
    const a = serializeDeck({ title: 'A', version: 1, theme: 'dark', slides: [] });
    const b = serializeDeck({ version: 1, slides: [], theme: 'dark', title: 'A' });
    expect(a).toBe(b);
  });

  it('round-trips through normalizeDeck', () => {
    const once = serializeDeck(deck());
    expect(serializeDeck(normalizeDeck(JSON.parse(once)))).toBe(once);
  });
});

describe('trimTrailingBullets', () => {
  it('drops trailing blanks but keeps inner ones', () => {
    expect(trimTrailingBullets(['a', '', 'b', '', '  '])).toEqual(['a', '', 'b']);
    expect(trimTrailingBullets(['', ''])).toEqual([]);
  });
});

describe('fitScale', () => {
  it('fits the wider dimension', () => {
    expect(fitScale({ width: 960, height: 2000 })).toBe(1);
    expect(fitScale({ width: 2000, height: 540 })).toBe(1);
    expect(fitScale({ width: 480, height: 270 })).toBe(0.5);
  });

  it('subtracts padding from both sides', () => {
    expect(fitScale({ width: 1008, height: 2000 }, { padding: 24 })).toBe(1);
  });

  it('never draws narrower than the minimum', () => {
    expect(fitScale({ width: 100, height: 100 })).toBe(MIN_SLIDE_WIDTH / SLIDE_WIDTH);
    expect(fitScale({ width: 0, height: 0 })).toBe(MIN_SLIDE_WIDTH / SLIDE_WIDTH);
  });

  it('lets a stage letterbox below the minimum', () => {
    expect(fitScale({ width: 192, height: 500 }, { minWidth: 0 })).toBe(0.2);
  });

  it('caps how far a slide is blown up', () => {
    expect(fitScale({ width: 9600, height: 5400 }, { maxScale: 1.5 })).toBe(1.5);
  });
});
