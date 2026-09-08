/**
 * WCAG 2 contrast between the picked colour and one to compare it with.
 *
 * The verdicts are read straight off the thresholds in contrast.ts and the
 * ratio is printed truncated, so a pair at 4.49 says 4.49 and fails. The
 * sample underneath is set at the two sizes the criteria actually distinguish
 * rather than at whatever size the panel happens to use.
 */

import { IconButton, Input } from '@lumen/ui';
import { ArrowLeftRight } from 'lucide-react';
import { useId, useState } from 'react';
import { formatHex, type Rgba } from '../paint/colour';
import {
  type ContrastVerdict,
  composite,
  formatRatio,
  LARGE_TEXT_NOTE,
  pairRatio,
  verdicts,
} from './contrast';
import { cssOpaque, cssRgba, parseColour } from './model';
import { Swatch } from './Swatch';

/** The two sizes 1.4.3 names, in the pixels it names them in. */
const NORMAL_TEXT_PX = 16;
const LARGE_TEXT_PX = 24;

const SAMPLE = 'The quick brown fox jumps over the lazy dog';

interface Group {
  subject: string;
  aa: ContrastVerdict | null;
  aaa: ContrastVerdict | null;
}

function group(ratio: number): Group[] {
  const all = verdicts(ratio);
  const subjects: string[] = [];
  for (const verdict of all) {
    if (!subjects.includes(verdict.subject)) subjects.push(verdict.subject);
  }
  return subjects.map((subject) => ({
    subject,
    aa: all.find((v) => v.subject === subject && v.level === 'AA') ?? null,
    aaa: all.find((v) => v.subject === subject && v.level === 'AAA') ?? null,
  }));
}

function Verdict({ verdict }: { verdict: ContrastVerdict | null }) {
  if (!verdict) {
    return (
      <span className="mono text-xs text-ink-3" title="WCAG 2 defines no such level">
        —
      </span>
    );
  }
  return (
    <span className="flex flex-col">
      <span className={verdict.pass ? 'text-base text-ok' : 'text-base text-danger'}>
        {verdict.pass ? 'Pass' : 'Fail'}
      </span>
      <span className="mono text-2xs text-ink-3 tabular-nums">
        {verdict.threshold}:1 · {verdict.criterion}
      </span>
    </span>
  );
}

export interface ContrastPanelProps {
  colour: Rgba;
  compare: Rgba;
  onCompare: (colour: Rgba) => void;
  onSwap: () => void;
}

export function ContrastPanel({ colour, compare, onCompare, onSwap }: ContrastPanelProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? formatHex(compare);
  const invalid = draft !== null && draft.trim() !== '' && parseColour(draft) === null;
  const ratio = pairRatio(colour, compare);
  const groups = group(ratio);
  const sampleInk = cssRgba(colour);
  const sampleGround = cssOpaque(compare);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={id} className="text-sm text-ink-2">
            Against
          </label>
          <div className="flex min-w-0 items-center gap-2">
            <Swatch colour={compare} className="size-6 shrink-0" />
            <Input
              id={id}
              mono
              size="sm"
              spellCheck={false}
              autoComplete="off"
              value={text}
              invalid={invalid}
              onChange={(event) => {
                setDraft(event.target.value);
                const parsed = parseColour(event.target.value);
                if (parsed) onCompare(parsed);
              }}
              onBlur={() => setDraft(null)}
            />
          </div>
        </div>
        <IconButton label="Swap the two colours" size="sm" variant="outline" onClick={onSwap}>
          <ArrowLeftRight />
        </IconButton>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="mono text-xl text-ink tabular-nums">{formatRatio(ratio)}</span>
        <span className="text-base text-ink-2">to 1</span>
      </div>

      <div className="lumen-scroll">
        <table className="w-full min-w-72 border-collapse text-left">
          <thead>
            <tr className="text-sm text-ink-3">
              <th scope="col" className="py-1 pr-3 font-normal">
                Applies to
              </th>
              <th scope="col" className="py-1 pr-3 font-normal">
                AA
              </th>
              <th scope="col" className="py-1 font-normal">
                AAA
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((entry) => (
              <tr key={entry.subject} className="border-t border-rule align-top">
                <th scope="row" className="py-1.5 pr-3 text-base font-normal text-ink">
                  {entry.subject}
                </th>
                <td className="py-1.5 pr-3">
                  <Verdict verdict={entry.aa} />
                </td>
                <td className="py-1.5">
                  <Verdict verdict={entry.aaa} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-ink-2">
        {LARGE_TEXT_NOTE} WCAG 2 sets no AAA level for non-text contrast.
      </p>

      <div
        className="flex flex-col gap-2 rounded-sm p-3 hairline"
        style={{ background: sampleGround }}
      >
        <p style={{ color: sampleInk, fontSize: NORMAL_TEXT_PX }}>{SAMPLE}</p>
        <p style={{ color: sampleInk, fontSize: LARGE_TEXT_PX }}>{SAMPLE}</p>
      </div>

      {colour.a < 255 && (
        <p className="text-sm text-ink-2">
          The sample is {formatHex(composite(colour, compare))} once its alpha is laid on the
          background; that is the colour the ratio is measured from.
        </p>
      )}
    </div>
  );
}
