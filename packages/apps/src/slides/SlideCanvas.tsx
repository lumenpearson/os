import { cx } from '@lumen/ui';
import { basename } from '@lumen/vfs';
import type { CSSProperties } from 'react';
import { useObjectUrl } from '../_sdk';
import { BulletList } from './BulletList';
import { type DeckTheme, SLIDE_HEIGHT, SLIDE_WIDTH, type Slide, type SlidePatch } from './deck';
import { EditableText } from './EditableText';

/** Slide-space metrics. Everything inside the slide is authored at scale 1. */
const PAD = 72;
const TITLE: CSSProperties = { fontSize: 44, lineHeight: 1.15, fontWeight: 600 };
const BODY: CSSProperties = { fontSize: 24, lineHeight: 1.45 };
const EMPTY_BULLETS: readonly string[] = [];

export interface SlideCanvasProps {
  slide: Slide;
  theme: DeckTheme;
  /** Multiplier from slide space to screen space. */
  scale: number;
  editable?: boolean;
  onPatch?: (patch: SlidePatch) => void;
  onChooseImage?: () => void;
  /** Draw the hairline, radius and shadow of a page. Off for the player. */
  framed?: boolean;
  className?: string;
}

function SlideImage({ path, alt }: { path: string; alt: string }) {
  const { url, error } = useObjectUrl(path);
  if (!url) {
    return (
      <span style={BODY} className="opacity-50">
        {error ? `Missing ${basename(path)}` : basename(path)}
      </span>
    );
  }
  return <img src={url} alt={alt} className="max-h-full max-w-full object-contain" />;
}

/**
 * One slide drawn at 960×540 and transform-scaled to whatever space it is
 * given, so thumbnails, the editor and the player are the same component and
 * always agree.
 */
export function SlideCanvas({
  slide,
  theme,
  scale,
  editable = false,
  onPatch,
  onChooseImage,
  framed = true,
  className,
}: SlideCanvasProps) {
  const dark = theme === 'dark';
  const patch = (next: SlidePatch) => onPatch?.(next);

  const title = (style: CSSProperties = TITLE) => (
    <EditableText
      value={slide.title ?? ''}
      onChange={(value) => patch({ title: value })}
      placeholder="Click to add title"
      label="Slide title"
      editable={editable}
      style={style}
    />
  );

  const body = () => {
    switch (slide.layout) {
      case 'title':
        return (
          <div className="flex flex-1 flex-col justify-center" style={{ gap: 20 }}>
            {title()}
            <EditableText
              value={slide.subtitle ?? ''}
              onChange={(value) => patch({ subtitle: value })}
              placeholder="Click to add subtitle"
              label="Slide subtitle"
              editable={editable}
              style={{ ...BODY, opacity: 0.7 }}
            />
          </div>
        );
      case 'bullets':
        return (
          <div className="flex flex-1 flex-col" style={{ gap: 28 }}>
            {title()}
            <BulletList
              bullets={slide.bullets ?? EMPTY_BULLETS}
              onChange={(bullets) => patch({ bullets })}
              placeholder="Click to add bullets"
              editable={editable}
              style={BODY}
            />
          </div>
        );
      case 'text':
        return (
          <div className="flex flex-1 flex-col" style={{ gap: 28 }}>
            {title()}
            <EditableText
              value={slide.text ?? ''}
              onChange={(value) => patch({ text: value })}
              placeholder="Click to add text"
              label="Slide text"
              editable={editable}
              multiline
              className="flex-1"
              style={BODY}
            />
          </div>
        );
      case 'two-column':
        return (
          <div className="flex flex-1 flex-col" style={{ gap: 28 }}>
            {title()}
            <div className="flex flex-1" style={{ gap: 44 }}>
              <EditableText
                value={slide.left ?? ''}
                onChange={(value) => patch({ left: value })}
                placeholder="Click to add text"
                label="Left column"
                editable={editable}
                multiline
                className="flex-1"
                style={BODY}
              />
              <EditableText
                value={slide.right ?? ''}
                onChange={(value) => patch({ right: value })}
                placeholder="Click to add text"
                label="Right column"
                editable={editable}
                multiline
                className="flex-1"
                style={BODY}
              />
            </div>
          </div>
        );
      case 'image':
        return (
          <div className="flex flex-1 flex-col" style={{ gap: 24 }}>
            {(editable || slide.title) && title({ ...TITLE, fontSize: 32 })}
            <div className="flex min-h-0 flex-1 items-center justify-center">
              {slide.imagePath ? (
                <SlideImage path={slide.imagePath} alt={slide.title ?? 'Slide image'} />
              ) : editable ? (
                <button
                  type="button"
                  onClick={onChooseImage}
                  className="opacity-55 transition-opacity duration-(--duration-fast) ease-(--ease-standard) hover:opacity-100 lumen-focus"
                  style={{
                    ...BODY,
                    padding: '14px 22px',
                    border: '1px solid currentColor',
                    borderRadius: 8,
                  }}
                >
                  Choose an image
                </button>
              ) : null}
            </div>
          </div>
        );
      case 'blank':
        return <div className="flex-1" />;
    }
  };

  return (
    <div
      className={cx(
        'relative shrink-0 overflow-hidden',
        dark ? 'bg-ink' : 'bg-surface',
        framed && 'rounded-md border border-rule shadow-sm',
        className,
      )}
      style={{ width: Math.round(SLIDE_WIDTH * scale), height: Math.round(SLIDE_HEIGHT * scale) }}
    >
      <div
        className={cx('absolute top-0 left-0 flex flex-col', dark ? 'text-surface' : 'text-ink')}
        style={{
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          padding: PAD,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {body()}
      </div>
    </div>
  );
}
