import { useT } from '@lumen/kernel/react';
import { formatBytes, typeInfo } from '@lumen/vfs';
import { useEffect, useState } from 'react';
import { formatDateTime, useObjectUrl } from '../_sdk';
import { albumLabel, formatDimensions, type Photo } from './library';

export interface InfoPanelProps {
  photo: Photo | null;
  /**
   * Pixel dimensions of the picture the lightbox has already decoded. Passing
   * them in saves decoding the same file twice; without them the panel reads
   * the picture itself and reports what it measures.
   */
  dimensions: { width: number; height: number } | null;
}

/**
 * The facts about one picture, and only facts: what the file system knows,
 * plus the pixel dimensions of the decoded image. There is no EXIF here —
 * reading the camera, the lens or the place a photograph was taken means
 * decoding the metadata, and inventing any of it would be worse than leaving
 * it out.
 */
export function InfoPanel({ photo, dimensions }: InfoPanelProps) {
  const t = useT();
  const { url, error } = useObjectUrl(photo?.path ?? null);
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const [broken, setBroken] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new picture is the reason to forget the last one's size
  useEffect(() => {
    setMeasured(null);
    setBroken(false);
  }, [photo?.path]);

  if (!photo) {
    return (
      <aside
        aria-label={t('photosApp.pictureInfo')}
        className="flex w-60 shrink-0 flex-col border-l border-rule bg-canvas"
      >
        <p className="p-4 text-sm text-ink-2">{t('photosApp.noneSelected')}</p>
      </aside>
    );
  }

  const size = dimensions ?? measured;
  return (
    <aside
      aria-label={t('photosApp.pictureInfo')}
      className="lumen-scroll flex w-60 shrink-0 flex-col gap-4 border-l border-rule bg-canvas p-3"
    >
      <div className="flex h-36 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-rule bg-surface">
        {url && !broken ? (
          <img
            src={url}
            alt={photo.name}
            draggable={false}
            onLoad={(event) =>
              setMeasured({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            onError={() => setBroken(true)}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <p className="px-3 text-center text-sm text-ink-3">
            {broken || error ? 'Could not read this picture.' : 'Reading…'}
          </p>
        )}
      </div>
      <p className="break-words text-base font-medium text-ink">{photo.name}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-ink-3">{t('photosApp.kind')}</dt>
        <dd className="mono break-words text-ink-2">{typeInfo(photo.path).label}</dd>
        <dt className="text-ink-3">{t('photosApp.pixels')}</dt>
        <dd className="mono tabular-nums text-ink-2">
          {size ? formatDimensions(size.width, size.height) : '—'}
        </dd>
        <dt className="text-ink-3">{t('previewApp.size')}</dt>
        <dd className="mono tabular-nums text-ink-2">{formatBytes(photo.size)}</dd>
        <dt className="text-ink-3">{t('photosApp.modified')}</dt>
        <dd className="mono tabular-nums text-ink-2">{formatDateTime(photo.modifiedAt)}</dd>
        <dt className="text-ink-3">{t('photosApp.folder')}</dt>
        <dd className="mono break-words text-ink-2">{albumLabel(photo.album)}</dd>
      </dl>
      <p className="mono break-all text-2xs text-ink-3">{photo.path}</p>
    </aside>
  );
}
