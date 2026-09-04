import { Button, cx, IconButton, Input } from '@lumen/ui';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { RefObject } from 'react';

export interface FindState {
  open: boolean;
  /** The replace field and its buttons are shown. */
  replace: boolean;
  query: string;
  replacement: string;
  caseSensitive: boolean;
  regex: boolean;
}

export const EMPTY_FIND: FindState = {
  open: false,
  replace: false,
  query: '',
  replacement: '',
  caseSensitive: false,
  regex: false,
};

export interface FindBarProps {
  state: FindState;
  matchCount: number;
  /** Zero-based index of the selected match, or -1. */
  activeIndex: number;
  error: string | null;
  readOnly: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onPatch: (patch: Partial<FindState>) => void;
  onNavigate: (forward: boolean) => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

function countLabel(query: string, error: string | null, count: number, active: number): string {
  if (error) return 'Bad expression';
  if (!query) return '';
  if (count === 0) return 'No results';
  if (active < 0) return `${count} found`;
  return `${active + 1} of ${count}`;
}

/** Find and replace, above the text. Enter steps forward, Shift+Enter back. */
export function FindBar({
  state,
  matchCount,
  activeIndex,
  error,
  readOnly,
  inputRef,
  onPatch,
  onNavigate,
  onReplace,
  onReplaceAll,
  onClose,
}: FindBarProps) {
  const count = countLabel(state.query, error, matchCount, activeIndex);
  const disabled = matchCount === 0;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-rule bg-canvas px-2 py-1.5">
      <div className="flex min-w-40 flex-1 items-center gap-1">
        <Input
          ref={inputRef}
          mono
          size="sm"
          value={state.query}
          placeholder="Find"
          aria-label="Find"
          invalid={Boolean(error)}
          onChange={(e) => onPatch({ query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onNavigate(!e.shiftKey);
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
        />
        <IconButton
          label="Match case"
          size="sm"
          variant="outline"
          active={state.caseSensitive}
          onClick={() => onPatch({ caseSensitive: !state.caseSensitive })}
        >
          <span className="mono text-xs">Aa</span>
        </IconButton>
        <IconButton
          label="Regular expression"
          size="sm"
          variant="outline"
          active={state.regex}
          onClick={() => onPatch({ regex: !state.regex })}
        >
          <span className="mono text-xs">.*</span>
        </IconButton>
      </div>

      <div className="flex items-center gap-1">
        <span
          aria-live="polite"
          className={cx('mono min-w-24 text-xs tabular-nums', error ? 'text-danger' : 'text-ink-2')}
        >
          {count}
        </span>
        <IconButton
          label="Previous match"
          size="sm"
          disabled={disabled}
          onClick={() => onNavigate(false)}
        >
          <ChevronUp />
        </IconButton>
        <IconButton
          label="Next match"
          size="sm"
          disabled={disabled}
          onClick={() => onNavigate(true)}
        >
          <ChevronDown />
        </IconButton>
        <IconButton label="Close find" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      {state.replace && (
        <div className="flex w-full items-center gap-1">
          <Input
            mono
            size="sm"
            className="min-w-40 flex-1"
            value={state.replacement}
            placeholder="Replace with"
            aria-label="Replace with"
            disabled={readOnly}
            onChange={(e) => onPatch({ replacement: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onReplace();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }
            }}
          />
          <Button size="sm" disabled={disabled || readOnly} onClick={onReplace}>
            Replace
          </Button>
          <Button size="sm" disabled={disabled || readOnly} onClick={onReplaceAll}>
            Replace All
          </Button>
        </div>
      )}
    </div>
  );
}
