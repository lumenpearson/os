/**
 * What looks like the same person twice. Each pile says why it was gathered
 * and what merging it would keep; nothing is merged without being asked.
 */

import { Button, Dialog } from '@lumen/ui';
import type { Contact } from './contact';
import type { DuplicateGroup, DuplicateReason } from './merge';
import { displayName } from './sort';

export interface DuplicatesDialogProps {
  open: boolean;
  groups: DuplicateGroup[];
  container: HTMLElement | null;
  onMerge: (group: DuplicateGroup) => void;
  onClose: () => void;
}

const REASONS: Record<DuplicateReason, string> = {
  email: 'same email address',
  phone: 'same phone number',
  name: 'same name',
};

export function DuplicatesDialog({
  open,
  groups,
  container,
  onMerge,
  onClose,
}: DuplicatesDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Duplicates"
      width={480}
      container={container}
      actions={
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      }
    >
      {groups.length === 0 ? (
        <p className="py-2 text-base text-ink-2">
          No two cards share an email address, a phone number or a name.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 py-1">
          {groups.map((group) => (
            <li
              key={group.id}
              className="flex items-center gap-3 rounded-sm border border-rule px-3 py-2"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate-1 text-base text-ink">{summarise(group.contacts)}</span>
                <span className="mono text-2xs text-ink-3">
                  {group.contacts.length} cards · {REASONS[group.reason]}
                </span>
              </div>
              <Button size="sm" onClick={() => onMerge(group)}>
                Merge
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function summarise(contacts: readonly Contact[]): string {
  const names = contacts.map((contact) => displayName(contact) || 'No name');
  const unique = [...new Set(names)];
  return unique.join(' · ');
}
