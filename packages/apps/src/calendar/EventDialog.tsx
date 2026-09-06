/**
 * The event editor. Every field edits the draft, and the draft is only turned
 * into an event when Save is pressed — so a half-typed time never reaches the
 * store, and the first thing wrong with the draft is named next to the field
 * that owns it rather than in a banner at the top.
 */

import { Button, Checkbox, cx, Dialog, Field, Input, Select, TextArea } from '@lumen/ui';
import { useId, useState } from 'react';
import { type DateKey, type FirstDay, weekdayOrder } from './dates';
import {
  crossesMidnight,
  type DraftError,
  draftRecurrence,
  draftToInput,
  type EndsChoice,
  type EventDraft,
  type RepeatChoice,
  toggleWeekday,
} from './draft';
import { SWATCH_CLASS } from './EventChip';
import { COLOR_LABELS, EVENT_COLORS, type EventColor, type EventInput } from './events';
import { type FormatOptions, formatMediumDate, weekdayHeaders } from './format';
import { describeRecurrence } from './recurrence';

const REPEAT_OPTIONS: ReadonlyArray<{ value: RepeatChoice; label: string }> = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const ENDS_OPTIONS: ReadonlyArray<{ value: EndsChoice; label: string }> = [
  { value: 'never', label: 'Never' },
  { value: 'on', label: 'On a date' },
  { value: 'after', label: 'After a number of times' },
];

export interface EventDialogProps {
  open: boolean;
  /** Null while closed; the draft being edited otherwise. */
  draft: EventDraft | null;
  firstDay: FirstDay;
  o: FormatOptions;
  container: HTMLElement | null;
  onChange: (draft: EventDraft) => void;
  onSave: (input: EventInput, id: string | null) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function EventDialog({
  open,
  draft,
  firstDay,
  o,
  container,
  onChange,
  onSave,
  onDelete,
  onClose,
}: EventDialogProps) {
  const [error, setError] = useState<DraftError | null>(null);
  const id = useId();

  if (!draft) return null;

  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    setError(null);
    onChange({ ...draft, [key]: value });
  };

  const save = () => {
    const result = draftToInput(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSave(result.input, draft.id);
  };

  // The rule as it currently reads, so the repeat field says what it will do
  // before the event is saved. A rule that does not parse yet says nothing —
  // the error under the field is the message that matters.
  const rule = draftRecurrence(draft);
  const summary =
    rule !== null && !('field' in rule)
      ? describeRecurrence(rule, draft.date, {
          // Sunday-first, because the summary indexes these by weekday number.
          weekdays: weekdayHeaders(0, o),
          formatDate: (date: DateKey) => formatMediumDate(date, o),
        })
      : null;

  const dayNames = weekdayHeaders(firstDay, o);

  const errorFor = (field: DraftError['field']) =>
    error?.field === field ? error.message : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      container={container}
      width={480}
      title={draft.id ? 'Edit event' : 'New event'}
      actions={
        <>
          {draft.id && (
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              onClick={() => onDelete(draft.id as string)}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Title" htmlFor={`${id}-title`} error={errorFor('title')}>
          <Input
            id={`${id}-title`}
            data-autofocus
            value={draft.title}
            placeholder="New Event"
            onChange={(event) => set('title', event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              save();
            }}
          />
        </Field>

        <Checkbox
          label="All day"
          checked={draft.allDay}
          onChange={(event) => set('allDay', event.target.checked)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={draft.allDay ? 'Starts' : 'Date'}
            htmlFor={`${id}-date`}
            error={errorFor('date')}
          >
            <Input
              id={`${id}-date`}
              type="date"
              mono
              value={draft.date}
              onChange={(event) => set('date', event.target.value)}
            />
          </Field>
          {draft.allDay ? (
            <Field label="Ends" htmlFor={`${id}-end-date`}>
              <Input
                id={`${id}-end-date`}
                type="date"
                mono
                value={draft.endDate}
                onChange={(event) => set('endDate', event.target.value)}
              />
            </Field>
          ) : (
            <Field
              label="Time"
              htmlFor={`${id}-start-time`}
              error={errorFor('time')}
              hint={crossesMidnight(draft) ? 'Runs into the next day.' : undefined}
            >
              <div className="flex items-center gap-2">
                <Input
                  id={`${id}-start-time`}
                  type="time"
                  mono
                  aria-label="Start time"
                  value={draft.start}
                  onChange={(event) => set('start', event.target.value)}
                />
                <span aria-hidden className="text-ink-3">
                  –
                </span>
                <Input
                  type="time"
                  mono
                  aria-label="End time"
                  value={draft.end}
                  onChange={(event) => set('end', event.target.value)}
                />
              </div>
            </Field>
          )}
        </div>

        <Field label="Location" htmlFor={`${id}-location`}>
          <Input
            id={`${id}-location`}
            value={draft.location}
            placeholder="Where"
            onChange={(event) => set('location', event.target.value)}
          />
        </Field>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm text-ink-2">Colour</legend>
          <div className="flex items-center gap-1.5">
            {EVENT_COLORS.map((colour) => (
              <button
                key={colour}
                type="button"
                aria-pressed={draft.color === colour}
                title={COLOR_LABELS[colour]}
                onClick={() => set('color', colour as EventColor)}
                className={cx(
                  'size-5 rounded-xs border lumen-focus',
                  SWATCH_CLASS[colour],
                  draft.color === colour && 'outline-2 outline-offset-1 outline-accent',
                )}
              >
                <span className="sr-only">{COLOR_LABELS[colour]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <Field
          label="Repeat"
          htmlFor={`${id}-repeat`}
          error={errorFor('repeat')}
          hint={summary ?? undefined}
        >
          <Select
            id={`${id}-repeat`}
            options={REPEAT_OPTIONS}
            value={draft.repeat}
            onChange={(value) => set('repeat', value as RepeatChoice)}
          />
        </Field>

        {draft.repeat !== 'none' && (
          <div className="flex flex-col gap-3 border-l border-rule pl-3">
            <Field label="Every" htmlFor={`${id}-interval`} inline>
              <Input
                id={`${id}-interval`}
                type="number"
                min={1}
                mono
                className="w-20"
                value={draft.interval}
                onChange={(event) => set('interval', event.target.value)}
              />
            </Field>

            {draft.repeat === 'weekly' && (
              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-sm text-ink-2">On</legend>
                <div className="flex gap-1">
                  {weekdayOrder(firstDay).map((day, index) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={draft.weekdays.includes(day)}
                      onClick={() => set('weekdays', toggleWeekday(draft.weekdays, day))}
                      className={cx(
                        'mono h-6 min-w-8 rounded-xs border px-1 text-xs lumen-focus',
                        draft.weekdays.includes(day)
                          ? 'border-transparent bg-accent text-accent-ink'
                          : 'border-rule-strong bg-surface text-ink-2',
                      )}
                    >
                      {dayNames[index]}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <Field label="Ends" htmlFor={`${id}-ends`}>
              <Select
                id={`${id}-ends`}
                options={ENDS_OPTIONS}
                value={draft.ends}
                onChange={(value) => set('ends', value as EndsChoice)}
              />
            </Field>

            {draft.ends === 'on' && (
              <Field label="End date" htmlFor={`${id}-until`}>
                <Input
                  id={`${id}-until`}
                  type="date"
                  mono
                  value={draft.until}
                  onChange={(event) => set('until', event.target.value)}
                />
              </Field>
            )}
            {draft.ends === 'after' && (
              <Field label="Times" htmlFor={`${id}-count`}>
                <Input
                  id={`${id}-count`}
                  type="number"
                  min={1}
                  mono
                  className="w-24"
                  value={draft.count}
                  onChange={(event) => set('count', event.target.value)}
                />
              </Field>
            )}
          </div>
        )}

        <Field label="Notes" htmlFor={`${id}-notes`}>
          <TextArea
            id={`${id}-notes`}
            rows={3}
            value={draft.notes}
            onChange={(event) => set('notes', event.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
