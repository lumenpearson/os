/**
 * Turning a media failure into something the panel can say honestly: which
 * file, what the browser's error code means, and the browser's own message
 * when it gave one. Nothing here invents a cause.
 */

export interface MediaErrorLike {
  code: number;
  message?: string;
}

export interface PlaybackFailure {
  /** File the failure belongs to. */
  name: string;
  /** Plain reading of the error code. */
  reason: string;
  /** The browser's message, verbatim; empty when it gave none. */
  detail: string;
}

/** `MediaError` codes, spelled out rather than imported from the DOM lib. */
const REASONS: Record<number, string> = {
  1: 'Loading stopped before the file could play.',
  2: 'The file could not be read to the end.',
  3: 'The data is damaged, or in a form this browser cannot decode.',
  4: 'This browser cannot play this format.',
};

export function describeMediaError(
  error: MediaErrorLike | null | undefined,
  name: string,
): PlaybackFailure {
  const reason = (error && REASONS[error.code]) ?? 'The browser stopped playback without a reason.';
  return { name, reason, detail: (error?.message ?? '').trim() };
}

/** A `play()` or file-read rejection, which arrives as an Error rather than a code. */
export function describeThrown(thrown: unknown, name: string): PlaybackFailure {
  const message = thrown instanceof Error ? thrown.message : String(thrown ?? '');
  const aborted = thrown instanceof Error && thrown.name === 'AbortError';
  return {
    name,
    reason: aborted
      ? 'Playback was interrupted by another track.'
      : 'The browser refused to start playback.',
    detail: message.trim(),
  };
}

/** One line for a notification, where there is no room for a panel. */
export function failureSummary(failure: PlaybackFailure): string {
  return failure.detail ? `${failure.reason} ${failure.detail}` : failure.reason;
}
