import {
  Button,
  Checkbox,
  Dialog,
  Field,
  Input,
  SegmentedControl,
  Select,
  TextArea,
} from '@lumen/ui';
import { useId, useState } from 'react';
import { fromTimeValue, isDateKey, toTimeValue } from './date';
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  type Frequency,
  MAX_INTERVAL,
  PRIORITIES,
  PRIORITY_LABELS,
  type Priority,
  type Reminder,
  type ReminderList,
  type ReminderPatch,
} from './store';

export interface DetailsDialogProps {
  item: Reminder;
  lists: ReminderList[];
  container: HTMLElement | null;
  onClose: () => void;
  onSave: (patch: ReminderPatch, listId: string) => void;
  onDelete: () => void;
}

type RepeatChoice = 'none' | Frequency;

/** Everything about one reminder that does not fit on its row. */
export function DetailsDialog({
  item,
  lists,
  container,
  onClose,
  onSave,
  onDelete,
}: DetailsDialogProps) {
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes);
  const [due, setDue] = useState(item.due ?? '');
  const [time, setTime] = useState(item.dueTime === null ? '' : toTimeValue(item.dueTime));
  const [priority, setPriority] = useState<Priority>(item.priority);
  const [flagged, setFlagged] = useState(item.flagged);
  const [repeat, setRepeat] = useState<RepeatChoice>(item.repeat?.freq ?? 'none');
  const [interval, setInterval] = useState(String(item.repeat?.interval ?? 1));
  const [listId, setListId] = useState(item.listId);
  const id = useId();

  const dated = isDateKey(due);
  const every = Math.min(MAX_INTERVAL, Math.max(1, Math.floor(Number(interval) || 1)));

  const save = () => {
    onSave(
      {
        title,
        notes,
        due: dated ? due : null,
        dueTime: dated ? fromTimeValue(time) : null,
        priority,
        flagged,
        repeat: dated && repeat !== 'none' ? { freq: repeat, interval: every } : null,
      },
      listId,
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Reminder"
      width={460}
      container={container}
      actions={
        <>
          <Button variant="ghost" className="mr-auto text-danger" onClick={onDelete}>
            Delete
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3 pb-1"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Field label="Title" htmlFor={`${id}-title`}>
          <Input
            id={`${id}-title`}
            data-autofocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Notes" htmlFor={`${id}-notes`}>
          <TextArea
            id={`${id}-notes`}
            value={notes}
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-16"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due" htmlFor={`${id}-due`}>
            <Input
              id={`${id}-due`}
              type="date"
              mono
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
          <Field
            label="Time"
            htmlFor={`${id}-time`}
            hint={dated ? undefined : 'A time needs a date.'}
          >
            <Input
              id={`${id}-time`}
              type="time"
              mono
              value={time}
              disabled={!dated}
              onChange={(e) => setTime(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Repeat" htmlFor={`${id}-repeat`}>
          <div className="flex items-center gap-2">
            <Select<RepeatChoice>
              id={`${id}-repeat`}
              value={repeat}
              disabled={!dated}
              onChange={setRepeat}
              options={[
                { value: 'none', label: 'Never' },
                ...FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] })),
              ]}
            />
            {repeat !== 'none' && dated && (
              <>
                <label htmlFor={`${id}-interval`} className="text-base text-ink-2">
                  every
                </label>
                <Input
                  id={`${id}-interval`}
                  type="number"
                  min={1}
                  max={MAX_INTERVAL}
                  mono
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  className="w-16 tabular-nums"
                />
              </>
            )}
          </div>
        </Field>
        <Field label="Priority">
          <SegmentedControl<Priority>
            aria-label="Priority"
            value={priority}
            onChange={setPriority}
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
          />
        </Field>
        <Field label="List" htmlFor={`${id}-list`}>
          <Select
            id={`${id}-list`}
            value={listId}
            onChange={setListId}
            options={lists.map((l) => ({ value: l.id, label: l.name }))}
          />
        </Field>
        <Checkbox
          label="Flagged"
          checked={flagged}
          onChange={(e) => setFlagged(e.target.checked)}
        />
        <button type="submit" className="hidden" aria-hidden tabIndex={-1}>
          Save
        </button>
      </form>
    </Dialog>
  );
}
