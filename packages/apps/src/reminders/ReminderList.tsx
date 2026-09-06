import { EmptyState } from '@lumen/ui';
import { ListChecks } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { type DateKey, type FormatOptions, formatDayHeading, relativeDayLabel } from './date';
import { CONTENT_MAX_WIDTH } from './layout';
import { ReminderRow } from './ReminderRow';
import type { Section } from './smart';
import type { Reminder } from './store';

export interface ReminderListProps {
  sections: Section[];
  focusId: string | null;
  /** The row Tab lands on when nothing has been focused yet. */
  firstId: string | null;
  today: DateKey;
  o: FormatOptions;
  listNameOf: (item: Reminder) => string | null;
  emptyMessage: string;
  onFocusRow: (id: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onToggleCompleted: (item: Reminder) => void;
  onToggleFlagged: (item: Reminder) => void;
  onOpen: (item: Reminder) => void;
}

function sectionTitle(date: DateKey, today: DateKey, o: FormatOptions): string {
  const relative = relativeDayLabel(date, today);
  const heading = formatDayHeading(date, today, o);
  return relative ? `${relative} · ${heading}` : heading;
}

/** The reminders of the selected list, grouped where the list groups them. */
export function ReminderList({
  sections,
  focusId,
  firstId,
  today,
  o,
  listNameOf,
  emptyMessage,
  onFocusRow,
  onKeyDown,
  onToggleCompleted,
  onToggleFlagged,
  onOpen,
}: ReminderListProps) {
  if (sections.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks />}
        title={emptyMessage}
        description="Type in the field above to add one."
      />
    );
  }
  return (
    <div className="px-2 py-2">
      <div
        role="listbox"
        aria-label="Reminders"
        onKeyDown={onKeyDown}
        className="mx-auto w-full"
        style={{ maxWidth: CONTENT_MAX_WIDTH }}
      >
        {sections.map((section) => (
          <section
            key={section.id}
            role={section.date ? 'group' : undefined}
            aria-label={section.date ? sectionTitle(section.date, today, o) : undefined}
          >
            {/* The group carries the same words as its accessible name, so
                this one is for the eye only. */}
            {section.date && (
              <div
                aria-hidden
                className="mono px-2 pb-1 pt-3 text-2xs uppercase tracking-[0.08em] text-ink-3"
              >
                {sectionTitle(section.date, today, o)}
              </div>
            )}
            {section.rows.map((row) => (
              <ReminderRow
                key={row.item.id}
                row={row}
                focused={row.item.id === focusId}
                tabbable={row.item.id === (focusId ?? firstId)}
                listName={listNameOf(row.item)}
                today={today}
                o={o}
                onFocus={() => onFocusRow(row.item.id)}
                onToggleCompleted={() => onToggleCompleted(row.item)}
                onToggleFlagged={() => onToggleFlagged(row.item)}
                onOpen={() => onOpen(row.item)}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
