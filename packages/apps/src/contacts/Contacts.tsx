/**
 * Contacts: an address book over one list of records.
 *
 * The store is a single JSON file under the home directory. vCards are the
 * exchange format, not the storage format — importing reads a `.vcf` into
 * records, exporting writes records back out — which is why the parser and the
 * serialiser in `vcard.ts` have to agree exactly rather than approximately.
 *
 * The window folds: list beside detail while there is room, one pane at a
 * time when there is not, with the groups sidebar and the A–Z rail given up
 * first. Every decision comes from the measured size of this window.
 */

import { useCurrentUser, useKernel, useSettings, useVfs } from '@lumen/kernel/react';
import {
  AppFrame,
  Button,
  cx,
  EmptyState,
  IconButton,
  SearchField,
  Toolbar,
  useDialogs,
  useElementSize,
  useLatest,
} from '@lumen/ui';
import { basename, join } from '@lumen/vfs';
import { PanelLeft, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useApp,
  useAppMenus,
  useArgs,
  useCloseGuard,
  useDirty,
  useFilePicker,
  useJsonFile,
  useLauncher,
  useNotify,
  useShortcut,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { ContactDetail } from './ContactDetail';
import { ContactEditor } from './ContactEditor';
import { ContactList } from './ContactList';
import {
  type Contact,
  type ContactsAction,
  type ContactsData,
  type ContactsPrefs,
  CURRENT_VERSION,
  cleanContact,
  contactFromUser,
  contactsReducer,
  DEFAULT_DATA,
  emptyContact,
  FAVOURITES,
  filterByGroup,
  groupCounts,
  newContactId,
  normalizeData,
  sameContent,
  shouldSeed,
  summariseImport,
} from './contact';
import { DuplicatesDialog } from './DuplicatesDialog';
import { GroupsSidebar } from './GroupsSidebar';
import { layoutFor, type Pane, visiblePane } from './layout';
import { buildContactsMenus } from './menus';
import { type DuplicateGroup, findDuplicates, mergeAll } from './merge';
import { searchContacts } from './search';
import { displayName, sectionize } from './sort';
import { parseVcards, serialiseVcards } from './vcard';

const PHOTO_TYPES = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'];

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

export default function Contacts(props: AppProps) {
  const kernel = useKernel();
  const vfs = useVfs();
  const settings = useSettings();
  const user = useCurrentUser();
  const dialogs = useDialogs();
  const pick = useFilePicker();
  const notify = useNotify();
  const { launch } = useLauncher();
  const { close } = useWindowControls();
  const { container } = useApp();
  const args = useArgs<{ path?: string }>(props.args);

  const [root, size] = useElementSize<HTMLDivElement>();
  const [stored, store, { loaded }] = useJsonFile<ContactsData>(
    join(kernel.home, '.config', 'contacts.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);
  const { contacts, prefs } = data;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Contact | null>(null);
  const [creating, setCreating] = useState(false);
  const [pane, setPane] = useState<Pane>('list');
  const [duplicates, setDuplicates] = useState<DuplicateGroup[] | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const locale = settings.region.locale || undefined;
  const layout = layoutFor(size, { showGroups: prefs.showGroups });

  const inGroup = useMemo(() => filterByGroup(contacts, prefs.group), [contacts, prefs.group]);
  const hits = useMemo(() => searchContacts(inGroup, query), [inGroup, query]);
  const fields = useMemo(() => new Map(hits.map((hit) => [hit.contact.id, hit.field])), [hits]);
  const sections = useMemo(
    () =>
      sectionize(
        hits.map((hit) => hit.contact),
        prefs.sort,
        locale,
      ),
    [hits, prefs.sort, locale],
  );
  const selected = useMemo(
    () => contacts.find((contact) => contact.id === selectedId) ?? null,
    [contacts, selectedId],
  );
  const groups = useMemo(() => groupCounts(contacts), [contacts]);
  const favourites = useMemo(() => contacts.filter((c) => c.favourite).length, [contacts]);

  const original =
    draft === null ? null : creating ? emptyContact(draft.id, draft.createdAt) : selected;
  const dirty =
    draft !== null && (original === null || !sameContent(cleanContact(draft), original));

  const view = visiblePane(layout, pane, selected !== null || draft !== null);
  const showList = layout.split || view === 'list';
  const showDetail = layout.split || view === 'detail';

  useTitle(selected && !creating ? `Contacts — ${displayName(selected) || 'No name'}` : 'Contacts');
  useDirty(dirty);

  // ── the store ───────────────────────────────────────────────────────────

  const setPrefs = useCallback(
    (patch: Partial<ContactsPrefs>) => {
      store((current) => {
        const base = normalizeData(current);
        return { ...base, version: CURRENT_VERSION, prefs: { ...base.prefs, ...patch } };
      });
    },
    [store],
  );

  const dispatch = useCallback(
    (action: ContactsAction) => {
      store((current) => {
        const base = normalizeData(current);
        return {
          ...base,
          version: CURRENT_VERSION,
          contacts: contactsReducer(base.contacts, action),
        };
      });
    },
    [store],
  );

  /**
   * The signed-in user gets a card the first time the app runs. Version 0
   * means the file has never been written, which is not the same as a book
   * the user has emptied — that one is left empty.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (!loaded || seeded.current) return;
    if (!shouldSeed(data)) {
      seeded.current = true;
      return;
    }
    if (!user) return;
    seeded.current = true;
    const me = contactFromUser(user, newContactId(), Date.now());
    store((current) => {
      const base = normalizeData(current);
      if (!shouldSeed(base)) return base;
      return {
        ...base,
        version: CURRENT_VERSION,
        contacts: [me, ...base.contacts],
        prefs: { ...base.prefs, meId: me.id },
      };
    });
    setSelectedId(me.id);
  }, [loaded, data, user, store]);

  // ── commands ────────────────────────────────────────────────────────────

  const startNew = useCallback(() => {
    const contact = emptyContact(newContactId(), Date.now());
    // A new card joins whatever the list is filtered to, which is where the
    // user will look for it.
    if (prefs.group === FAVOURITES) contact.favourite = true;
    else if (prefs.group !== null) contact.groups = [prefs.group];
    setDraft(contact);
    setCreating(true);
    setSelectedId(null);
    setPane('detail');
  }, [prefs.group]);

  const startEdit = useCallback(() => {
    if (!selected) return;
    setDraft(selected);
    setCreating(false);
    setPane('detail');
  }, [selected]);

  const save = useCallback(() => {
    if (!draft) return;
    const now = Date.now();
    const clean = cleanContact(draft);
    if (creating)
      dispatch({ type: 'create', contact: { ...clean, createdAt: now, updatedAt: now } });
    else dispatch({ type: 'update', id: clean.id, patch: clean, now });
    setSelectedId(clean.id);
    setDraft(null);
    setCreating(false);
  }, [draft, creating, dispatch]);

  const cancelEdit = useCallback(() => {
    if (creating) setPane('list');
    setDraft(null);
    setCreating(false);
  }, [creating]);

  const removeContact = useCallback(async () => {
    if (!selected) return;
    const name = displayName(selected) || 'this contact';
    const ok = await dialogs.confirm({
      title: `Delete ${name}?`,
      message: 'The card is removed from the address book.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    dispatch({ type: 'delete', id: selected.id });
    setSelectedId(null);
    setDraft(null);
    setPane('list');
  }, [selected, dialogs, dispatch]);

  const toggleFavourite = useCallback(() => {
    if (!selected) return;
    dispatch({
      type: 'favourite',
      id: selected.id,
      favourite: !selected.favourite,
      now: Date.now(),
    });
  }, [selected, dispatch]);

  const latest = useLatest({ contacts, selected, hits, prefs });

  const importFrom = useCallback(
    async (path: string) => {
      let text: string;
      try {
        text = await vfs.readText(path);
      } catch (error) {
        notify('Could not read the file', reason(error));
        return;
      }
      const parsed = parseVcards(text, { now: Date.now(), makeId: () => newContactId() });
      if (parsed.length === 0) {
        notify('No vCards found', `${basename(path)} holds no contact records.`);
        return;
      }
      const known = new Set(latest.current.contacts.map((contact) => contact.id));
      const updated = parsed.filter((contact) => known.has(contact.id)).length;
      dispatch({ type: 'import', contacts: parsed });
      const first = parsed[0];
      if (first) setSelectedId(first.id);
      kernel.addRecent(path, 'lumen.contacts');
      notify(
        parsed.length === 1 ? 'Contact imported' : `${parsed.length} contacts imported`,
        summariseImport(parsed.length - updated, updated),
      );
    },
    [vfs, notify, dispatch, kernel, latest],
  );

  const importVcard = useCallback(async () => {
    const target = await pick({
      mode: 'open',
      title: 'Import vCard',
      extensions: ['.vcf'],
      startDir: join(kernel.home, 'Documents'),
    });
    if (typeof target === 'string') await importFrom(target);
  }, [pick, kernel.home, importFrom]);

  const exportVcard = useCallback(async () => {
    const one = latest.current.selected;
    const list = one ? [one] : latest.current.hits.map((hit) => hit.contact);
    if (list.length === 0) {
      notify('Nothing to export', 'The list is empty.');
      return;
    }
    const stem = one ? displayName(one) || 'Contact' : 'Contacts';
    const target = await pick({
      mode: 'save',
      title: one ? 'Export Contact' : 'Export Contacts',
      defaultName: `${stem}.vcf`,
      startDir: join(kernel.home, 'Documents'),
      extensions: ['.vcf'],
    });
    if (typeof target !== 'string') return;
    try {
      await vfs.writeText(target, serialiseVcards(list, { version: '4.0' }), { recursive: true });
      notify(
        list.length === 1 ? 'Contact exported' : `${list.length} contacts exported`,
        basename(target),
      );
    } catch (error) {
      notify('Could not write the file', reason(error));
    }
  }, [pick, kernel.home, vfs, notify, latest]);

  const pickPhoto = useCallback(async () => {
    const target = await pick({
      mode: 'open',
      title: 'Choose Photo',
      extensions: PHOTO_TYPES,
      startDir: join(kernel.home, 'Pictures'),
    });
    if (typeof target !== 'string') return;
    setDraft((current) => (current ? { ...current, photo: target } : current));
  }, [pick, kernel.home]);

  const find = useCallback(() => {
    setPane('list');
    searchInput.current?.focus();
    searchInput.current?.select();
  }, []);

  const mergePile = useCallback(
    (group: DuplicateGroup) => {
      const keep = mergeAll(group.contacts, Date.now());
      if (!keep) return;
      dispatch({
        type: 'replace',
        keep,
        drop: group.contacts.map((contact) => contact.id).filter((id) => id !== keep.id),
      });
      setSelectedId(keep.id);
      setDuplicates((current) => current?.filter((pile) => pile.id !== group.id) ?? null);
    },
    [dispatch],
  );

  // A `.vcf` opened from Files or the Terminal lands here as a launch
  // argument; a singleton window may be asked more than once.
  const importedPath = useRef<string | null>(null);
  useEffect(() => {
    const path = args.path;
    if (!path || !loaded || importedPath.current === path) return;
    importedPath.current = path;
    void importFrom(path);
  }, [args.path, loaded, importFrom]);

  const confirmDiscard = useCallback(async () => {
    const name = draft ? displayName(draft) || 'This contact' : 'This contact';
    return dialogs.confirm({
      title: 'Discard changes?',
      message: `${name} has edits that have not been saved.`,
      confirmLabel: 'Discard',
      danger: true,
    });
  }, [dialogs, draft]);

  useCloseGuard(dirty ? confirmDiscard : null);

  // Escape leaves the card on a folded window; while editing it is the menu's
  // Discard command instead, so the two never fight over the key.
  useShortcut(
    'Escape',
    () => setPane('list'),
    !layout.split && view === 'detail' && draft === null,
  );

  const commands = useLatest({
    startNew,
    importVcard,
    exportVcard,
    close,
    find,
    startEdit,
    save,
    cancelEdit,
    removeContact,
    toggleFavourite,
    openDuplicates: () => setDuplicates(findDuplicates(latest.current.contacts)),
    setSort: (sort: ContactsPrefs['sort']) => setPrefs({ sort }),
    toggleGroups: () => setPrefs({ showGroups: !latest.current.prefs.showGroups }),
  });

  useAppMenus(
    buildContactsMenus(
      {
        sort: prefs.sort,
        showGroups: prefs.showGroups,
        hasSelection: selected !== null,
        isFavourite: selected?.favourite ?? false,
        editing: draft !== null,
      },
      {
        newContact: () => commands.current.startNew(),
        importVcard: () => void commands.current.importVcard(),
        exportVcard: () => void commands.current.exportVcard(),
        close: () => commands.current.close(),
        find: () => commands.current.find(),
        editContact: () => commands.current.startEdit(),
        saveContact: () => commands.current.save(),
        cancelEdit: () => commands.current.cancelEdit(),
        deleteContact: () => void commands.current.removeContact(),
        toggleFavourite: () => commands.current.toggleFavourite(),
        findDuplicates: () => commands.current.openDuplicates(),
        setSort: (sort) => commands.current.setSort(sort),
        toggleGroups: () => commands.current.toggleGroups(),
      },
    ),
    [prefs.sort, prefs.showGroups, selected?.id, selected?.favourite, draft !== null],
  );

  const total = contacts.length;
  const listed = hits.length;

  return (
    <div ref={root} className="flex h-full min-h-0 w-full">
      <AppFrame
        toolbar={
          <Toolbar dense>
            {layout.canSidebar && (
              <IconButton
                size="sm"
                label="Groups sidebar"
                active={prefs.showGroups}
                onClick={() => commands.current.toggleGroups()}
              >
                <PanelLeft />
              </IconButton>
            )}
            <IconButton size="sm" label="New contact" onClick={() => commands.current.startNew()}>
              <UserPlus />
            </IconButton>
            <div className="ml-auto min-w-0 max-w-64 flex-1">
              <SearchField
                ref={searchInput}
                size="sm"
                placeholder="Search"
                aria-label="Search contacts"
                value={query}
                onChange={setQuery}
              />
            </div>
          </Toolbar>
        }
        sidebar={
          layout.sidebar ? (
            <GroupsSidebar
              groups={groups}
              selected={prefs.group}
              total={total}
              favourites={favourites}
              onSelect={(group) => {
                setPrefs({ group });
                setPane('list');
              }}
            />
          ) : undefined
        }
        statusBar={
          <>
            <span className="tabular-nums">
              {listed === total ? plural(total) : `${listed} of ${plural(total)}`}
            </span>
            {selected && (
              <span className="truncate-1 text-ink-3">{displayName(selected) || 'No name'}</span>
            )}
          </>
        }
      >
        <div className="flex min-h-0 min-w-0 flex-1">
          {showList && (
            <div
              className={cx(
                'flex min-h-0 min-w-0 flex-col',
                layout.split ? 'shrink-0 border-r border-rule' : 'flex-1',
              )}
              style={layout.split ? { width: layout.listWidth } : undefined}
            >
              <ContactList
                sections={sections}
                selectedId={selectedId}
                meId={prefs.meId}
                fields={fields}
                searching={query.trim() !== ''}
                rail={layout.rail}
                openOnSelect={!layout.split}
                onSelect={setSelectedId}
                onOpen={(id) => {
                  setSelectedId(id);
                  setPane('detail');
                }}
              />
            </div>
          )}

          {showDetail && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
              {draft !== null ? (
                <ContactEditor
                  key={draft.id}
                  draft={draft}
                  isNew={creating}
                  narrow={!layout.split}
                  onChange={setDraft}
                  onSave={save}
                  onCancel={cancelEdit}
                  onPickPhoto={() => void pickPhoto()}
                />
              ) : selected ? (
                <ContactDetail
                  contact={selected}
                  isMe={selected.id === prefs.meId}
                  locale={locale}
                  showBack={!layout.split}
                  onBack={() => setPane('list')}
                  onEdit={startEdit}
                  onToggleFavourite={toggleFavourite}
                  onOpenUrl={(url) => launch('lumen.browser', { url })}
                />
              ) : (
                <EmptyState
                  icon={<Users className="size-5" />}
                  title="No contact selected"
                  description="Pick a name from the list, or make a new card."
                  action={
                    <Button size="sm" onClick={() => commands.current.startNew()}>
                      New Contact
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </div>
      </AppFrame>

      <DuplicatesDialog
        open={duplicates !== null}
        groups={duplicates ?? []}
        container={container}
        onMerge={mergePile}
        onClose={() => setDuplicates(null)}
      />
    </div>
  );
}

function plural(count: number): string {
  return count === 1 ? '1 contact' : `${count} contacts`;
}
