/**
 * Colour: pick one, read it in every notation the platform writes, check what
 * it does against a second colour, and keep the ones worth keeping.
 *
 * Everything on screen is computed from the colour itself. There is nothing to
 * fetch and nothing to be out of date, so the app never shows a spinner and
 * never has to say it could not reach anything.
 *
 * The picker is the only part that moves at pointer rate and it owns that
 * problem; this file decides what is on screen and what is written to disk.
 */

import { useClipboard, useKernel } from '@lumen/kernel/react';
import {
  AppFrame,
  Button,
  cx,
  SegmentedControl,
  type SegmentedOption,
  Toolbar,
  ToolbarSpacer,
  useDialogs,
  useElementSize,
} from '@lumen/ui';
import { join } from '@lumen/vfs';
import { Copy, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AppProps, useAppMenus, useJsonFile, useTitle, useWindowControls } from '../_sdk';
import { BLACK, formatHex, parseHex, type Rgba, WHITE } from '../paint/colour';
import { ContrastPanel } from './ContrastPanel';
import { formatRatio, pairRatio } from './contrast';
import { layoutFor } from './layout';
import { buildColourMenus } from './menus';
import { formatColour, type Notation, parseColour } from './model';
import { Notations } from './Notations';
import { PalettePanel } from './PalettePanel';
import { Picker } from './Picker';
import {
  addSwatch,
  type ColourData,
  clearSwatches,
  DEFAULT_DATA,
  moveSwatch,
  NAME_LIMIT,
  normalizeData,
  type PanelId,
  removeSwatch,
  renameSwatch,
  type Swatch as SwatchEntry,
  swatchLabel,
} from './palette';
import { Swatch } from './Swatch';
import { VisionPanel } from './VisionPanel';

/** How long the status line keeps saying what was copied. */
const COPIED_MS = 1600;

const PANEL_OPTIONS: ReadonlyArray<SegmentedOption<PanelId>> = [
  { value: 'contrast', label: 'Contrast', title: 'WCAG 2 contrast against a second colour' },
  { value: 'palette', label: 'Palette', title: 'The swatches you have kept' },
  { value: 'vision', label: 'Vision', title: 'The palette under simulated colour blindness' },
];

const PANEL_TITLES: Record<PanelId, string> = {
  contrast: 'Contrast',
  palette: 'Palette',
  vision: 'Colour vision',
};

export default function Colour(_props: AppProps) {
  const kernel = useKernel();
  const dialogs = useDialogs();
  const { copyText, item } = useClipboard();
  const { close, window: frameWindow } = useWindowControls();
  const [frame, size] = useElementSize<HTMLDivElement>();

  const [stored, store] = useJsonFile<ColourData>(
    join(kernel.home, '.config', 'colour.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);

  const [status, setStatus] = useState('');
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    },
    [],
  );

  const say = useCallback((message: string) => {
    setStatus(message);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(''), COPIED_MS);
  }, []);

  const update = useCallback(
    (change: (previous: ColourData) => ColourData) => {
      store((previous) => change(normalizeData(previous)));
    },
    [store],
  );

  const colour = useMemo(() => parseHex(data.colour) ?? BLACK, [data.colour]);
  const compare = useMemo(() => parseHex(data.compare) ?? WHITE, [data.compare]);
  const ratio = pairRatio(colour, compare);

  /**
   * Until the observer has measured the body it reads zero, and an unmeasured
   * window is not a tiny one — so the size the shell opened it at stands in.
   */
  const measured = size.width > 0 ? size : (frameWindow?.bounds ?? size);
  const layout = layoutFor(measured);

  useTitle(`Colour — ${PANEL_TITLES[data.panel]}`);

  const setColour = useCallback(
    (next: Rgba) => update((previous) => ({ ...previous, colour: formatHex(next) })),
    [update],
  );
  const setCompare = useCallback(
    (next: Rgba) => update((previous) => ({ ...previous, compare: formatHex(next) })),
    [update],
  );
  const setPanel = useCallback(
    (panel: PanelId) => update((previous) => ({ ...previous, panel })),
    [update],
  );

  const copy = useCallback(
    (notation: Notation) => {
      const text = formatColour(colour, notation);
      copyText(text);
      say(`Copied ${text}`);
    },
    [colour, copyText, say],
  );

  const pasted = item?.kind === 'text' ? (item.text ?? '') : '';
  const pastedColour = useMemo(() => (pasted ? parseColour(pasted) : null), [pasted]);

  const paste = useCallback(() => {
    if (!pastedColour) return;
    setColour(pastedColour);
    say(`Pasted ${formatHex(pastedColour)}`);
  }, [pastedColour, setColour, say]);

  const addToPalette = useCallback(() => {
    update((previous) => addSwatch(previous, colour));
    say(`Added ${formatHex(colour)} to the palette`);
  }, [colour, update, say]);

  const swap = useCallback(
    () =>
      update((previous) => ({ ...previous, colour: previous.compare, compare: previous.colour })),
    [update],
  );

  const clearPalette = useCallback(async () => {
    const ok = await dialogs.confirm({
      title: 'Remove every swatch?',
      message: 'The palette file is emptied. This cannot be undone.',
      confirmLabel: 'Remove all',
      danger: true,
    });
    if (ok) update(clearSwatches);
  }, [dialogs, update]);

  const rename = useCallback(
    async (swatch: SwatchEntry) => {
      const name = await dialogs.prompt({
        title: 'Name this swatch',
        defaultValue: swatch.name,
        placeholder: swatch.hex,
        confirmLabel: 'Rename',
        validate: (value) =>
          value.length > NAME_LIMIT ? `At most ${NAME_LIMIT} characters.` : null,
      });
      if (name !== null) update((previous) => renameSwatch(previous, swatch.id, name));
    },
    [dialogs, update],
  );

  useAppMenus(
    buildColourMenus(
      {
        panel: data.panel,
        hasSwatches: data.swatches.length > 0,
        canPaste: pastedColour !== null,
      },
      {
        close,
        copy,
        paste,
        addToPalette,
        clearPalette: () => void clearPalette(),
        swapWithComparison: swap,
        setPanel,
      },
    ),
    [
      data.panel,
      data.swatches.length,
      pastedColour,
      close,
      copy,
      paste,
      addToPalette,
      clearPalette,
      swap,
      setPanel,
    ],
  );

  return (
    <AppFrame
      className="bg-canvas"
      toolbar={
        <Toolbar dense windowControls>
          <Swatch colour={colour} className="size-5 shrink-0" />
          <span className="mono truncate-1 min-w-0 text-sm text-ink tabular-nums">
            {formatHex(colour)}
          </span>
          <ToolbarSpacer />
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={addToPalette}>
            Add
          </Button>
          <Button size="sm" icon={<Copy className="size-3.5" />} onClick={() => copy('hex')}>
            Copy
          </Button>
        </Toolbar>
      }
      statusBar={
        <>
          <span className="shrink-0 tabular-nums">{formatHex(colour)}</span>
          <span className="truncate-1 min-w-0">
            {formatRatio(ratio)}:1 against {formatHex(compare)}
          </span>
          {status && (
            <span aria-live="polite" className="truncate-1 ml-auto min-w-0 text-ink-3">
              {status}
            </span>
          )}
        </>
      }
    >
      <div ref={frame} className="lumen-scroll min-h-0 min-w-0 flex-1">
        <div
          className={cx(
            'flex min-w-0 gap-6 p-4',
            layout.columns ? 'flex-row items-start' : 'flex-col',
          )}
        >
          <section
            aria-label="Picker"
            className={cx(
              'flex min-w-0 flex-col gap-3',
              layout.columns ? 'w-88 shrink-0' : 'w-full',
            )}
          >
            <Picker colour={colour} fieldHeight={layout.fieldHeight} onChange={setColour} />
            <Notations colour={colour} onChange={setColour} onCopy={copy} />
          </section>

          <section
            aria-label={PANEL_TITLES[data.panel]}
            className="flex min-w-0 flex-1 flex-col gap-3"
          >
            <SegmentedControl
              aria-label="Panel"
              size="sm"
              options={PANEL_OPTIONS}
              value={data.panel}
              onChange={setPanel}
              className="self-start"
            />
            {data.panel === 'contrast' && (
              <ContrastPanel
                colour={colour}
                compare={compare}
                onCompare={setCompare}
                onSwap={swap}
              />
            )}
            {data.panel === 'palette' && (
              <PalettePanel
                swatches={data.swatches}
                onAdd={addToPalette}
                onPick={setColour}
                onRename={(swatch) => void rename(swatch)}
                onRemove={(swatch) => {
                  update((previous) => removeSwatch(previous, swatch.id));
                  say(`Removed ${swatchLabel(swatch)}`);
                }}
                onMove={(swatch, delta) =>
                  update((previous) => moveSwatch(previous, swatch.id, delta))
                }
              />
            )}
            {data.panel === 'vision' && <VisionPanel colour={colour} swatches={data.swatches} />}
          </section>
        </div>
      </div>
    </AppFrame>
  );
}
