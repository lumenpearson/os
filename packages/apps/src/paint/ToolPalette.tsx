/**
 * The tool column and the options that belong to whichever tool is chosen.
 *
 * Only the options the current tool actually uses are shown — `usesOption`
 * answers that, so the bar never carries a hardness slider for the pencil.
 */

import { Button, cx, IconButton, Select, Slider } from '@lumen/ui';
import { useId } from 'react';
import { MAX_BRUSH, MAX_TEXT, MIN_BRUSH, MIN_TEXT, type PaintPrefs } from './prefs';
import { type ShapeStyle, TOOLS, type ToolId, toolSpec, usesOption } from './tools';

export interface ToolPaletteProps {
  tool: ToolId;
  onTool: (tool: ToolId) => void;
}

/** The tools, down the left edge, as a toolbar the keyboard can walk. */
export function ToolPalette({ tool, onTool }: ToolPaletteProps) {
  return (
    <div
      role="toolbar"
      aria-label="Tools"
      aria-orientation="vertical"
      className="flex w-9 shrink-0 flex-col items-center gap-0.5 border-r border-rule bg-canvas py-1.5"
    >
      {TOOLS.map((spec) => {
        const Glyph = spec.glyph;
        return (
          <IconButton
            key={spec.id}
            size="md"
            variant="ghost"
            active={spec.id === tool}
            aria-pressed={spec.id === tool}
            label={`${spec.label} (${spec.key.toUpperCase()}) — ${spec.hint}`}
            onClick={() => onTool(spec.id)}
          >
            <Glyph />
          </IconButton>
        );
      })}
    </div>
  );
}

const SHAPE_STYLES: ReadonlyArray<{ value: ShapeStyle; label: string }> = [
  { value: 'stroke', label: 'Outline' },
  { value: 'fill', label: 'Filled' },
  { value: 'both', label: 'Outline and fill' },
];

export interface ToolOptionsProps {
  tool: ToolId;
  prefs: PaintPrefs;
  onPrefs: (patch: Partial<PaintPrefs>) => void;
}

/** The row above the canvas: whatever the current tool can be adjusted by. */
export function ToolOptions({ tool, prefs, onPrefs }: ToolOptionsProps) {
  const spec = toolSpec(tool);
  const id = useId();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="shrink-0 text-sm text-ink-2">{spec.label}</span>

      {usesOption(tool, 'size') && (
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-ink-2">
          <label htmlFor={`${id}-size`}>Size</label>
          <Slider
            id={`${id}-size`}
            className="w-28"
            min={MIN_BRUSH}
            max={MAX_BRUSH}
            value={prefs.brushSize}
            onChange={(brushSize) => onPrefs({ brushSize })}
            showValue={(value) => `${value} px`}
          />
        </span>
      )}

      {usesOption(tool, 'hardness') && (
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-ink-2">
          <label htmlFor={`${id}-hardness`}>Hardness</label>
          <Slider
            id={`${id}-hardness`}
            className="w-24"
            min={0}
            max={100}
            value={Math.round(prefs.hardness * 100)}
            onChange={(value) => onPrefs({ hardness: value / 100 })}
            showValue={(value) => `${value}%`}
          />
        </span>
      )}

      {usesOption(tool, 'tolerance') && (
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-ink-2">
          <label htmlFor={`${id}-tolerance`}>Tolerance</label>
          <Slider
            id={`${id}-tolerance`}
            className="w-24"
            min={0}
            max={255}
            value={prefs.tolerance}
            onChange={(tolerance) => onPrefs({ tolerance })}
            showValue
          />
        </span>
      )}

      {usesOption(tool, 'shape') && (
        <Select
          size="sm"
          aria-label="Shape style"
          options={SHAPE_STYLES}
          value={prefs.shapeStyle}
          onChange={(shapeStyle) => onPrefs({ shapeStyle: shapeStyle as ShapeStyle })}
        />
      )}

      {usesOption(tool, 'text') && (
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-ink-2">
          <label htmlFor={`${id}-text-size`}>Text size</label>
          <Slider
            id={`${id}-text-size`}
            className="w-28"
            min={MIN_TEXT}
            max={MAX_TEXT}
            value={prefs.textSize}
            onChange={(textSize) => onPrefs({ textSize })}
            showValue={(value) => `${value} px`}
          />
        </span>
      )}
    </div>
  );
}

export interface ColourWellProps {
  foreground: string;
  background: string;
  recent: readonly string[];
  onForeground: (hex: string) => void;
  onBackground: (hex: string) => void;
  onSwap: () => void;
}

/**
 * The two colours and the ones lately used. The native colour input is what
 * carries the picker: it is keyboard reachable and it is the one control every
 * platform already knows how to draw.
 */
export function ColourWell({
  foreground,
  background,
  recent,
  onForeground,
  onBackground,
  onSwap,
}: ColourWellProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="relative size-7">
        <ColourInput
          label="Background colour"
          value={background}
          onChange={onBackground}
          className="absolute right-0 bottom-0 size-4.5"
        />
        <ColourInput
          label="Foreground colour"
          value={foreground}
          onChange={onForeground}
          className="absolute top-0 left-0 size-5"
        />
      </div>
      <Button size="sm" variant="ghost" onClick={onSwap}>
        Swap
      </Button>
      {recent.length > 0 && (
        <div className="flex items-center gap-1" role="group" aria-label="Recent colours">
          {recent.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={`Use ${hex}`}
              title={hex}
              onClick={() => onForeground(hex)}
              style={{ backgroundColor: hex }}
              className="size-4 rounded-xs border border-rule-strong lumen-focus"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ColourInput({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}) {
  return (
    <input
      type="color"
      aria-label={label}
      title={`${label}: ${value}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cx(
        'cursor-pointer rounded-xs border border-rule-strong bg-transparent p-0 lumen-focus',
        className,
      )}
    />
  );
}
