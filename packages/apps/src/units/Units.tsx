/**
 * Units: a converter across fourteen kinds of quantity.
 *
 * Both value fields are live. Whichever one was typed into last is the input;
 * the other is derived from it, so the pair always agrees and there is no
 * "convert" button to press. Switching the units re-derives; swapping them
 * moves the number that was below up to the top, which is what the eye
 * expects when the labels change places.
 *
 * The arithmetic lives in convert.ts against the catalogue in units.ts — this
 * file only decides what is on screen.
 */

import { useClipboard, useKernel } from '@lumen/kernel/react';
import { Button, IconButton, Toolbar, ToolbarSpacer, useElementSize } from '@lumen/ui';
import { join } from '@lumen/vfs';
import { ArrowUpDown, Copy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AppProps, useAppMenus, useJsonFile, useTitle, useWindowControls } from '../_sdk';
import { CategoryPicker } from './CategoryPicker';
import {
  type CategoryId,
  categoryById,
  categoryOf,
  stepCategory,
  type UnitId,
  unitIn,
  unitsIn,
} from './catalogue';
import { convert, formatQuantity, formatValue, parseValue } from './convert';
import { layoutFor } from './layout';
import { buildUnitsMenus } from './menus';
import { RecentsList } from './RecentsList';
import {
  clearRecents,
  DEFAULT_DATA,
  normalizeData,
  pairFor,
  type RecentConversion,
  recordConversion,
  setPair,
  type UnitPair,
  type UnitsData,
} from './storage';
import { ValueField } from './ValueField';

/** How long the status line says "Copied" for. */
const COPIED_MS = 1600;

/** Which field the user typed into; the other one is derived from it. */
interface Entry {
  side: 'from' | 'to';
  text: string;
}

const FRESH: Entry = { side: 'from', text: '1' };

export default function Units(_props: AppProps) {
  const kernel = useKernel();
  const { close, window: frameWindow } = useWindowControls();
  const { copyText } = useClipboard();
  const [frame, size] = useElementSize<HTMLDivElement>();

  const [stored, store] = useJsonFile<UnitsData>(
    join(kernel.home, '.config', 'units.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);

  const [entry, setEntry] = useState<Entry>(FRESH);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const category = data.category;
  const pair = pairFor(data, category);
  const units = unitsIn(category);
  const fromUnit = unitIn(category, pair.from);
  const toUnit = unitIn(category, pair.to);
  const categoryName = categoryById(category)?.name ?? 'Units';
  /**
   * The measured content box decides the layout. Until the observer has run
   * once it reads zero, and a window that has not been measured is not a tiny
   * window — so the size the shell opened it at stands in for that one frame.
   */
  const measured = size.width > 0 ? size : (frameWindow?.bounds ?? size);
  const layout = layoutFor(measured, { showRecents: data.showRecents });

  useTitle(`Units — ${categoryName}`);

  // ── the two fields ────────────────────────────────────────────────────
  const typed = parseValue(entry.text);
  const source = entry.side === 'from' ? fromUnit : toUnit;
  const target = entry.side === 'from' ? toUnit : fromUnit;
  const converted = typed === null ? null : convert(typed, source.id, target.id);
  /** The field the user is not editing: the result, in the sense that matters. */
  const derived = converted === null ? '' : formatValue(converted);
  const fromText = entry.side === 'from' ? entry.text : derived;
  const toText = entry.side === 'to' ? entry.text : derived;
  const fromValue = entry.side === 'from' ? typed : converted;
  const toValue = entry.side === 'to' ? typed : converted;
  const invalid = entry.text.trim() !== '' && typed === null;

  // ── writing to the file ───────────────────────────────────────────────
  const update = useCallback(
    (change: (previous: UnitsData) => UnitsData) => {
      store((previous) => change(normalizeData(previous)));
    },
    [store],
  );

  const chooseCategory = useCallback(
    (next: CategoryId) => {
      update((previous) => ({ ...previous, category: next }));
      setEntry(FRESH);
    },
    [update],
  );

  const chooseUnits = useCallback(
    (next: UnitPair) => update((previous) => setPair(previous, category, next)),
    [update, category],
  );

  /** Keep this conversion in the recents list. Only a finished pair is kept. */
  const keep = useCallback(() => {
    if (fromValue === null || toValue === null) return;
    const record: RecentConversion = {
      from: fromUnit.id,
      to: toUnit.id,
      value: fromValue,
      at: Date.now(),
    };
    update((previous) => recordConversion(previous, record));
  }, [fromValue, toValue, fromUnit.id, toUnit.id, update]);

  const swap = useCallback(() => {
    chooseUnits({ from: toUnit.id, to: fromUnit.id });
    setEntry({ side: 'from', text: toText });
  }, [chooseUnits, fromUnit.id, toUnit.id, toText]);

  const copyResult = useCallback(() => {
    if (derived === '') return;
    copyText(derived);
    keep();
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }, [derived, copyText, keep]);

  const restore = useCallback(
    (recent: RecentConversion) => {
      const next = categoryOf(recent.from);
      if (next === null) return;
      update((previous) =>
        setPair({ ...previous, category: next }, next, { from: recent.from, to: recent.to }),
      );
      setEntry({ side: 'from', text: formatValue(recent.value) });
    },
    [update],
  );

  useAppMenus(
    buildUnitsMenus(
      {
        category,
        hasResult: derived !== '',
        hasRecents: data.recents.length > 0,
        showRecents: data.showRecents,
      },
      {
        close,
        copyResult,
        swapUnits: swap,
        clearRecents: () => update(clearRecents),
        setCategory: chooseCategory,
        stepCategory: (direction) => chooseCategory(stepCategory(category, direction)),
        toggleRecents: () =>
          update((previous) => ({ ...previous, showRecents: !previous.showRecents })),
      },
    ),
    [
      category,
      derived,
      data.recents.length,
      data.showRecents,
      close,
      copyResult,
      swap,
      chooseCategory,
      update,
    ],
  );

  const equation = invalid
    ? `“${entry.text.trim()}” is not a number.`
    : fromValue === null || toValue === null
      ? 'Type a value in either field.'
      : `${formatQuantity(fromValue, fromUnit)} = ${formatQuantity(toValue, toUnit)}`;

  return (
    // The toolbar runs the full width of the window: it is the title bar now,
    // so the sidebar starts under it rather than beside it.
    <div ref={frame} className="flex h-full min-h-0 w-full flex-col bg-canvas text-ink">
      <Toolbar dense windowControls>
        {/* The window has no title bar of its own, so the category named here
            is what says which window this is — as tabs when they fit, and as
            a label or a select when they do not. The tab strip takes the free
            width and scrolls inside itself; the other two shapes are their own
            size, with the spacer after. */}
        {layout.picker === 'tabs' ? (
          <CategoryPicker shape="tabs" value={category} onChange={chooseCategory} />
        ) : (
          <>
            {layout.picker === 'sidebar' ? (
              <span className="truncate-1 min-w-0 px-1 text-base font-medium text-ink">
                {categoryName}
              </span>
            ) : (
              <CategoryPicker shape="select" value={category} onChange={chooseCategory} />
            )}
            <ToolbarSpacer />
          </>
        )}
        <Button
          size="sm"
          icon={<Copy className="size-3.5" />}
          disabled={derived === ''}
          onClick={copyResult}
        >
          Copy
        </Button>
      </Toolbar>

      <div className="flex min-h-0 min-w-0 flex-1">
        {layout.picker === 'sidebar' && (
          <CategoryPicker shape="sidebar" value={category} onChange={chooseCategory} />
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="lumen-scroll flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-4 py-3">
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-2.5">
                <ValueField
                  label="From"
                  value={fromText}
                  onChange={(text) => setEntry({ side: 'from', text })}
                  onCommit={keep}
                  units={units}
                  unit={fromUnit.id}
                  onUnitChange={(id: UnitId) => chooseUnits({ from: id, to: toUnit.id })}
                  invalid={entry.side === 'from' && invalid}
                  pairRow={layout.pairRow}
                  direction="down"
                />
                <div className="flex justify-center">
                  <IconButton label="Swap units" size="sm" variant="outline" onClick={swap}>
                    <ArrowUpDown />
                  </IconButton>
                </div>
                <ValueField
                  label="To"
                  value={toText}
                  onChange={(text) => setEntry({ side: 'to', text })}
                  onCommit={keep}
                  units={units}
                  unit={toUnit.id}
                  onUnitChange={(id: UnitId) => chooseUnits({ from: fromUnit.id, to: id })}
                  invalid={entry.side === 'to' && invalid}
                  pairRow={layout.pairRow}
                  direction="up"
                />
              </div>
            </div>
            {layout.recents && (
              <RecentsList
                entries={data.recents}
                onPick={restore}
                onClear={() => update(clearRecents)}
              />
            )}
          </div>

          <div className="flex h-6 shrink-0 items-center gap-3 border-t border-rule bg-canvas px-3">
            <span role="status" aria-live="polite" className="mono truncate-1 text-xs text-ink-2">
              {equation}
            </span>
            {copied && (
              <span className="ml-auto shrink-0 text-xs text-ink-3">Copied to the clipboard</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
