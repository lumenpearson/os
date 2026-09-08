import { describe, expect, it } from 'vitest';
import {
  addressEmail,
  bodyBlocks,
  displayAddress,
  type FormatOptions,
  formatAddressList,
  formatAttachmentSummary,
  formatAttribution,
  formatClockTime,
  formatFullStamp,
  formatSize,
  formatStamp,
  parseAddress,
  sameAddress,
  snippet,
  stripQuotedText,
} from './format';

/** A fixed locale, clock and zone, so the strings do not follow the host. */
const o: FormatOptions = { locale: 'en-GB', hour12: false, timeZone: 'UTC' };
const at = (y: number, m: number, d: number, h = 9, min = 41) => Date.UTC(y, m - 1, d, h, min);
const NOW = at(2026, 9, 4, 15, 0);

describe('parseAddress', () => {
  it('splits a display name from the address', () => {
    expect(parseAddress('Ada Lovelace <ada@local>')).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@local',
    });
  });

  it('unwraps a quoted name that holds a comma', () => {
    expect(parseAddress('"Lovelace, Ada" <ada@local>')).toEqual({
      name: 'Lovelace, Ada',
      email: 'ada@local',
    });
  });

  it('reads a bare address, and angle brackets with no name', () => {
    expect(parseAddress('ada@local')).toEqual({ name: '', email: 'ada@local' });
    expect(parseAddress('<ada@local>')).toEqual({ name: '', email: 'ada@local' });
  });

  it('treats a word with no @ as a name', () => {
    expect(parseAddress('Ada')).toEqual({ name: 'Ada', email: '' });
  });
});

describe('displayAddress', () => {
  it('prints the name when there is one and the address when there is not', () => {
    expect(displayAddress('Ada Lovelace <ada@local>')).toBe('Ada Lovelace');
    expect(displayAddress('ada@local')).toBe('ada@local');
    expect(displayAddress('  ')).toBe('');
  });

  it('gives the bare address for comparison', () => {
    expect(addressEmail('Ada Lovelace <ada@local>')).toBe('ada@local');
    expect(addressEmail('Ada')).toBe('');
  });

  it('compares two spellings of the same person', () => {
    expect(sameAddress('Ada <ADA@local>', 'ada@local')).toBe(true);
    expect(sameAddress('ada@local', 'grace@local')).toBe(false);
    expect(sameAddress('Ada', 'ada')).toBe(true);
  });
});

describe('formatAddressList', () => {
  it('joins a short list and counts a long one', () => {
    expect(formatAddressList([])).toBe('');
    expect(formatAddressList(['Ada <ada@local>'])).toBe('Ada');
    expect(formatAddressList(['Ada <ada@local>', 'grace@local'])).toBe('Ada and grace@local');
    expect(formatAddressList(['a@x', 'b@x', 'c@x', 'd@x'])).toBe('a@x, b@x and 2 more');
  });
});

describe('sizes', () => {
  it('reads bytes up the scale and refuses nonsense', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(-1)).toBe('—');
    expect(formatSize(Number.NaN)).toBe('—');
  });

  it('summarises an attachment strip', () => {
    expect(formatAttachmentSummary(1, 1024)).toBe('1 file · 1.0 KB');
    expect(formatAttachmentSummary(3, 0)).toBe('3 files · 0 B');
  });
});

describe('dates', () => {
  it('prints a time for a message from today', () => {
    expect(formatStamp(at(2026, 9, 4), NOW, o)).toBe('09:41');
    expect(formatClockTime(at(2026, 9, 4, 0, 5), o)).toBe('00:05');
  });

  it('names yesterday, then the weekday, inside the last week', () => {
    expect(formatStamp(at(2026, 9, 3), NOW, o)).toBe('Yesterday');
    expect(formatStamp(at(2026, 8, 31), NOW, o)).toBe('Monday');
  });

  it('falls back to a date at a week, and adds the year past one', () => {
    const lastWeek = formatStamp(at(2026, 8, 25), NOW, o);
    expect(lastWeek).toMatch(/^25 \w+$/);
    expect(lastWeek).not.toContain('2026');
    expect(formatStamp(at(2025, 12, 24), NOW, o)).toContain('2025');
  });

  it('reads the clock in the zone the user set, not the host one', () => {
    const tokyo: FormatOptions = { ...o, timeZone: 'Asia/Tokyo' };
    expect(formatClockTime(at(2026, 9, 4, 14, 40), tokyo)).toBe('23:40');
    // 16:00 UTC on the 3rd is already the 4th in Tokyo, so the same pair of
    // instants reads as two days in UTC and as one afternoon over there.
    expect(formatStamp(at(2026, 9, 3, 16, 0), at(2026, 9, 4, 1, 0), o)).toBe('Yesterday');
    expect(formatStamp(at(2026, 9, 3, 16, 0), at(2026, 9, 4, 1, 0), tokyo)).toBe('01:00');
  });

  it('prints the full stamp and the attribution line a reply quotes under', () => {
    expect(formatFullStamp(at(2026, 9, 4), o)).toBe('4 September 2026 at 09:41');
    expect(formatAttribution(at(2026, 9, 4), 'Ada Lovelace <ada@local>', o)).toBe(
      'On 4 September 2026 at 09:41, Ada Lovelace wrote:',
    );
  });

  it('reads a 12-hour clock when that is the preference', () => {
    expect(formatClockTime(at(2026, 9, 4, 13, 5), { ...o, hour12: true })).toMatch(/1:05/);
  });
});

describe('stripQuotedText', () => {
  it('drops quoted lines and the attribution above them', () => {
    const body = [
      'Yes, Tuesday works.',
      '',
      'On 4 September 2026 at 09:41, Ada Lovelace wrote:',
      '> Are you free on Tuesday?',
      '> Ada',
    ].join('\n');
    expect(stripQuotedText(body)).toBe('Yes, Tuesday works.');
  });

  it('stops at a signature delimiter', () => {
    expect(stripQuotedText('Thanks.\n\n--\nAda\nAnalytical Engine')).toBe('Thanks.');
  });

  it('stops at a forwarded header', () => {
    const body = 'See below.\n\n---------- Forwarded message ----------\nFrom: Ada';
    expect(stripQuotedText(body)).toBe('See below.');
  });

  it('leaves a body that quotes nothing exactly as it is', () => {
    expect(stripQuotedText('One\nTwo')).toBe('One\nTwo');
  });
});

describe('snippet', () => {
  it('flattens the body to one line', () => {
    expect(snippet('First line.\n\n  Second   line.')).toBe('First line. Second line.');
  });

  it('cuts at a word boundary and marks the cut', () => {
    const long = `${'alpha beta '.repeat(30)}omega`;
    const cut = snippet(long, 40);
    expect(cut.length).toBeLessThanOrEqual(41);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toContain('  ');
  });

  it('cuts mid-word rather than throwing most of the line away', () => {
    expect(snippet(`${'x'.repeat(40)} tail`, 20)).toBe(`${'x'.repeat(20)}…`);
  });

  it('is empty when the message is nothing but a quote', () => {
    expect(snippet('> only a quote')).toBe('');
  });
});

describe('bodyBlocks', () => {
  it('runs of quoted and unquoted lines come out as separate blocks', () => {
    expect(bodyBlocks('Hi\n\n> One\n> Two\nBye')).toEqual([
      { quoted: false, text: 'Hi\n' },
      { quoted: true, text: 'One\nTwo' },
      { quoted: false, text: 'Bye' },
    ]);
  });

  it('takes one level of quoting off and leaves the rest', () => {
    expect(bodyBlocks('> > deep')).toEqual([{ quoted: true, text: '> deep' }]);
  });

  it('gives an unquoted body a single block', () => {
    expect(bodyBlocks('One\nTwo')).toEqual([{ quoted: false, text: 'One\nTwo' }]);
    expect(bodyBlocks('')).toEqual([{ quoted: false, text: '' }]);
  });
});
