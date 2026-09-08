import { Button, SegmentedControl, Select, useElementSize } from '@lumen/ui';
import { ArrowLeftRight } from 'lucide-react';
import { useEffect, useId, useMemo } from 'react';
import { runEncode } from './derive';
import { CODEC_LABEL, CODECS } from './encode';
import { paneLayoutFor } from './layout';
import { CopyButton, Editor, Option, Pane, Split } from './panes';
import type { Direction, EncodeState } from './storage';

const CODEC_OPTIONS = CODECS.map((codec) => ({ value: codec, label: CODEC_LABEL[codec] }));

const DIRECTIONS = [
  { value: 'encode' as Direction, label: 'Encode' },
  { value: 'decode' as Direction, label: 'Decode' },
];

export interface EncodePanelProps {
  state: EncodeState;
  onChange: (next: EncodeState) => void;
  onOutput: (text: string) => void;
}

export function EncodePanel({ state, onChange, onOutput }: EncodePanelProps) {
  const [bodyRef, { width }] = useElementSize<HTMLDivElement>();
  const { split } = paneLayoutFor(width);
  const codecId = useId();
  const set = (change: Partial<EncodeState>) => onChange({ ...state, ...change });

  const result = useMemo(() => runEncode(state), [state]);
  useEffect(() => onOutput(result.output), [result.output, onOutput]);

  const encoding = state.direction === 'encode';

  return (
    <Pane
      bodyRef={bodyRef}
      options={
        <>
          <Option label="Format" htmlFor={codecId}>
            <Select
              id={codecId}
              size="sm"
              options={CODEC_OPTIONS}
              value={state.codec}
              onChange={(codec) => set({ codec })}
            />
          </Option>
          <SegmentedControl
            size="sm"
            aria-label="Direction"
            options={DIRECTIONS}
            value={state.direction}
            onChange={(direction) => set({ direction })}
          />
          <Button
            size="sm"
            icon={<ArrowLeftRight className="size-3.5" />}
            disabled={result.output === ''}
            onClick={() =>
              set({
                direction: encoding ? 'decode' : 'encode',
                input: result.output,
              })
            }
          >
            Use output as input
          </Button>
        </>
      }
    >
      <Split split={split}>
        <Editor
          label={encoding ? 'Text' : CODEC_LABEL[state.codec]}
          value={state.input}
          onChange={(input) => set({ input })}
          placeholder={encoding ? 'Anything' : 'The encoded text'}
          error={result.error}
        />
        <Editor
          readOnly
          label={encoding ? CODEC_LABEL[state.codec] : 'Text'}
          value={result.output}
          actions={<CopyButton text={result.output} label="Copy output" />}
        />
      </Split>
    </Pane>
  );
}
