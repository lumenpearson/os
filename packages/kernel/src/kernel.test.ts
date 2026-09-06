import { createWebPlatform } from '@lumen/platform';
import { MemoryAdapter } from '@lumen/vfs';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRegistryStore } from './apps/registry';
import { createKernel, type Kernel } from './kernel';
import { useProcessStore } from './process/store';
import { useSessionStore } from './session/store';
import { useSettingsStore } from './settings/store';
import type { AppDefinition } from './types';
import { useWindowStore } from './window/store';

const Dummy = () => null;
const apps: AppDefinition[] = [
  {
    id: 'lumen.files',
    name: 'Files',
    description: 'Browse files',
    category: 'system',
    icon: Dummy,
    component: Dummy,
    window: { width: 800, height: 500 },
    acceptsDirectories: true,
  },
  {
    id: 'lumen.editor',
    name: 'Text Editor',
    description: 'Edit text',
    category: 'utilities',
    icon: Dummy,
    component: Dummy,
    window: { width: 600, height: 400 },
    fileAssociations: [{ extensions: ['.txt', '.md'], role: 'editor' }],
  },
  {
    id: 'lumen.settings',
    name: 'Settings',
    description: 'System settings',
    category: 'system',
    icon: Dummy,
    component: Dummy,
    window: { width: 700, height: 500 },
    singleton: true,
  },
  {
    id: 'lumen.terminal',
    name: 'Terminal',
    description: 'Shell',
    category: 'developer',
    icon: Dummy,
    component: Dummy,
    window: { width: 700, height: 400 },
  },
];

function makeKernel(auto = true): Kernel {
  const platform = createWebPlatform();
  return createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps,
    autoSetup: auto ? { name: 'Ada Lovelace' } : null,
  });
}

describe('kernel', () => {
  beforeEach(() => {
    useWindowStore.setState({ windows: {}, order: [], focusedId: null });
    useProcessStore.setState({ processes: {} });
    useRegistryStore.setState({ apps: {}, installed: {} });
  });

  it('boots into setup when there is no user, then locked after setup', async () => {
    const kernel = makeKernel(false);
    expect(await kernel.boot()).toBe('setup');
    const { recoveryKey, user } = await kernel.completeSetup({
      name: 'Grace',
      password: 'hopper1906',
    });
    expect(user.username).toBe('grace');
    expect(recoveryKey).toMatch(/^([A-Z0-9]{4}-){5}[A-Z0-9]{4}$/);
    expect(await kernel.vfs.exists('/Users/grace/Desktop/Welcome.md')).toBe(true);
    expect((await kernel.unlock('wrong')).ok).toBe(false);
    expect((await kernel.unlock('hopper1906')).ok).toBe(true);
    expect(useSessionStore.getState().state).toBe('desktop');
  });

  it('recovers a forgotten password with the recovery key', async () => {
    const kernel = makeKernel(false);
    await kernel.boot();
    const { recoveryKey } = await kernel.completeSetup({ name: 'Grace', password: 'old' });
    expect(await kernel.verifyRecovery('NOPE-NOPE-NOPE-NOPE-NOPE-NOPE')).toBe(false);
    expect(await kernel.verifyRecovery(recoveryKey.toLowerCase())).toBe(true);
    const fresh = await kernel.resetPassword('new-password');
    expect(fresh).not.toBe(recoveryKey);
    expect((await kernel.unlock('old')).ok).toBe(false);
    expect((await kernel.unlock('new-password')).ok).toBe(true);
  });

  it('launches apps, opens files by association and runs .app manifests', async () => {
    const kernel = makeKernel();
    expect(await kernel.boot()).toBe('locked');
    await kernel.unlock('');
    const p = kernel.launch('lumen.files');
    expect(p?.windowIds).toHaveLength(1);
    const editor = await kernel.open('/Users/adalovelace/Desktop/Welcome.md');
    expect(editor?.appId).toBe('lumen.editor');
    const folder = await kernel.open('/Users/adalovelace/Documents');
    expect(folder?.appId).toBe('lumen.files');
    // Two processes, not three: the file manager is one process for the whole
    // session, and both of its windows belong to it.
    expect(Object.keys(useProcessStore.getState().processes)).toHaveLength(2);
    expect(folder?.pid).toBe(p?.pid);

    await kernel.installApp({
      id: 'user.term',
      name: 'Quick Terminal',
      alias: { appId: 'lumen.terminal', args: { cwd: '/' } },
    });
    expect(useRegistryStore.getState().installed['user.term']).toBeDefined();
    const run = await kernel.open('/Applications/Quick Terminal.app');
    expect(run?.appId).toBe('lumen.terminal');
    expect(run?.args.cwd).toBe('/');
    expect(await kernel.vfs.exists('/Applications/Files.app')).toBe(true);
  });

  it('singleton apps focus the existing window', async () => {
    const kernel = makeKernel();
    await kernel.boot();
    const a = kernel.launch('lumen.settings');
    const b = kernel.launch('lumen.settings', { section: 'appearance' });
    expect(a?.pid).toBe(b?.pid);
    expect(Object.keys(useWindowStore.getState().windows)).toHaveLength(1);
  });

  it('close guards can veto, quit exits the process, and bounds are remembered', async () => {
    const kernel = makeKernel();
    await kernel.boot();
    const p = kernel.launch('lumen.terminal');
    const winId = p?.windowIds[0] as string;
    kernel.setCloseGuard(winId, () => false);
    expect(await kernel.closeWindow(winId)).toBe(false);
    kernel.setCloseGuard(winId, null);
    useWindowStore.getState().setBounds(winId, { x: 10, y: 40, width: 500, height: 300 });
    expect(await kernel.closeWindow(winId)).toBe(true);
    expect(useProcessStore.getState().processes[p?.pid as number]).toBeUndefined();
    expect(kernel.state.windowBounds['lumen.terminal']).toEqual({
      x: 10,
      y: 40,
      width: 500,
      height: 300,
    });
    const again = kernel.launch('lumen.terminal');
    const bounds = useWindowStore.getState().windows[again?.windowIds[0] as string]?.bounds;
    expect(bounds?.width).toBe(500);
  });

  it('expands paths and lock/sleep transitions', async () => {
    const kernel = makeKernel();
    await kernel.boot();
    await kernel.unlock('');
    expect(kernel.expandPath('~/Documents')).toBe('/Users/adalovelace/Documents');
    expect(kernel.expandPath('../x', '/Users/adalovelace')).toBe('/Users/x');
    kernel.lock();
    expect(useSessionStore.getState().state).toBe('locked');
    kernel.sleep();
    expect(useSessionStore.getState().state).toBe('sleeping');
    kernel.wake();
    expect(useSessionStore.getState().state).toBe('locked');
  });
});

describe('disposing a kernel', () => {
  it('stops it listening, so a replaced kernel cannot write over the live one', async () => {
    const platform = createWebPlatform();
    const first = createKernel({
      platform: { ...platform, adapter: new MemoryAdapter() },
      apps: [],
      autoSetup: { name: 'Ada' },
    });
    await first.boot();

    let writes = 0;
    const original = first.saveSettings.bind(first);
    first.saveSettings = async () => {
      writes += 1;
      return original();
    };

    first.dispose();
    useSettingsStore.getState().patch('appearance', { accent: 'green' });
    await new Promise((r) => setTimeout(r, 600));

    expect(writes).toBe(0);
  });
});

describe('the file manager', () => {
  it('runs from the moment the session opens, without a window', async () => {
    const kernel = makeKernel();
    await kernel.boot();
    await kernel.unlock('');
    const [files] = useProcessStore.getState().findByApp('lumen.files');
    expect(files).toBeDefined();
    expect(files?.windowIds).toHaveLength(0);
    expect(files?.background).toBe(true);
  });

  it('stays when its last window closes', async () => {
    const kernel = makeKernel();
    await kernel.boot();
    await kernel.unlock('');
    const files = kernel.launch('lumen.files');
    const windowId = files?.windowIds[0];
    expect(windowId).toBeDefined();
    await kernel.closeWindow(windowId as string);
    const after = useProcessStore.getState().findByApp('lumen.files')[0];
    expect(after?.pid).toBe(files?.pid);
    expect(after?.windowIds).toHaveLength(0);
  });

  it('restarts instead of ending when it is killed', async () => {
    const kernel = makeKernel();
    await kernel.boot();
    await kernel.unlock('');
    const before = useProcessStore.getState().findByApp('lumen.files')[0];
    kernel.kill(before?.pid as number);
    const after = useProcessStore.getState().findByApp('lumen.files')[0];
    expect(after).toBeDefined();
    expect(after?.pid).not.toBe(before?.pid);
  });

  it('takes the session with it when it is ended for good', async () => {
    const kernel = makeKernel();
    await kernel.boot();
    await kernel.unlock('');
    kernel.launch('lumen.editor');
    await kernel.endSession('kill -9 from the terminal');
    expect(Object.keys(useProcessStore.getState().processes)).toHaveLength(0);
    expect(useSessionStore.getState().state).toBe('locked');
    // The files are untouched: this is a reboot, not a reset.
    expect(await kernel.vfs.exists('/Users/adalovelace/Desktop/Welcome.md')).toBe(true);
  });
});
