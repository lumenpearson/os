/**
 * The editing commands and the reading of the selection back into toolbar
 * state. Rich-text editing in a contentEditable still runs through
 * document.execCommand: it is the only API every engine implements, and it
 * keeps the browser's own undo stack intact.
 */
import { escapeAttribute, escapeHtml, isElement, tagOf } from './dom';
import { alignFromStyle } from './sanitize';

export const BLOCK_TYPES = [
  { value: 'p', label: 'Paragraph' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'blockquote', label: 'Quote' },
  { value: 'pre', label: 'Code block' },
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number]['value'];
export type Alignment = 'left' | 'center' | 'right';
export type Mark = 'bold' | 'italic' | 'underline' | 'strikeThrough';

const BLOCK_VALUES = new Set<string>(BLOCK_TYPES.map((b) => b.value));

/** execCommand('formatBlock') wants the tag in angle brackets. */
export function formatBlockValue(block: BlockType): string {
  return `<${block}>`;
}

export const ALIGN_COMMANDS: Record<Alignment, string> = {
  left: 'justifyLeft',
  center: 'justifyCenter',
  right: 'justifyRight',
};

export interface EditorState {
  block: BlockType;
  align: Alignment;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  bulletList: boolean;
  numberList: boolean;
  link: boolean;
}

export const INITIAL_EDITOR_STATE: EditorState = {
  block: 'p',
  align: 'left',
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  bulletList: false,
  numberList: false,
  link: false,
};

/** The block that contains a node; list items count as paragraphs. */
export function blockTypeOf(node: Node | null, root: HTMLElement): BlockType {
  let current: Node | null = node;
  while (current !== null && current !== root) {
    const tag = tagOf(current);
    if (tag === 'li' || tag === 'ul' || tag === 'ol') return 'p';
    if (BLOCK_VALUES.has(tag)) return tag as BlockType;
    current = current.parentNode;
  }
  return 'p';
}

/** The alignment written on the nearest block, defaulting to left. */
export function alignmentOf(node: Node | null, root: HTMLElement): Alignment {
  let current: Node | null = node;
  while (current !== null && current !== root) {
    if (isElement(current)) {
      const align = alignFromStyle(current.getAttribute('style'));
      if (align === 'center' || align === 'right') return align;
      if (align !== null) return 'left';
    }
    current = current.parentNode;
  }
  return 'left';
}

export function closestLink(node: Node | null, root: HTMLElement): HTMLAnchorElement | null {
  let current: Node | null = node;
  while (current !== null && current !== root) {
    if (tagOf(current) === 'a') return current as HTMLAnchorElement;
    current = current.parentNode;
  }
  return null;
}

/** Tab indents a list item; anywhere else it must still move focus. */
export function isInsideList(node: Node | null, root: HTMLElement): boolean {
  let current: Node | null = node;
  while (current !== null && current !== root) {
    if (tagOf(current) === 'li') return true;
    current = current.parentNode;
  }
  return false;
}

/** Drop an element but keep its children: how a link is removed. */
export function unwrapElement(element: Element): void {
  const parent = element.parentNode;
  if (parent === null) return;
  while (element.firstChild !== null) parent.insertBefore(element.firstChild, element);
  element.remove();
}

/** Whether a node sits inside the editor at all. */
export function isInside(root: HTMLElement, node: Node | null): boolean {
  return node !== null && (node === root || root.contains(node));
}

export function exec(command: string, value?: string): boolean {
  if (typeof document.execCommand !== 'function') return false;
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

export function queryState(command: string): boolean {
  if (typeof document.queryCommandState !== 'function') return false;
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

/** Read the toolbar's state from the current selection. */
export function readEditorState(root: HTMLElement): EditorState {
  const selection = root.ownerDocument.getSelection();
  const node = selection?.anchorNode ?? null;
  const inside = isInside(root, node);
  return {
    block: inside ? blockTypeOf(node, root) : 'p',
    align: inside ? alignmentOf(node, root) : 'left',
    bold: queryState('bold'),
    italic: queryState('italic'),
    underline: queryState('underline'),
    strike: queryState('strikeThrough'),
    bulletList: queryState('insertUnorderedList'),
    numberList: queryState('insertOrderedList'),
    link: inside && closestLink(node, root) !== null,
  };
}

/** A link to insert when the selection is collapsed and has no text to wrap. */
export function anchorHtml(href: string, label: string): string {
  return `<a href="${escapeAttribute(href)}">${escapeHtml(label)}</a>`;
}
