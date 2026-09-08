import { useT } from '@lumen/kernel/react';
import { Button, EmptyState, IconButton, SearchField, SettingsPage, useDialogs } from '@lumen/ui';
import { Pencil, Plus, Star, X } from 'lucide-react';
import { useState } from 'react';
import { formatDate } from '../../_sdk';
import type { Bookmark } from '../data';
import { displayUrl, resolveInput, type SearchEngine, titleFor } from '../url';

export interface LibraryProps {
  bookmarks: readonly Bookmark[];
  engine: SearchEngine;
  onNavigate: (url: string) => void;
  onAdd: (url: string, title: string) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
}

function matchesQuery(bookmark: Bookmark, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return bookmark.title.toLowerCase().includes(q) || bookmark.url.toLowerCase().includes(q);
}

/** The bookmark list, where they are named, reopened and thrown away. */
export function Library({
  bookmarks,
  engine,
  onNavigate,
  onAdd,
  onRename,
  onRemove,
}: LibraryProps) {
  const t = useT();
  const dialogs = useDialogs();
  const [query, setQuery] = useState('');
  const shown = bookmarks.filter((b) => matchesQuery(b, query));

  const add = async () => {
    const typed = await dialogs.prompt({
      title: t('browserApp.addBookmark'),
      message: t('browserApp.addressToKeep'),
      placeholder: t('browserApp.examplePage'),
      mono: true,
      confirmLabel: t('browserApp.add'),
      validate: (value) => (value.trim() ? null : 'Type an address.'),
    });
    if (typed === null) return;
    const resolved = resolveInput(typed, engine);
    if (!resolved) return;
    onAdd(resolved.url, titleFor(resolved.url));
  };

  const rename = async (bookmark: Bookmark) => {
    const next = await dialogs.prompt({
      title: t('browserApp.renameBookmark'),
      defaultValue: bookmark.title,
      placeholder: titleFor(bookmark.url),
      confirmLabel: t('browserApp.rename'),
      validate: (value) => (value.trim() ? null : 'A bookmark needs a name.'),
    });
    if (next === null) return;
    onRename(bookmark.id, next);
  };

  if (bookmarks.length === 0) {
    return (
      <EmptyState
        icon={<Star />}
        title={t('browserApp.noBookmarks')}
        description={t('browserApp.bookmarksHint')}
        action={
          <Button icon={<Plus />} onClick={() => void add()}>
            {t('browserApp.addBookmarkButton')}
          </Button>
        }
      />
    );
  }

  return (
    <SettingsPage title={t('browserApp.bookmarks')}>
      <div className="flex items-center gap-2">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t('browserApp.searchBookmarks')}
          aria-label={t('browserApp.searchBookmarks')}
          className="flex-1"
        />
        <Button icon={<Plus />} onClick={() => void add()}>
          {t('browserApp.add')}
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="text-base text-ink-2">
          {t('browserApp.noBookmarkMatch', { query: query.trim() })}
        </p>
      ) : (
        <ul className="divide-y divide-rule rounded-md border border-rule bg-surface">
          {shown.map((b) => {
            const address = displayUrl(b.url);
            const name = b.title || address;
            return (
              <li key={b.id} className="group flex items-center gap-3 px-3 py-2">
                <button
                  type="button"
                  title={b.url}
                  onClick={() => onNavigate(b.url)}
                  className="min-w-0 flex-1 rounded-xs text-left lumen-focus"
                >
                  <span className="block truncate-1 text-base text-ink">{name}</span>
                  {address !== name && (
                    <span className="mono block truncate-1 text-xs text-ink-3">{address}</span>
                  )}
                </button>
                {b.addedAt > 0 && (
                  <span className="mono shrink-0 text-xs text-ink-3 tabular-nums">
                    {formatDate(b.addedAt, 'short')}
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-(--duration-fast) ease-(--ease-standard) group-hover:opacity-100 group-focus-within:opacity-100">
                  <IconButton label={`Rename ${name}`} size="sm" onClick={() => void rename(b)}>
                    <Pencil />
                  </IconButton>
                  <IconButton label={`Remove ${name}`} size="sm" onClick={() => onRemove(b.id)}>
                    <X />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsPage>
  );
}
