/**
 * The palette the person builds. It lives in a file under their home, so it
 * belongs to the account rather than to the browser that happened to open the
 * app.
 *
 * Reordering is buttons rather than a drag: the list is short, the buttons are
 * reachable from the keyboard, and a drag here would buy nothing that a pair of
 * arrows does not already do.
 */

import { Button, EmptyState, IconButton } from '@lumen/ui';
import { ArrowDown, ArrowUp, Pencil, Plus, SwatchBook, Trash2 } from 'lucide-react';
import { parseHex, type Rgba } from '../paint/colour';
import { NAME_LIMIT, type Swatch as SwatchEntry, swatchLabel } from './palette';
import { Swatch } from './Swatch';

export interface PalettePanelProps {
  swatches: readonly SwatchEntry[];
  onAdd: () => void;
  onPick: (colour: Rgba) => void;
  onRename: (swatch: SwatchEntry) => void;
  onRemove: (swatch: SwatchEntry) => void;
  onMove: (swatch: SwatchEntry, delta: number) => void;
}

export function PalettePanel({
  swatches,
  onAdd,
  onPick,
  onRename,
  onRemove,
  onMove,
}: PalettePanelProps) {
  if (swatches.length === 0) {
    return (
      <EmptyState
        icon={<SwatchBook />}
        title="No swatches yet"
        description="Add the colour you are on now, then name it."
        action={
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={onAdd}>
            Add current colour
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" icon={<Plus className="size-3.5" />} onClick={onAdd} className="self-start">
        Add current colour
      </Button>
      <ul className="flex flex-col">
        {swatches.map((swatch, index) => {
          const colour = parseHex(swatch.hex);
          if (!colour) return null;
          const label = swatchLabel(swatch);
          return (
            <li key={swatch.id} className="flex items-center gap-0.5 border-t border-rule py-1">
              <button
                type="button"
                onClick={() => onPick(colour)}
                aria-label={`Pick ${label}`}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xs px-1 py-1 text-left lumen-focus hover:bg-surface-2"
              >
                <Swatch colour={colour} className="size-5 shrink-0" />
                <span className="truncate-1 min-w-0 text-base text-ink">{label}</span>
                <span className="mono ml-auto shrink-0 text-xs text-ink-3 tabular-nums">
                  {swatch.hex}
                </span>
              </button>
              <IconButton
                label={`Move ${label} up`}
                size="sm"
                disabled={index === 0}
                onClick={() => onMove(swatch, -1)}
              >
                <ArrowUp />
              </IconButton>
              <IconButton
                label={`Move ${label} down`}
                size="sm"
                disabled={index === swatches.length - 1}
                onClick={() => onMove(swatch, 1)}
              >
                <ArrowDown />
              </IconButton>
              <IconButton label={`Rename ${label}`} size="sm" onClick={() => onRename(swatch)}>
                <Pencil />
              </IconButton>
              <IconButton label={`Remove ${label}`} size="sm" onClick={() => onRemove(swatch)}>
                <Trash2 />
              </IconButton>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-ink-3">
        Names are up to {NAME_LIMIT} characters. Selecting a swatch loads it into the picker.
      </p>
    </div>
  );
}
