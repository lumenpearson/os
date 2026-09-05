/**
 * A contact's picture, or the initials that stand in for one. The photo is a
 * path in the VFS, read through an object URL that is revoked when the path
 * changes, so scrolling the book does not leak blobs.
 */

import { cx } from '@lumen/ui';
import { useObjectUrl } from '../_sdk';
import type { Contact } from './contact';
import { displayName, initials } from './sort';

export interface ContactPhotoProps {
  contact: Contact;
  size: number;
  className?: string;
}

export function ContactPhoto({ contact, size, className }: ContactPhotoProps) {
  const { url } = useObjectUrl(contact.photo);
  const name = displayName(contact);
  const letters = initials(contact);

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        // deslop-ignore-next-line 19 — a portrait is round in every address book.
        className={cx('shrink-0 rounded-full border border-rule object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cx(
        // deslop-ignore-next-line 19 — the placeholder takes the portrait's shape.
        'mono inline-flex shrink-0 items-center justify-center rounded-full',
        'border border-rule bg-surface-2 text-ink-2 select-none',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {letters}
    </span>
  );
}
