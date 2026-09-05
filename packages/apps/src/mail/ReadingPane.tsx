import { cx, EmptyState, Heading } from '@lumen/ui';
import { Flag, Mail, Paperclip } from 'lucide-react';
import { displaySender, displaySubject } from './compose';
import {
  addressEmail,
  bodyBlocks,
  displayAddress,
  type FormatOptions,
  formatAddressList,
  formatFullStamp,
  formatSize,
  formatStamp,
  snippet,
} from './format';
import type { Message } from './store';
import type { Thread } from './thread';

function AddressRow({ label, list }: { label: string; list: readonly string[] }) {
  if (list.length === 0) return null;
  return (
    <div className="flex min-w-0 gap-2">
      <span className="mono w-8 shrink-0 text-xs text-ink-3">{label}</span>
      <span className="mono min-w-0 flex-1 truncate-1 text-xs text-ink-2">{list.join(', ')}</span>
    </div>
  );
}

export interface ReadingPaneProps {
  message: Message | null;
  /** The conversation the message sits in, when it has company. */
  thread: Thread | null;
  o: FormatOptions;
  now: number;
  onSelectMessage: (id: string) => void;
  onOpenAttachment: (path: string) => void;
  className?: string;
}

/** The right-hand pane: one message in full, and the rest of its conversation. */
export function ReadingPane({
  message,
  thread,
  o,
  now,
  onSelectMessage,
  onOpenAttachment,
  className,
}: ReadingPaneProps) {
  if (!message) {
    return (
      <div className={cx('flex min-h-0 min-w-0 flex-1 flex-col bg-surface', className)}>
        <EmptyState
          icon={<Mail />}
          title="No message selected"
          description="This mailbox is a file on this computer. Nothing here was sent or received over a network."
        />
      </div>
    );
  }

  const email = addressEmail(message.from);
  const others = (thread?.messages ?? []).filter((m) => m.id !== message.id);
  const totalSize = message.attachments.reduce((sum, a) => sum + a.size, 0);

  return (
    <div className={cx('lumen-scroll min-h-0 min-w-0 flex-1 bg-surface', className)}>
      <article className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-5">
        <header className="flex flex-col gap-3">
          <Heading level={2} className="tracking-tight">
            {displaySubject(message.subject)}
          </Heading>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-base font-medium text-ink">{displaySender(message)}</span>
            {email !== '' && email !== displaySender(message) && (
              <span className="mono text-xs text-ink-3">{email}</span>
            )}
            <span className="flex-1" />
            {message.flagged && (
              <span className="flex items-center gap-1 text-xs text-accent">
                <Flag className="size-3" />
                Flagged
              </span>
            )}
            <span className="mono text-xs tabular-nums text-ink-2">
              {formatFullStamp(message.date, o)}
            </span>
          </div>
          <div className="flex flex-col gap-1 border-t border-rule pt-2">
            <AddressRow label="To" list={message.to} />
            <AddressRow label="Cc" list={message.cc} />
            <AddressRow label="Bcc" list={message.bcc} />
          </div>
        </header>

        {message.attachments.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="mono text-2xs uppercase tracking-[0.08em] text-ink-3">
                Attachments
              </span>
              <span className="mono text-2xs tabular-nums text-ink-3">{formatSize(totalSize)}</span>
            </div>
            <ul className="flex flex-wrap gap-2">
              {message.attachments.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    onClick={() => onOpenAttachment(file.path)}
                    title={file.path}
                    className={cx(
                      'flex items-center gap-2 rounded-sm border border-rule bg-surface-2 px-2 py-1 text-left lumen-focus',
                      'transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:bg-surface-3',
                    )}
                  >
                    <Paperclip className="size-3.5 shrink-0 text-ink-3" />
                    <span className="mono truncate-1 max-w-52 text-xs text-ink">{file.name}</span>
                    <span className="mono shrink-0 text-2xs tabular-nums text-ink-3">
                      {formatSize(file.size)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-col gap-3 text-base leading-relaxed text-ink">
          {bodyBlocks(message.body).map((block, i) =>
            block.quoted ? (
              // A block's position in the body is its identity; nothing reorders.
              <blockquote
                key={i}
                className="whitespace-pre-wrap border-l border-rule-strong pl-3 text-ink-3"
              >
                {block.text}
              </blockquote>
            ) : (
              <p key={i} className="whitespace-pre-wrap">
                {block.text}
              </p>
            ),
          )}
        </div>

        {others.length > 0 && (
          <section className="flex flex-col gap-2 border-t border-rule pt-4">
            <h3 className="mono text-2xs uppercase tracking-[0.08em] text-ink-3">
              Earlier in this conversation
            </h3>
            <ul className="flex flex-col">
              {others.map((other) => (
                <li key={other.id}>
                  <button
                    type="button"
                    onClick={() => onSelectMessage(other.id)}
                    className={cx(
                      'flex w-full min-w-0 items-baseline gap-2 rounded-sm px-2 py-1.5 text-left lumen-focus',
                      'transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:bg-surface-2',
                    )}
                  >
                    <span className="shrink-0 text-sm font-medium text-ink">
                      {displayAddress(other.from) || formatAddressList(other.to)}
                    </span>
                    <span className="truncate-1 min-w-0 flex-1 text-sm text-ink-3">
                      {snippet(other.body, 80)}
                    </span>
                    <span className="mono shrink-0 text-2xs tabular-nums text-ink-3">
                      {formatStamp(other.date, now, o)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}
