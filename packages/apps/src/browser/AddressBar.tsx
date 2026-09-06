import { cx, Spinner, VisuallyHidden } from '@lumen/ui';
import { Bookmark, Clock, Globe, Lock, Search, ShieldOff } from 'lucide-react';
import type { KeyboardEvent, RefObject } from 'react';
import { useId, useMemo, useState } from 'react';
import type { Bookmark as BookmarkEntry, Suggestion } from './data';
import { buildSuggestions } from './data';
import type { Visit } from './history';
import type { TabStatus } from './tabs';
import { displayUrl, resolveInput, type SearchEngine, START_URL, securityOf } from './url';

export interface AddressBarProps {
  url: string;
  status: TabStatus;
  engine: SearchEngine;
  bookmarks: readonly BookmarkEntry[];
  history: readonly Visit[];
  onNavigate: (url: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

const SECURITY = {
  secure: { icon: Lock, text: 'Encrypted connection' },
  insecure: { icon: ShieldOff, text: 'Connection is not encrypted' },
  internal: { icon: Globe, text: 'A page inside Lumen' },
} as const;

const KIND_ICONS = {
  navigate: Globe,
  search: Search,
  bookmark: Bookmark,
  history: Clock,
} as const;

/**
 * The address bar: an ARIA combobox over history, bookmarks and a search
 * row. Typing filters; Enter goes to the highlighted row, or to whatever the
 * text resolves to.
 */
export function AddressBar({
  url,
  status,
  engine,
  bookmarks,
  history,
  onNavigate,
  inputRef,
}: AddressBarProps) {
  const listId = useId();
  /** null while the bar shows the current page rather than something typed. */
  const [draft, setDraft] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const editing = draft !== null;

  const rows = useMemo<Suggestion[]>(
    () => (editing ? buildSuggestions(draft, { bookmarks, history, engine }) : []),
    [editing, draft, bookmarks, history, engine],
  );
  const open = editing && rows.length > 0;
  const security = SECURITY[securityOf(url)];
  const SecurityIcon = security.icon;
  const activeRow = active >= 0 ? rows[active] : undefined;

  const go = (target: string) => {
    setDraft(null);
    setActive(-1);
    inputRef.current?.blur();
    onNavigate(target);
  };

  const submit = () => {
    if (activeRow) {
      go(activeRow.url);
      return;
    }
    const resolved = resolveInput(draft ?? '', engine);
    if (resolved) go(resolved.url);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => (rows.length === 0 ? -1 : Math.min(rows.length - 1, i + 1)));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => Math.max(-1, i - 1));
        break;
      case 'Enter':
        e.preventDefault();
        submit();
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        setDraft(null);
        setActive(-1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <div className="lumen-control flex h-7 items-center gap-1.5 px-2 focus-within:border-accent">
        <span className="shrink-0 text-ink-3" title={`${security.text} · ${url}`}>
          <SecurityIcon className="size-3.5" aria-hidden />
          <VisuallyHidden>{security.text}</VisuallyHidden>
        </span>
        <input
          ref={inputRef}
          // The ARIA 1.2 combobox pattern: the input owns the role, the
          // listbox below is referenced by aria-controls, and the highlighted
          // row is named by aria-activedescendant while focus stays here.
          role="combobox"
          aria-label="Address and search"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeRow ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={draft ?? displayUrl(url)}
          placeholder={`Search ${engine.name} or enter an address`}
          onChange={(e) => {
            setDraft(e.target.value);
            setActive(e.target.value.trim() ? 0 : -1);
          }}
          onFocus={(e) => {
            setDraft(url === START_URL ? '' : url);
            setActive(-1);
            requestAnimationFrame(() => e.target.select());
          }}
          onBlur={() => {
            setDraft(null);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          className="mono min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:font-sans placeholder:text-ink-3"
        />
        {status === 'loading' && <Spinner size={12} className="shrink-0" />}
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="lumen-scroll absolute top-full right-0 left-0 z-30 mt-1 max-h-80 rounded-md border border-rule bg-surface p-1 shadow-lg"
        >
          {rows.map((row, i) => {
            const Icon = KIND_ICONS[row.kind];
            const highlighted = i === active;
            return (
              // biome-ignore lint/a11y/useFocusableInteractive: the input keeps focus; the listbox is driven by aria-activedescendant
              <li
                key={row.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={highlighted}
                onPointerEnter={() => setActive(i)}
                onPointerDown={(e) => {
                  // keep focus so the blur handler does not discard the row first
                  e.preventDefault();
                  go(row.url);
                }}
                className={cx(
                  'flex cursor-default items-center gap-2.5 rounded-sm px-2 py-1.5',
                  highlighted ? 'bg-accent text-accent-ink' : 'text-ink',
                )}
              >
                <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
                <span className="truncate-1 flex-1 text-base">{row.label}</span>
                <span
                  className={cx(
                    'mono truncate-1 max-w-[45%] text-xs',
                    highlighted ? 'text-accent-ink/75' : 'text-ink-3',
                  )}
                >
                  {row.detail}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
