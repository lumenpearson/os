import { extname } from '@lumen/vfs';
import { create } from 'zustand';
import { events } from '../events';
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

export function defaultAppForFile(path: string): AppDefinition | undefined {
  return appsForFile(path)[0];
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
