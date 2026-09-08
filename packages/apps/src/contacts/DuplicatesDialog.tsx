import { usePlural, useT } from '@lumen/kernel/react';
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
  const t = useT();
  const plural = usePlural();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('contactsApp.duplicates')}
      width={480}
      container={container}
      actions={
        <Button size="sm" onClick={onClose}>
          {t('action.done')}
        </Button>
      }
    >
      {groups.length === 0 ? (
        <p className="py-2 text-base text-ink-2">{t('contactsApp.noDuplicates')}</p>
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
                  {t('contactsApp.cardsAndReason', {
                    cards: plural('count.cards', group.contacts.length),
                    reason: REASONS[group.reason],
                  })}
                </span>
              </div>
              <Button size="sm" onClick={() => onMerge(group)}>
                {t('contactsApp.merge')}
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
