import type { AppDefinition, AppManifest } from '@lumen/kernel';
import { useApps, useInstalledApps, useSetting } from '@lumen/kernel/react';
import {
  AnchoredMenu,
  Button,
  cx,
  IconButton,
  type MenuEntry,
  SegmentedControl,
  type SegmentedOption,
  SettingsGroup,
  SettingsPage,
  Slider,
  Switch,
} from '@lumen/ui';
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ManifestIcon } from '../../_sdk';
import { addPinned, movePinned, removePinned } from '../logic';
import { Row } from '../Row';

const POSITIONS: SegmentedOption<'bottom' | 'left' | 'right'>[] = [
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

interface PinnedEntry {
  id: string;
  name: string;
  icon: ReactNode;
}

function describe(
  id: string,
  apps: Map<string, AppDefinition>,
  manifests: Map<string, AppManifest>,
  size: number,
): PinnedEntry {
  const app = apps.get(id);
  if (app) {
    const Icon = app.icon;
    return { id, name: app.name, icon: <Icon size={size} /> };
  }
  const m = manifests.get(id);
  if (m)
    return { id, name: m.name, icon: <ManifestIcon size={size} name={m.name} icon={m.icon} /> };
  return {
    id,
    name: id,
    icon: (
      <span
        className="inline-block rounded-sm bg-surface-3"
        style={{ width: size, height: size }}
      />
    ),
  };
}

function PinnedApps() {
  const [taskbar, patch] = useSetting('taskbar');
  const apps = useApps();
  const installed = useInstalledApps();
  const byId = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);
  const manifests = useMemo(
    () => new Map(installed.map((i) => [i.manifest.id, i.manifest])),
    [installed],
  );
  const pinned = taskbar.pinned;
  const entries = pinned.map((id) => describe(id, byId, manifests, 20));
  const available = useMemo(() => {
    const list: PinnedEntry[] = [];
    for (const a of apps)
      if (!pinned.includes(a.id)) list.push(describe(a.id, byId, manifests, 16));
    for (const i of installed)
      if (!pinned.includes(i.manifest.id)) list.push(describe(i.manifest.id, byId, manifests, 16));
    return list;
  }, [apps, installed, pinned, byId, manifests]);

  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Drag reorder: the drop indicator is written to the DOM in rAF, never through state.
  const listRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<number | null>(null);
  const indicator = useRef<{ index: number; where: 'before' | 'after' } | null>(null);
  const raf = useRef(0);
  const paint = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-index]') ?? [];
      const ind = indicator.current;
      for (const r of rows) {
        if (ind && Number(r.dataset.index) === ind.index) r.dataset.drop = ind.where;
        else delete r.dataset.drop;
      }
    });
  };
  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );
  const endDrag = () => {
    dragFrom.current = null;
    indicator.current = null;
    paint();
  };

  const move = (from: number, to: number) => patch({ pinned: movePinned(pinned, from, to) });

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        ref={listRef}
        role="list"
        aria-label="Pinned apps"
        className="divide-y divide-rule rounded-sm border border-rule"
      >
        {entries.length === 0 && <p className="px-3 py-2 text-sm text-ink-2">No apps pinned.</p>}
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            role="listitem"
            data-index={i}
            draggable
            onDragStart={(e) => {
              dragFrom.current = i;
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', entry.id);
            }}
            onDragOver={(e) => {
              if (dragFrom.current === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              const r = e.currentTarget.getBoundingClientRect();
              const where = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
              const prev = indicator.current;
              if (!prev || prev.index !== i || prev.where !== where) {
                indicator.current = { index: i, where };
                paint();
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              if (indicator.current?.index === i) {
                indicator.current = null;
                paint();
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragFrom.current;
              const ind = indicator.current;
              endDrag();
              if (from === null || !ind) return;
              let to = ind.where === 'after' ? ind.index + 1 : ind.index;
              if (to > from) to -= 1;
              move(from, to);
            }}
            onDragEnd={endDrag}
            className={cx(
              'flex items-center gap-2 px-2 py-1',
              'data-[drop=before]:shadow-[inset_0_2px_0_0_var(--lumen-accent)]',
              'data-[drop=after]:shadow-[inset_0_-2px_0_0_var(--lumen-accent)]',
            )}
          >
            <GripVertical aria-hidden className="size-4 shrink-0 cursor-grab text-ink-3" />
            {entry.icon}
            <span className="truncate-1 flex-1 text-base">{entry.name}</span>
            <IconButton label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, i - 1)}>
              <ArrowUp />
            </IconButton>
            <IconButton
              label="Move down"
              size="sm"
              disabled={i === entries.length - 1}
              onClick={() => move(i, i + 1)}
            >
              <ArrowDown />
            </IconButton>
            <IconButton
              label={`Unpin ${entry.name}`}
              size="sm"
              onClick={() => patch({ pinned: removePinned(pinned, entry.id) })}
            >
              <X />
            </IconButton>
          </div>
        ))}
      </div>
      <div>
        <Button
          ref={setAddAnchor}
          size="sm"
          icon={<Plus className="size-3.5" />}
          onClick={() => setAddOpen(true)}
          aria-haspopup="menu"
          aria-expanded={addOpen}
        >
          Add…
        </Button>
        <AnchoredMenu
          open={addOpen}
          onClose={() => setAddOpen(false)}
          anchor={addAnchor}
          items={
            available.length === 0
              ? [{ id: 'none', label: 'Every app is pinned', enabled: false }]
              : available.map<MenuEntry>((a) => ({
                  id: a.id,
                  label: a.name,
                  icon: a.icon,
                  onSelect: () => patch({ pinned: addPinned(pinned, a.id) }),
                }))
          }
        />
      </div>
    </div>
  );
}

export function TaskbarPage() {
  const [taskbar, patch] = useSetting('taskbar');
  const [menubar, patchMenubar] = useSetting('menubar');
  return (
    <SettingsPage
      title="Taskbar & Menubar"
      description="Where the taskbar sits, what it holds, and what the menubar shows."
    >
      <SettingsGroup title="Taskbar">
        <Row id="taskbar.position" label="Position">
          <SegmentedControl
            aria-label="Position"
            options={POSITIONS}
            value={taskbar.position}
            onChange={(position) => patch({ position })}
          />
        </Row>
        <Row id="taskbar.size" label="Icon size" stacked>
          <Slider
            aria-label="Icon size"
            min={32}
            max={64}
            step={1}
            value={taskbar.size}
            onChange={(size) => patch({ size })}
            showValue={(v) => `${v} px`}
          />
        </Row>
        <Row
          id="taskbar.autoHide"
          label="Auto-hide"
          description="Slides away until the pointer reaches the edge."
        >
          <Switch
            checked={taskbar.autoHide}
            onChange={(e) => patch({ autoHide: e.target.checked })}
          />
        </Row>
        <Row id="taskbar.magnify" label="Magnify on hover">
          <Switch
            checked={taskbar.magnify}
            onChange={(e) => patch({ magnify: e.target.checked })}
          />
        </Row>
        <Row id="taskbar.labels" label="Show labels" description="App names under the icons.">
          <Switch
            checked={taskbar.showLabels}
            onChange={(e) => patch({ showLabels: e.target.checked })}
          />
        </Row>
        <Row id="taskbar.centered" label="Centred">
          <Switch
            checked={taskbar.centered}
            onChange={(e) => patch({ centered: e.target.checked })}
          />
        </Row>
        <Row
          id="taskbar.recents"
          label="Show recent apps"
          description="Running apps that are not pinned."
        >
          <Switch
            checked={taskbar.showRecents}
            onChange={(e) => patch({ showRecents: e.target.checked })}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Pinned apps" description="Drag to reorder, or use the arrows.">
        <Row id="taskbar.pinned" label="Pinned" stacked>
          <PinnedApps />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Menubar">
        <Row id="taskbar.clock" label="Show clock">
          <Switch
            checked={menubar.showClock}
            onChange={(e) => patchMenubar({ showClock: e.target.checked })}
          />
        </Row>
        <Row id="taskbar.clock24h" label="24-hour clock">
          <Switch
            checked={menubar.clock24h}
            disabled={!menubar.showClock}
            onChange={(e) => patchMenubar({ clock24h: e.target.checked })}
          />
        </Row>
        <Row id="taskbar.seconds" label="Show seconds">
          <Switch
            checked={menubar.showSeconds}
            disabled={!menubar.showClock}
            onChange={(e) => patchMenubar({ showSeconds: e.target.checked })}
          />
        </Row>
        <Row id="taskbar.date" label="Show date">
          <Switch
            checked={menubar.showDate}
            disabled={!menubar.showClock}
            onChange={(e) => patchMenubar({ showDate: e.target.checked })}
          />
        </Row>
        <Row id="taskbar.weekday" label="Show day of week">
          <Switch
            checked={menubar.showDayOfWeek}
            disabled={!menubar.showClock}
            onChange={(e) => patchMenubar({ showDayOfWeek: e.target.checked })}
          />
        </Row>
        <Row id="taskbar.battery" label="Show battery">
          <Switch
            checked={menubar.showBattery}
            onChange={(e) => patchMenubar({ showBattery: e.target.checked })}
          />
        </Row>
        <Row id="taskbar.network" label="Show network">
          <Switch
            checked={menubar.showNetwork}
            onChange={(e) => patchMenubar({ showNetwork: e.target.checked })}
          />
        </Row>
        <Row id="taskbar.sound" label="Show sound">
          <Switch
            checked={menubar.showSound}
            onChange={(e) => patchMenubar({ showSound: e.target.checked })}
          />
        </Row>
        <Row id="taskbar.user" label="Show user">
          <Switch
            checked={menubar.showUser}
            onChange={(e) => patchMenubar({ showUser: e.target.checked })}
          />
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}
