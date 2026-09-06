import { SegmentedControl, useElementSize } from '@lumen/ui';
import { useEffect, useState } from 'react';
import { type Digest, HASHES, type HashAlgorithm, hashText } from './hash';
import { paneLayoutFor } from './layout';
import { CopyButton, Editor, Note, Pane, Split } from './panes';
import type { HashState } from './storage';

const ALGORITHM_OPTIONS = HASHES.map((algorithm) => ({ value: algorithm, label: algorithm }));

/** Digest lengths, so the pane can say what it is showing without measuring. */
const BITS: Record<HashAlgorithm, number> = {
  'SHA-1': 160,
  'SHA-256': 256,
  'SHA-384': 384,
  'SHA-512': 512,
};

export interface HashPanelProps {
  state: HashState;
  onChange: (next: HashState) => void;
  onOutput: (text: string) => void;
}

export function HashPanel({ state, onChange, onOutput }: HashPanelProps) {
  const [bodyRef, { width }] = useElementSize<HTMLDivElement>();
  const { split } = paneLayoutFor(width);
  const set = (change: Partial<HashState>) => onChange({ ...state, ...change });

  const [digest, setDigest] = useState<Digest>({ ok: true, hex: '' });

  // crypto.subtle is asynchronous, so a stale answer can arrive after a newer
  // one; the flag drops anything that is no longer being asked about.
  useEffect(() => {
    if (state.input === '') {
      setDigest({ ok: true, hex: '' });
      return;
    }
    let current = true;
    void hashText(state.algorithm, state.input).then((result) => {
      if (current) setDigest(result);
    });
    return () => {
      current = false;
    };
  }, [state.algorithm, state.input]);

  const hex = digest.ok ? digest.hex : '';
  useEffect(() => onOutput(hex), [hex, onOutput]);

  return (
    <Pane
      bodyRef={bodyRef}
      options={
        <SegmentedControl
          size="sm"
          aria-label="Algorithm"
          options={ALGORITHM_OPTIONS}
          value={state.algorithm}
          onChange={(algorithm) => set({ algorithm })}
        />
      }
    >
      <Split split={split}>
        <Editor
          label="Text"
          value={state.input}
          onChange={(input) => set({ input })}
          placeholder="Anything"
        />
        <div className="flex min-h-20 min-w-0 flex-1 flex-col gap-1.5">
          <Editor
            readOnly
            label={state.algorithm}
            value={hex}
            note={hex === '' ? null : `${BITS[state.algorithm]} bits`}
            error={digest.ok ? null : digest.error}
            actions={<CopyButton text={hex} label="Copy output" />}
          />
          <Note>Hashed over the UTF-8 bytes of the text.</Note>
        </div>
      </Split>
    </Pane>
  );
}
