import { Input } from '@lumen/ui';
import { Plus } from 'lucide-react';
import type { KeyboardEvent, RefObject } from 'react';
import { CONTENT_MAX_WIDTH } from './layout';

export interface ComposeFieldProps {
  value: string;
  /** What the typed line was understood to mean, printed under the field. */
  hint: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFocus: () => void;
  /** Down from the field steps into the list, so the two act as one column. */
  onStepIntoList: () => void;
}

/**
 * The field a reminder is typed into. Enter adds it and leaves the cursor
 * here, so a list can be typed out without touching the mouse.
 */
export function ComposeField({
  value,
  hint,
  inputRef,
  onChange,
  onSubmit,
  onFocus,
  onStepIntoList,
}: ComposeFieldProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit();
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onStepIntoList();
    }
  };
  return (
    <div className="shrink-0 border-b border-rule bg-canvas px-2 py-2">
      <div className="mx-auto w-full" style={{ maxWidth: CONTENT_MAX_WIDTH }}>
        <Input
          ref={inputRef}
          value={value}
          leading={<Plus />}
          aria-label="New reminder"
          placeholder="New reminder"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
        />
        {/* The line is kept whether or not it has anything to say, so the
            list below does not jump as a date is typed. */}
        <p className="mono truncate-1 h-4 pt-1 text-xs tabular-nums text-ink-3">{hint}</p>
      </div>
    </div>
  );
}
