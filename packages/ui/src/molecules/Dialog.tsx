import { X } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../atoms/Button';
import { IconButton } from '../atoms/IconButton';
import { Input } from '../atoms/Input';
import { cx } from '../cx';
import { useEscape, useFocusTrap } from '../hooks';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Footer actions. */
  actions?: ReactNode;
  width?: number;
  /** Render inside a container instead of the document body (app-modal sheets). */
  container?: HTMLElement | null;
  /**
   * Nothing dismisses this sheet: no close button, no Escape, no click on the
   * scrim. For work already in flight, where cancelling is not one of the
   * answers — an account being erased, a password being changed.
   */
  persistent?: boolean;
  /**
   * No close button and no dismissal by clicking away, but Escape still
   * cancels. A confirmation asks a question its own buttons answer, so an ×
   * beside them is a third button meaning the same as Cancel; a stray click
   * on the scrim should not answer a question either. Escape is different:
   * it is how every system lets a keyboard user say no, and taking it away
   * leaves them reaching for the mouse.
   */
  hideClose?: boolean;
  className?: string;
}

/**
 * A modal sheet, sized by the box it is portalled into rather than by the
 * screen: inside an app window that is the window's body, so a dialog can
 * never grow past the window it belongs to. Focus is trapped, and Escape
 * closes unless the sheet is persistent.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  width = 420,
  container,
  persistent,
  hideClose,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  useEscape(() => {
    if (!persistent) onClose();
  }, open);
  const showClose = !persistent && !hideClose;
  if (!open || typeof document === 'undefined') return null;
  const target = container ?? document.body;
  return createPortal(
    <div
      // The scrim is the sheet's containing block: it covers the window body
      // the dialog was portalled into, so every size below is measured
      // against that box and not against the viewport. Its padding is the
      // margin the sheet may never cross, at any window size.
      className={cx(
        'lumen-scrim absolute inset-0 z-[1400] flex items-center justify-center p-4 lumen-fade-enter',
        !container && 'fixed',
      )}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !persistent && !hideClose) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'lumen-dialog-title' : undefined}
        // The radius and the border are on this element, so the corner is a
        // real mitre; overflow-hidden is here to clip the header and footer
        // rules, which should stop at the curve. It also means the frame
        // itself can never scroll: the body below is the only scroller.
        className={cx(
          // deslop-ignore-next-line 22
          'flex max-h-full w-full flex-col overflow-hidden rounded-lg border border-rule bg-surface shadow-lg outline-none lumen-pop-enter',
          className,
        )}
        style={{
          // `min()` keeps the preferred width from beating the container: on a
          // narrow window the sheet is the window minus the scrim padding.
          maxWidth: `min(100%, ${width}px)`,
          ['--lumen-pop-origin' as string]: 'top center',
        }}
        tabIndex={-1}
      >
        {(title || showClose) && (
          <div className="flex shrink-0 items-center gap-2 px-4 pt-3.5 pb-1">
            {title && (
              <h2 id="lumen-dialog-title" className="text-md font-semibold text-ink">
                {title}
              </h2>
            )}
            {showClose && (
              <IconButton label="Close" size="sm" className="ml-auto" onClick={onClose}>
                <X />
              </IconButton>
            )}
          </div>
        )}
        {/* min-h-0 lets this shrink below its content, which is what turns
            overflow into a scroll here instead of a clip on the frame. */}
        <div data-testid="dialog-body" className="lumen-scroll min-h-0 flex-1 px-4 py-2 text-base">
          {children}
        </div>
        {actions && <div className="flex shrink-0 justify-end gap-2 px-4 pb-4 pt-3">{actions}</div>}
      </div>
    </div>,
    target,
  );
}

// ── imperative dialogs: confirm / prompt / alert ─────────────────────────

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  mono?: boolean;
  validate?: (value: string) => string | null;
  /** Select this many characters from the start (e.g. the stem of a filename). */
  selectRange?: [number, number];
  password?: boolean;
}

export interface ChooseOptions {
  title: string;
  message?: ReactNode;
  /** Buttons in display order; the last one is the default. */
  buttons: Array<{ id: string; label: string; variant?: 'primary' | 'secondary' | 'danger' }>;
}

interface DialogApi {
  confirm(options: ConfirmOptions): Promise<boolean>;
  prompt(options: PromptOptions): Promise<string | null>;
  alert(options: { title: string; message?: ReactNode }): Promise<void>;
  /** A multi-button question ("Save", "Don't Save", "Cancel"). Resolves null on Escape. */
  choose(options: ChooseOptions): Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

type Pending =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void }
  | { kind: 'alert'; options: { title: string; message?: ReactNode }; resolve: () => void }
  | { kind: 'choose'; options: ChooseOptions; resolve: (v: string | null) => void };

/** Mount once per app window (or once in the shell) to get `useDialogs()`. */
export function DialogProvider({
  children,
  container,
}: {
  children: ReactNode;
  container?: HTMLElement | null;
}) {
  const [queue, setQueue] = useState<Pending[]>([]);
  const push = useCallback((p: Pending) => setQueue((q) => [...q, p]), []);
  const pop = useCallback(() => setQueue((q) => q.slice(1)), []);
  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) => new Promise((resolve) => push({ kind: 'confirm', options, resolve })),
      prompt: (options) => new Promise((resolve) => push({ kind: 'prompt', options, resolve })),
      alert: (options) => new Promise((resolve) => push({ kind: 'alert', options, resolve })),
      choose: (options) => new Promise((resolve) => push({ kind: 'choose', options, resolve })),
    }),
    [push],
  );
  const current = queue[0];
  return (
    <DialogContext.Provider value={api}>
      {children}
      {current?.kind === 'confirm' && (
        <ConfirmDialog key={queue.length} pending={current} done={pop} container={container} />
      )}
      {current?.kind === 'prompt' && (
        <PromptDialog key={queue.length} pending={current} done={pop} container={container} />
      )}
      {current?.kind === 'choose' && (
        <Dialog
          open
          onClose={() => {
            current.resolve(null);
            pop();
          }}
          title={current.options.title}
          container={container}
          actions={current.options.buttons.map((b, i) => (
            <Button
              key={b.id}
              variant={
                b.variant ?? (i === current.options.buttons.length - 1 ? 'primary' : 'secondary')
              }
              data-autofocus={i === current.options.buttons.length - 1 ? true : undefined}
              onClick={() => {
                current.resolve(b.id);
                pop();
              }}
            >
              {b.label}
            </Button>
          ))}
        >
          {current.options.message}
        </Dialog>
      )}
      {current?.kind === 'alert' && (
        <Dialog
          open
          onClose={() => {
            current.resolve();
            pop();
          }}
          title={current.options.title}
          container={container}
          actions={
            <Button
              variant="primary"
              data-autofocus
              onClick={() => {
                current.resolve();
                pop();
              }}
            >
              OK
            </Button>
          }
        >
          {current.options.message}
        </Dialog>
      )}
    </DialogContext.Provider>
  );
}

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs must be used inside <DialogProvider>');
  return ctx;
}

function ConfirmDialog({
  pending,
  done,
  container,
}: {
  pending: Extract<Pending, { kind: 'confirm' }>;
  done: () => void;
  container?: HTMLElement | null;
}) {
  const finish = (v: boolean) => {
    pending.resolve(v);
    done();
  };
  const o = pending.options;
  return (
    <Dialog
      open
      onClose={() => finish(false)}
      title={o.title}
      container={container}
      hideClose
      actions={
        <>
          <Button onClick={() => finish(false)}>{o.cancelLabel ?? 'Cancel'}</Button>
          <Button
            variant={o.danger ? 'danger' : 'primary'}
            data-autofocus
            onClick={() => finish(true)}
          >
            {o.confirmLabel ?? 'OK'}
          </Button>
        </>
      }
    >
      {o.message}
    </Dialog>
  );
}

function PromptDialog({
  pending,
  done,
  container,
}: {
  pending: Extract<Pending, { kind: 'prompt' }>;
  done: () => void;
  container?: HTMLElement | null;
}) {
  const o = pending.options;
  const [value, setValue] = useState(o.defaultValue ?? '');
  const error = o.validate?.(value) ?? null;
  const finish = (v: string | null) => {
    pending.resolve(v);
    done();
  };
  return (
    <Dialog
      open
      onClose={() => finish(null)}
      title={o.title}
      container={container}
      hideClose
      actions={
        <>
          <Button onClick={() => finish(null)}>Cancel</Button>
          <Button variant="primary" disabled={Boolean(error)} onClick={() => finish(value)}>
            {o.confirmLabel ?? 'OK'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!error) finish(value);
        }}
        className="flex flex-col gap-2"
      >
        {o.message && <p className="text-ink-2">{o.message}</p>}
        <Input
          data-autofocus
          mono={o.mono}
          type={o.password ? 'password' : 'text'}
          value={value}
          placeholder={o.placeholder}
          invalid={Boolean(error) && value.length > 0}
          onChange={(e) => setValue(e.target.value)}
          ref={(el) => {
            if (el && o.selectRange && !el.dataset.selected) {
              el.dataset.selected = '1';
              requestAnimationFrame(() =>
                el.setSelectionRange(o.selectRange?.[0] ?? 0, o.selectRange?.[1] ?? value.length),
              );
            }
          }}
        />
        {error && value.length > 0 && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
