import { Button, Field, IconButton, Select, TextArea } from '@lumen/ui';
import { basename } from '@lumen/vfs';
import { ImagePlus, PanelRightClose } from 'lucide-react';
import { useId } from 'react';
import {
  type DeckTheme,
  LAYOUT_LABELS,
  SLIDE_LAYOUTS,
  type Slide,
  type SlideLayout,
  THEME_LABELS,
} from './deck';

export interface InspectorProps {
  slide: Slide | undefined;
  theme: DeckTheme;
  onNotes: (notes: string) => void;
  onLayout: (layout: SlideLayout) => void;
  onTheme: (theme: DeckTheme) => void;
  onChooseImage: () => void;
  onClose: () => void;
}

const LAYOUT_OPTIONS = SLIDE_LAYOUTS.map((layout) => ({
  value: layout,
  label: LAYOUT_LABELS[layout],
}));

const THEME_OPTIONS: Array<{ value: DeckTheme; label: string }> = [
  { value: 'light', label: THEME_LABELS.light },
  { value: 'dark', label: THEME_LABELS.dark },
];

/** Speaker notes and the properties of the selected slide. */
export function Inspector({
  slide,
  theme,
  onNotes,
  onLayout,
  onTheme,
  onChooseImage,
  onClose,
}: InspectorProps) {
  const layoutId = useId();
  const themeId = useId();
  const notesId = useId();

  return (
    <aside
      aria-label="Slide properties"
      className="flex w-64 shrink-0 flex-col border-l border-rule bg-surface"
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-rule pr-1 pl-3">
        <h2 className="text-sm font-medium text-ink-2">Slide</h2>
        <IconButton label="Hide notes panel" size="sm" onClick={onClose}>
          <PanelRightClose />
        </IconButton>
      </header>
      <div className="lumen-scroll flex min-h-0 flex-1 flex-col gap-6 p-3">
        <Field label="Speaker notes" htmlFor={notesId}>
          <TextArea
            id={notesId}
            value={slide?.notes ?? ''}
            disabled={!slide}
            rows={8}
            placeholder="What to say on this slide"
            onChange={(event) => onNotes(event.target.value)}
            className="min-h-32"
          />
        </Field>

        <div className="flex flex-col gap-3">
          <Field label="Layout" inline htmlFor={layoutId}>
            <Select
              id={layoutId}
              options={LAYOUT_OPTIONS}
              value={slide?.layout ?? 'blank'}
              disabled={!slide}
              size="sm"
              onChange={onLayout}
            />
          </Field>
          <Field label="Theme" inline htmlFor={themeId}>
            <Select
              id={themeId}
              options={THEME_OPTIONS}
              value={theme}
              size="sm"
              onChange={onTheme}
            />
          </Field>
        </div>

        {slide?.layout === 'image' && (
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              icon={<ImagePlus className="size-3.5" />}
              onClick={onChooseImage}
              block
            >
              {slide.imagePath ? 'Replace Image' : 'Choose Image'}
            </Button>
            {slide.imagePath && (
              <p className="mono truncate-1 text-xs text-ink-3" title={slide.imagePath}>
                {basename(slide.imagePath)}
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
