/**
 * What is known about the character under the cursor. Two shapes of the same
 * information: a column beside the grid when the window is wide enough for
 * one, and a single strip under it when it is not.
 *
 * Every value is a button that copies exactly the text it shows. Where the
 * app has no name for a character the name line is absent — it is not filled
 * with a guess or with the word "Unknown".
 */

import { Button, IconButton } from '@lumen/ui';
import { Copy, Pin, PinOff } from 'lucide-react';
import { blockOf } from './blocks';
import { displayText, formatCodePoint } from './chars';
import { characterFacts } from './facts';
import { characterName } from './names';

export interface DetailsProps {
  /** The character under the cursor, or null when the grid is empty. */
  codePoint: number | null;
  pinned: boolean;
  onCopy: (text: string, what: string) => void;
  onCopyCharacter: () => void;
  onTogglePin: () => void;
}

function Specimen({ codePoint, size }: { codePoint: number; size: number }) {
  return (
    <div
      aria-hidden
      style={{ height: size, fontSize: Math.round(size * 0.58), lineHeight: 1 }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-rule bg-surface px-2 text-ink"
    >
      {displayText(codePoint)}
    </div>
  );
}

function PinButton({ pinned, onTogglePin }: { pinned: boolean; onTogglePin: () => void }) {
  return (
    <IconButton
      label={pinned ? 'Unpin character' : 'Pin character'}
      size="sm"
      variant="outline"
      active={pinned}
      onClick={onTogglePin}
    >
      {pinned ? <PinOff /> : <Pin />}
    </IconButton>
  );
}

export function DetailPanel({
  codePoint,
  pinned,
  onCopy,
  onCopyCharacter,
  onTogglePin,
}: DetailsProps) {
  return (
    <aside
      aria-label="Character details"
      className="flex w-64 shrink-0 flex-col border-l border-rule bg-canvas"
    >
      {codePoint === null ? (
        <p className="p-3 text-base text-ink-3">No character to show.</p>
      ) : (
        <>
          <div className="lumen-scroll flex min-h-0 flex-1 flex-col gap-3 p-3">
            <div className="flex flex-col gap-1.5">
              <Specimen codePoint={codePoint} size={92} />
              <CharacterHeading codePoint={codePoint} onCopy={onCopy} />
            </div>
            <dl className="flex flex-col">
              {/* The code point is the heading; repeating it as a row would
                  say the same thing twice in a 256 pixel column. */}
              {characterFacts(codePoint)
                .filter((fact) => fact.id !== 'code-point')
                .map((fact) => (
                  <div key={fact.id} className="flex items-center justify-between gap-2">
                    <dt className="shrink-0 text-sm text-ink-2">{fact.label}</dt>
                    <dd className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onCopy(fact.value, fact.label)}
                        aria-label={`Copy ${fact.label}, ${fact.value}`}
                        title="Copy"
                        className="mono block w-full truncate rounded-xs px-1 py-0.5 text-right text-sm tabular-nums text-ink hover:bg-surface-2 lumen-focus"
                      >
                        {fact.value}
                      </button>
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 border-t border-rule p-2">
            <Button size="sm" icon={<Copy className="size-3.5" />} onClick={onCopyCharacter}>
              Copy
            </Button>
            <div className="ml-auto">
              <PinButton pinned={pinned} onTogglePin={onTogglePin} />
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

/** The code point, the name if there is one, and the block it belongs to. */
function CharacterHeading({
  codePoint,
  onCopy,
}: {
  codePoint: number;
  onCopy: DetailsProps['onCopy'];
}) {
  const name = characterName(codePoint);
  const block = blockOf(codePoint);
  const value = formatCodePoint(codePoint);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={() => onCopy(value, 'Code point')}
        aria-label={`Copy Code point, ${value}`}
        title="Copy"
        className="mono -mx-1 rounded-xs px-1 text-md tabular-nums text-ink hover:bg-surface-2 lumen-focus"
      >
        {value}
      </button>
      {name !== null && <span className="text-base text-ink-2">{name}</span>}
      {block !== null && <span className="text-sm text-ink-3">{block.name}</span>}
    </div>
  );
}

export interface DetailStripProps extends DetailsProps {
  /** There is room for the name beside the code point. */
  roomy: boolean;
}

export function DetailStrip({
  codePoint,
  pinned,
  onCopy,
  onCopyCharacter,
  onTogglePin,
  roomy,
}: DetailStripProps) {
  const name = codePoint === null ? null : characterName(codePoint);
  const html =
    codePoint === null ? null : (characterFacts(codePoint).find((f) => f.id === 'html') ?? null);
  return (
    <div
      role="group"
      aria-label="Character details"
      className="flex h-12 shrink-0 items-center gap-2.5 border-t border-rule bg-canvas px-3"
    >
      {codePoint === null ? (
        <p className="text-base text-ink-3">No character to show.</p>
      ) : (
        <>
          <Specimen codePoint={codePoint} size={32} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="mono text-sm tabular-nums text-ink">{formatCodePoint(codePoint)}</span>
            {roomy && name !== null && (
              <span className="truncate-1 text-sm text-ink-2">{name}</span>
            )}
          </div>
          {roomy && html && (
            <button
              type="button"
              onClick={() => onCopy(html.value, html.label)}
              aria-label={`Copy ${html.label}, ${html.value}`}
              title="Copy"
              className="mono shrink-0 rounded-xs px-1 py-0.5 text-sm tabular-nums text-ink-2 hover:bg-surface-2 lumen-focus"
            >
              {html.value}
            </button>
          )}
          <PinButton pinned={pinned} onTogglePin={onTogglePin} />
          <Button size="sm" icon={<Copy className="size-3.5" />} onClick={onCopyCharacter}>
            Copy
          </Button>
        </>
      )}
    </div>
  );
}
