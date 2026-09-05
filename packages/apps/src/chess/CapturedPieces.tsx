/** What one side has taken, and by how much it leads, beside the move list. */

import { type Color, opposite, type PieceType } from './board';
import { leadLabel } from './material';
import { PieceGlyph, pieceName } from './PieceGlyph';
import { colorName } from './side';

export interface CapturedPiecesProps {
  /** The side that did the capturing; the pieces shown are the other colour. */
  color: Color;
  /** The pieces this side has taken, heaviest first. */
  taken: readonly PieceType[];
  /** Points White is ahead by, as `material` counts it. */
  balance: number;
}

export function CapturedPieces({ color, taken, balance }: CapturedPiecesProps) {
  const lead = leadLabel(balance, color);
  const spoken =
    taken.length === 0 ? 'nothing yet' : taken.map((t) => pieceName(opposite(color), t)).join(', ');

  return (
    <div
      role="group"
      aria-label={`${colorName(color)} has taken ${spoken}${lead ? `, ahead by ${lead.slice(1)}` : ''}`}
      className="flex min-h-7 items-center gap-2 px-2 py-1"
    >
      <span className="mono w-10 shrink-0 text-2xs text-ink-3">{colorName(color)}</span>
      <span aria-hidden className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
        {taken.map((type, index) => (
          <span key={`${type}-${index}`} className="size-3.5">
            <PieceGlyph color={opposite(color)} type={type} />
          </span>
        ))}
      </span>
      {lead && <span className="mono shrink-0 text-xs tabular-nums text-ink">{lead}</span>}
    </div>
  );
}
