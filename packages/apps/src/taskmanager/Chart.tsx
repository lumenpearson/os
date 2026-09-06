/** One measurement: a title, the current value, an area chart and its scale. */
import { areaPath, lastPointPath, linePath } from './series';

/** viewBox units. The plot is stretched horizontally; strokes stay hairlines. */
const WIDTH = 240;
const HEIGHT = 48;

export interface ChartProps {
  title: string;
  /** Where the number comes from, in one line. */
  source: string;
  /** The current reading, already formatted, or an em-dash. */
  value: string;
  unit?: string;
  values: readonly number[];
  /** Top of the scale; the bottom is always zero. */
  max?: number;
  scale: string;
  span: string;
  /** X slots, so a filling buffer slides in from the right. */
  slots: number;
  /** Set when the platform cannot measure this: replaces the plot. */
  note?: string;
}

export function Chart({
  title,
  source,
  value,
  unit,
  values,
  max,
  scale,
  span,
  slots,
  note,
}: ChartProps) {
  const options = { width: WIDTH, height: HEIGHT, min: 0, max, slots };
  const line = linePath(values, options);
  return (
    <section className="flex flex-col gap-2 rounded-md border border-rule bg-canvas p-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="truncate-1 text-base font-medium text-ink">{title}</h3>
        <p className="mono shrink-0 text-md tabular-nums text-ink">
          {value}
          {unit && <span className="text-sm text-ink-2"> {unit}</span>}
        </p>
      </div>
      <p className="truncate-1 text-sm text-ink-2">{source}</p>
      {note ? (
        <p className="flex h-12 items-center text-sm text-ink-3">{note}</p>
      ) : (
        <svg
          className="h-12 w-full text-accent"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title}: ${value}${unit ? ` ${unit}` : ''}, ${span}`}
        >
          {line && (
            <>
              <path d={areaPath(values, options)} fill="currentColor" opacity={0.1} />
              <path
                d={line}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={lastPointPath(values, options)}
                stroke="currentColor"
                strokeWidth={3.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
      )}
      <div className="mono flex items-baseline justify-between gap-3 text-sm text-ink-3 tabular-nums">
        <span className="truncate-1">{scale}</span>
        <span className="shrink-0">{span}</span>
      </div>
    </section>
  );
}
