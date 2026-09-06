/**
 * Frames for anything that follows playback time. While the media plays the
 * callback runs once per animation frame; while it is paused it runs only when
 * the element says something changed. Everything the callback touches is
 * written straight to the DOM, so the transport never re-renders per frame.
 */
import { useLatest } from '@lumen/ui';
import { useEffect } from 'react';

const ELEMENT_EVENTS = [
  'timeupdate',
  'seeked',
  'seeking',
  'loadedmetadata',
  'durationchange',
  'progress',
  'ratechange',
  'emptied',
] as const;

export function useMediaFrames(
  media: HTMLMediaElement | null,
  active: boolean,
  onFrame: (media: HTMLMediaElement) => void,
): void {
  const latest = useLatest(onFrame);
  useEffect(() => {
    if (!media) return;
    let single = 0;
    let loop = 0;

    const paint = () => {
      single = 0;
      latest.current(media);
    };
    const once = () => {
      if (!single && !loop) single = requestAnimationFrame(paint);
    };
    const tick = () => {
      latest.current(media);
      loop = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (loop) cancelAnimationFrame(loop);
      loop = 0;
    };
    const start = () => {
      if (active && !document.hidden && !loop) loop = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    for (const type of ELEMENT_EVENTS) media.addEventListener(type, once);
    document.addEventListener('visibilitychange', onVisibility);
    once();
    start();

    return () => {
      stop();
      if (single) cancelAnimationFrame(single);
      for (const type of ELEMENT_EVENTS) media.removeEventListener(type, once);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [media, active, latest]);
}
