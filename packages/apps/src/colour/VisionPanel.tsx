/**
 * The palette as three kinds of dichromacy render it, beside the colours as
 * picked. Two swatches that look alike in a column are two swatches that
 * cannot be told apart, which is the whole reason to look at this.
 *
 * The table scrolls sideways inside its own box rather than stretching the
 * window: four colour columns do not fit at the narrowest size this app opens
 * at, and clipping them silently would hide the tritanopia column entirely.
 */

import { parseHex, type Rgba } from '../paint/colour';
import { formatHex } from './model';
import { type Swatch as SwatchEntry, swatchLabel } from './palette';
import { Swatch } from './Swatch';
import { simulate, VISION_TYPES } from './vision';

interface Row {
  key: string;
  label: string;
  colour: Rgba;
}

export interface VisionPanelProps {
  colour: Rgba;
  swatches: readonly SwatchEntry[];
}

export function VisionPanel({ colour, swatches }: VisionPanelProps) {
  const rows: Row[] = [{ key: 'current', label: 'Picked colour', colour }];
  for (const swatch of swatches) {
    const parsed = parseHex(swatch.hex);
    if (parsed) rows.push({ key: swatch.id, label: swatchLabel(swatch), colour: parsed });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="lumen-scroll">
        <table className="w-full min-w-80 border-collapse text-left">
          <thead>
            <tr className="text-sm text-ink-3">
              <th scope="col" className="py-1 pr-3 font-normal">
                Colour
              </th>
              <th scope="col" className="py-1 pr-2 font-normal">
                As picked
              </th>
              {VISION_TYPES.map((type) => (
                <th key={type.id} scope="col" className="py-1 pr-2 font-normal" title={type.cone}>
                  {type.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-rule">
                <th scope="row" className="max-w-32 py-1.5 pr-3 font-normal">
                  <span className="truncate-1 block text-base text-ink">{row.label}</span>
                  <span className="mono block text-2xs text-ink-3 tabular-nums">
                    {formatHex(row.colour)}
                  </span>
                </th>
                <td className="py-1.5 pr-2">
                  <Swatch
                    colour={row.colour}
                    className="h-6 w-12"
                    title={`${row.label}, as picked`}
                  />
                </td>
                {VISION_TYPES.map((type) => {
                  const seen = simulate(row.colour, type.id);
                  return (
                    <td key={type.id} className="py-1.5 pr-2">
                      <Swatch
                        colour={seen}
                        className="h-6 w-12"
                        title={`${row.label} under ${type.label}: ${formatHex(seen)}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-2">
        A simulation, from the reduced-plane matrices of Viénot, Brettel and Mollon. It models one
        missing cone class, not any particular person, and the single-plane tritanopia case is
        approximate for saturated colours.
      </p>
    </div>
  );
}
