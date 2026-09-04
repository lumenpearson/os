import { describe, expect, it } from 'vitest';
import {
  canGoBack,
  canGoForward,
  createStack,
  currentEntry,
  goBack,
  goForward,
  groupVisitsByDay,
  MAX_STACK_ENTRIES,
  MAX_VISITS,
  pushEntry,
  recordVisit,
  relativeDayLabel,
  removeVisit,
  searchVisits,
  setVisitTitle,
  startOfDay,
  uniqueByUrl,
  type Visit,
} from './history';

const A = 'https://a.example/';
const B = 'https://b.example/';
const C = 'https://c.example/';

describe('NavStack', () => {
  it('starts on its only entry with nowhere to go', () => {
    const stack = createStack(A);
    expect(currentEntry(stack)).toBe(A);
    expect(canGoBack(stack)).toBe(false);
    expect(canGoForward(stack)).toBe(false);
  });

  it('pushes and walks back and forward', () => {
    let stack = pushEntry(createStack(A), B);
    expect(currentEntry(stack)).toBe(B);
    expect(canGoBack(stack)).toBe(true);

    stack = goBack(stack);
    expect(currentEntry(stack)).toBe(A);
    expect(canGoForward(stack)).toBe(true);

    stack = goForward(stack);
    expect(currentEntry(stack)).toBe(B);
    expect(canGoForward(stack)).toBe(false);
  });

  it('drops the forward entries when navigating from the middle', () => {
    let stack = pushEntry(pushEntry(createStack(A), B), C);
    stack = goBack(stack);
    expect(currentEntry(stack)).toBe(B);

    stack = pushEntry(stack, 'https://d.example/');
    expect(stack.entries).toEqual([A, B, 'https://d.example/']);
    expect(canGoForward(stack)).toBe(false);
    expect(currentEntry(stack)).toBe('https://d.example/');
  });

  it('does not stack the address it is already showing', () => {
    const stack = pushEntry(createStack(A), A);
    expect(stack.entries).toEqual([A]);
  });

  it('returns the same stack when there is nowhere to go', () => {
    const stack = createStack(A);
    expect(goBack(stack)).toBe(stack);
    expect(goForward(stack)).toBe(stack);
  });

  it('drops the oldest entries past the limit and keeps the cursor at the end', () => {
    let stack = createStack('https://0.example/');
    for (let i = 1; i < MAX_STACK_ENTRIES + 10; i += 1) {
      stack = pushEntry(stack, `https://${i}.example/`);
    }
    expect(stack.entries).toHaveLength(MAX_STACK_ENTRIES);
    expect(stack.index).toBe(MAX_STACK_ENTRIES - 1);
    expect(currentEntry(stack)).toBe(`https://${MAX_STACK_ENTRIES + 9}.example/`);
    expect(stack.entries[0]).toBe('https://10.example/');
  });
});

function visit(id: string, url: string, visitedAt: number, title = ''): Visit {
  return { id, url, title: title || url, visitedAt };
}

describe('recordVisit', () => {
  it('puts the newest visit first', () => {
    const log = recordVisit(recordVisit([], visit('1', A, 1)), visit('2', B, 2));
    expect(log.map((v) => v.url)).toEqual([B, A]);
  });

  it('merges a repeat of the page at the head instead of duplicating it', () => {
    const first = recordVisit([], visit('1', A, 1, 'a.example'));
    const log = recordVisit(first, { id: '2', url: A, title: '', visitedAt: 5 });
    expect(log).toHaveLength(1);
    expect(log[0]?.id).toBe('1');
    expect(log[0]?.visitedAt).toBe(5);
    expect(log[0]?.title).toBe('a.example');
  });

  it('takes a better title when the repeat has one', () => {
    const first = recordVisit([], visit('1', A, 1, 'a.example'));
    const log = recordVisit(first, { id: '2', url: A, title: 'Real Title', visitedAt: 6 });
    expect(log[0]?.title).toBe('Real Title');
  });

  it('records the page again when something else was visited in between', () => {
    let log = recordVisit([], visit('1', A, 1));
    log = recordVisit(log, visit('2', B, 2));
    log = recordVisit(log, visit('3', A, 3));
    expect(log.map((v) => v.id)).toEqual(['3', '2', '1']);
  });

  it('caps the log', () => {
    let log: Visit[] = [];
    for (let i = 0; i < MAX_VISITS + 20; i += 1) {
      log = recordVisit(log, visit(String(i), `https://${i}.example/`, i));
    }
    expect(log).toHaveLength(MAX_VISITS);
    expect(log[0]?.id).toBe(String(MAX_VISITS + 19));
  });
});

describe('setVisitTitle / removeVisit', () => {
  const log = [visit('1', A, 1), visit('2', B, 2)];

  it('renames one entry', () => {
    expect(setVisitTitle(log, '2', 'Bee')[1]?.title).toBe('Bee');
    expect(setVisitTitle(log, '2', 'Bee')[0]?.title).toBe(log[0]?.title);
  });

  it('removes one entry', () => {
    expect(removeVisit(log, '1').map((v) => v.id)).toEqual(['2']);
    expect(removeVisit(log, 'nope')).toHaveLength(2);
  });
});

describe('searchVisits', () => {
  const log = [
    visit('1', 'https://example.com/docs', 3, 'Documentation'),
    visit('2', 'https://other.test/', 2, 'Other'),
    visit('3', 'https://example.com/blog', 1, 'Blog'),
  ];

  it('matches the title, case-insensitively', () => {
    expect(searchVisits(log, 'documentation').map((v) => v.id)).toEqual(['1']);
  });

  it('matches the address', () => {
    expect(searchVisits(log, 'example.com').map((v) => v.id)).toEqual(['1', '3']);
  });

  it('returns everything for a blank query, honouring the limit', () => {
    expect(searchVisits(log, '   ')).toHaveLength(3);
    expect(searchVisits(log, '', 2)).toHaveLength(2);
  });

  it('stops at the limit', () => {
    expect(searchVisits(log, 'example.com', 1).map((v) => v.id)).toEqual(['1']);
  });
});

describe('uniqueByUrl', () => {
  it('keeps the newest visit per address', () => {
    const log = [visit('3', A, 3), visit('2', B, 2), visit('1', A, 1)];
    expect(uniqueByUrl(log).map((v) => v.id)).toEqual(['3', '2']);
  });

  it('stops at the limit', () => {
    const log = [visit('3', A, 3), visit('2', B, 2), visit('1', C, 1)];
    expect(uniqueByUrl(log, 2)).toHaveLength(2);
  });
});

describe('grouping by day', () => {
  const day = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

  it('puts local midnight at the start of the day', () => {
    const noon = day(2026, 2, 4);
    expect(new Date(startOfDay(noon)).getHours()).toBe(0);
    expect(startOfDay(noon)).toBeLessThanOrEqual(noon);
  });

  it('groups newest day first and newest visit first', () => {
    const log = [
      visit('a', A, day(2026, 2, 4, 9)),
      visit('b', B, day(2026, 2, 4, 17)),
      visit('c', C, day(2026, 2, 2, 8)),
    ];
    const groups = groupVisitsByDay(log);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.day).toBe(startOfDay(day(2026, 2, 4)));
    expect(groups[0]?.visits.map((v) => v.id)).toEqual(['b', 'a']);
    expect(groups[1]?.visits.map((v) => v.id)).toEqual(['c']);
  });

  it('has no groups for an empty log', () => {
    expect(groupVisitsByDay([])).toEqual([]);
  });

  it('labels today and yesterday and nothing else', () => {
    const now = day(2026, 2, 4, 15);
    expect(relativeDayLabel(startOfDay(now), now)).toBe('Today');
    expect(relativeDayLabel(startOfDay(day(2026, 2, 3)), now)).toBe('Yesterday');
    expect(relativeDayLabel(startOfDay(day(2026, 2, 2)), now)).toBeNull();
  });
});
