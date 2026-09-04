import type { LaunchArgs } from '@lumen/kernel';
import { useKernel, useSetting, useVfs } from '@lumen/kernel/react';
import { Button, cx, IconButton, useElementSize, useLatest } from '@lumen/ui';
import { basename, dirname, join } from '@lumen/vfs';
import { TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useAppMenus,
  useArgs,
  useFilePicker,
  useJsonFile,
  useNotify,
  useObjectUrl,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { useAudioGraph } from './audio';
import { DEFAULT_CONFIG, MAX_RATE, type MediaConfig, MIN_RATE, sanitizeConfig } from './config';
import { describeMediaError, describeThrown, type PlaybackFailure } from './errors';
import { commandForKey, isControlTarget, type MediaCommand } from './keys';
import { buildMediaMenus, type MediaActions } from './menus';
import { NowPlaying } from './NowPlaying';
import { Playlist } from './Playlist';
import {
  currentTrack,
  cycleLoop,
  MEDIA_EXTENSIONS,
  mediaKind,
  type QueueAction,
  queueReducer,
  step,
  tracksFor,
} from './queue';
import { SeekBar } from './SeekBar';
import { Transport } from './Transport';
import { clamp, seekBy, timeAtFraction } from './time';
import { VideoStage } from './VideoStage';
import { Visualiser } from './VisualiserCanvas';

/** Below this width the playlist moves under the stage and the sliders go. */
const NARROW_WIDTH = 560;

/** Paths the window was launched with, in the order they should queue. */
function launchPaths(args: LaunchArgs): string[] {
  const many = Array.isArray(args.paths) ? args.paths : [];
  const one = typeof args.path === 'string' && !many.includes(args.path) ? [args.path] : [];
  return [...many, ...one];
}

function describe(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * The player: one media element for the life of the window, a queue in the
 * VFS, and controls drawn by the app rather than by the browser.
 *
 * The element is a `<video>` even for audio. A media element can carry only
 * one `MediaElementAudioSourceNode`, so swapping tags between an audio track
 * and a film would strand the analyser on the element that had been left
 * behind; one element that can do both keeps the audio graph honest. For an
 * audio track the video stage is hidden and the sound panel takes its place.
 */
export default function MediaPlayer({ args: initialArgs }: AppProps) {
  const kernel = useKernel();
  const vfs = useVfs();
  const notify = useNotify();
  const pick = useFilePicker();
  const controls = useWindowControls();
  const [appearance] = useSetting('appearance');
  const args = useArgs(initialArgs);

  const configPath = useMemo(() => join(kernel.home, '.config', 'media.json'), [kernel.home]);
  const [stored, store, storage] = useJsonFile<MediaConfig>(configPath, DEFAULT_CONFIG);
  const config = useMemo(() => sanitizeConfig(stored), [stored]);
  const queue = config.queue;
  const track = currentTrack(queue);
  const trackPath = track?.path ?? null;
  const trackName = track?.name ?? '';

  const [media, setMedia] = useState<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(Number.NaN);
  const [bytes, setBytes] = useState<number | null>(null);
  /** The picture's own pixels, once the file has told us. */
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const [failure, setFailure] = useState<PlaybackFailure | null>(null);

  const element = useRef<HTMLVideoElement | null>(null);
  /** True while the listener wants sound; it survives a change of track. */
  const wanted = useRef(false);
  const opened = useRef('');

  const [root, size] = useElementSize<HTMLDivElement>();
  const narrow = size.width > 0 && size.width < NARROW_WIDTH;

  const source = useObjectUrl(trackPath);
  const { analyser, supported, connect } = useAudioGraph(media);
  const canVisualise = supported && !appearance.reduceMotion;
  const showVisualiser = config.showVisualiser && canVisualise;
  const fullscreen = controls.window?.fullscreen ?? false;
  const isVideo = track?.kind === 'video';

  const latest = useLatest({ config, queue, track, controls, fullscreen, showVisualiser });

  useTitle(track ? track.name : 'Media Player');

  const attach = useCallback((node: HTMLVideoElement | null) => {
    element.current = node;
    setMedia(node);
  }, []);

  const focusRoot = useCallback(() => {
    root.current?.focus({ preventScroll: true });
  }, [root]);

  // ── stored state ─────────────────────────────────────────────────────────

  const patch = useCallback(
    (change: Partial<MediaConfig> | ((current: MediaConfig) => Partial<MediaConfig>)) => {
      store((previous) => {
        const current = sanitizeConfig(previous);
        return { ...current, ...(typeof change === 'function' ? change(current) : change) };
      });
    },
    [store],
  );

  const dispatch = useCallback(
    (action: QueueAction) => patch((current) => ({ queue: queueReducer(current.queue, action) })),
    [patch],
  );

  // ── playback ─────────────────────────────────────────────────────────────

  const startPlayback = useCallback(() => {
    const node = element.current;
    if (!node) return;
    wanted.current = true;
    // The audio graph must be built from the gesture and before play(), and
    // only when something is going to read it.
    if (latest.current.showVisualiser && latest.current.track?.kind === 'audio') void connect();
    const started = node.play();
    if (!started) return;
    void started
      .then(() => setFailure(null))
      .catch((thrown: unknown) => {
        // The autoplay policy is not a fault worth a panel: the Play button is
        // right there and pressing it works.
        if (thrown instanceof Error && thrown.name === 'NotAllowedError') return;
        setFailure(describeThrown(thrown, latest.current.track?.name ?? ''));
      });
  }, [connect, latest]);

  const toggle = useCallback(() => {
    const node = element.current;
    if (!node || !latest.current.track) return;
    if (node.paused) {
      startPlayback();
      return;
    }
    wanted.current = false;
    node.pause();
  }, [latest, startPlayback]);

  const advance = useCallback(
    (direction: 1 | -1, auto = false) => {
      const node = element.current;
      const current = latest.current.queue;
      const result = step(current, direction, { auto, elapsed: node?.currentTime ?? 0 });
      if (result.index === null) {
        wanted.current = false;
        node?.pause();
        return;
      }
      if (result.index === current.index) {
        if (node && result.restart) {
          node.currentTime = 0;
          if (wanted.current || auto) startPlayback();
        }
        if (result.seed !== current.seed) patch({ queue: { ...current, seed: result.seed } });
        return;
      }
      patch({
        queue: queueReducer(current, { type: 'select', index: result.index, seed: result.seed }),
      });
    },
    [latest, patch, startPlayback],
  );

  const select = useCallback(
    (index: number) => {
      const node = element.current;
      wanted.current = true;
      if (index === latest.current.queue.index) {
        if (node) {
          node.currentTime = 0;
          startPlayback();
        }
        return;
      }
      dispatch({ type: 'select', index });
    },
    [dispatch, latest, startPlayback],
  );

  const seekTo = useCallback((time: number) => {
    const node = element.current;
    if (node) node.currentTime = time;
  }, []);

  // ── the element ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!media) return;
    media.volume = config.volume;
    media.muted = config.muted;
    media.playbackRate = config.rate;
  }, [media, config.volume, config.muted, config.rate]);

  useEffect(() => {
    if (!media) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      advance(1, true);
    };
    const onMetadata = () => {
      setDuration(media.duration);
      setFrame(
        media.videoWidth > 0 ? { width: media.videoWidth, height: media.videoHeight } : null,
      );
    };
    const onCanPlay = () => {
      if (wanted.current && media.paused) startPlayback();
    };
    const onFail = () => {
      // Clearing the queue empties the source, which some browsers report as
      // an error; there is no file to blame then.
      if (!latest.current.track) return;
      wanted.current = false;
      setPlaying(false);
      setFailure(describeMediaError(media.error, latest.current.track.name));
    };
    media.addEventListener('play', onPlay);
    media.addEventListener('pause', onPause);
    media.addEventListener('ended', onEnded);
    media.addEventListener('loadedmetadata', onMetadata);
    media.addEventListener('durationchange', onMetadata);
    media.addEventListener('canplay', onCanPlay);
    media.addEventListener('error', onFail);
    return () => {
      media.removeEventListener('play', onPlay);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('ended', onEnded);
      media.removeEventListener('loadedmetadata', onMetadata);
      media.removeEventListener('durationchange', onMetadata);
      media.removeEventListener('canplay', onCanPlay);
      media.removeEventListener('error', onFail);
    };
  }, [media, advance, startPlayback, latest]);

  // A queue that runs out leaves the element holding the last file; drop it so
  // the sound stops with the playlist.
  useEffect(() => {
    const node = element.current;
    if (!node || source.url) return;
    node.pause();
    node.removeAttribute('src');
    node.load();
  }, [source.url]);

  useEffect(() => {
    setFailure(null);
    setDuration(Number.NaN);
    setBytes(null);
    setFrame(null);
    if (!trackPath) return;
    let cancelled = false;
    kernel.addRecent(trackPath, 'lumen.media');
    vfs
      .stat(trackPath)
      .then((stat) => {
        if (!cancelled) setBytes(stat.size);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [trackPath, kernel, vfs]);

  useEffect(() => {
    if (!source.error) return;
    setFailure({
      name: trackName,
      reason: 'This file could not be read from disk.',
      detail: source.error,
    });
  }, [source.error, trackName]);

  useEffect(() => {
    focusRoot();
  }, [focusRoot]);

  // ── opening files ────────────────────────────────────────────────────────

  const openPaths = useCallback(
    (paths: string[], options: { replace?: boolean; play?: boolean } = {}) => {
      const tracks = tracksFor(paths);
      const first = tracks[0];
      if (!first) {
        notify(
          'Nothing to play',
          paths.length === 1
            ? `${basename(paths[0] ?? '')} is not a media file this player can open.`
            : 'None of those files are media this player can open.',
        );
        return;
      }
      if (options.play) {
        wanted.current = true;
        // Opening the file that is already loaded changes no state, so it has
        // to be started here.
        const node = element.current;
        if (node && latest.current.track?.path === first.path) {
          node.currentTime = 0;
          startPlayback();
        }
      }
      patch((current) => {
        const base = options.replace
          ? queueReducer(current.queue, { type: 'clear' })
          : current.queue;
        const added = queueReducer(base, { type: 'add', tracks });
        const index = added.tracks.findIndex((entry) => entry.path === first.path);
        return {
          queue:
            options.play && index >= 0 ? queueReducer(added, { type: 'select', index }) : added,
        };
      });
    },
    [notify, patch, latest, startPlayback],
  );

  const chooseFiles = useCallback(
    async (mode: 'open' | 'add') => {
      const chosen = await pick({
        mode: 'open',
        multiple: true,
        title: mode === 'open' ? 'Open Media' : 'Add to Playlist',
        confirmLabel: mode === 'open' ? 'Open' : 'Add',
        extensions: MEDIA_EXTENSIONS,
        startDir: trackPath ? dirname(trackPath) : undefined,
      });
      const paths = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
      if (paths.length === 0) return;
      openPaths(paths, mode === 'open' ? { replace: true, play: true } : {});
    },
    [pick, openPaths, trackPath],
  );

  const addFolder = useCallback(async () => {
    const chosen = await pick({ mode: 'folder', title: 'Add Folder', confirmLabel: 'Add' });
    if (typeof chosen !== 'string') return;
    const found: string[] = [];
    try {
      await vfs.walk(chosen, (entry) => {
        if (entry.name.startsWith('.')) return false;
        if (entry.kind === 'file' && mediaKind(entry.path)) found.push(entry.path);
        return true;
      });
    } catch (thrown) {
      notify('Could not read that folder', describe(thrown));
      return;
    }
    if (found.length === 0) {
      notify('No media in that folder', basename(chosen));
      return;
    }
    found.sort((a, b) => a.localeCompare(b));
    openPaths(found);
  }, [pick, vfs, notify, openPaths]);

  // Files handed over at launch queue once the stored playlist has arrived,
  // so the file being read does not overwrite them.
  useEffect(() => {
    if (!storage.loaded) return;
    const paths = launchPaths(args);
    const key = paths.join('\n');
    if (!key || key === opened.current) return;
    opened.current = key;
    openPaths(paths, { play: true });
  }, [args, storage.loaded, openPaths]);

  // ── menus and keys ───────────────────────────────────────────────────────

  const actions = useMemo<MediaActions>(
    () => ({
      open: () => void chooseFiles('open'),
      addFiles: () => void chooseFiles('add'),
      addFolder: () => void addFolder(),
      clear: () => {
        wanted.current = false;
        element.current?.pause();
        dispatch({ type: 'clear' });
      },
      toggle,
      next: () => advance(1),
      previous: () => advance(-1),
      setRate: (rate) => patch({ rate: clamp(rate, MIN_RATE, MAX_RATE) }),
      setLoop: (mode) => dispatch({ type: 'loop', mode }),
      toggleShuffle: () => dispatch({ type: 'shuffle', on: !latest.current.queue.shuffle }),
      toggleFullscreen: () => latest.current.controls.setFullscreen(!latest.current.fullscreen),
      togglePlaylist: () => patch((current) => ({ showPlaylist: !current.showPlaylist })),
      toggleVisualiser: () => {
        const on = !latest.current.config.showVisualiser;
        if (on) void connect();
        patch({ showVisualiser: on });
      },
    }),
    [chooseFiles, addFolder, dispatch, toggle, advance, patch, latest, connect],
  );

  const menus = useMemo(
    () =>
      buildMediaMenus(
        {
          hasTracks: queue.tracks.length > 0,
          hasTrack: track !== null,
          playing,
          loop: queue.loop,
          shuffle: queue.shuffle,
          rate: config.rate,
          fullscreen,
          showPlaylist: config.showPlaylist,
          showVisualiser: config.showVisualiser,
          canVisualise,
        },
        actions,
      ),
    [
      queue.tracks.length,
      queue.loop,
      queue.shuffle,
      track,
      playing,
      config.rate,
      config.showPlaylist,
      config.showVisualiser,
      fullscreen,
      canVisualise,
      actions,
    ],
  );
  useAppMenus(menus, [menus]);

  const run = useCallback(
    (command: MediaCommand) => {
      const node = element.current;
      switch (command.type) {
        case 'toggle':
          toggle();
          break;
        case 'seek':
          if (node) node.currentTime = seekBy(node.currentTime, command.delta, node.duration);
          break;
        case 'volume':
          patch((current) => ({
            volume: clamp(current.volume + command.delta, 0, 1),
            muted: false,
          }));
          break;
        case 'mute':
          patch((current) => ({ muted: !current.muted }));
          break;
        case 'fullscreen':
          latest.current.controls.setFullscreen(!latest.current.fullscreen);
          break;
        case 'next':
          advance(1);
          break;
        case 'previous':
          advance(-1);
          break;
        case 'fraction':
          if (node) node.currentTime = timeAtFraction(command.value, node.duration);
          break;
      }
    },
    [toggle, patch, advance, latest],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const command = commandForKey(event);
    if (!command) return;
    if (isControlTarget(event.target)) {
      // The focused control answers this key itself. Keep it from reaching the
      // menubar's single-key shortcuts, which would act on it a second time.
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    run(command);
  };

  // ── render ───────────────────────────────────────────────────────────────

  const transport = (
    <>
      <SeekBar
        media={media}
        playing={playing}
        duration={duration}
        onSeek={seekTo}
        onToggle={toggle}
      />
      <Transport
        playing={playing}
        hasTrack={track !== null}
        hasTracks={queue.tracks.length > 0}
        volume={config.volume}
        muted={config.muted}
        rate={config.rate}
        loop={queue.loop}
        shuffle={queue.shuffle}
        fullscreen={fullscreen}
        showPlaylist={config.showPlaylist}
        narrow={narrow}
        onToggle={toggle}
        onNext={actions.next}
        onPrevious={actions.previous}
        onVolume={(volume) => patch({ volume, muted: false })}
        onToggleMute={() => patch((current) => ({ muted: !current.muted }))}
        onRate={actions.setRate}
        onLoop={() => dispatch({ type: 'loop', mode: cycleLoop(queue.loop) })}
        onShuffle={actions.toggleShuffle}
        onFullscreen={actions.toggleFullscreen}
        onPlaylist={actions.togglePlaylist}
      />
    </>
  );

  return (
    <div
      ref={root}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="flex h-full w-full flex-col bg-surface text-ink outline-none"
    >
      <div className={cx('flex min-h-0 flex-1', narrow ? 'flex-col' : 'flex-row')}>
        <VideoStage
          active={isVideo}
          playing={playing}
          caption={
            track && (
              <div className="flex min-w-0 items-baseline gap-3">
                <span className="truncate-1 text-base text-ink">{track.name}</span>
                {frame && (
                  <span className="mono shrink-0 text-xs text-ink-3 tabular-nums">
                    {frame.width}×{frame.height}
                  </span>
                )}
              </div>
            )
          }
          controls={transport}
          onPointerActivate={focusRoot}
        >
          {/* One element for every track. The app draws the controls, so the
              browser's own are off. */}
          {/* biome-ignore lint/a11y/useMediaCaption: the file being played is
              the user's own; there is no caption track to attach to it, and
              the browser still shows any the file itself carries. */}
          <video
            ref={attach}
            src={source.url ?? undefined}
            controls={false}
            playsInline
            preload="metadata"
            className="max-h-full max-w-full"
          />
        </VideoStage>
        {!isVideo && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <NowPlaying
              track={track}
              media={media}
              playing={playing}
              duration={duration}
              size={bytes}
              onAdd={actions.addFiles}
            />
            {showVisualiser && <Visualiser analyser={analyser} active={playing} />}
          </div>
        )}
        {config.showPlaylist && (
          <Playlist
            tracks={queue.tracks}
            index={queue.index}
            onSelect={select}
            onRemove={(index) => dispatch({ type: 'remove', index })}
            onReorder={(from, to) => dispatch({ type: 'reorder', from, to })}
            onAddFiles={actions.addFiles}
            onAddFolder={actions.addFolder}
            onClear={actions.clear}
            className={cx(
              'shrink-0',
              narrow ? 'h-44 border-t border-rule' : 'w-60 border-l border-rule',
            )}
          />
        )}
      </div>

      {failure && (
        <div className="flex shrink-0 items-start gap-3 border-t border-rule bg-surface-2 px-3 py-2">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="mono truncate-1 text-sm text-ink">{failure.name}</p>
            <p className="text-sm text-ink-2">{failure.reason}</p>
            {failure.detail && (
              <p className="mono text-xs break-words text-ink-3">{failure.detail}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              disabled={queue.tracks.length < 2}
              onClick={() => {
                setFailure(null);
                advance(1);
              }}
            >
              Next
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const index = latest.current.queue.index;
                setFailure(null);
                if (index >= 0) dispatch({ type: 'remove', index });
              }}
            >
              Remove
            </Button>
            <IconButton size="sm" label="Dismiss" onClick={() => setFailure(null)}>
              <X />
            </IconButton>
          </div>
        </div>
      )}

      {!isVideo && (
        <div className="flex shrink-0 flex-col gap-1 border-t border-rule bg-canvas px-3 py-2">
          {transport}
        </div>
      )}
    </div>
  );
}
