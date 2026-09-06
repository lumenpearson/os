/**
 * Character Map: find a character, put it on the clipboard.
 *
 * The window is one grid over one source — a Unicode block, the pinned list,
 * the recent list, or the results of a search — and one detail pane for the
 * character under the cursor. Everything the pane shows is derived from the
 * code point (see chars.ts) or read from the two hand-written tables in
 * names.ts and entities.ts; there is no character database here, and nothing
 * is invented to fill the space where a name would be.
 *
 * The block table, the search parsing, the grid geometry and the file format
 * are all in plain modules with tests. This file only decides what is on
 * screen at a given window size.
 */

import { useClipboard, useKernel } from '@lumen/kernel/react';
import { SearchField, Toolbar, ToolbarSpacer, useElementSize } from '@lumen/ui';
import { join } from '@lumen/vfs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AppProps, useAppMenus, useJsonFile, useTitle, useWindowControls } from '../_sdk';
import { blockById, stepBlock } from './blocks';
import { CharacterGrid, type CharacterGridHandle } from './CharacterGrid';
import { charOf, formatCodePoint } from './chars';
import { DetailPanel, DetailStrip } from './Details';
import { characterFacts } from './facts';
import { layoutFor } from './layout';
import { buildCharmapMenus } from './menus';
import { SourceSelect, SourceSidebar } from './SourcePicker';
import { emptyStateFor, resolveSource, statusLine } from './source';
import {
  type CharmapData,
  clearRecents,
  DEFAULT_DATA,
  isPinned,
  normalizeData,
  PINNED_SOURCE,
  RECENT_SOURCE,
  recordRecent,
  type SourceId,
  togglePin,
} from './storage';

/** How long the status line says what was copied. */
const COPIED_MS = 1600;

export default function CharacterMap(_props: AppProps) {
  const kernel = useKernel();
  const { close, window: frameWindow } = useWindowControls();
  const { copyText } = useClipboard();
  const [frame, size] = useElementSize<HTMLDivElement>();
  const search = useRef<HTMLInputElement>(null);
  const grid = useRef<CharacterGridHandle>(null);

  const [stored, store] = useJsonFile<CharmapData>(
    join(kernel.home, '.config', 'charmap.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);

  const [query, setQuery] = useState('');
  /**
   * The cursor is the character, not its position. A grid whose contents move
   * under it — the recent list reordering as things are copied, a search
   * narrowing as it is typed — then keeps pointing at the same character
   * where it still exists, and falls back to the first one where it does not.
   */
  const [cursorChar, setCursorChar] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const source = useMemo(() => resolveSource(data, query), [data, query]);
  /** Where the cursor is in this source: -1 only when there is nothing at all. */
  const index =
    source.codePoints.length === 0
      ? -1
      : Math.max(0, cursorChar === null ? 0 : source.codePoints.indexOf(cursorChar));
  const current = index < 0 ? null : (source.codePoints[index] ?? null);

  const moveCursorTo = useCallback(
    (next: number) => {
      const codePoint = source.codePoints[next];
      if (codePoint !== undefined) setCursorChar(codePoint);
    },
    [source],
  );

  /**
   * The measured content box decides the layout. Until the observer has run
   * once it reads zero, and an unmeasured window is not a tiny window — so
   * the size the shell opened it at stands in for that one frame.
   */
  const measured = size.width > 0 ? size : (frameWindow?.bounds ?? size);
  const layout = layoutFor(measured, { showSidebar: data.showSidebar });

  useTitle(`Character Map — ${source.name}`);

  const update = useCallback(
    (change: (previous: CharmapData) => CharmapData) => {
      store((previous) => change(normalizeData(previous)));
    },
    [store],
  );

  const flash = useCallback((message: string) => {
    setCopied(message);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), COPIED_MS);
  }, []);

  /** Copying anything about a character counts as having used it. */
  const copyFor = useCallback(
    (codePoint: number, text: string, what: string) => {
      copyText(text);
      update((previous) => recordRecent(previous, codePoint));
      flash(`${what} copied`);
    },
    [copyText, update, flash],
  );

  const copyCharacterAt = useCallback(
    (codePoint: number) => copyFor(codePoint, charOf(codePoint), formatCodePoint(codePoint)),
    [copyFor],
  );

  const copyCharacter = useCallback(() => {
    if (current !== null) copyCharacterAt(current);
  }, [current, copyCharacterAt]);

  const copyFact = useCallback(
    (id: string) => {
      if (current === null) return;
      const fact = characterFacts(current).find((f) => f.id === id);
      if (fact) copyFor(current, fact.value, fact.label);
    },
    [current, copyFor],
  );

  const chooseSource = useCallback(
    (next: SourceId) => {
      setQuery('');
      update((previous) => ({ ...previous, source: next }));
    },
    [update],
  );

  const focusSearch = useCallback(() => {
    search.current?.focus();
    search.current?.select();
  }, []);

  const pinned = current !== null && isPinned(data, current);

  useAppMenus(
    buildCharmapMenus(
      {
        hasCharacter: current !== null,
        pinned,
        hasRecents: data.recents.length > 0,
        inBlock: blockById(data.source) !== null && query.trim() === '',
        showSidebar: data.showSidebar,
      },
      {
        close,
        copyCharacter,
        copyCodePoint: () => copyFact('code-point'),
        copyHtml: () => copyFact('html'),
        copyJavaScript: () => copyFact('javascript'),
        copyCss: () => copyFact('css'),
        togglePin: () => {
          if (current !== null) update((previous) => togglePin(previous, current));
        },
        clearRecents: () => update(clearRecents),
        showPinned: () => chooseSource(PINNED_SOURCE),
        showRecent: () => chooseSource(RECENT_SOURCE),
        stepBlock: (steps) => chooseSource(stepBlock(data.source, steps)),
        focusSearch,
        toggleSidebar: () =>
          update((previous) => ({ ...previous, showSidebar: !previous.showSidebar })),
      },
    ),
    [
      current,
      pinned,
      data.recents.length,
      data.source,
      data.showSidebar,
      query,
      close,
      copyCharacter,
      copyFact,
      chooseSource,
      focusSearch,
      update,
    ],
  );

  const searchField = (
    <SearchField
      ref={search}
      size="sm"
      value={query}
      onChange={setQuery}
      aria-label="Search characters"
      placeholder="U+2014, 8212, name or character"
      onKeyDown={(event) => {
        // Enter leaves the field for the results. Without it the only way
        // into the grid is Tab, and the block list is in the way.
        if (event.key !== 'Enter') return;
        event.preventDefault();
        grid.current?.focus();
      }}
    />
  );

  const details = {
    codePoint: current,
    pinned,
    onCopy: (text: string, what: string) => {
      if (current !== null) copyFor(current, text, what);
    },
    onCopyCharacter: copyCharacter,
    onTogglePin: () => {
      if (current !== null) update((previous) => togglePin(previous, current));
    },
  };

  const empty = emptyStateFor(source);

  return (
    // The toolbar runs the full width: it is the title bar now, so the
    // sidebar starts under it rather than beside it.
    <div ref={frame} className="flex h-full min-h-0 w-full flex-col bg-canvas text-ink">
      <Toolbar dense windowControls>
        {layout.blocks === 'sidebar' ? (
          <>
            <span className="truncate-1 min-w-0 px-1 text-base font-medium text-ink">
              {source.name}
            </span>
            <ToolbarSpacer />
          </>
        ) : (
          // The select takes the free width and its own <select> is told to
          // fill it: left to itself a native select is as wide as its longest
          // option, and "Miscellaneous Mathematical Symbols-A" is wider than
          // the smallest window this app opens at.
          <div className="flex min-w-0 flex-1 items-center">
            <SourceSelect
              value={data.source}
              onChange={chooseSource}
              className="w-full [&>select]:w-full [&>select]:min-w-0"
            />
          </div>
        )}
        {layout.search === 'toolbar' && <div className="w-64 shrink-0">{searchField}</div>}
      </Toolbar>

      {layout.search === 'row' && (
        <div className="shrink-0 border-b border-rule bg-canvas px-2 py-1.5">{searchField}</div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1">
        {layout.blocks === 'sidebar' && (
          <SourceSidebar
            value={source.id}
            onChange={chooseSource}
            pinnedCount={data.pinned.length}
            recentCount={data.recents.length}
          />
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 min-w-0 flex-1">
            <CharacterGrid
              ref={grid}
              codePoints={source.codePoints}
              cursor={index}
              onCursor={moveCursorTo}
              onCopy={copyCharacterAt}
              onType={(text) => {
                // Typing in the grid is the start of a search. The caret goes
                // after what was typed, so selecting the field would be wrong.
                setQuery((previous) => previous + text);
                search.current?.focus();
              }}
              label={source.name}
              emptyTitle={empty.title}
              emptyDescription={empty.description}
            />
            {layout.details === 'panel' && <DetailPanel {...details} />}
          </div>
          {layout.details === 'strip' && <DetailStrip {...details} roomy={layout.stripDetail} />}
          <div className="flex h-6 shrink-0 items-center gap-3 border-t border-rule bg-canvas px-3">
            <span className="mono truncate-1 text-xs tabular-nums text-ink-2">
              {statusLine(source)}
            </span>
            {/* The code point is already in the details; this line is only
                ever the acknowledgement, which is also what gets announced. */}
            <span
              role="status"
              aria-live="polite"
              className="mono ml-auto shrink-0 text-xs tabular-nums text-ink-3"
            >
              {copied ?? ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
