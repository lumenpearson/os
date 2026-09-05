/**
 * Workbench: the small tools a developer keeps reaching for, in one window.
 *
 * The shell owns the persisted state and hands each pane its own slice; a pane
 * owns nothing but what it derives from that slice, so switching tools is free
 * and Copy Output means the same thing wherever it is invoked. Nothing here
 * touches the network.
 */

import { useClipboard, useKernel, useSettings } from '@lumen/kernel/react';
import { Button, Select, Sidebar, Toolbar, ToolbarSpacer, useElementSize } from '@lumen/ui';
import { join } from '@lumen/vfs';
import {
  Binary,
  Braces,
  Clock,
  Copy,
  Eraser,
  FileDiff,
  FingerprintPattern,
  Hash,
  type LucideIcon,
  Regex,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { type AppProps, useAppMenus, useJsonFile, useTitle, useWindowControls } from '../_sdk';
import { DiffPanel } from './DiffPanel';
import { EncodePanel } from './EncodePanel';
import { HashPanel } from './HashPanel';
import { IdsPanel } from './IdsPanel';
import { JsonPanel } from './JsonPanel';
import { layoutFor, SIDEBAR_WIDTH } from './layout';
import { buildWorkbenchMenus } from './menus';
import { RegexPanel } from './RegexPanel';
import { clearTool, DEFAULT_DATA, normalizeData, resolveZone, type WorkbenchData } from './storage';
import { TimePanel } from './TimePanel';
import { stepTool, TOOL_LABEL, TOOL_SUMMARY, TOOLS, type ToolId } from './tools';

const GLYPH: Record<ToolId, LucideIcon> = {
  json: Braces,
  regex: Regex,
  diff: FileDiff,
  encode: Binary,
  ids: FingerprintPattern,
  time: Clock,
  hash: Hash,
};

const TOOL_OPTIONS = TOOLS.map((tool) => ({ value: tool, label: TOOL_LABEL[tool] }));

/** Whether the tool's fields hold anything, so Clear knows if it has work. */
function hasInput(data: WorkbenchData, tool: ToolId): boolean {
  switch (tool) {
    case 'json':
      return data.json.input !== '' || data.json.query !== '';
    case 'regex':
      return (
        data.regex.pattern !== '' || data.regex.subject !== '' || data.regex.replacement !== ''
      );
    case 'diff':
      return data.diff.left !== '' || data.diff.right !== '';
    case 'encode':
      return data.encode.input !== '';
    case 'ids':
      return false;
    case 'time':
      return data.time.input !== '';
    case 'hash':
      return data.hash.input !== '';
  }
}

export default function Workbench(_props: AppProps) {
  const kernel = useKernel();
  const settings = useSettings();
  const { close } = useWindowControls();
  const { copyText } = useClipboard();
  const [frameRef, { width }] = useElementSize<HTMLDivElement>();

  const [stored, store] = useJsonFile<WorkbenchData>(
    join(kernel.home, '.config', 'workbench.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);
  const tool = data.tool;

  /** What the pane on screen has produced; the Copy Output command reads it. */
  const [output, setOutput] = useState('');
  const onOutput = useCallback((text: string) => setOutput(text), []);

  const write = useCallback(
    (change: (previous: WorkbenchData) => WorkbenchData) =>
      store((previous) => change(normalizeData(previous))),
    [store],
  );

  const setTool = useCallback(
    (next: ToolId) => {
      setOutput('');
      write((previous) => ({ ...previous, tool: next }));
    },
    [write],
  );

  const layout = layoutFor(width);
  const zone = resolveZone(data.time.zone, settings.region.timeZone);

  useTitle(`Workbench — ${TOOL_LABEL[tool]}`);

  useAppMenus(
    buildWorkbenchMenus(
      { tool, hasOutput: output !== '', hasInput: hasInput(data, tool) },
      {
        close,
        copyOutput: () => {
          if (output !== '') copyText(output);
        },
        clear: () => write((previous) => clearTool(previous, previous.tool)),
        setTool,
        nextTool: () => setTool(stepTool(tool, 1)),
        previousTool: () => setTool(stepTool(tool, -1)),
      },
    ),
    [tool, output, data, close, copyText, write, setTool],
  );

  const panel = (() => {
    switch (tool) {
      case 'json':
        return (
          <JsonPanel
            state={data.json}
            onOutput={onOutput}
            onChange={(json) => write((previous) => ({ ...previous, json }))}
          />
        );
      case 'regex':
        return (
          <RegexPanel
            state={data.regex}
            onOutput={onOutput}
            onChange={(regex) => write((previous) => ({ ...previous, regex }))}
          />
        );
      case 'diff':
        return (
          <DiffPanel
            state={data.diff}
            onOutput={onOutput}
            onChange={(diff) => write((previous) => ({ ...previous, diff }))}
          />
        );
      case 'encode':
        return (
          <EncodePanel
            state={data.encode}
            onOutput={onOutput}
            onChange={(encode) => write((previous) => ({ ...previous, encode }))}
          />
        );
      case 'ids':
        return (
          <IdsPanel
            state={data.ids}
            onOutput={onOutput}
            onChange={(ids) => write((previous) => ({ ...previous, ids }))}
          />
        );
      case 'time':
        return (
          <TimePanel
            state={data.time}
            zone={zone}
            locale={settings.region.locale}
            onOutput={onOutput}
            onChange={(time) => write((previous) => ({ ...previous, time }))}
          />
        );
      case 'hash':
        return (
          <HashPanel
            state={data.hash}
            onOutput={onOutput}
            onChange={(hash) => write((previous) => ({ ...previous, hash }))}
          />
        );
    }
  })();

  return (
    <div ref={frameRef} className="flex h-full min-h-0 w-full flex-col bg-surface text-ink">
      <Toolbar dense>
        {layout.sidebar ? (
          <span className="pl-1 text-base font-medium text-ink">{TOOL_LABEL[tool]}</span>
        ) : (
          <Select
            size="sm"
            aria-label="Tool"
            options={TOOL_OPTIONS}
            value={tool}
            onChange={setTool}
          />
        )}
        <ToolbarSpacer />
        <Button
          size="sm"
          aria-label="Copy Output"
          title="Copy Output"
          icon={<Copy className="size-3.5" />}
          disabled={output === ''}
          onClick={() => copyText(output)}
        >
          {layout.labels ? 'Copy Output' : null}
        </Button>
        <Button
          size="sm"
          aria-label="Clear"
          title="Clear"
          icon={<Eraser className="size-3.5" />}
          disabled={!hasInput(data, tool)}
          onClick={() => write((previous) => clearTool(previous, previous.tool))}
        >
          {layout.labels ? 'Clear' : null}
        </Button>
      </Toolbar>

      <div className="flex min-h-0 min-w-0 flex-1">
        {layout.sidebar && (
          <Sidebar
            width={SIDEBAR_WIDTH}
            activeId={tool}
            sections={[
              {
                id: 'tools',
                title: 'Tools',
                items: TOOLS.map((id) => {
                  const Glyph = GLYPH[id];
                  return {
                    id,
                    label: TOOL_LABEL[id],
                    icon: <Glyph />,
                    onSelect: () => setTool(id),
                  };
                }),
              },
            ]}
          />
        )}
        {/* The pane is keyed by the tool so a switch never carries stale local state. */}
        <div key={tool} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {panel}
        </div>
      </div>

      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-rule bg-canvas px-3">
        <span className="truncate-1 text-sm text-ink-2">{TOOL_SUMMARY[tool]}</span>
      </div>
    </div>
  );
}
