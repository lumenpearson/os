/**
 * The list pane: the book cut into A–Z sections, with the index rail beside it
 * when the window is wide enough to hold one.
 *
 * Arrow keys move the selection and carry focus with it, so the list behaves
 * like one control rather than a few hundred tab stops: only the selected row
 * is in the tab order.
 */

import { cx, EmptyState } from '@lumen/ui';
import { Star, UserSearch } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Contact } from './contact';
import { FIELD_LABELS, type MatchField } from './search';
import { type ContactSection, displayName, SECTION_LETTERS, sectionsPresent } from './sort';

export interface ContactListProps {
  sections: ContactSection[];
  selectedId: string | null;
  /** The card that is the signed-in user. */
  meId: string | null;
  /** Which field each contact matched on, while a search is running. */
  fields: Map<string, MatchField>;
  searching: boolean;
  rail: boolean;
  /** A folded window has nowhere to show a selection, so a click opens. */
  openOnSelect: boolean;
  onSelect: (id: string) => void;
  /** Enter, or a click on a folded window: show the card. */
  onOpen: (id: string) => void;
}

export function ContactList({
  sections,
  selectedId,
  meId,
  fields,
  searching,
  rail,
  openOnSelect,
  onSelect,
  onOpen,
}: ContactListProps) {
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const headers = useRef(new Map<string, HTMLLIElement>());

  const order = useMemo(() => sections.flatMap((section) => section.contacts), [sections]);
  const present = useMemo(() => sectionsPresent(sections), [sections]);
  const tabbableId = selectedId ?? order[0]?.id ?? null;

  // A selection made elsewhere — a new card, an import, the menubar — has to
  // come into view here.
  useEffect(() => {
    if (!selectedId) return;
    rows.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const move = useCallback(
    (delta: number | 'first' | 'last') => {
      if (order.length === 0) return;
      const at = order.findIndex((contact) => contact.id === selectedId);
      const next =
        delta === 'first'
          ? 0
          : delta === 'last'
            ? order.length - 1
            : Math.min(order.length - 1, Math.max(0, (at < 0 ? 0 : at) + delta));
      const contact = order[next];
      if (!contact) return;
      onSelect(contact.id);
      rows.current.get(contact.id)?.focus();
    },
    [order, selectedId, onSelect],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        move('first');
        break;
      case 'End':
        event.preventDefault();
        move('last');
        break;
      case 'PageDown':
        event.preventDefault();
        move(10);
        break;
      case 'PageUp':
        event.preventDefault();
        move(-10);
        break;
      default:
        break;
    }
  };

  if (order.length === 0) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <EmptyState
          icon={<UserSearch className="size-5" />}
          title={searching ? 'No contacts match' : 'No contacts yet'}
          description={
            searching
              ? 'Nothing on any card matches what you typed.'
              : 'Make one with New Contact, or import a vCard.'
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="lumen-scroll min-w-0 flex-1">
        <ul aria-label="Contacts" onKeyDown={onKeyDown}>
          {sections.map((section) => (
            <li
              key={section.letter}
              ref={(element) => {
                if (element) headers.current.set(section.letter, element);
                else headers.current.delete(section.letter);
              }}
            >
              <h3 className="mono sticky top-0 z-10 border-b border-rule bg-canvas px-3 py-1 text-2xs text-ink-3">
                {section.letter}
              </h3>
              <ul>
                {section.contacts.map((contact) => (
                  <li key={contact.id}>
                    <Row
                      contact={contact}
                      selected={contact.id === selectedId}
                      tabbable={contact.id === tabbableId}
                      isMe={contact.id === meId}
                      openOnSelect={openOnSelect}
                      field={searching ? fields.get(contact.id) : undefined}
                      onSelect={onSelect}
                      onOpen={onOpen}
                      register={(element) => {
                        if (element) rows.current.set(contact.id, element);
                        else rows.current.delete(contact.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      {rail && (
        <nav
          aria-label="Jump to letter"
          className="flex shrink-0 flex-col justify-center gap-px border-l border-rule px-0.5 py-1"
        >
          {SECTION_LETTERS.map((letter) => (
            <button
              key={letter}
              type="button"
              disabled={!present.has(letter)}
              onClick={() => headers.current.get(letter)?.scrollIntoView({ block: 'start' })}
              className={cx(
                'mono h-3 w-4 rounded-xs text-center text-2xs leading-3 lumen-focus',
                'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
                present.has(letter)
                  ? 'text-ink-2 hover:bg-surface-2 hover:text-accent'
                  : 'text-ink-3 opacity-40',
              )}
            >
              {letter}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

interface RowProps {
  contact: Contact;
  selected: boolean;
  tabbable: boolean;
  isMe: boolean;
  openOnSelect: boolean;
  field: MatchField | undefined;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  register: (element: HTMLButtonElement | null) => void;
}

/** The second line: why this card matched, or who it is. */
function subtitle(contact: Contact, field: MatchField | undefined): string {
  if (field && field !== 'name') return `in ${FIELD_LABELS[field]}`;
  if (contact.organisation !== '') return contact.organisation;
  if (contact.title !== '') return contact.title;
  return contact.emails[0]?.value ?? '';
}

function Row({
  contact,
  selected,
  tabbable,
  isMe,
  openOnSelect,
  field,
  onSelect,
  onOpen,
  register,
}: RowProps) {
  const name = displayName(contact);
  const second = subtitle(contact, field);
  const matched = field !== undefined && field !== 'name';

  return (
    <button
      ref={register}
      type="button"
      tabIndex={tabbable ? 0 : -1}
      aria-current={selected ? 'true' : undefined}
      onClick={() => (openOnSelect ? onOpen(contact.id) : onSelect(contact.id))}
      onDoubleClick={() => onOpen(contact.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onOpen(contact.id);
        }
      }}
      className={cx(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left lumen-focus',
        'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
        selected ? 'bg-selection' : 'hover:bg-surface-2',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate-1 text-base text-ink">
          {name || <span className="text-ink-3">No name</span>}
        </span>
        {second !== '' && (
          <span className={cx('truncate-1 text-sm text-ink-3', matched && 'mono text-2xs')}>
            {second}
          </span>
        )}
      </span>
      {isMe && <span className="mono shrink-0 text-2xs text-ink-3">Me</span>}
      {contact.favourite && <Star aria-hidden className="size-3 shrink-0 text-accent" />}
    </button>
  );
}
