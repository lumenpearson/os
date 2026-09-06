import { Button, EmptyState } from '@lumen/ui';
import { dirname, formatBytes } from '@lumen/vfs';
import { Music } from 'lucide-react';
import { useRef } from 'react';
import { useMediaFrames } from './clock';
import type { Track } from './queue';
import { formatRemaining, formatTimecode, isKnownDuration, UNKNOWN_TIME } from './time';

export interface NowPlayingProps {
  track: Track | null;
  media: HTMLMediaElement | null;
  playing: boolean;
  /** From the element's metadata; NaN until it arrives. */
  duration: number;
  /** File size in bytes, or null while it is being read. */
  size: number | null;
  onAdd: () => void;
}

/**
 * The audio panel. It shows what the file itself says — its name, the folder
 * it came from, its size and its duration — and never claims an artist or an
 * album, because nothing here reads tags.
 */
export function NowPlaying({ track, media, playing, duration, size, onAdd }: NowPlayingProps) {
  const elapsed = useRef<HTMLSpanElement>(null);
  const remaining = useRef<HTMLSpanElement>(null);

  useMediaFrames(media, playing, (el) => {
    if (elapsed.current) elapsed.current.textContent = formatTimecode(el.currentTime);
    if (remaining.current)
      remaining.current.textContent = formatRemaining(el.currentTime, el.duration);
  });

  if (!track) {
    return (
      <EmptyState
        icon={<Music />}
        title="Nothing queued"
        description="Add audio or video files, then press Play."
        action={
          <Button variant="primary" onClick={onAdd}>
            Add Files…
          </Button>
        }
      />
    );
  }

  const facts = [
    isKnownDuration(duration) ? formatTimecode(duration) : null,
    size === null ? null : formatBytes(size),
  ].filter((fact): fact is string => fact !== null);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
      <Music aria-hidden className="size-9 shrink-0 stroke-[1.25] text-ink-3" />
      <div className="flex w-full min-w-0 flex-col items-center gap-1 text-center">
        <h2 className="w-full truncate-1 text-xl font-medium text-ink">{track.name}</h2>
        <p className="mono w-full truncate-1 text-xs text-ink-3" title={dirname(track.path)}>
          {dirname(track.path)}
        </p>
        {facts.length > 0 && (
          <p className="mono text-xs text-ink-3 tabular-nums">{facts.join('  ·  ')}</p>
        )}
      </div>
      <div className="mono flex items-baseline gap-6 text-md text-ink tabular-nums">
        <span ref={elapsed}>{UNKNOWN_TIME}</span>
        <span ref={remaining} className="text-ink-3">
          {UNKNOWN_TIME}
        </span>
      </div>
    </div>
  );
}
