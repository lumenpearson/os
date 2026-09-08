import { useCallback, useEffect, useMemo, useState } from 'react';
import { isContextMenuKey, type MenuEntry } from './Menu';

/** An input or textarea the editing menu can act on. */
export type TextField = HTMLInputElement | HTMLTextAreaElement;

/**
 * Whether a node is a field the editing menu can work with. The test is the
 * selection API rather than a list of input types: `selectionStart` is null
 * on exactly the inputs where a caret has no meaning — number, email, colour,
 * checkbox, file — and a hand-written list of the others would go stale.
 */
export function isTextField(node: EventTarget | null): node is TextField {
  if (typeof HTMLTextAreaElement !== 'undefined' && node instanceof HTMLTextAreaElement)
    return true;
  return (
    typeof HTMLInputElement !== 'undefined' &&
    node instanceof HTMLInputElement &&
    node.selectionStart !== null
  );
}

/**
 * What the page is allowed to do with the system clipboard. Reading is the
 * one that is routinely refused: Firefox does not offer `readText` to a page
 * at all, and Chrome will only grant it once the person says so.
 */
export type ClipboardAccess = 'ok' | 'denied' | 'unavailable';

/** Why an item is off, in the few words a menu has room for. */
const REASON: Record<ClipboardAccess, string | undefined> = {
  ok: undefined,
  denied: 'permission denied',
  unavailable: 'unavailable in this browser',
};

export interface TextFieldMenuState {
  /** The field takes typing: not read-only, not disabled. */
  editable: boolean;
  /** Part of the value is selected, so there is something to cut or copy. */
  hasSelection: boolean;
  /** The field holds any text at all. */
  hasText: boolean;
  /** A password field: its text is never handed to the clipboard. */
  secret: boolean;
  read: ClipboardAccess;
  write: ClipboardAccess;
}

export interface TextFieldMenuActions {
  cut: () => void;
  copy: () => void;
  paste: () => void;
  selectAll: () => void;
}

/**
 * Cut / Copy / Paste / Select All for one text field. Every item is either
 * live or says why it is not: an item that looks ready and then does nothing
 * is the thing this menu exists to avoid.
 */
export function textFieldMenuItems(
  state: TextFieldMenuState,
  actions: TextFieldMenuActions,
  shortcut: (keys: string) => string,
): MenuEntry[] {
  const items: MenuEntry[] = [];
  // A password field hands nothing to the clipboard, so the two items that
  // would take it out of the field are not offered at all.
  if (!state.secret) {
    const blocked = state.hasSelection ? REASON[state.write] : undefined;
    items.push({
      id: 'cut',
      label: 'Cut',
      shortcut: shortcut('Mod+X'),
      enabled: state.editable && state.hasSelection && state.write === 'ok',
      hint: state.editable ? blocked : undefined,
      onSelect: actions.cut,
    });
    items.push({
      id: 'copy',
      label: 'Copy',
      shortcut: shortcut('Mod+C'),
      enabled: state.hasSelection && state.write === 'ok',
      hint: blocked,
      onSelect: actions.copy,
    });
  }
  items.push({
    id: 'paste',
    label: 'Paste',
    shortcut: shortcut('Mod+V'),
    enabled: state.editable && state.read === 'ok',
    hint: state.editable ? REASON[state.read] : undefined,
    onSelect: actions.paste,
  });
  items.push({ id: 'edit-sep', type: 'separator' });
  items.push({
    id: 'select-all',
    label: 'Select All',
    shortcut: shortcut('Mod+A'),
    enabled: state.hasText,
    onSelect: actions.selectAll,
  });
  return items;
}

/** The clipboard as the runtime actually has it, which can be not at all. */
function clipboard(): Clipboard | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.clipboard as Clipboard | undefined;
}

function writeAccess(): ClipboardAccess {
  return typeof clipboard()?.writeText === 'function' ? 'ok' : 'unavailable';
}

function readAccess(): ClipboardAccess {
  return typeof clipboard()?.readText === 'function' ? 'ok' : 'unavailable';
}

/**
 * The read permission as the browser reports it. Anything short of a flat
 * "denied" is treated as available: a browser that answers "prompt" will ask
 * the person when Paste is chosen, and one that refuses the question at all
 * tells us nothing, so the honest answer is to let them try.
 */
async function readPermission(): Promise<ClipboardAccess> {
  const sync = readAccess();
  if (sync !== 'ok') return sync;
  try {
    const permissions = typeof navigator === 'undefined' ? undefined : navigator.permissions;
    if (!permissions?.query) return 'ok';
    const status = await permissions.query({ name: 'clipboard-read' as PermissionName });
    return status.state === 'denied' ? 'denied' : 'ok';
  } catch {
    return 'ok';
  }
}

/**
 * React remembers the value it last wrote to a field, so assigning
 * `el.value` leaves it certain nothing changed and the next render puts the
 * old text back. Going through the prototype setter and firing `input` is
 * what makes a controlled field accept an edit that came from outside React.
 */
function writeValue(el: TextField, value: string, caret: number) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** The field as it stood when the menu opened; the menu takes the focus away. */
interface Field {
  el: TextField;
  start: number;
  end: number;
  editable: boolean;
  secret: boolean;
}

function snapshot(el: TextField): Field {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? start;
  return {
    el,
    start: Math.min(start, end),
    end: Math.max(start, end),
    editable: !el.readOnly && !el.disabled,
    secret: el instanceof HTMLInputElement && el.type === 'password',
  };
}

export interface TextFieldMenuOptions {
  /** Write a chord like `Mod+X` the way this system writes shortcuts. */
  shortcut: (keys: string) => string;
}

export interface TextFieldMenu {
  open: boolean;
  at: { x: number; y: number } | null;
  items: MenuEntry[];
  close: () => void;
  /**
   * Open the editing menu on the field under a right-click. Returns false
   * when the click landed somewhere else, so the caller can decide what a
   * right-click there should do instead.
   */
  openAt: (event: { target: EventTarget | null; clientX: number; clientY: number }) => boolean;
}

/**
 * The editing menu every text field shares. One of these serves a whole
 * screen: the caller hands it a right-click, and it answers for inputs and
 * textareas wherever they were drawn, including the plain ones an app wrote
 * itself. The Menu key and Shift+F10 open it for the field that has focus.
 */
export function useTextFieldMenu({ shortcut }: TextFieldMenuOptions): TextFieldMenu {
  const [field, setField] = useState<Field | null>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [read, setRead] = useState<ClipboardAccess>(readAccess);
  const [write, setWrite] = useState<ClipboardAccess>(writeAccess);

  const close = useCallback(() => {
    setField(null);
    setAt(null);
  }, []);

  const openFor = useCallback((el: TextField, x: number, y: number) => {
    setField(snapshot(el));
    setAt({ x, y });
    // Permission can have been granted or withdrawn since the last menu, so
    // both answers are asked for again every time one opens.
    setWrite(writeAccess());
    void readPermission().then(setRead);
  }, []);

  const openAt = useCallback(
    (event: { target: EventTarget | null; clientX: number; clientY: number }) => {
      if (!isTextField(event.target)) return false;
      openFor(event.target, event.clientX, event.clientY);
      return true;
    },
    [openFor],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A component with a menu of its own has already answered the key.
      if (e.defaultPrevented || !isContextMenuKey(e)) return;
      const el = document.activeElement;
      if (!isTextField(el)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      openFor(el, rect.left + 8, rect.bottom - 2);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openFor]);

  const items = useMemo(() => {
    if (!field) return [];
    const { el, start, end } = field;
    const selected = el.value.slice(start, end);
    const focusField = () => {
      el.focus();
      el.setSelectionRange(start, end);
    };
    return textFieldMenuItems(
      {
        editable: field.editable,
        hasSelection: end > start,
        hasText: el.value.length > 0,
        secret: field.secret,
        read,
        write,
      },
      {
        cut: () => {
          // The text leaves the field only once the clipboard has it.
          clipboard()
            ?.writeText(selected)
            .then(() => {
              el.focus();
              writeValue(el, el.value.slice(0, start) + el.value.slice(end), start);
            })
            .catch(() => setWrite('denied'));
        },
        copy: () => {
          clipboard()
            ?.writeText(selected)
            .catch(() => setWrite('denied'));
          focusField();
        },
        paste: () => {
          clipboard()
            ?.readText()
            .then((text) => {
              if (!text) return;
              el.focus();
              writeValue(
                el,
                el.value.slice(0, start) + text + el.value.slice(end),
                start + text.length,
              );
            })
            .catch(() => setRead('denied'));
        },
        selectAll: () => {
          el.focus();
          el.select();
        },
      },
      shortcut,
    );
  }, [field, read, write, shortcut]);

  return { open: field !== null, at, items, close, openAt };
}
