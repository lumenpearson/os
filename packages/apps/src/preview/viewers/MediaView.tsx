import { IconButton, Slider } from '@lumen/ui';
import {
  AlertTriangle,
  Maximize2,
  Minimize2,
  Music,
  Pause,
  Play,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { type MediaHTMLAttributes, useCallback, useEffect, useRef, useState } from 'react';
import { formatDuration } from '../document';
import {
  clampTime,
  clampVolume,
  isSeekable,
  ownsKeys,
  type PlaybackCommand,
  playbackCommand,
  seekBy,
  volumeLevel,
} from '../playback';
import type { Size } from '../zoom';

export interface MediaViewProps {
  /** Blob URL for the file; the SDK revokes it. */
  url: string;
  name: string;
  /** Video gets a picture; audio gets a plate with the file name on it. */
  video: boolean;
  /** Drop the volume slider when the window is too narrow for it. */
  narrow?: boolean;
  fullScreen: boolean;
  onToggleFullScreen: () => void;
  onDuration: (seconds: number) => void;
  onSize: (size: Size) => void;
}

const VOLUME_GLYPH = { muted: VolumeX, low: Volume1, high: Volume2 };

/**
 * The player, with the app's own transport rather than the browser's: the
 * default controls are a different design in every engine, and they answer
 * neither the menubar nor the keys Preview binds.
 */
export function MediaView({
  url,
  name,
  video,
  narrow,
  fullScreen,
  onToggleFullScreen,
  onDuration,
  onSize,
}: MediaViewProps) {
  const media = useRef<HTMLMediaElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(Number.NaN);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);

  // A new file is a new transport: nothing about the last one carries over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the new file is the reason to reset, not something the body reads
  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    setDuration(Number.NaN);
    setFailed(false);
  }, [url]);

  const play = useCallback(() => {
    const el = media.current;
    if (!el) return;
    // Older engines return nothing from play() instead of a promise.
    if (el.paused) void Promise.resolve(el.play()).catch(() => setFailed(true));
    else el.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const el = media.current;
    if (!el) return;
    const next = clampTime(seconds, el.duration);
    el.currentTime = next;
    setPosition(next);
  }, []);

  const changeVolume = useCallback((value: number) => {
    const el = media.current;
    const next = clampVolume(value);
    if (el) {
      el.volume = next;
      el.muted = next === 0;
    }
    setVolume(next);
    setMuted(next === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const el = media.current;
    if (!el) return;
    const next = !el.muted;
    el.muted = next;
    setMuted(next);
  }, []);

  const run = useCallback(
    (command: PlaybackCommand) => {
      const el = media.current;
      if (!el) return;
      switch (command.type) {
        case 'toggle':
          play();
          break;
        case 'seek':
          seek(seekBy(el.currentTime, command.delta, el.duration));
          break;
        case 'volume':
          changeVolume(el.volume + command.delta);
          break;
        case 'mute':
          toggleMute();
          break;
        case 'start':
          seek(0);
          break;
        case 'end':
          seek(isSeekable(el.duration) ? el.duration : el.currentTime);
          break;
      }
    },
    [play, seek, changeVolume, toggleMute],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (ownsKeys(event.target)) return;
    const command = playbackCommand(event);
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    run(command);
  };

  const seekable = isSeekable(duration);
  const Speaker = VOLUME_GLYPH[volumeLevel(volume, muted)];

  /** One set of handlers for both elements; the ref narrows where it matters. */
  const wiring: MediaHTMLAttributes<HTMLMediaElement> = {
    src: url,
    playsInline: true,
    preload: 'metadata',
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onTimeUpdate: (e) => setPosition(e.currentTarget.currentTime),
    onVolumeChange: (e) => {
      setVolume(clampVolume(e.currentTarget.volume));
      setMuted(e.currentTarget.muted);
    },
    onError: () => setFailed(true),
    onLoadedMetadata: (e) => {
      const el = e.currentTarget;
      setDuration(el.duration);
      onDuration(el.duration);
      const width = 'videoWidth' in el ? Number(el.videoWidth) : 0;
      const height = 'videoHeight' in el ? Number(el.videoHeight) : 0;
      if (width > 0 && height > 0) onSize({ width, height });
    },
  };

  return (
    <div
      role="group"
      aria-label={`${name}. Space plays and pauses, the arrows seek.`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the player answers the transport keys, so it has to be reachable by keyboard
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-1 flex-col bg-canvas lumen-focus focus-visible:-outline-offset-2"
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {video ? (
          <video
            ref={(el) => {
              media.current = el;
            }}
            {...wiring}
            className="h-full w-full object-contain"
            aria-label={name}
          />
        ) : (
          <audio
            ref={(el) => {
              media.current = el;
            }}
            {...wiring}
            aria-label={name}
          />
        )}
        {!video && (
          <div className="flex flex-col items-center gap-2 px-8 text-center">
            <Music aria-hidden className="size-8 stroke-[1.25] text-ink-3" />
            <p className="mono truncate-1 max-w-80 text-sm text-ink-2">{name}</p>
          </div>
        )}
        {failed && (
          <p className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-surface px-4 py-2 text-base text-ink-2">
            <AlertTriangle aria-hidden className="size-4 shrink-0 text-ink-3" />
            This runtime cannot play the file's format.
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-rule bg-surface px-2 py-1.5">
        <IconButton label={playing ? 'Pause' : 'Play'} onClick={play}>
          {playing ? <Pause /> : <Play />}
        </IconButton>
        <span className="mono w-10 shrink-0 text-right text-xs tabular-nums text-ink-2">
          {formatDuration(position)}
        </span>
        <Slider
          className="min-w-16 flex-1"
          aria-label="Seek"
          aria-valuetext={`${formatDuration(position)} of ${formatDuration(duration)}`}
          min={0}
          max={seekable ? duration : 1}
          step={0.1}
          value={seekable ? Math.min(position, duration) : 0}
          onChange={seek}
          disabled={!seekable}
        />
        <span className="mono w-10 shrink-0 text-xs tabular-nums text-ink-3">
          {formatDuration(duration)}
        </span>
        <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
          <Speaker />
        </IconButton>
        {!narrow && (
          <Slider
            className="w-20 shrink-0"
            aria-label="Volume"
            aria-valuetext={`${Math.round(volume * 100)} percent`}
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={changeVolume}
          />
        )}
        {video && (
          <IconButton
            label={fullScreen ? 'Leave Full Screen' : 'Full Screen'}
            onClick={onToggleFullScreen}
          >
            {fullScreen ? <Minimize2 /> : <Maximize2 />}
          </IconButton>
        )}
      </div>
    </div>
  );
}
