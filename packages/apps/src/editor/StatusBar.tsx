import { Button, cx, ToolbarSpacer } from '@lumen/ui';

export interface StatusBarProps {
  line: number;
  column: number;
  /** Characters covered by the selection; zero hides the reading. */
  selectionLength: number;
  words: number;
  characters: number;
  lineEnding: 'LF' | 'CRLF';
  typeLabel: string;
  readOnly: boolean;
  /** Under this width the secondary readings are dropped. */
  narrow: boolean;
  markdown: boolean;
  preview: boolean;
  onTogglePreview: () => void;
}

/** Everything here is a reading of the document, so it is all monospace. */
export function StatusBar({
  line,
  column,
  selectionLength,
  words,
  characters,
  lineEnding,
  typeLabel,
  readOnly,
  narrow,
  markdown,
  preview,
  onTogglePreview,
}: StatusBarProps) {
  return (
    <>
      <span className="tabular-nums">
        Ln {line}, Col {column}
      </span>
      {selectionLength > 0 && <span className="tabular-nums">{selectionLength} selected</span>}
      {!narrow && <span className="tabular-nums">{words} words</span>}
      {!narrow && <span className="tabular-nums">{characters} characters</span>}
      {readOnly && <span className="text-ink-3">Read-only</span>}
      <ToolbarSpacer />
      {!narrow && <span>UTF-8</span>}
      {!narrow && <span>{lineEnding}</span>}
      <span>{typeLabel}</span>
      {markdown && (
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={preview}
          className={cx('mono -mr-1 text-xs', preview && 'bg-surface-3 text-ink')}
          onClick={onTogglePreview}
        >
          Markdown
        </Button>
      )}
    </>
  );
}
