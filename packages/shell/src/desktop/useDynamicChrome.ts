/**
 * Settings > Wallpaper > "Dynamic chrome": the menubar, the taskbar and the
 * popovers take a little of their colour from the wallpaper behind them.
 *
 * The derivation lives in the kernel and is pure; this hook is the part that
 * has to touch the machine — reading a preset, or drawing a user's image into
 * a small canvas to average it — and the one line that writes the result. It
 * writes `--lumen-chrome` on the document element and removes the property
 * again when the setting is off, so with dynamic chrome off the token is
 * exactly what the theme says it is.
 */

import { averagePixels, chromeTintValue, presetTint, type Rgb, wallpaperById } from '@lumen/kernel';
import { useSettings, useVfs } from '@lumen/kernel/react';
import { useEffect } from 'react';

/** The image is averaged, so a large canvas would cost time and change nothing. */
const SAMPLE = 24;

/** Average an image's pixels. Null wherever there is no canvas to draw into. */
export async function sampleImage(url: string): Promise<Rgb | null> {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    ctx.drawImage(image, 0, 0, SAMPLE, SAMPLE);
    return averagePixels(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data);
  } catch {
    return null;
  }
}

export function useDynamicChrome(): void {
  const { wallpaper, dynamicChrome } = useSettings().desktop;
  const vfs = useVfs();

  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty('--lumen-chrome');
    if (!dynamicChrome) {
      clear();
      return;
    }
    let cancelled = false;
    const apply = (tint: Rgb | null) => {
      if (cancelled) return;
      if (tint) root.style.setProperty('--lumen-chrome', chromeTintValue(tint));
      else clear();
    };

    const preset = wallpaperById(wallpaper);
    if (preset) {
      apply(presetTint(preset));
      return () => {
        cancelled = true;
        clear();
      };
    }
    if (!wallpaper.startsWith('/')) {
      clear();
      return;
    }
    let objectUrl: string | null = null;
    vfs
      .objectUrl(wallpaper)
      .then(async (url) => {
        objectUrl = url;
        apply(await sampleImage(url));
      })
      .catch(() => apply(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      clear();
    };
  }, [wallpaper, dynamicChrome, vfs]);
}
