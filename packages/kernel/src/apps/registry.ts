import { extname } from '@lumen/vfs';
import { create } from 'zustand';
import { events } from '../events';
import { getSettings } from '../settings/store';
import type { AppDefinition, AppId, AppManifest } from '../types';

export interface InstalledApp {
  manifest: AppManifest;
  /** VFS path of the `.app` file. */
  path: string;
}

interface RegistryStore {
  apps: Record<AppId, AppDefinition>;
  installed: Record<AppId, InstalledApp>;
  register: (defs: AppDefinition[]) => void;
  unregister: (id: AppId) => void;
  setInstalled: (apps: InstalledApp[]) => void;
}

export const useRegistryStore = create<RegistryStore>((set) => ({
  apps: {},
  installed: {},
  register: (defs) => {
    set((s) => {
      const apps = { ...s.apps };
      for (const d of defs) apps[d.id] = d;
      return { apps };
    });
    events.emit('apps:change');
  },
  unregister: (id) => {
    set((s) => {
      const apps = { ...s.apps };
      delete apps[id];
      return { apps };
    });
    events.emit('apps:change');
  },
  setInstalled: (list) => {
    set({ installed: Object.fromEntries(list.map((a) => [a.manifest.id, a])) });
    events.emit('apps:change');
  },
}));

export function getApp(id: AppId): AppDefinition | undefined {
  return useRegistryStore.getState().apps[id];
}

export function listApps(options: { includeHidden?: boolean } = {}): AppDefinition[] {
  return Object.values(useRegistryStore.getState().apps)
    .filter((a) => options.includeHidden || !a.hidden)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Apps that can open a file, best first. */
export function appsForFile(path: string): AppDefinition[] {
  const ext = extname(path);
  const matches: Array<{ app: AppDefinition; priority: number; role: 'viewer' | 'editor' }> = [];
  for (const app of Object.values(useRegistryStore.getState().apps)) {
    for (const assoc of app.fileAssociations ?? []) {
      if (assoc.extensions.includes(ext) || assoc.extensions.includes('*')) {
        matches.push({ app, priority: assoc.priority ?? 0, role: assoc.role });
      }
    }
  }
  matches.sort((a, b) => b.priority - a.priority || a.app.name.localeCompare(b.app.name));
  return matches.map((m) => m.app);
}

/**
 * What a file opens in: the app the person chose for that kind if there is
 * one, and the registry's own ranking otherwise. A choice for an app that is
 * no longer installed is ignored rather than obeyed into nothing.
 */
export function defaultAppForFile(path: string): AppDefinition | undefined {
  const chosen = getSettings().files.defaultApps[extname(path).toLowerCase()];
  return (chosen ? getApp(chosen) : undefined) ?? appsForFile(path)[0];
}

/**
 * Everything a person may choose to open a file with, in two groups: the apps
 * that claim the type, then every other app that opens files at all.
 *
 * `appsForFile` answers "what should this open in", which is a question with
 * one right answer and a ranked list behind it. Open With asks a different
 * question — "open it in something else" — and offering only the app that
 * would have opened it anyway is no offer. A spreadsheet read as text in the
 * editor is a legitimate thing to want, and it is how a person looks inside a
 * file the system has decided it knows about.
 */
export function appsThatCanOpen(path: string): {
  handlers: AppDefinition[];
  others: AppDefinition[];
} {
  const handlers = appsForFile(path);
  const claimed = new Set(handlers.map((a) => a.id));
  const others = listApps()
    .filter((a) => !claimed.has(a.id) && (a.fileAssociations?.length ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { handlers, others };
}

/** Simple ranked search across name, description and keywords. */
export function searchApps(query: string, limit = 8): AppDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<[number, AppDefinition]> = [];
  for (const app of listApps()) {
    const name = app.name.toLowerCase();
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (app.keywords?.some((k) => k.toLowerCase().startsWith(q))) score = 40;
    else if (app.description.toLowerCase().includes(q)) score = 20;
    if (score > 0) scored.push([score, app]);
  }
  return scored
    .sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name))
    .slice(0, limit)
    .map(([, app]) => app);
}

export function parseManifest(text: string): AppManifest {
  const raw = JSON.parse(text) as Partial<AppManifest>;
  if (!raw || typeof raw !== 'object') throw new Error('manifest is not an object');
  if (typeof raw.id !== 'string' || !/^[a-z0-9_.-]{2,64}$/i.test(raw.id))
    throw new Error('manifest.id is invalid');
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0)
    throw new Error('manifest.name is required');
  if (!raw.alias && !raw.html && !raw.script)
    throw new Error('manifest needs alias, html or script');
  return raw as AppManifest;
}
