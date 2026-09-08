import { describe, expect, it } from 'vitest';
import { describeMediaError, describeThrown, failureSummary } from './errors';

describe('describeMediaError', () => {
  it('reads each MediaError code', () => {
    expect(describeMediaError({ code: 1 }, 'a.mp3').reason).toMatch(/stopped/i);
    expect(describeMediaError({ code: 2 }, 'a.mp3').reason).toMatch(/read/i);
    expect(describeMediaError({ code: 3 }, 'a.mp3').reason).toMatch(/decode/i);
    expect(describeMediaError({ code: 4 }, 'a.mp3').reason).toMatch(/cannot play this format/i);
  });

  it('keeps the file name and the browser message verbatim', () => {
    const failure = describeMediaError(
      { code: 4, message: ' DEMUXER_ERROR_COULD_NOT_OPEN ' },
      'clip.mov',
    );
    expect(failure.name).toBe('clip.mov');
    expect(failure.detail).toBe('DEMUXER_ERROR_COULD_NOT_OPEN');
  });

  it('says so when there is no error object or message', () => {
    const failure = describeMediaError(null, 'a.mp3');
    expect(failure.reason).toMatch(/without a reason/i);
    expect(failure.detail).toBe('');
    expect(describeMediaError({ code: 99 }, 'a.mp3').reason).toMatch(/without a reason/i);
  });
});

describe('describeThrown', () => {
  it('reports a refused play() with the browser text', () => {
    const failure = describeThrown(new Error('play() failed'), 'a.mp3');
    expect(failure.reason).toMatch(/refused/i);
    expect(failure.detail).toBe('play() failed');
  });

  it('separates an interruption from a refusal', () => {
    const abort = new Error('interrupted');
    abort.name = 'AbortError';
    expect(describeThrown(abort, 'a.mp3').reason).toMatch(/interrupted/i);
  });

  it('copes with a non-Error', () => {
    expect(describeThrown('nope', 'a.mp3').detail).toBe('nope');
    expect(describeThrown(null, 'a.mp3').detail).toBe('');
  });
});

describe('failureSummary', () => {
  it('joins the reason and the detail when there is one', () => {
    expect(failureSummary({ name: 'a', reason: 'Reason.', detail: 'Detail.' })).toBe(
      'Reason. Detail.',
    );
    expect(failureSummary({ name: 'a', reason: 'Reason.', detail: '' })).toBe('Reason.');
  });
});
