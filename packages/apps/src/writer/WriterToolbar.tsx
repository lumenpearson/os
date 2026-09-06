import { Divider, IconButton, Select, type SelectOption, Toolbar, ToolbarGroup } from '@lumen/ui';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BookOpen,
  CalendarDays,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Redo2,
  RemoveFormatting,
  Search,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import type { MouseEvent } from 'react';
import { BLOCK_TYPES, type BlockType, type EditorState } from './editing';
import type { WriterActions } from './menus';

export interface WriterToolbarProps {
  editor: EditorState;
  readOnly: boolean;
  readingMode: boolean;
  findOpen: boolean;
  actions: WriterActions;
}

const BLOCK_OPTIONS: Array<SelectOption<BlockType>> = BLOCK_TYPES.map((block) => ({
  value: block.value,
  label: block.label,
}));

/** Pressing a toolbar button must not take the caret out of the page. */
function keepSelection(event: MouseEvent) {
  event.preventDefault();
}

export function WriterToolbar({
  editor,
  readOnly,
  readingMode,
  findOpen,
  actions,
}: WriterToolbarProps) {
  return (
    <Toolbar dense className="gap-1 overflow-x-auto overflow-y-hidden">
      <ToolbarGroup>
        <IconButton
          label="Undo"
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={actions.undo}
        >
          <Undo2 />
        </IconButton>
        <IconButton
          label="Redo"
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={actions.redo}
        >
          <Redo2 />
        </IconButton>
      </ToolbarGroup>
      <Rule />
      <Select
        aria-label="Paragraph style"
        size="sm"
        className="shrink-0"
        options={BLOCK_OPTIONS}
        value={editor.block}
        disabled={readOnly}
        onChange={actions.setBlock}
      />
      <Rule />
      <ToolbarGroup>
        <IconButton
          label="Bold"
          active={editor.bold}
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={() => actions.toggleMark('bold')}
        >
          <Bold />
        </IconButton>
        <IconButton
          label="Italic"
          active={editor.italic}
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={() => actions.toggleMark('italic')}
        >
          <Italic />
        </IconButton>
        <IconButton
          label="Underline"
          active={editor.underline}
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={() => actions.toggleMark('underline')}
        >
          <Underline />
        </IconButton>
        <IconButton
          label="Strikethrough"
          active={editor.strike}
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={() => actions.toggleMark('strikeThrough')}
        >
          <Strikethrough />
        </IconButton>
      </ToolbarGroup>
      <Rule />
      <ToolbarGroup>
        <IconButton
          label="Bulleted list"
          active={editor.bulletList}
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={() => actions.toggleList('bullet')}
        >
          <List />
        </IconButton>
        <IconButton
          label="Numbered list"
          active={editor.numberList}
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={() => actions.toggleList('number')}
        >
          <ListOrdered />
        </IconButton>
        <IconButton
          label="Outdent"
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={actions.outdent}
        >
          <IndentDecrease />
        </IconButton>
        <IconButton
          label="Indent"
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={actions.indent}
        >
          <IndentIncrease />
        </IconButton>
      </ToolbarGroup>
      <Rule />
      <ToolbarGroup>
        <IconButton
          label="Align left"
          active={editor.align === 'left'}
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={() => actions.setAlignment('left')}
        >
          <AlignLeft />
        </IconButton>
        <IconButton
          label="Align centre"
          active={editor.align === 'center'}
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={() => actions.setAlignment('center')}
        >
          <AlignCenter />
        </IconButton>
        <IconButton
          label="Align right"
          active={editor.align === 'right'}
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={() => actions.setAlignment('right')}
        >
          <AlignRight />
        </IconButton>
      </ToolbarGroup>
      <Rule />
      <ToolbarGroup>
        <IconButton
          label="Link"
          active={editor.link}
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={actions.link}
        >
          <Link />
        </IconButton>
        <IconButton
          label="Clear formatting"
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={actions.clearFormatting}
        >
          <RemoveFormatting />
        </IconButton>
        <IconButton
          label="Horizontal rule"
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={actions.insertRule}
        >
          <Minus />
        </IconButton>
        <IconButton
          label="Insert date"
          disabled={readOnly}
          onMouseDown={keepSelection}
          onClick={actions.insertDate}
        >
          <CalendarDays />
        </IconButton>
      </ToolbarGroup>
      <div className="flex-1" />
      <ToolbarGroup>
        <IconButton label="Find" active={findOpen} onClick={actions.find}>
          <Search />
        </IconButton>
        <IconButton label="Reading mode" active={readingMode} onClick={actions.toggleReadingMode}>
          <BookOpen />
        </IconButton>
      </ToolbarGroup>
    </Toolbar>
  );
}

function Rule() {
  return (
    <span className="mx-0.5 flex h-4 shrink-0 items-stretch">
      <Divider vertical />
    </span>
  );
}
