import { wallpaperById, wallpaperUrl } from '@lumen/kernel';
import { useSettings, useVfs } from '@lumen/kernel/react';
import { cx } from '@lumen/ui';
import { useEffect, useState } from 'react';

const FIT: Record<string, React.CSSProperties> = {
  cover: { backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' },
  contain: {
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
  },
  tile: { backgroundSize: 'auto', backgroundRepeat: 'repeat', backgroundPosition: 'top left' },
  center: { backgroundSize: 'auto', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' },
};

/** The desktop background: a preset SVG or a user image from the VFS. */
export function Wallpaper({ dim, blur }: { dim?: boolean; blur?: boolean }) {
  const settings = useSettings();
  const vfs = useVfs();
  const { wallpaper, wallpaperFit } = settings.desktop;
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const preset =
    wallpaperById(wallpaper) ??
    (wallpaper.startsWith('preset:') ? wallpaperById('preset:dawn') : undefined);

  useEffect(() => {
    if (preset || !wallpaper.startsWith('/')) {
      setCustomUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    vfs
      .objectUrl(wallpaper)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        url = u;
        setCustomUrl(u);
      })
      .catch(() => setCustomUrl(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [wallpaper, preset, vfs]);

  const image = preset ? wallpaperUrl(preset) : customUrl ? `url("${customUrl}")` : undefined;
  const tone = preset?.tone ?? 'dark';

  return (
    <div
      aria-hidden
      data-wallpaper-tone={tone}
      className={cx(
        'absolute inset-0 bg-[#1b1c1f] transition-[filter] duration-(--duration-slow) ease-(--ease-standard)',
        blur && 'scale-[1.04] blur-xl',
      )}
      style={{ backgroundImage: image, ...FIT[wallpaperFit] }}
    >
      {dim && <div className="absolute inset-0 bg-black/35" />}
    </div>
  );
}
