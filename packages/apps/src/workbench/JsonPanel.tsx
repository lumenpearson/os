import { Checkbox, Input, Select, useElementSize } from '@lumen/ui';
import { useEffect, useId, useMemo } from 'react';
import { runJson } from './derive';
import { paneLayoutFor } from './layout';
import { CopyButton, Editor, Option, Pane, Split } from './panes';
import { INDENT_LABEL, INDENTS, type JsonState } from './storage';

const INDENT_OPTIONS = INDENTS.map((id) => ({ value: id, label: INDENT_LABEL[id] }));

export interface JsonPanelProps {
  state: JsonState;
  onChange: (next: JsonState) => void;
  onOutput: (text: string) => void;
}

export function JsonPanel({ state, onChange, onOutput }: JsonPanelProps) {
  const [bodyRef, { width }] = useElementSize<HTMLDivElement>();
  const { split } = paneLayoutFor(width);
  const indentId = useId();
  const queryId = useId();
  const queryErrorId = useId();
  const set = (change: Partial<JsonState>) => onChange({ ...state, ...change });

  const result = useMemo(() => runJson(state), [state]);
  useEffect(() => onOutput(result.output), [result.output, onOutput]);

  return (
    <Pane
      bodyRef={bodyRef}
      options={
        <>
          <Option label="Indent" htmlFor={indentId}>
            <Select
              id={indentId}
              size="sm"
              options={INDENT_OPTIONS}
              value={state.indent}
              onChange={(indent) => set({ indent })}
            />
          </Option>
          <Checkbox
            label="Sort keys"
            checked={state.sortKeys}
            onChange={(event) => set({ sortKeys: event.target.checked })}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <Option label="Path" htmlFor={queryId}>
              <Input
                id={queryId}
                size="sm"
                mono
                className="w-44"
                placeholder="$.items[0].id"
                value={state.query}
                invalid={result.queryError !== null}
                aria-describedby={result.queryError ? queryErrorId : undefined}
                onChange={(event) => set({ query: event.target.value })}
              />
            </Option>
            {result.queryError && (
              <p id={queryErrorId} role="alert" className="text-sm text-danger">
                {result.queryError}
              </p>
            )}
          </div>
        </>
      }
    >
      <Split split={split}>
        <Editor
          nowrap
          label="Document"
          value={state.input}
          onChange={(input) => set({ input })}
          placeholder='{"items": [{"id": 1}]}'
          error={result.parseError}
        />
        <Editor
          nowrap
          readOnly
          label={state.query.trim() === '' ? 'Formatted' : 'Matches'}
          value={result.output}
          note={result.note}
          actions={<CopyButton text={result.output} label="Copy output" />}
        />
      </Split>
    </Pane>
  );
}
