/**
 * Reminders: lists of things to do, with due dates, priorities and subtasks.
 *
 * The window is a sidebar of lists and a column of rows. The rows are the
 * keyboard's territory — the arrows move between them, Space ticks one off,
 * Tab makes the reminder above it its parent — while the field at the top
 * takes a typed line ("call the dentist tomorrow at 9am") and reads the date
 * out of it. Everything a row can do is also in the Edit menu, with the
 * shortcut printed beside it.
 *
 * The whole store is one JSON file under the user's home, read and written
 * through the VFS.
 */

import { useKernel, useSettings } from '@lumen/kernel/react';
import {
  AnchoredMenu,
  AppFrame,
  Button,
  IconButton,
  type MenuEntry,
  SearchField,
  Toolbar,
  ToolbarSpacer,
  useDialogs,
  useElementSize,
  useLatest,
} from '@lumen/ui';
import { join } from '@lumen/vfs';
import { PanelLeft, Plus } from 'lucide-react';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useApp,
  useAppMenus,
  useJsonFile,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { ComposeField } from './ComposeField';
import { DetailsDialog } from './DetailsDialog';
import { civilNow, type FormatOptions, formatDue } from './date';
import { layoutFor } from './layout';
import { buildRemindersMenus } from './menus';
import { parseReminderInput } from './parse';
import { ReminderList } from './ReminderList';
import { RemindersSidebar } from './RemindersSidebar';
import {
  defaultDueFor,
  listCounts,
  parseSelection,
  rowsOf,
  type Selection,
  SMART_EMPTY,
  SMART_LABELS,
  SMART_LISTS,
  sectionsFor,
  selectionId,
  smartCounts,
  stepRow,
  summarize,
} from './smart';
import {
  canIndent,
  canOutdent,
  childrenOf,
  createReminder,
  DEFAULT_DATA,
  DEFAULT_LIST_ID,
  describeRepeat,
  displayTitle,
  newId,
  normalizeData,
  type Reminder,
  type ReminderPatch,
  type RemindersAction,
  type RemindersData,
  type RemindersPrefs,
  remindersReducer,
} from './store';

/** Today only changes once a day; a minute is a fine granularity to notice. */
const TICK_MS = 60_000;

export default function Reminders(_props: AppProps) {
  const kernel = useKernel();
  const settings = useSettings();
  const { container } = useApp();
  const { close } = useWindowControls();
  const dialogs = useDialogs();
  const [frameRef, { width }] = useElementSize<HTMLDivElement>();

  const [stored, store] = useJsonFile<RemindersData>(
    join(kernel.home, '.config', 'reminders.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);

  const [instant, setInstant] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setInstant(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  const now = useMemo(
    () => civilNow(instant, settings.region.timeZone),
    [instant, settings.region.timeZone],
  );
  const o: FormatOptions = useMemo(
    () => ({ locale: settings.region.locale, hour12: !settings.menubar.clock24h }),
    [settings.region.locale, settings.menubar.clock24h],
  );

  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Where the lists open as a menu, on a window too narrow for a sidebar. */
  const [listMenuAt, setListMenuAt] = useState<{ x: number; y: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const composeRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const handledTick = useRef(0);

  const selection = useMemo(
    () => parseSelection(data.prefs.selection, data.lists),
    [data.prefs.selection, data.lists],
  );
  const layout = layoutFor(width, { showSidebar: data.prefs.showSidebar });
  const sections = useMemo(
    () =>
      sectionsFor(data, selection, {
        today: now.date,
        showCompleted: data.prefs.showCompleted,
        query,
      }),
    [data, selection, now.date, query],
  );
  const rows = useMemo(() => rowsOf(sections), [sections]);
  const focused = useMemo(
    () => rows.find((row) => row.item.id === focusId)?.item ?? null,
    [rows, focusId],
  );
  const counts = useMemo(() => summarize(rows), [rows]);
  const title =
    selection.kind === 'smart'
      ? SMART_LABELS[selection.id]
      : (data.lists.find((l) => l.id === selection.id)?.name ?? 'Reminders');
  useTitle(`Reminders — ${title}`);

  /** Move the cursor and take the keyboard with it. */
  const focusRow = useCallback((id: string | null) => {
    setFocusId(id);
    setFocusTick((tick) => tick + 1);
  }, []);

  // Only a deliberate move takes focus; a click has already landed where it
  // meant to, and pulling focus back to the row would undo it.
  useEffect(() => {
    if (handledTick.current === focusTick) return;
    handledTick.current = focusTick;
    if (focusId === null) return;
    const host = listRef.current;
    if (!host) return;
    for (const element of host.querySelectorAll<HTMLElement>('[data-row]')) {
      if (element.dataset.row === focusId) {
        element.focus({ preventScroll: true });
        element.scrollIntoView({ block: 'nearest' });
        return;
      }
    }
  }, [focusId, focusTick]);

  const dispatch = useCallback(
    (action: RemindersAction) => {
      store((current) => remindersReducer(normalizeData(current), action));
    },
    [store],
  );

  const setPrefs = useCallback(
    (patch: Partial<RemindersPrefs>) => {
      store((current) => {
        const base = normalizeData(current);
        return { ...base, prefs: { ...base.prefs, ...patch } };
      });
    },
    [store],
  );

  const targetList =
    selection.kind === 'list' ? selection.id : (data.lists[0]?.id ?? DEFAULT_LIST_ID);

  const parsed = useMemo(
    () => parseReminderInput(draft, { date: now.date, minutes: now.minutes }),
    [draft, now.date, now.minutes],
  );
  const hint = useMemo(() => {
    const parts: string[] = [];
    if (parsed.due !== null) parts.push(formatDue(parsed.due, parsed.dueTime, now.date, o));
    const repeat = describeRepeat(parsed.repeat);
    if (repeat) parts.push(repeat);
    return parts.join(' · ');
  }, [parsed, now.date, o]);

  const addFromField = useCallback(() => {
    if (!draft.trim()) return;
    const read = parseReminderInput(draft, { date: now.date, minutes: now.minutes });
    const item = createReminder(
      {
        listId: targetList,
        title: read.title.trim(),
        due: read.due ?? defaultDueFor(selection, now.date),
        dueTime: read.dueTime,
        repeat: read.repeat,
        flagged: selection.kind === 'smart' && selection.id === 'flagged',
      },
      newId(),
      Date.now(),
    );
    dispatch({ type: 'add', item });
    setDraft('');
    composeRef.current?.focus();
  }, [draft, now.date, now.minutes, targetList, selection, dispatch]);

  const toggleCompleted = useCallback(
    (item: Reminder) => {
      if (item.completed) dispatch({ type: 'uncomplete', id: item.id });
      else dispatch({ type: 'complete', id: item.id, now: Date.now(), nextId: newId() });
    },
    [dispatch],
  );

  const toggleFlagged = useCallback(
    (item: Reminder) => {
      dispatch({ type: 'edit', id: item.id, patch: { flagged: !item.flagged } });
    },
    [dispatch],
  );

  const removeItem = useCallback(
    async (id: string) => {
      const item = data.items.find((i) => i.id === id);
      if (!item) return;
      const kids = childrenOf(data.items, id).length;
      if (kids > 0) {
        const ok = await dialogs.confirm({
          title: `Delete "${displayTitle(item)}"?`,
          message: kids === 1 ? 'Its subtask goes with it.' : `Its ${kids} subtasks go with it.`,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
      }
      const next = stepRow(rows, id, 1) ?? stepRow(rows, id, -1);
      dispatch({ type: 'delete', id });
      setEditingId((current) => (current === id ? null : current));
      if (next !== null && next !== id) focusRow(next);
      else setFocusId(null);
    },
    [data.items, rows, dialogs, dispatch, focusRow],
  );

  const saveDetails = useCallback(
    (id: string, patch: ReminderPatch, listId: string) => {
      dispatch({ type: 'edit', id, patch });
      const item = data.items.find((i) => i.id === id);
      if (item && item.listId !== listId) dispatch({ type: 'move', id, listId });
      setEditingId(null);
    },
    [dispatch, data.items],
  );

  const newList = useCallback(async () => {
    const name = await dialogs.prompt({
      title: 'New List',
      placeholder: 'Name',
      confirmLabel: 'Create',
      validate: (value) => (value.trim() ? null : 'Give the list a name.'),
    });
    if (!name?.trim()) return;
    const id = newId('l');
    dispatch({ type: 'addList', list: { id, name: name.trim(), createdAt: Date.now() } });
    setPrefs({ selection: selectionId({ kind: 'list', id }) });
  }, [dialogs, dispatch, setPrefs]);

  const renameList = useCallback(
    async (id: string) => {
      const list = data.lists.find((l) => l.id === id);
      if (!list) return;
      const name = await dialogs.prompt({
        title: 'Rename List',
        defaultValue: list.name,
        confirmLabel: 'Rename',
        validate: (value) => (value.trim() ? null : 'Give the list a name.'),
      });
      if (!name?.trim()) return;
      dispatch({ type: 'renameList', id, name: name.trim() });
    },
    [data.lists, dialogs, dispatch],
  );

  const removeList = useCallback(
    async (id: string) => {
      const list = data.lists.find((l) => l.id === id);
      if (!list) return;
      const held = data.items.filter((i) => i.listId === id).length;
      const ok = await dialogs.confirm({
        title: `Delete "${list.name}"?`,
        message:
          held === 0
            ? 'The list is empty.'
            : `${held} ${held === 1 ? 'reminder' : 'reminders'} in it will be deleted.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      dispatch({ type: 'deleteList', id });
      if (selection.kind === 'list' && selection.id === id) {
        setPrefs({ selection: selectionId({ kind: 'smart', id: 'today' }) });
      }
    },
    [data.lists, data.items, dialogs, dispatch, selection, setPrefs],
  );

  const select = useCallback(
    (next: Selection) => {
      setPrefs({ selection: selectionId(next) });
      setFocusId(null);
    },
    [setPrefs],
  );

  const startNewReminder = useCallback(() => {
    setFocusId(null);
    composeRef.current?.focus();
  }, []);

  const find = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
    setFocusId(null);
  }, []);

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const item = focused;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        // Mod+Shift+Arrow reorders, and that command lives in the menu.
        if (event.shiftKey && (event.metaKey || event.ctrlKey)) return;
        event.preventDefault();
        const next = stepRow(rows, focusId, event.key === 'ArrowDown' ? 1 : -1);
        if (next !== null) focusRow(next);
        break;
      }
      case 'Home':
      case 'End': {
        event.preventDefault();
        const edge = event.key === 'Home' ? rows[0] : rows[rows.length - 1];
        if (edge) focusRow(edge.item.id);
        break;
      }
      case ' ': {
        if (!item) break;
        event.preventDefault();
        toggleCompleted(item);
        break;
      }
      case 'Enter': {
        if (!item) break;
        event.preventDefault();
        setEditingId(item.id);
        break;
      }
      case 'Escape': {
        event.preventDefault();
        startNewReminder();
        break;
      }
      case 'Tab': {
        // Tab nests a reminder under the one above and Shift+Tab lifts it
        // out. Where neither is possible the key does its usual job and
        // moves focus out of the list, so the window is never a trap.
        if (!item) break;
        if (!event.shiftKey && canIndent(data.items, item.id)) {
          event.preventDefault();
          dispatch({ type: 'indent', id: item.id });
          focusRow(item.id);
        } else if (event.shiftKey && canOutdent(data.items, item.id)) {
          event.preventDefault();
          dispatch({ type: 'outdent', id: item.id });
          focusRow(item.id);
        }
        break;
      }
      default:
        break;
    }
  };

  const latest = useLatest({
    startNewReminder,
    newList,
    close,
    find,
    editDetails: () => focused && setEditingId(focused.id),
    toggleCompleted: () => focused && toggleCompleted(focused),
    toggleFlagged: () => focused && toggleFlagged(focused),
    indent: () => focused && dispatch({ type: 'indent', id: focused.id }),
    outdent: () => focused && dispatch({ type: 'outdent', id: focused.id }),
    move: (direction: 1 | -1) =>
      focused && dispatch({ type: 'reorder', id: focused.id, direction }),
    remove: () => focused && void removeItem(focused.id),
    select,
    toggleShowCompleted: () => setPrefs({ showCompleted: !data.prefs.showCompleted }),
    toggleSidebar: () => setPrefs({ showSidebar: !data.prefs.showSidebar }),
  });

  useAppMenus(
    buildRemindersMenus(
      {
        selection,
        hasFocus: focused !== null,
        focusedCompleted: focused?.completed ?? false,
        focusedFlagged: focused?.flagged ?? false,
        canIndent: focused !== null && canIndent(data.items, focused.id),
        canOutdent: focused !== null && canOutdent(data.items, focused.id),
        showCompleted: data.prefs.showCompleted,
        showSidebar: data.prefs.showSidebar,
      },
      {
        newReminder: () => latest.current.startNewReminder(),
        newList: () => void latest.current.newList(),
        close: () => latest.current.close(),
        find: () => latest.current.find(),
        editDetails: () => latest.current.editDetails(),
        toggleCompleted: () => latest.current.toggleCompleted(),
        toggleFlagged: () => latest.current.toggleFlagged(),
        indent: () => latest.current.indent(),
        outdent: () => latest.current.outdent(),
        moveUp: () => latest.current.move(-1),
        moveDown: () => latest.current.move(1),
        deleteItem: () => latest.current.remove(),
        select: (next) => latest.current.select(next),
        toggleShowCompleted: () => latest.current.toggleShowCompleted(),
        toggleSidebar: () => latest.current.toggleSidebar(),
      },
    ),
    [selection, focused, data.items, data.prefs.showCompleted, data.prefs.showSidebar, close],
  );

  const editing = editingId === null ? null : (data.items.find((i) => i.id === editingId) ?? null);
  const listNameOf = (item: Reminder) =>
    selection.kind === 'list' || !layout.listNames
      ? null
      : (data.lists.find((l) => l.id === item.listId)?.name ?? null);
  const emptyMessage =
    query.trim() !== ''
      ? 'Nothing matches that search.'
      : selection.kind === 'smart'
        ? SMART_EMPTY[selection.id]
        : 'This list is empty.';

  const listMenuEntries: MenuEntry[] = [
    ...SMART_LISTS.map<MenuEntry>((id) => ({
      id: `smart-${id}`,
      type: 'radio',
      label: SMART_LABELS[id],
      checked: selection.kind === 'smart' && selection.id === id,
      onSelect: () => select({ kind: 'smart', id }),
    })),
    { type: 'separator' },
    ...data.lists.map<MenuEntry>((list) => ({
      id: `list-${list.id}`,
      type: 'radio',
      label: list.name,
      checked: selection.kind === 'list' && selection.id === list.id,
      onSelect: () => select({ kind: 'list', id: list.id }),
    })),
    { type: 'separator' },
    { id: 'new-list', label: 'New List…', onSelect: () => void newList() },
  ];

  return (
    <div ref={frameRef} className="flex h-full min-h-0 w-full">
      <AppFrame
        toolbar={
          <Toolbar dense>
            {layout.sidebarFits ? (
              <IconButton
                size="sm"
                label="Sidebar"
                active={data.prefs.showSidebar}
                onClick={() => latest.current.toggleSidebar()}
              >
                <PanelLeft className="size-3.5" />
              </IconButton>
            ) : (
              <IconButton
                size="sm"
                label="Lists"
                onClick={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  setListMenuAt({ x: box.left, y: box.bottom + 4 });
                }}
              >
                <PanelLeft className="size-3.5" />
              </IconButton>
            )}
            <span className="truncate-1 pl-1 text-md font-medium text-ink">{title}</span>
            <ToolbarSpacer />
            {/* The field's own wrapper stretches, so the width is set here. */}
            <div className={layout.compact ? 'w-28' : 'w-44'}>
              <SearchField
                ref={searchRef}
                size="sm"
                value={query}
                aria-label="Search reminders"
                placeholder="Search"
                onChange={setQuery}
                onFocus={() => setFocusId(null)}
              />
            </div>
            {layout.compact ? (
              <IconButton
                size="sm"
                label="New Reminder"
                onClick={() => latest.current.startNewReminder()}
              >
                <Plus className="size-3.5" />
              </IconButton>
            ) : (
              <Button
                size="sm"
                icon={<Plus className="size-3.5" />}
                onClick={() => latest.current.startNewReminder()}
              >
                New Reminder
              </Button>
            )}
          </Toolbar>
        }
        sidebar={
          layout.sidebar ? (
            <RemindersSidebar
              lists={data.lists}
              selection={selection}
              smartCounts={smartCounts(data.items, now.date)}
              listCounts={listCounts(data.items)}
              onSelect={select}
              onNewList={() => void newList()}
              onRenameList={(id) => void renameList(id)}
              onDeleteList={(id) => void removeList(id)}
            />
          ) : undefined
        }
        statusBar={
          <>
            <span className="tabular-nums">
              {counts.open === 1 ? '1 open' : `${counts.open} open`}
            </span>
            {counts.completed > 0 && (
              <span className="tabular-nums text-ink-3">{counts.completed} completed</span>
            )}
            {focused && <span className="truncate-1 text-ink-3">{displayTitle(focused)}</span>}
          </>
        }
      >
        <ComposeField
          value={draft}
          hint={hint}
          inputRef={composeRef}
          onChange={setDraft}
          onSubmit={addFromField}
          onFocus={() => setFocusId(null)}
          onStepIntoList={() => {
            const first = rows[0]?.item.id;
            if (first !== undefined) focusRow(first);
          }}
        />
        <div ref={listRef} className="lumen-scroll min-h-0 flex-1">
          <ReminderList
            sections={sections}
            focusId={focusId}
            firstId={rows[0]?.item.id ?? null}
            today={now.date}
            o={o}
            listNameOf={listNameOf}
            emptyMessage={emptyMessage}
            onFocusRow={setFocusId}
            onKeyDown={onListKeyDown}
            onToggleCompleted={toggleCompleted}
            onToggleFlagged={toggleFlagged}
            onOpen={(item) => setEditingId(item.id)}
          />
        </div>
      </AppFrame>

      <AnchoredMenu
        open={listMenuAt !== null}
        onClose={() => setListMenuAt(null)}
        items={listMenuEntries}
        at={listMenuAt ?? undefined}
      />

      {editing && (
        <DetailsDialog
          key={editing.id}
          item={editing}
          lists={data.lists}
          container={container}
          onClose={() => setEditingId(null)}
          onSave={(patch, listId) => saveDetails(editing.id, patch, listId)}
          onDelete={() => void removeItem(editing.id)}
        />
      )}
    </div>
  );
}
