import { formatShortcut, GLOBAL_SHORTCUTS, type GlobalShortcutId, modIsMeta } from '@lumen/kernel';
import { useSetting } from '@lumen/kernel/react';
import {
  Button,
  cx,
  IconButton,
  SegmentedControl,
  type SegmentedOption,
  SettingsGroup,
  SettingsPage,
} from '@lumen/ui';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Row } from '../Row';
import { findConflict, recordKey } from '../shortcutRecorder';

const MODIFIERS: SegmentedOption<'auto' | 'ctrl' | 'meta'>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'ctrl', label: 'Ctrl' },
  { value: 'meta', label: 'Cmd / Win' },
];

const SHORTCUT_IDS = Object.keys(GLOBAL_SHORTCUTS) as GlobalShortcutId[];

export function KeyboardPage() {
  const [keyboard, patch] = useSetting('keyboard');
  const [recording, setRecording] = useState<GlobalShortcutId | null>(null);
  const [conflict, setConflict] = useState<{ id: GlobalShortcutId; other: string } | null>(null);
  const overrides = keyboard.shortcuts;
  const overridden = SHORTCUT_IDS.filter((id) => id in overrides);
  const bindings: Record<string, string> = Object.fromEntries(
    SHORTCUT_IDS.map((id) => [id, overrides[id] ?? GLOBAL_SHORTCUTS[id].keys]),
  );

  const setBinding = (id: GlobalShortcutId, keys: string) => {
    const next = { ...overrides };
    if (keys === GLOBAL_SHORTCUTS[id].keys) delete next[id];
    else next[id] = keys;
    patch({ shortcuts: next });
    const other = findConflict(keys, id, bindings);
    setConflict(
      other ? { id, other: GLOBAL_SHORTCUTS[other as GlobalShortcutId]?.label ?? other } : null,
    );
  };

  const resetOne = (id: GlobalShortcutId) => {
    const next = { ...overrides };
    delete next[id];
    patch({ shortcuts: next });
    setConflict(null);
  };

  return (
    <SettingsPage
      title="Keyboard"
      description="The primary modifier and the system-wide shortcuts."
    >
      <SettingsGroup title="Modifier">
        <Row
          id="keyboard.modifier"
          label="Modifier key"
          description="Mod = Ctrl on Windows, Cmd on macOS. Auto follows the host."
        >
          <SegmentedControl
            aria-label="Modifier key"
            options={MODIFIERS}
            value={keyboard.modifier}
            onChange={(modifier) => patch({ modifier })}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup
        title="Shortcuts"
        description="Click a shortcut, then press the new keys. Escape cancels."
      >
        <Row id="keyboard.shortcuts" label="System shortcuts" stacked>
          <div className="flex w-full items-center justify-between">
            <span className="text-sm text-ink-2">
              {overridden.length === 0
                ? 'All shortcuts are at their defaults.'
                : `${overridden.length} changed.`}
            </span>
            <Button
              size="sm"
              disabled={overridden.length === 0}
              onClick={() => patch({ shortcuts: {} })}
            >
              Reset all
            </Button>
          </div>
          <table className="w-full border-collapse text-base">
            <thead>
              <tr className="mono text-left text-2xs uppercase tracking-[0.08em] text-ink-3">
                <th className="py-1 pr-2 font-medium">Action</th>
                <th className="py-1 pr-2 font-medium">Keys</th>
                <th className="w-7 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {SHORTCUT_IDS.map((id) => {
                const keys = bindings[id] ?? GLOBAL_SHORTCUTS[id].keys;
                const changed = id in overrides;
                const isRecording = recording === id;
                return (
                  <tr key={id}>
                    <td className="py-1 pr-2 text-ink">{GLOBAL_SHORTCUTS[id].label}</td>
                    <td className="py-1 pr-2">
                      <button
                        type="button"
                        aria-label={`${GLOBAL_SHORTCUTS[id].label}: ${formatShortcut(keys, keyboard.modifier)}. Click to change.`}
                        onClick={() => setRecording(id)}
                        onBlur={() => setRecording((r) => (r === id ? null : r))}
                        onKeyDown={(e) => {
                          if (!isRecording) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const r = recordKey(e.nativeEvent, {
                            modIsMeta: modIsMeta(keyboard.modifier),
                          });
                          if (r.type === 'ignore') return;
                          if (r.type === 'keys') setBinding(id, r.keys);
                          setRecording(null);
                        }}
                        className={cx(
                          'mono inline-flex h-6 min-w-24 items-center rounded-xs border px-2 text-sm lumen-focus tabular-nums',
                          'transition-[border-color,background-color] duration-(--duration-fast) ease-(--ease-standard)',
                          isRecording
                            ? 'border-accent bg-selection text-ink'
                            : 'border-rule-strong bg-surface text-ink-2 hover:text-ink',
                        )}
                      >
                        {isRecording ? 'Press keys…' : formatShortcut(keys, keyboard.modifier)}
                      </button>
                    </td>
                    <td className="py-1">
                      <IconButton
                        label="Reset to default"
                        size="sm"
                        className={cx(!changed && 'invisible')}
                        onClick={() => resetOne(id)}
                      >
                        <RotateCcw />
                      </IconButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {conflict && (
            <p className="text-sm text-danger" role="status">
              {formatShortcut(bindings[conflict.id] ?? '', keyboard.modifier)} is also used by{' '}
              {conflict.other}.
            </p>
          )}
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}
