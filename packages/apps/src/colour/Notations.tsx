/**
 * The same colour in the four notations the platform writes. Each field is
 * editable, and each accepts any of the four: paste an `oklch()` into the hex
 * row and the picker moves. Only the field being typed into holds a draft, so
 * the other three keep showing the canonical spelling of whatever the draft
 * currently means.
 *
 * A draft that does not parse leaves the colour exactly where it was and says
 * why underneath. Guessing at a half-typed `rgb(2` would drag the picker
 * through nonsense on the way to a valid entry.
 */

import { IconButton, Input } from '@lumen/ui';
import { Copy } from 'lucide-react';
import { useId, useState } from 'react';
import type { Rgba } from '../paint/colour';
import { formatColour, NOTATIONS, type Notation, parseColour } from './model';

export interface NotationsProps {
  colour: Rgba;
  onChange: (colour: Rgba) => void;
  onCopy: (notation: Notation) => void;
}

interface Draft {
  notation: Notation;
  text: string;
}

export function Notations({ colour, onChange, onCopy }: NotationsProps) {
  const group = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const typed = draft?.text.trim() ?? '';
  const invalid = typed !== '' && parseColour(typed) === null;

  const type = (notation: Notation, text: string) => {
    setDraft({ notation, text });
    const parsed = parseColour(text);
    if (parsed) onChange(parsed);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {NOTATIONS.map((notation) => {
        const value =
          draft?.notation === notation.id ? draft.text : formatColour(colour, notation.id);
        const bad = invalid && draft?.notation === notation.id;
        return (
          <div key={notation.id} className="flex items-center gap-2">
            <label htmlFor={`${group}-${notation.id}`} className="w-10 shrink-0 text-sm text-ink-2">
              {notation.label}
            </label>
            <Input
              id={`${group}-${notation.id}`}
              mono
              size="sm"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              value={value}
              invalid={bad}
              onChange={(event) => type(notation.id, event.target.value)}
              onBlur={() => setDraft(null)}
            />
            <IconButton
              label={`Copy ${notation.label}`}
              size="sm"
              onClick={() => onCopy(notation.id)}
            >
              <Copy />
            </IconButton>
          </div>
        );
      })}
      {invalid && (
        <p role="status" className="text-sm text-danger">
          “{typed}” is not a colour in any of these notations. Nothing changed.
        </p>
      )}
    </div>
  );
}
