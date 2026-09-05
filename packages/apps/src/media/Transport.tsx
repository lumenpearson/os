import { cx, IconButton, Select, Slider } from '@lumen/ui';
import {
  ListMusic,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { RATES } from './config';
import type { LoopMode } from './queue';
import { formatPercent, formatRate } from './time';

const LOOP_LABEL: Record<LoopMode, string> = {
  off: 'Loop off',
  all: 'Loop the playlist',
  one: 'Loop this track',
};

const RATE_OPTIONS = RATES.map((rate) => ({ value: String(rate), label: formatRate(rate) }));

export interface TransportProps {
  playing: boolean;
  hasTrack: boolean;
  hasTracks: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  loop: LoopMode;
  shuffle: boolean;
  fullscreen: boolean;
  showPlaylist: boolean;
  /**
   * The row gives up its widest controls as the window narrows: the volume
   * slider first, the rate select next. Both stay reachable — volume from the
   * mute button and the arrow keys, rate from the Playback menu.
   */
  showVolumeSlider?: boolean;
  showRate?: boolean;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
  onRate: (rate: number) => void;
  onLoop: () => void;
  onShuffle: () => void;
  onFullscreen: () => void;
  onPlaylist: () => void;
  className?: string;
}

/** Every playback control, as real buttons and a real range input. */
export function Transport({
  playing,
  hasTrack,
  hasTracks,
  volume,
  muted,
  rate,
  loop,
  shuffle,
  fullscreen,
  showPlaylist,
  showVolumeSlider,
  showRate,
  onToggle,
  onNext,
  onPrevious,
  onVolume,
  onToggleMute,
  onRate,
  onLoop,
  onShuffle,
  onFullscreen,
  onPlaylist,
  className,
}: TransportProps) {
  const VolumeGlyph = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className={cx('flex min-w-0 items-center gap-1', className)}>
      <IconButton label="Previous track" onClick={onPrevious} disabled={!hasTracks}>
        <SkipBack />
      </IconButton>
      <IconButton
        label={playing ? 'Pause' : 'Play'}
        variant="outline"
        size="lg"
        onClick={onToggle}
        disabled={!hasTrack}
      >
        {playing ? <Pause /> : <Play />}
      </IconButton>
      <IconButton label="Next track" onClick={onNext} disabled={!hasTracks}>
        <SkipForward />
      </IconButton>

      <span className="mx-1 h-4 w-px shrink-0 bg-rule" />

      <IconButton label="Shuffle" active={shuffle} onClick={onShuffle} disabled={!hasTracks}>
        <Shuffle />
      </IconButton>
      <IconButton label={LOOP_LABEL[loop]} active={loop !== 'off'} onClick={onLoop}>
        {loop === 'one' ? <Repeat1 /> : <Repeat />}
      </IconButton>

      <span className="flex-1" />

      {showRate && (
        <Select
          size="sm"
          mono
          aria-label="Playback rate"
          className="mr-1 shrink-0"
          options={RATE_OPTIONS}
          value={String(rate)}
          onChange={(value) => onRate(Number(value))}
        />
      )}
      <IconButton label={muted ? 'Unmute' : 'Mute'} active={muted} onClick={onToggleMute}>
        <VolumeGlyph />
      </IconButton>
      {showVolumeSlider && (
        <Slider
          className="w-32 shrink-0"
          aria-label="Volume"
          min={0}
          max={100}
          step={1}
          value={Math.round((muted ? 0 : volume) * 100)}
          onChange={(next) => onVolume(next / 100)}
          showValue={() => formatPercent(muted ? 0 : volume)}
        />
      )}
      <IconButton label="Show playlist" active={showPlaylist} onClick={onPlaylist}>
        <ListMusic />
      </IconButton>
      <IconButton
        label={fullscreen ? 'Leave full screen' : 'Full screen'}
        active={fullscreen}
        onClick={onFullscreen}
      >
        {fullscreen ? <Minimize2 /> : <Maximize2 />}
      </IconButton>
    </div>
  );
}
