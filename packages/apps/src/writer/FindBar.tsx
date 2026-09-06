import { IconButton, SearchField } from '@lumen/ui';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { KeyboardEvent, RefObject } from 'react';

export interface FindBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Zero-based index of the current match. */
  index: number;
  total: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

export function FindBar({
  query,
  onQueryChange,
  index,
  total,
  inputRef,
  onNext,
  onPrevious,
  onClose,
}: FindBarProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onNext();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-rule bg-canvas px-2">
      <SearchField
        ref={inputRef}
        value={query}
        onChange={onQueryChange}
        onKeyDown={onKeyDown}
        placeholder="Find in document"
        aria-label="Find in document"
        className="w-56"
      />
      <span className="mono shrink-0 text-xs text-ink-2 tabular-nums">
        {query === '' ? '' : total === 0 ? 'No matches' : `${index + 1} of ${total}`}
      </span>
      <div className="flex-1" />
      <IconButton label="Previous match" size="sm" disabled={total === 0} onClick={onPrevious}>
        <ChevronUp />
      </IconButton>
      <IconButton label="Next match" size="sm" disabled={total === 0} onClick={onNext}>
        <ChevronDown />
      </IconButton>
      <IconButton label="Close find" size="sm" onClick={onClose}>
        <X />
      </IconButton>
    </div>
  );
}
