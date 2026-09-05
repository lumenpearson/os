import { Button, Dialog, IconButton, Input, TextArea } from '@lumen/ui';
import { Paperclip, Send, X } from 'lucide-react';
import { useId, useState } from 'react';
import { canSend, type Draft } from './compose';
import { formatSize } from './format';

export interface ComposeSheetProps {
  draft: Draft;
  title: string;
  container: HTMLElement | null;
  onChange: (draft: Draft) => void;
  /** Opens the file picker; the parent adds what comes back. */
  onAttach: () => void;
  onRemoveAttachment: (path: string) => void;
  onSaveDraft: () => void;
  onSend: () => void;
  onClose: () => void;
}

/** The compose sheet: window-modal, one message at a time. */
export function ComposeSheet({
  draft,
  title,
  container,
  onChange,
  onAttach,
  onRemoveAttachment,
  onSaveDraft,
  onSend,
  onClose,
}: ComposeSheetProps) {
  const id = useId();
  const [showBcc, setShowBcc] = useState(draft.bcc.trim() !== '');
  const field = (name: string) => `${id}-${name}`;
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const addressed = canSend(draft);

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      width={680}
      container={container}
      actions={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button onClick={onSaveDraft}>Save Draft</Button>
          <Button
            variant="primary"
            icon={<Send className="size-3.5" />}
            disabled={!addressed}
            onClick={onSend}
          >
            Send
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (addressed) onSend();
        }}
      >
        <div className="flex flex-col divide-y divide-rule border-y border-rule">
          <div className="flex items-center gap-3 py-1.5">
            <label htmlFor={field('to')} className="mono w-12 shrink-0 text-xs text-ink-3">
              To
            </label>
            <Input
              id={field('to')}
              mono
              size="sm"
              data-autofocus={draft.to.trim() === '' ? true : undefined}
              value={draft.to}
              placeholder="name@local"
              onChange={(e) => set({ to: e.target.value })}
            />
            {!showBcc && (
              <Button size="sm" variant="ghost" onClick={() => setShowBcc(true)}>
                Bcc
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3 py-1.5">
            <label htmlFor={field('cc')} className="mono w-12 shrink-0 text-xs text-ink-3">
              Cc
            </label>
            <Input
              id={field('cc')}
              mono
              size="sm"
              value={draft.cc}
              onChange={(e) => set({ cc: e.target.value })}
            />
          </div>
          {showBcc && (
            <div className="flex items-center gap-3 py-1.5">
              <label htmlFor={field('bcc')} className="mono w-12 shrink-0 text-xs text-ink-3">
                Bcc
              </label>
              <Input
                id={field('bcc')}
                mono
                size="sm"
                value={draft.bcc}
                onChange={(e) => set({ bcc: e.target.value })}
              />
            </div>
          )}
          <div className="flex items-center gap-3 py-1.5">
            <label htmlFor={field('subject')} className="mono w-12 shrink-0 text-xs text-ink-3">
              Subject
            </label>
            <Input
              id={field('subject')}
              size="sm"
              value={draft.subject}
              onChange={(e) => set({ subject: e.target.value })}
            />
          </div>
        </div>

        <TextArea
          aria-label="Message"
          data-autofocus={draft.to.trim() === '' ? undefined : true}
          className="min-h-56"
          value={draft.body}
          onChange={(e) => set({ body: e.target.value })}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={<Paperclip className="size-3.5" />}
            onClick={onAttach}
          >
            Attach File
          </Button>
          {draft.attachments.map((file) => (
            <span
              key={file.path}
              title={file.path}
              className="flex items-center gap-1.5 rounded-sm border border-rule bg-surface-2 py-0.5 pl-2 pr-0.5"
            >
              <span className="mono truncate-1 max-w-44 text-xs text-ink">{file.name}</span>
              <span className="mono shrink-0 text-2xs tabular-nums text-ink-3">
                {formatSize(file.size)}
              </span>
              <IconButton
                size="sm"
                label={`Remove ${file.name}`}
                onClick={() => onRemoveAttachment(file.path)}
              >
                <X />
              </IconButton>
            </span>
          ))}
        </div>

        <p className="text-sm text-ink-3">
          Send files a copy in Sent and delivers one to this computer&rsquo;s Inbox. There is no
          network account to send it anywhere else.
        </p>
      </form>
    </Dialog>
  );
}
