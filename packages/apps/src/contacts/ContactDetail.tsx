/**
 * The card, read-only. Editing is a separate mode with its own Save and
 * Cancel, so nothing on screen changes the record while it is being read.
 *
 * Every value keeps its label in the margin, in the monospace face the design
 * rules give to labels and to anything a terminal would print — numbers,
 * addresses, dates.
 */

import { Button, cx, Heading, IconButton } from '@lumen/ui';
import { ChevronLeft, Pencil, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { ContactPhoto } from './ContactPhoto';
import { type Contact, formatBirthday, type PostalAddress } from './contact';
import { displayName } from './sort';

export interface ContactDetailProps {
  contact: Contact;
  isMe: boolean;
  locale: string | undefined;
  /** The window is folded, so the list needs a way back. */
  showBack: boolean;
  onBack: () => void;
  onEdit: () => void;
  onToggleFavourite: () => void;
  onOpenUrl: (url: string) => void;
}

export function ContactDetail({
  contact,
  isMe,
  locale,
  showBack,
  onBack,
  onEdit,
  onToggleFavourite,
  onOpenUrl,
}: ContactDetailProps) {
  const name = displayName(contact);
  const birthday = formatBirthday(contact.birthday, locale);
  const hasDetails =
    contact.phones.length > 0 ||
    contact.emails.length > 0 ||
    contact.addresses.length > 0 ||
    contact.urls.length > 0 ||
    birthday !== '' ||
    contact.notes !== '' ||
    contact.groups.length > 0;

  return (
    <section aria-label="Contact card" className="lumen-scroll min-h-0 min-w-0 flex-1">
      <header className="flex items-start gap-3 px-4 pt-4 pb-3">
        {showBack && (
          <IconButton size="sm" label="Back to list" onClick={onBack}>
            <ChevronLeft />
          </IconButton>
        )}
        <ContactPhoto contact={contact} size={56} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Heading level={2} className="flex min-w-0 items-baseline gap-2">
            <span className="truncate-1">{name || 'No name'}</span>
            {isMe && <span className="mono shrink-0 text-2xs font-normal text-ink-3">Me</span>}
          </Heading>
          {contact.nickname !== '' && (
            <p className="truncate-1 text-sm text-ink-3">“{contact.nickname}”</p>
          )}
          {(contact.title !== '' || contact.organisation !== '') && (
            <p className="truncate-1 text-base text-ink-2">
              {[contact.title, contact.organisation].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            size="sm"
            label={contact.favourite ? 'Remove from favourites' : 'Add to favourites'}
            active={contact.favourite}
            onClick={onToggleFavourite}
          >
            <Star className={cx(contact.favourite && 'fill-current text-accent')} />
          </IconButton>
          <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={onEdit}>
            Edit
          </Button>
        </div>
      </header>

      {hasDetails ? (
        <dl className="flex flex-col gap-px border-t border-rule px-4 py-3">
          {contact.phones.map((phone, index) => (
            <Row key={`phone-${index}-${phone.value}`} label={phone.label || 'phone'}>
              <span className="mono tabular-nums">{phone.value}</span>
            </Row>
          ))}
          {contact.emails.map((email, index) => (
            <Row key={`email-${index}-${email.value}`} label={email.label || 'email'}>
              <span className="mono break-all">{email.value}</span>
            </Row>
          ))}
          {contact.urls.map((url, index) => (
            <Row key={`url-${index}-${url.value}`} label={url.label || 'website'}>
              <button
                type="button"
                onClick={() => onOpenUrl(url.value)}
                className="mono break-all rounded-xs text-left text-accent hover:underline lumen-focus"
              >
                {url.value}
              </button>
            </Row>
          ))}
          {contact.addresses.map((address, index) => (
            <Row key={`address-${index}`} label={address.label || 'address'}>
              <AddressLines address={address} />
            </Row>
          ))}
          {birthday !== '' && (
            <Row label="birthday">
              <span className="mono tabular-nums">{birthday}</span>
            </Row>
          )}
          {contact.groups.length > 0 && (
            <Row label="groups">
              <span>{contact.groups.join(', ')}</span>
            </Row>
          )}
          {contact.notes !== '' && (
            <Row label="note">
              <p className="whitespace-pre-wrap">{contact.notes}</p>
            </Row>
          )}
        </dl>
      ) : (
        <p className="border-t border-rule px-4 py-3 text-base text-ink-3">
          Nothing on this card yet. Edit it to add a number or an address.
        </p>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-baseline gap-3 py-1">
      <dt className="mono truncate-1 pt-px text-right text-2xs text-ink-3">{label}</dt>
      <dd className="min-w-0 text-base text-ink">{children}</dd>
    </div>
  );
}

function AddressLines({ address }: { address: PostalAddress }) {
  const lines = [
    address.street,
    [address.postcode, address.city].filter(Boolean).join(' '),
    [address.region, address.country].filter(Boolean).join(', '),
  ].filter((line) => line.trim() !== '');
  return (
    <span className="mono flex flex-col">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </span>
  );
}
