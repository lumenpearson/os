import { cx } from '@lumen/ui';

interface Props {
  focused: boolean;
  closable: boolean;
  minimizable: boolean;
  maximizable: boolean;
  dirty: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
}

/**
 * Close / minimize / zoom. Three small circles that reveal their glyph on
 * hover as a group; a dot marks unsaved changes. Inactive windows show them
 * as neutral discs.
 */
export function WindowControls({
  focused,
  closable,
  minimizable,
  maximizable,
  dirty,
  onClose,
  onMinimize,
  onMaximize,
}: Props) {
  return (
    <div
      className="group/controls flex items-center gap-2"
      data-no-drag
      data-testid="window-controls"
    >
      <Control
        label="Close"
        tone="close"
        enabled={closable}
        focused={focused}
        revealed={dirty}
        onClick={onClose}
      >
        {dirty ? (
          // deslop-ignore-next-line 19 — the unsaved-changes marker is a dot, so it is round.
          <span className="block size-1.5 rounded-full bg-[#4a1010]" />
        ) : (
          <svg aria-hidden viewBox="0 0 10 10" className="size-2">
            <path
              d="M2 2l6 6M8 2l-6 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        )}
      </Control>
      <Control
        label="Minimize"
        tone="minimize"
        enabled={minimizable}
        focused={focused}
        onClick={onMinimize}
      >
        <svg aria-hidden viewBox="0 0 10 10" className="size-2">
          <path d="M2 5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </Control>
      <Control
        label="Zoom"
        tone="zoom"
        enabled={maximizable}
        focused={focused}
        onClick={onMaximize}
      >
        <svg aria-hidden viewBox="0 0 10 10" className="size-2">
          <path
            d="M2.5 6.5V2.5h4M7.5 3.5v4h-4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Control>
    </div>
  );
}

const TONES = {
  close: 'bg-[#ec5f59] text-[#4a1010]',
  minimize: 'bg-[#e1b13c] text-[#5a3d05]',
  zoom: 'bg-[#5fc25b] text-[#0f4a12]',
};

function Control({
  label,
  tone,
  enabled,
  focused,
  revealed,
  onClick,
  children,
}: {
  label: string;
  tone: keyof typeof TONES;
  enabled: boolean;
  focused: boolean;
  /** Show the glyph without waiting for the pointer: the unsaved marker. */
  revealed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!enabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cx(
        // deslop-ignore-next-line 19 — window controls are circles by platform convention, not a max-radius pill.
        'flex size-3 items-center justify-center rounded-full border border-black/10 lumen-focus',
        'transition-[background-color] duration-(--duration-fast)',
        enabled && focused ? TONES[tone] : 'bg-surface-3 text-transparent',
        !enabled && 'opacity-50',
        // An inactive window is a neutral row of discs and stays one: the
        // pointer passing over it is not a reason to light up someone else's
        // window. Only the window in front answers the hover.
        enabled && focused
          ? revealed
            ? '[&>*]:opacity-100'
            : '[&>*]:opacity-0 group-hover/controls:[&>*]:opacity-100 focus-visible:[&>*]:opacity-100'
          : '[&>*]:opacity-0',
      )}
    >
      {children}
    </button>
  );
}
