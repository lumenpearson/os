/**
 * Mail over a mailbox that lives in this computer's file system.
 *
 * There is no account and no server. Every message is a record in
 * ~/.config/mail.json, so Send files a copy in Sent and delivers a second
 * copy to Inbox — the loopback address is the only one this computer has.
 * The app says so in the sidebar, in the empty state and in the compose
 * sheet, because a mail client that stayed quiet about it would be lying.
 */

import { useCurrentUser, useKernel, useSettings, useVfs } from '@lumen/kernel/react';
import {
  AnchoredMenu,
  AppFrame,
  IconButton,
  SearchField,
  Toolbar,
  ToolbarGroup,
  ToolbarSpacer,
  useContextMenu,
  useDialogs,
  useElementSize,
  useEscape,
  useLatest,
} from '@lumen/ui';
import { basename, join } from '@lumen/vfs';
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  CornerUpLeft,
  Flag,
  Forward,
  PanelLeft,
  ReplyAll,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useApp,
  useAppMenus,
  useCloseGuard,
  useDirty,
  useFilePicker,
  useJsonFile,
  useLauncher,
  useNotify,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { ComposeSheet } from './ComposeSheet';
import {
  canSend,
  type Draft,
  draftFromMessage,
  draftIsBlank,
  draftToMessage,
  emptyDraft,
  forwardDraft,
  replyDraft,
} from './compose';
import type { FormatOptions } from './format';
import { layoutFor, listWidthFor, type Pane, SIDEBAR_BREAKPOINT, SIDEBAR_WIDTH } from './layout';
import { MailboxSidebar } from './MailboxSidebar';
import { MessageList } from './MessageList';
import { buildMailMenus } from './menus';
import { ReadingPane } from './ReadingPane';
import { isEmptyQuery, parseQuery, searchesAllMailboxes, searchMessages } from './search';
import {
  DEFAULT_DATA,
  folderIdFor,
  type MailAction,
  type MailData,
  type MailPrefs,
  mailboxCounts,
  mailboxLabel,
  mailReducer,
  messagesIn,
  newMessageId,
  normalizeData,
  type SortKey,
  seed,
} from './store';
import { groupThreads, sortThreads, threadOf } from './thread';

/** How long a message has to be on screen before it counts as read. */
const READ_DELAY = 800;
/** The stamps in the list are minutes at their finest. */
const TICK_MS = 60_000;

/** A bare Delete must not eat a message while the caret is in a text field. */
function typingInField(): boolean {
  const el = typeof document === 'undefined' ? null : document.activeElement;
  return (
    el instanceof HTMLElement &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  );
}

export default function Mail(_props: AppProps) {
  const kernel = useKernel();
  const vfs = useVfs();
  const settings = useSettings();
  const user = useCurrentUser();
  const { container } = useApp();
  const { close } = useWindowControls();
  const dialogs = useDialogs();
  const pickFile = useFilePicker();
  const notify = useNotify();
  const { open } = useLauncher();
  const [frameRef, { width }] = useElementSize<HTMLDivElement>();

  const path = useMemo(() => join(kernel.home, '.config', 'mail.json'), [kernel.home]);
  const [stored, setStored, { loaded }] = useJsonFile<MailData>(path, DEFAULT_DATA);
  const data = useMemo(() => normalizeData(stored), [stored]);

  const me = user ? `${user.name} <${user.username}@local>` : 'You <you@local>';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [composeTitle, setComposeTitle] = useState('New Message');
  const [pane, setPane] = useState<Pane>('list');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const searchRef = useRef<HTMLInputElement>(null);
  const folderMenu = useContextMenu();
  const [menuFolder, setMenuFolder] = useState<string | null>(null);

  const o: FormatOptions = useMemo(
    () => ({
      locale: settings.region.locale || 'en-US',
      hour12: !settings.menubar.clock24h,
      timeZone: settings.region.timeZone || undefined,
    }),
    [settings.region.locale, settings.region.timeZone, settings.menubar.clock24h],
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // The seed runs when the file is absent, and the flag it writes keeps it
  // from running again over a mailbox the user has since emptied.
  useEffect(() => {
    if (!loaded || data.seeded) return;
    setStored((current) => seed(normalizeData(current), Date.now(), me));
  }, [loaded, data.seeded, setStored, me]);

  const dispatch = useCallback(
    (action: MailAction) => setStored((current) => mailReducer(normalizeData(current), action)),
    [setStored],
  );

  const setPrefs = useCallback(
    (patch: Partial<MailPrefs>) =>
      setStored((current) => {
        const base = normalizeData(current);
        return { ...base, prefs: { ...base.prefs, ...patch } };
      }),
    [setStored],
  );

  const mailbox = data.prefs.mailbox;
  const counts = useMemo(() => mailboxCounts(data), [data]);
  const parsed = useMemo(() => parseQuery(query), [query]);
  const matchContext = useMemo(
    () => ({ mailboxLabel: (id: string) => mailboxLabel(data, id) }),
    [data],
  );
  const scope = useMemo(
    () => (searchesAllMailboxes(parsed) ? data.messages : messagesIn(data, mailbox)),
    [data, mailbox, parsed],
  );
  const visible = useMemo(
    () => searchMessages(scope, parsed, matchContext),
    [scope, parsed, matchContext],
  );
  const showRecipients = mailbox === 'sent' || mailbox === 'drafts';
  const threads = useMemo(
    () => sortThreads(groupThreads(visible), data.prefs.sort, showRecipients),
    [visible, data.prefs.sort, showRecipients],
  );

  const selected = useMemo(
    () => data.messages.find((m) => m.id === selectedId) ?? null,
    [data.messages, selectedId],
  );
  const selectedThread = useMemo(() => threadOf(threads, selectedId), [threads, selectedId]);

  // A selection that has left the list — filed elsewhere, deleted, filtered
  // out by a search — stops being the selection.
  useEffect(() => {
    if (selectedId !== null && !visible.some((m) => m.id === selectedId)) setSelectedId(null);
  }, [visible, selectedId]);

  const layout = layoutFor(width, {
    showSidebar: data.prefs.showSidebar,
    sidebarOpen,
    pane,
    hasSelection: selected !== null,
  });

  useEscape(() => setSidebarOpen(false), layout.sidebarOverlay);

  /**
   * Reading marks a message read, but only once it has actually sat in the
   * reading pane for a moment: arrowing past six messages on the way to the
   * seventh should not mark six of them read. The timer is armed by the
   * selection changing and never by the read flag, so Mark as Unread on the
   * message in front of you stays where you put it.
   */
  const latestMessages = useLatest(data.messages);
  useEffect(() => {
    if (!layout.reading || selectedId === null) return;
    const timer = setTimeout(() => {
      const message = latestMessages.current.find((m) => m.id === selectedId);
      if (message && !message.read) dispatch({ type: 'setRead', ids: [selectedId], read: true });
    }, READ_DELAY);
    return () => clearTimeout(timer);
  }, [layout.reading, selectedId, dispatch, latestMessages]);

  const title = mailboxLabel(data, mailbox);
  useTitle(`Mail — ${title}`);
  useDirty(draft !== null && !draftIsBlank(draft));

  const dirtyDraft = draft !== null && !draftIsBlank(draft) && !draft.saved;
  useCloseGuard(
    dirtyDraft
      ? () =>
          dialogs.confirm({
            title: 'Discard this message?',
            message: 'The draft has not been saved.',
            confirmLabel: 'Discard',
            danger: true,
          })
      : null,
  );

  // ── commands ────────────────────────────────────────────────────────────

  const openMailbox = (id: string) => {
    setPrefs({ mailbox: id });
    setSelectedId(null);
    setPane('list');
    setSidebarOpen(false);
  };

  /** The message the selection should land on once this one leaves the list. */
  const neighbourOf = (id: string): string | null => {
    const index = threads.findIndex((t) => t.messages.some((m) => m.id === id));
    if (index < 0) return null;
    const thread = threads[index];
    const sibling = thread?.messages.filter((m) => m.id !== id) ?? [];
    if (sibling.length > 0) return sibling[sibling.length - 1]?.id ?? null;
    const next = threads[index + 1] ?? threads[index - 1];
    return next?.latest.id ?? null;
  };

  const compose = (next: Draft, sheetTitle: string) => {
    setDraft(next);
    setComposeTitle(sheetTitle);
  };

  const actions = {
    newMessage: () => compose(emptyDraft(newMessageId(), Date.now()), 'New Message'),
    reply: (all: boolean) => {
      if (!selected) return;
      compose(
        replyDraft(selected, me, { all, id: newMessageId(), now: Date.now(), o }),
        all ? 'Reply All' : 'Reply',
      );
    },
    forward: () => {
      if (!selected) return;
      compose(forwardDraft(selected, { id: newMessageId(), now: Date.now(), o }), 'Forward');
    },
    editDraft: (id: string) => {
      const message = data.messages.find((m) => m.id === id);
      if (message) compose(draftFromMessage(message), 'Draft');
    },
    saveDraft: () => {
      if (!draft) return;
      if (draftIsBlank(draft)) {
        setDraft(null);
        return;
      }
      dispatch({
        type: 'saveDraft',
        message: draftToMessage(draft, { from: me, mailbox: 'drafts', now: Date.now() }),
      });
      setDraft(null);
    },
    send: () => {
      if (!draft || !canSend(draft)) return;
      dispatch({
        type: 'send',
        message: draftToMessage(draft, { from: me, mailbox: 'sent', now: Date.now() }),
      });
      setDraft(null);
      notify('Message delivered', 'Filed in Sent, with a copy in this Inbox.');
    },
    closeDraft: async () => {
      if (dirtyDraft) {
        const discard = await dialogs.confirm({
          title: 'Discard this message?',
          message: 'The draft has not been saved.',
          confirmLabel: 'Discard',
          danger: true,
        });
        if (!discard) return;
      }
      setDraft(null);
    },
    attach: async () => {
      const chosen = await pickFile({ mode: 'open', multiple: true, title: 'Attach Files' });
      const paths = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
      if (paths.length === 0) return;
      const files = await Promise.all(
        paths.map(async (file) => {
          const size = await vfs
            .stat(file)
            .then((s) => s.size)
            .catch(() => 0);
          return { name: basename(file), path: file, size };
        }),
      );
      setDraft((current) =>
        current
          ? {
              ...current,
              attachments: [
                ...current.attachments.filter((a) => !paths.includes(a.path)),
                ...files,
              ],
            }
          : current,
      );
    },
    removeAttachment: (file: string) =>
      setDraft((current) =>
        current
          ? { ...current, attachments: current.attachments.filter((a) => a.path !== file) }
          : current,
      ),
    toggleRead: () => {
      if (!selected) return;
      dispatch({ type: 'setRead', ids: [selected.id], read: !selected.read });
    },
    toggleFlag: () => {
      if (!selected) return;
      dispatch({ type: 'setFlagged', ids: [selected.id], flagged: !selected.flagged });
    },
    archive: () => {
      if (!selected) return;
      const next = neighbourOf(selected.id);
      dispatch({ type: 'move', ids: [selected.id], to: 'archive' });
      setSelectedId(next);
    },
    restore: () => {
      if (!selected) return;
      const next = neighbourOf(selected.id);
      dispatch({ type: 'restore', ids: [selected.id] });
      setSelectedId(next);
    },
    remove: () => {
      if (!selected || typingInField()) return;
      const next = neighbourOf(selected.id);
      dispatch({ type: 'delete', ids: [selected.id] });
      setSelectedId(next);
      if (layout.back) setPane('list');
    },
    emptyTrash: async () => {
      const trash = messagesIn(data, 'trash');
      if (trash.length === 0) return;
      const sure = await dialogs.confirm({
        title: 'Empty the Trash?',
        message: `${trash.length === 1 ? '1 message' : `${trash.length} messages`} will be removed from this computer. This cannot be undone.`,
        confirmLabel: 'Empty Trash',
        danger: true,
      });
      if (sure) dispatch({ type: 'emptyTrash' });
    },
    newFolder: async () => {
      const name = await dialogs.prompt({
        title: 'New Folder',
        message: 'A folder in this mailbox.',
        placeholder: 'Project X',
        confirmLabel: 'Create',
        validate: (value) => (value.trim() === '' ? 'Give the folder a name.' : null),
      });
      if (name === null || name.trim() === '') return;
      const id = folderIdFor(name.trim(), data.folders);
      dispatch({ type: 'createFolder', name: name.trim() });
      openMailbox(id);
    },
    renameFolder: async (id: string) => {
      const folder = data.folders.find((f) => f.id === id);
      if (!folder) return;
      const name = await dialogs.prompt({
        title: 'Rename Folder',
        defaultValue: folder.name,
        confirmLabel: 'Rename',
        validate: (value) => (value.trim() === '' ? 'Give the folder a name.' : null),
      });
      if (name === null || name.trim() === '') return;
      dispatch({ type: 'renameFolder', id, name: name.trim() });
    },
    deleteFolder: async (id: string) => {
      const folder = data.folders.find((f) => f.id === id);
      if (!folder) return;
      const inside = messagesIn(data, id).length;
      const sure = await dialogs.confirm({
        title: `Delete “${folder.name}”?`,
        message:
          inside === 0
            ? 'The folder is empty.'
            : `${inside === 1 ? '1 message' : `${inside} messages`} will move to the Trash.`,
        confirmLabel: 'Delete Folder',
        danger: true,
      });
      if (sure) dispatch({ type: 'deleteFolder', id });
    },
    find: () => searchRef.current?.focus(),
    back: () => setPane('list'),
    toggleSidebar: () => {
      if (width > 0 && width < SIDEBAR_BREAKPOINT) setSidebarOpen((v) => !v);
      else setPrefs({ showSidebar: !data.prefs.showSidebar });
    },
    setSort: (sort: SortKey) => setPrefs({ sort }),
  };

  const latest = useLatest(actions);
  const selectionInTrash = selected ? selected.mailbox === 'trash' : mailbox === 'trash';

  useAppMenus(
    buildMailMenus(
      {
        hasSelection: selected !== null,
        unread: selected !== null && !selected.read,
        flagged: selected?.flagged ?? false,
        inTrash: selectionInTrash,
        inFolder: data.folders.some((f) => f.id === mailbox),
        composing: draft !== null,
        canGoBack: layout.back,
        sort: data.prefs.sort,
        sidebar: layout.sidebarOverlay || layout.sidebar,
      },
      {
        newMessage: () => latest.current.newMessage(),
        saveDraft: () => latest.current.saveDraft(),
        newFolder: () => void latest.current.newFolder(),
        renameFolder: () => void latest.current.renameFolder(mailbox),
        deleteFolder: () => void latest.current.deleteFolder(mailbox),
        emptyTrash: () => void latest.current.emptyTrash(),
        close,
        find: () => latest.current.find(),
        reply: () => latest.current.reply(false),
        replyAll: () => latest.current.reply(true),
        forward: () => latest.current.forward(),
        toggleRead: () => latest.current.toggleRead(),
        toggleFlag: () => latest.current.toggleFlag(),
        archive: () => latest.current.archive(),
        restore: () => latest.current.restore(),
        remove: () => latest.current.remove(),
        setSort: (sort) => latest.current.setSort(sort),
        back: () => latest.current.back(),
        toggleSidebar: () => latest.current.toggleSidebar(),
      },
    ),
    [
      selected,
      selectionInTrash,
      mailbox,
      draft !== null,
      data.prefs.sort,
      data.folders,
      layout.back,
      layout.sidebar,
      layout.sidebarOverlay,
      close,
      latest,
    ],
  );

  const openMessage = (id: string) => {
    setSelectedId(id);
    if (data.messages.find((m) => m.id === id)?.mailbox === 'drafts') {
      actions.editDraft(id);
      return;
    }
    setPane('reading');
  };

  const sidebar = (
    <MailboxSidebar
      data={data}
      counts={counts}
      active={mailbox}
      width={SIDEBAR_WIDTH}
      onSelect={openMailbox}
      onNewFolder={() => void actions.newFolder()}
      onFolderMenu={(id, event) => {
        setMenuFolder(id);
        folderMenu.openAt(event);
      }}
    />
  );

  const unread = counts[mailbox]?.unread ?? 0;

  return (
    <div ref={frameRef} className="relative flex h-full min-h-0 w-full">
      <AppFrame
        toolbar={
          <Toolbar dense>
            {layout.back ? (
              <IconButton size="sm" label="Back to list" onClick={() => setPane('list')}>
                <ChevronLeft />
              </IconButton>
            ) : (
              <IconButton
                size="sm"
                label="Mailboxes"
                active={layout.sidebar || layout.sidebarOverlay}
                onClick={() => actions.toggleSidebar()}
              >
                <PanelLeft />
              </IconButton>
            )}
            <IconButton size="sm" label="New message" onClick={() => actions.newMessage()}>
              <SquarePen />
            </IconButton>
            <ToolbarGroup className="ml-1">
              <IconButton
                size="sm"
                label="Reply"
                disabled={!selected}
                onClick={() => actions.reply(false)}
              >
                <CornerUpLeft />
              </IconButton>
              <IconButton
                size="sm"
                label="Reply all"
                disabled={!selected}
                onClick={() => actions.reply(true)}
              >
                <ReplyAll />
              </IconButton>
              <IconButton
                size="sm"
                label="Forward"
                disabled={!selected}
                onClick={() => actions.forward()}
              >
                <Forward />
              </IconButton>
            </ToolbarGroup>
            <ToolbarGroup className="ml-1">
              {selectionInTrash ? (
                <IconButton
                  size="sm"
                  label="Move back from Trash"
                  disabled={!selected}
                  onClick={() => actions.restore()}
                >
                  <ArchiveRestore />
                </IconButton>
              ) : (
                <IconButton
                  size="sm"
                  label="Move to Archive"
                  disabled={!selected}
                  onClick={() => actions.archive()}
                >
                  <Archive />
                </IconButton>
              )}
              <IconButton
                size="sm"
                label={selectionInTrash ? 'Delete permanently' : 'Delete'}
                disabled={!selected}
                onClick={() => actions.remove()}
              >
                <Trash2 />
              </IconButton>
              <IconButton
                size="sm"
                label={selected?.flagged ? 'Remove flag' : 'Flag'}
                active={selected?.flagged ?? false}
                disabled={!selected}
                onClick={() => actions.toggleFlag()}
              >
                <Flag />
              </IconButton>
            </ToolbarGroup>
            <ToolbarSpacer />
            <SearchField
              ref={searchRef}
              size="sm"
              aria-label="Search mail"
              placeholder="Search"
              value={query}
              onChange={setQuery}
              className={width > 0 && width < SIDEBAR_BREAKPOINT ? 'w-28' : 'w-52'}
              onKeyDown={(e) => {
                // Keep typing keys — Delete included — inside the field rather
                // than letting them reach the window's menu shortcuts.
                e.stopPropagation();
                if (e.key === 'Escape') setQuery('');
              }}
            />
          </Toolbar>
        }
        sidebar={layout.sidebar ? sidebar : undefined}
        statusBar={
          <>
            <span className="tabular-nums">
              {threads.length === 1 ? '1 conversation' : `${threads.length} conversations`}
            </span>
            {unread > 0 && <span className="tabular-nums text-ink-3">{unread} unread</span>}
            <span className="flex-1" />
            <span className="truncate-1 text-ink-3">Local mailbox · ~/.config/mail.json</span>
          </>
        }
      >
        <div className="flex min-h-0 min-w-0 flex-1">
          {layout.list && (
            <MessageList
              threads={threads}
              title={isEmptyQuery(parsed) ? title : 'Search results'}
              selectedId={selectedId}
              sort={data.prefs.sort}
              showRecipients={showRecipients}
              searching={!isEmptyQuery(parsed)}
              o={o}
              now={now}
              onSort={(sort) => actions.setSort(sort)}
              onSelect={setSelectedId}
              onActivate={openMessage}
              className={layout.listFills ? 'flex-1' : 'shrink-0'}
              style={layout.listFills ? undefined : { width: listWidthFor(width) }}
            />
          )}
          {layout.reading && (
            <ReadingPane
              message={selected}
              thread={selectedThread}
              o={o}
              now={now}
              onSelectMessage={setSelectedId}
              onOpenAttachment={(file) => void open(file)}
            />
          )}
        </div>
      </AppFrame>

      {layout.sidebarOverlay && (
        <div className="absolute inset-0 z-20 flex">
          <div className="lumen-fade-enter h-full shadow-md">{sidebar}</div>
          <button
            type="button"
            aria-label="Close mailboxes"
            className="flex-1 bg-scrim lumen-fade-enter"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      <AnchoredMenu
        open={folderMenu.open && menuFolder !== null}
        at={folderMenu.at}
        onClose={folderMenu.close}
        items={[
          {
            id: 'rename',
            label: 'Rename Folder…',
            onSelect: () => menuFolder && void actions.renameFolder(menuFolder),
          },
          {
            id: 'delete',
            label: 'Delete Folder',
            danger: true,
            onSelect: () => menuFolder && void actions.deleteFolder(menuFolder),
          },
        ]}
      />

      {draft && (
        <ComposeSheet
          draft={draft}
          title={composeTitle}
          container={container}
          // Any edit makes the sheet dirty again, so closing a draft that was
          // saved earlier and then changed still asks before discarding.
          onChange={(next) => setDraft({ ...next, saved: false })}
          onAttach={() => void actions.attach()}
          onRemoveAttachment={(file) => actions.removeAttachment(file)}
          onSaveDraft={() => actions.saveDraft()}
          onSend={() => actions.send()}
          onClose={() => void actions.closeDraft()}
        />
      )}
    </div>
  );
}
