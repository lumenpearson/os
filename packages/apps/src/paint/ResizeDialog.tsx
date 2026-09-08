/**
 * Canvas Size and Scale, which are the same dialog asked two ways.
 *
 * Canvas Size changes the room around the picture and needs to know where the
 * old picture sits inside the new one, so it offers the nine anchors. Scale
 * resamples the picture itself, so it offers a percentage and a locked ratio
 * instead. Neither commits until the fields parse.
 */

import { Button, Checkbox, cx, Dialog, Field, Input } from '@lumen/ui';
import { useEffect, useId, useState } from 'react';
import {
  ANCHORS,
  type Anchor,
  formatSize,
  linkDimensions,
  parseDimension,
  scaleByPercent,
} from './document';
import type { Size } from './geometry';

export type ResizeMode = 'canvas' | 'scale';

export interface ResizeDialogProps {
  open: boolean;
  mode: ResizeMode;
  size: Size;
  container: HTMLElement | null;
  onApply: (size: Size, anchor: Anchor) => void;
  onClose: () => void;
}

export function ResizeDialog({ open, mode, size, container, onApply, onClose }: ResizeDialogProps) {
  const id = useId();
  const [width, setWidth] = useState(String(size.width));
  const [height, setHeight] = useState(String(size.height));
  const [percent, setPercent] = useState('100');
  const [locked, setLocked] = useState(true);
  const [anchor, setAnchor] = useState<Anchor>('centre');

  // Every opening starts from the document as it is now, not from whatever
  // was typed and abandoned last time.
  useEffect(() => {
    if (!open) return;
    setWidth(String(size.width));
    setHeight(String(size.height));
    setPercent('100');
    setAnchor('centre');
  }, [open, size.width, size.height]);

  const parsedWidth = parseDimension(width);
  const parsedHeight = parseDimension(height);
  const next =
    parsedWidth !== null && parsedHeight !== null
      ? { width: parsedWidth, height: parsedHeight }
      : null;

  const edit = (side: 'width' | 'height', text: string) => {
    if (side === 'width') setWidth(text);
    else setHeight(text);
    if (mode !== 'scale' || !locked) return;
    const value = parseDimension(text);
    if (value === null) return;
    const linked = linkDimensions(
      size,
      side === 'width'
        ? { width: value, height: size.height }
        : { width: size.width, height: value },
      side,
    );
    setWidth(String(linked.width));
    setHeight(String(linked.height));
  };

  const editPercent = (text: string) => {
    setPercent(text);
    const value = Number.parseFloat(text);
    if (!Number.isFinite(value) || value <= 0) return;
    const scaled = scaleByPercent(size, value);
    setWidth(String(scaled.width));
    setHeight(String(scaled.height));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      container={container}
      width={mode === 'canvas' ? 380 : 340}
      title={mode === 'canvas' ? 'Canvas size' : 'Scale image'}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={next === null}
            onClick={() => {
              if (next) onApply(next, anchor);
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-2">
          Currently <span className="mono tabular-nums">{formatSize(size)}</span> pixels.
        </p>

        {mode === 'scale' && (
          <Field label="Percentage" htmlFor={`${id}-percent`}>
            <Input
              id={`${id}-percent`}
              data-autofocus
              mono
              inputMode="decimal"
              value={percent}
              onChange={(event) => editPercent(event.target.value)}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Width"
            htmlFor={`${id}-width`}
            error={parsedWidth === null ? 'Whole pixels, 1 to 8192.' : undefined}
          >
            <Input
              id={`${id}-width`}
              mono
              inputMode="numeric"
              value={width}
              invalid={parsedWidth === null}
              onChange={(event) => edit('width', event.target.value)}
            />
          </Field>
          <Field
            label="Height"
            htmlFor={`${id}-height`}
            error={parsedHeight === null ? 'Whole pixels, 1 to 8192.' : undefined}
          >
            <Input
              id={`${id}-height`}
              mono
              inputMode="numeric"
              value={height}
              invalid={parsedHeight === null}
              onChange={(event) => edit('height', event.target.value)}
            />
          </Field>
        </div>

        {mode === 'scale' ? (
          <Checkbox
            label="Keep the proportions"
            checked={locked}
            onChange={(event) => setLocked(event.target.checked)}
          />
        ) : (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm text-ink-2">Anchor</legend>
            {/* Nine anchor buttons in a 3×3 grid, which is the shape of the
                thing being chosen: where the old picture sits inside the new
                canvas. They carry no text at all.
                deslop-ignore-next-line 28 */}
            <div className="grid w-fit grid-cols-3 gap-px rounded-xs border border-rule p-px">
              {ANCHORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={anchor === option}
                  aria-label={ANCHOR_LABELS[option]}
                  onClick={() => setAnchor(option)}
                  className={cx(
                    'size-6 rounded-xs lumen-focus',
                    'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
                    anchor === option ? 'bg-accent' : 'bg-surface-2 hover:bg-surface-3',
                  )}
                />
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}

const ANCHOR_LABELS: Record<Anchor, string> = {
  'top-left': 'Anchor top left',
  top: 'Anchor top',
  'top-right': 'Anchor top right',
  left: 'Anchor left',
  centre: 'Anchor centre',
  right: 'Anchor right',
  'bottom-left': 'Anchor bottom left',
  bottom: 'Anchor bottom',
  'bottom-right': 'Anchor bottom right',
};
