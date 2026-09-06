import { Input, Label } from '@lumen/ui';
import { Search } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { formatRelative } from '../../_sdk';
import type { Bookmark } from '../data';
import { uniqueByUrl, type Visit } from '../history';
import { displayUrl, resolveInput, type SearchEngine, tabInitial } from '../url';

export interface StartProps {
  bookmarks: readonly Bookmark[];
  history: readonly Visit[];
  engine: SearchEngine;
  onNavigate: (url: string) => void;
}

const MAX_FAVORITES = 12;
const MAX_RECENT = 6;

/**
 * The new-tab page: one field, the pages kept on purpose, then the pages
 * passed through. Nothing else — this screen is seen more often than any
 * other in the app.
 */
export function Start({ bookmarks, history, engine, onNavigate }: StartProps) {
  const [query, setQuery] = useState('');
  const favorites = bookmarks.slice(0, MAX_FAVORITES);
  const recent = uniqueByUrl(history, MAX_RECENT);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const resolved = resolveInput(query, engine);
    if (!resolved) return;
    setQuery('');
    onNavigate(resolved.url);
  };

  return (
    <div className="lumen-scroll h-full bg-surface">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-8 pt-16 pb-12">
        <form onSubmit={submit}>
          <Input
            size="lg"
            leading={<Search />}
            type="text"
            spellCheck={false}
            autoComplete="off"
            aria-label={`Search ${engine.name} or enter an address`}
            placeholder={`Search ${engine.name} or enter an address`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>

        <section className="flex flex-col gap-3">
          <h2>
            <Label>Bookmarks</Label>
          </h2>
          {favorites.length === 0 ? (
            <p className="text-base text-ink-3">Star a page to keep it here.</p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
              {favorites.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    title={b.url}
                    onClick={() => onNavigate(b.url)}
                    className="flex w-full flex-col items-center gap-2 rounded-md border border-rule bg-surface p-3 text-ink transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:bg-surface-2 lumen-focus"
                  >
                    <span
                      aria-hidden
                      className="mono flex size-9 items-center justify-center rounded-sm bg-surface-3 text-md text-ink-2"
                    >
                      {tabInitial(b.url)}
                    </span>
                    <span className="w-full truncate-1 text-center text-sm">
                      {b.title || displayUrl(b.url)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2>
            <Label>Recent</Label>
          </h2>
          {recent.length === 0 ? (
            <p className="text-base text-ink-3">Pages you visit show up here.</p>
          ) : (
            <ul className="flex flex-col">
              {recent.map((v) => {
                const address = displayUrl(v.url);
                const label = v.title || address;
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      title={v.url}
                      onClick={() => onNavigate(v.url)}
                      className="flex w-full items-baseline gap-3 rounded-sm px-2 py-1.5 text-left transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:bg-surface-2 lumen-focus"
                    >
                      <span className="min-w-0 flex-1 truncate-1 text-base text-ink">{label}</span>
                      {/* The title of a framed page is its host, so the address
                          is only worth repeating when it says something more. */}
                      {address !== label && (
                        <span className="mono max-w-[38%] truncate-1 text-xs text-ink-3">
                          {address}
                        </span>
                      )}
                      <span className="mono shrink-0 text-xs text-ink-3 tabular-nums">
                        {formatRelative(v.visitedAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
