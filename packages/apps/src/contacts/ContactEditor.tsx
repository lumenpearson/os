/**
 * The card, being edited. The form works on a draft; nothing reaches the store
 * until Save, and Cancel throws the draft away — which is why the detail pane
 * has an edit mode at all rather than a live form.
 */

import { Button, Field, IconButton, Input, Select, type SelectOption, TextArea } from '@lumen/ui';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useId, useState } from 'react';
import { ContactPhoto } from './ContactPhoto';
import type { Contact, LabelledValue, PostalAddress } from './contact';
import { normalizeGroups, normalizeLabel } from './contact';

const PHONE_LABELS = ['mobile', 'home', 'work', 'main', 'fax'] as const;
const EMAIL_LABELS = ['home', 'work', 'other'] as const;
const ADDRESS_LABELS = ['home', 'work', 'other'] as const;
const URL_LABELS = ['home', 'work', 'other'] as const;

export interface ContactEditorProps {
  draft: Contact;
  /** True while the record has never been saved, which changes the heading. */
  isNew: boolean;
  /** One column instead of two for the paired fields. */
  narrow: boolean;
  onChange: (next: Contact) => void;
  onSave: () => void;
  onCancel: () => void;
  onPickPhoto: () => void;
}

export function ContactEditor({
  draft,
  isNew,
  narrow,
  onChange,
  onSave,
  onCancel,
  onPickPhoto,
}: ContactEditorProps) {
  const id = useId();
  // The typed text and the stored list are not the same thing: "Work, " has a
  // trailing separator the store would drop while the user is still typing.
  const [groupsText, setGroupsText] = useState(() => draft.groups.join(', '));

  const set = (patch: Partial<Contact>) => onChange({ ...draft, ...patch });
  const pairs = narrow ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <form
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="lumen-scroll min-h-0 flex-1 px-4 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <ContactPhoto contact={draft} size={56} />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={<ImagePlus className="size-3.5" />}
                onClick={onPickPhoto}
                type="button"
              >
                {draft.photo === null ? 'Add Photo' : 'Change Photo'}
              </Button>
              {draft.photo !== null && (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => set({ photo: null })}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>

          <div className={`grid gap-3 ${pairs}`}>
            <Field label="First name" htmlFor={`${id}-given`}>
              <Input
                id={`${id}-given`}
                data-autofocus
                value={draft.given}
                onChange={(event) => set({ given: event.target.value })}
              />
            </Field>
            <Field label="Last name" htmlFor={`${id}-family`}>
              <Input
                id={`${id}-family`}
                value={draft.family}
                onChange={(event) => set({ family: event.target.value })}
              />
            </Field>
          </div>

          <Field label="Nickname" htmlFor={`${id}-nickname`}>
            <Input
              id={`${id}-nickname`}
              value={draft.nickname}
              onChange={(event) => set({ nickname: event.target.value })}
            />
          </Field>

          <div className={`grid gap-3 ${pairs}`}>
            <Field label="Company" htmlFor={`${id}-org`}>
              <Input
                id={`${id}-org`}
                value={draft.organisation}
                onChange={(event) => set({ organisation: event.target.value })}
              />
            </Field>
            <Field label="Job title" htmlFor={`${id}-title`}>
              <Input
                id={`${id}-title`}
                value={draft.title}
                onChange={(event) => set({ title: event.target.value })}
              />
            </Field>
          </div>

          <ValueList
            title="Phone"
            entries={draft.phones}
            labels={PHONE_LABELS}
            placeholder="+44 20 7946 0018"
            inputMode="tel"
            mono
            onChange={(phones) => set({ phones })}
          />
          <ValueList
            title="Email"
            entries={draft.emails}
            labels={EMAIL_LABELS}
            placeholder="name@example.org"
            inputMode="email"
            mono
            onChange={(emails) => set({ emails })}
          />
          <ValueList
            title="Website"
            entries={draft.urls}
            labels={URL_LABELS}
            placeholder="https://example.org"
            inputMode="url"
            mono
            onChange={(urls) => set({ urls })}
          />
          <AddressList
            addresses={draft.addresses}
            narrow={narrow}
            onChange={(addresses) => set({ addresses })}
          />

          <div className={`grid gap-3 ${pairs}`}>
            <Field label="Birthday" htmlFor={`${id}-bday`}>
              <Input
                id={`${id}-bday`}
                type="date"
                mono
                value={draft.birthday}
                onChange={(event) => set({ birthday: event.target.value })}
              />
            </Field>
            <Field label="Groups" htmlFor={`${id}-groups`} hint="Separate with commas.">
              <Input
                id={`${id}-groups`}
                value={groupsText}
                onChange={(event) => {
                  setGroupsText(event.target.value);
                  set({ groups: normalizeGroups(event.target.value.split(',')) });
                }}
              />
            </Field>
          </div>

          <Field label="Note" htmlFor={`${id}-notes`}>
            <TextArea
              id={`${id}-notes`}
              rows={4}
              value={draft.notes}
              onChange={(event) => set({ notes: event.target.value })}
            />
          </Field>
        </div>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-rule bg-canvas px-2">
        <span className="text-sm text-ink-3">{isNew ? 'New contact' : 'Editing'}</span>
        <span className="flex-1" />
        <Button size="sm" type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" type="submit" variant="primary">
          Save
        </Button>
      </div>
    </form>
  );
}

function labelOptions(defaults: readonly string[], current: string): Array<SelectOption<string>> {
  const known = defaults.includes(current) || current === '' ? defaults : [...defaults, current];
  return [{ value: '', label: '—' }, ...known.map((value) => ({ value, label: value }))];
}

interface ValueListProps {
  title: string;
  entries: LabelledValue[];
  labels: readonly string[];
  placeholder: string;
  inputMode: 'tel' | 'email' | 'url';
  mono?: boolean;
  onChange: (entries: LabelledValue[]) => void;
}

/** A repeating labelled value: phones, emails, websites. */
function ValueList({
  title,
  entries,
  labels,
  placeholder,
  inputMode,
  mono,
  onChange,
}: ValueListProps) {
  const replace = (index: number, patch: Partial<LabelledValue>) =>
    onChange(entries.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)));

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="pb-1 text-base text-ink">{title}</legend>
      {entries.map((entry, index) => (
        <div key={`${title}-${index}`} className="flex items-center gap-2">
          <Select
            size="sm"
            aria-label={`${title} ${index + 1} label`}
            className="w-24 shrink-0"
            value={entry.label}
            options={labelOptions(labels, entry.label)}
            onChange={(label) => replace(index, { label: normalizeLabel(label) })}
          />
          <Input
            size="sm"
            mono={mono}
            inputMode={inputMode}
            aria-label={`${title} ${index + 1}`}
            placeholder={placeholder}
            value={entry.value}
            onChange={(event) => replace(index, { value: event.target.value })}
          />
          <IconButton
            size="sm"
            label={`Remove ${title.toLowerCase()} ${index + 1}`}
            onClick={() => onChange(entries.filter((_, at) => at !== index))}
          >
            <X />
          </IconButton>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        type="button"
        className="self-start"
        icon={<Plus className="size-3.5" />}
        onClick={() => onChange([...entries, { label: labels[0] ?? '', value: '' }])}
      >
        Add {title.toLowerCase()}
      </Button>
    </fieldset>
  );
}

const EMPTY_ADDRESS: PostalAddress = {
  label: 'home',
  street: '',
  city: '',
  region: '',
  postcode: '',
  country: '',
};

function AddressList({
  addresses,
  narrow,
  onChange,
}: {
  addresses: PostalAddress[];
  narrow: boolean;
  onChange: (addresses: PostalAddress[]) => void;
}) {
  const replace = (index: number, patch: Partial<PostalAddress>) =>
    onChange(addresses.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-1 text-base text-ink">Address</legend>
      {addresses.map((address, index) => (
        <div key={`address-${index}`} className="flex flex-col gap-1.5 rounded-sm bg-surface-2 p-2">
          <div className="flex items-center gap-2">
            <Select
              size="sm"
              aria-label={`Address ${index + 1} label`}
              className="w-24 shrink-0"
              value={address.label}
              options={labelOptions(ADDRESS_LABELS, address.label)}
              onChange={(label) => replace(index, { label: normalizeLabel(label) })}
            />
            <Input
              size="sm"
              aria-label={`Address ${index + 1} street`}
              placeholder="Street"
              value={address.street}
              onChange={(event) => replace(index, { street: event.target.value })}
            />
            <IconButton
              size="sm"
              label={`Remove address ${index + 1}`}
              onClick={() => onChange(addresses.filter((_, at) => at !== index))}
            >
              <Trash2 />
            </IconButton>
          </div>
          <div className={`grid gap-1.5 ${narrow ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <Input
              size="sm"
              aria-label={`Address ${index + 1} city`}
              placeholder="City"
              value={address.city}
              onChange={(event) => replace(index, { city: event.target.value })}
            />
            <Input
              size="sm"
              aria-label={`Address ${index + 1} region`}
              placeholder="Region"
              value={address.region}
              onChange={(event) => replace(index, { region: event.target.value })}
            />
            <Input
              size="sm"
              mono
              aria-label={`Address ${index + 1} postcode`}
              placeholder="Postcode"
              value={address.postcode}
              onChange={(event) => replace(index, { postcode: event.target.value })}
            />
            <Input
              size="sm"
              aria-label={`Address ${index + 1} country`}
              placeholder="Country"
              value={address.country}
              onChange={(event) => replace(index, { country: event.target.value })}
            />
          </div>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        type="button"
        className="self-start"
        icon={<Plus className="size-3.5" />}
        onClick={() => onChange([...addresses, { ...EMPTY_ADDRESS }])}
      >
        Add address
      </Button>
    </fieldset>
  );
}
