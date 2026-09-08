import type { Platform } from '@lumen/platform';
import {
  basename,
  dirname,
  elevate,
  extname,
  fileCategory,
  isInside,
  join,
  Vfs,
  VfsError,
} from '@lumen/vfs';
import { defaultAppForFile, getApp, parseManifest, useRegistryStore } from './apps/registry';
import { events } from './events';
import {
  APPLICATIONS_DIR,
  defaultState,
  homeDir,
  type PersistedState,
  SETTINGS_FILE,
  STATE_FILE,
  USERS_FILE,
} from './fs/layout';
import { seedApplications, seedHome, seedSystem } from './fs/seed';
import { log, useLogStore } from './log/store';
import { useMenuStore } from './menu/store';
import { useNotificationStore } from './notifications/store';
import { useProcessStore } from './process/store';
import { useServiceStore } from './services/store';
import { useSessionStore } from './session/store';
import { getSettings, useSettingsStore } from './settings/store';
import { applyThemeToDocument, stopFollowingSystemTheme } from './theme/apply';
import type {
  AppDefinition,
  AppId,
  AppManifest,
  LaunchArgs,
  Pid,
  Process,
  SessionState,
  UserAccount,
  WindowId,
  WindowState,
} from './types';
import {
  createUserAccount,
  currentUser,
  resetCredentials,
  useUsersStore,
  verifyPassword,
  verifyRecoveryKey,
} from './users/store';
import { useWindowStore } from './window/store';

export interface KernelOptions {
  platform: Platform;
  apps: AppDefinition[];
  /** Skip the OOBE and create a passwordless user (tests, demos). */
  autoSetup?: { name: string } | null;
}

/**
 * The kernel wires the platform, the file system and the stores together and
 * exposes the operations the shell and apps call: boot, launch, open, kill,
 * lock, sleep, shut down, install.
 */
export class Kernel {
  readonly platform: Platform;
  readonly vfs: Vfs;
  readonly events = events;
  private stateFile: PersistedState = defaultState();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private settingsTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Everything boot() subscribed to. createKernel replaces the instance and
   * calls dispose() on the old one, so without these a replaced kernel keeps
   * its store and file-system listeners alive and carries on writing settings
   * over the top of the live one.
   */
  private readonly subscriptions: Array<() => void> = [];
  private readonly bootStartedAt = performance.now();
  private readonly autoSetup: KernelOptions['autoSetup'];
  /** Close requests waiting for an app's answer (unsaved changes). */
  private readonly closeGuards = new Map<WindowId, () => Promise<boolean> | boolean>();

  constructor(options: KernelOptions) {
    this.platform = options.platform;
    this.vfs = new Vfs(options.platform.adapter);
    this.autoSetup = options.autoSetup ?? null;
    useRegistryStore.getState().register(options.apps);
  }

  // ── lifecycle ──────────────────────────────────────────────────────────

  async boot(): Promise<SessionState> {
    log.info('kernel', 'boot');
    // Nothing is running yet, whatever a previous kernel in this process left
    // behind. Without this the file manager of an earlier kernel would be
    // found and reused, and its windows would answer for this one.
    useProcessStore.getState().reset();
    await seedSystem(this.vfs);
    await this.loadSettings();
    // The state file holds the account the machine was left signed in as, so
    // it has to be read before the accounts are hydrated against it.
    await this.loadState();
    await this.loadUsers();
    await this.refreshInstalledApps();
    await seedApplications(
      this.vfs,
      Object.values(useRegistryStore.getState().apps)
        .filter((a) => !a.hidden)
        .map((a) => ({ id: a.id, name: a.name, description: a.description })),
    );
    applyThemeToDocument(getSettings());
    this.subscriptions.push(useSettingsStore.subscribe((s) => applyThemeToDocument(s.settings)));
    useLogStore.getState().setEnabled(getSettings().privacy.logging);

    this.subscriptions.push(
      this.vfs.subscribe((e) => {
        if (
          e.path.startsWith(APPLICATIONS_DIR) ||
          e.to?.startsWith(APPLICATIONS_DIR) ||
          extname(e.path) === '.app'
        ) {
          void this.refreshInstalledApps();
        }
      }),
    );

    let user = currentUser();
    if (!user && this.autoSetup) {
      await this.completeSetup({ name: this.autoSetup.name, password: '' });
      user = currentUser();
    }
    const next: SessionState = user ? 'locked' : 'setup';
    useSessionStore.getState().transition(next);
    // The services a real machine would be running come up with the session.
    useServiceStore.getState().boot(Date.now());
    if (!this.tickTimer && !this.platform.capabilities.hostProcesses) {
      this.tickTimer = setInterval(() => useProcessStore.getState().tick(), 2000);
    }
    events.emit('kernel:ready', { bootMs: Math.round(performance.now() - this.bootStartedAt) });
    log.info('kernel', `ready in ${Math.round(performance.now() - this.bootStartedAt)}ms`, {
      session: next,
    });
    return next;
  }

  /** Finish the first-run assistant: create the user, seed the home directory. */
  async completeSetup(input: { name: string; password: string; hint?: string; avatar?: string }) {
    const { user, recoveryKey } = await createUserAccount(input);
    user.lastLoginAt = Date.now();
    useUsersStore.getState().upsert(user);
    useUsersStore.getState().setCurrent(user.id);
    this.updateState((state) => ({ ...state, signedInUserId: user.id }));
    await this.saveUsers();
    await seedHome(this.vfs, user.username, user.name);
    useSettingsStore.getState().patch('setup', { completed: true, completedAt: Date.now() });
    useSettingsStore.getState().patch('files', { home: homeDir(user.username) });
    await this.saveSettings();
    log.info('kernel', `user created: ${user.username}`);
    return { user, recoveryKey };
  }

  async unlock(
    password: string,
  ): Promise<{ ok: boolean; reason?: 'locked-out' | 'wrong' | 'no-user' }> {
    const session = useSessionStore.getState();
    if (session.lockoutRemaining() > 0) return { ok: false, reason: 'locked-out' };
    const user = currentUser();
    if (!user) return { ok: false, reason: 'no-user' };
    const ok = await verifyPassword(user, password);
    if (!ok) {
      session.recordFailedAttempt();
      log.warn('session', 'failed unlock attempt');
      return { ok: false, reason: 'wrong' };
    }
    session.clearFailedAttempts();
    useUsersStore.getState().upsert({ ...user, lastLoginAt: Date.now() });
    void this.saveUsers();
    session.transition('desktop');
    this.ensureFileManager();
    log.info('session', 'unlocked');
    return { ok: true };
  }

  async verifyRecovery(key: string): Promise<boolean> {
    const user = currentUser();
    if (!user) return false;
    return verifyRecoveryKey(user, key);
  }

  /** After a verified recovery key: set a new password, get a fresh recovery key. */
  async resetPassword(newPassword: string, hint?: string): Promise<string> {
    const user = currentUser();
    if (!user) throw new Error('no user');
    const { user: next, recoveryKey } = await resetCredentials(user, newPassword, hint);
    useUsersStore.getState().upsert(next);
    await this.saveUsers();
    useSessionStore.getState().clearFailedAttempts();
    log.info('session', 'password reset through recovery');
    return recoveryKey;
  }

  /** Change the password from Settings after confirming the current one. */
  async changePassword(current: string, next: string, hint?: string): Promise<boolean> {
    const user = currentUser();
    if (!user || !(await verifyPassword(user, current))) return false;
    await this.resetPassword(next, hint);
    return true;
  }

  async updateUser(patch: Partial<Pick<UserAccount, 'name' | 'avatar' | 'hint'>>): Promise<void> {
    const user = currentUser();
    if (!user) return;
    useUsersStore.getState().upsert({ ...user, ...patch });
    await this.saveUsers();
  }

  lock(): void {
    const s = useSessionStore.getState();
    if (s.state !== 'desktop') return;
    s.transition('locked');
    log.info('session', 'locked');
  }

  /**
   * Add a second person to this machine.
   *
   * The account is created and its home is seeded, and that is all: the
   * session stays with whoever asked for it, because creating an account for
   * someone else should not sign you out of your own. The recovery key is
   * returned once and never stored in the clear, exactly as at first run.
   */
  async createProfile(input: {
    name: string;
    password: string;
    hint?: string;
    avatar?: string;
  }): Promise<{ user: UserAccount; recoveryKey: string }> {
    const taken = useUsersStore.getState().users.map((u) => u.username);
    const { user, recoveryKey } = await createUserAccount({ ...input, taken });
    useUsersStore.getState().upsert(user);
    await this.saveUsers();
    await seedHome(this.vfs, user.username, user.name);
    log.info('kernel', `profile created: ${user.username}`);
    return { user, recoveryKey };
  }

  /**
   * Hand the machine to another account: end this session the way signing out
   * does, then make them current so the lock screen asks for their password.
   * It does not sign them in — only their password does that.
   */
  async switchUser(userId: string): Promise<boolean> {
    const target = useUsersStore.getState().users.find((u) => u.id === userId);
    if (!target || target.id === useUsersStore.getState().currentUserId) return false;
    await this.endSession(`switching to ${target.username}`);
    useUsersStore.getState().setCurrent(target.id);
    // The home directory is a setting, and it belongs to whoever is signed in.
    useSettingsStore.getState().patch('files', { home: homeDir(target.username) });
    this.updateState((state) => ({ ...state, signedInUserId: target.id }));
    await this.saveSettings();
    log.info('session', `switched to ${target.username}`);
    return true;
  }

  /**
   * Remove an account. The files stay: deleting somebody's documents is a
   * separate decision from taking away their way in, and one the person doing
   * the removing may not be entitled to make.
   */
  async removeProfile(userId: string): Promise<{ ok: boolean; reason?: 'current' | 'last' }> {
    const { users, currentUserId } = useUsersStore.getState();
    if (users.length <= 1) return { ok: false, reason: 'last' };
    if (userId === currentUserId) return { ok: false, reason: 'current' };
    useUsersStore.getState().remove(userId);
    await this.saveUsers();
    log.info('kernel', `profile removed: ${userId}`);
    return { ok: true };
  }

  sleep(): void {
    const s = useSessionStore.getState();
    if (s.state !== 'desktop' && s.state !== 'locked') return;
    s.transition('sleeping');
  }

  wake(): void {
    const s = useSessionStore.getState();
    if (s.state !== 'sleeping') return;
    s.transition(getSettings().lock.requirePasswordOnWake ? 'locked' : 'desktop');
  }

  async shutdown(): Promise<void> {
    await this.flush();
    useSessionStore.getState().transition('shutdown');
    log.info('session', 'shutdown');
    if (this.platform.capabilities.canQuit) {
      setTimeout(() => void this.platform.quit(), 1200);
    }
  }

  async restart(): Promise<void> {
    await this.flush();
    useSessionStore.getState().transition('restarting');
    setTimeout(() => void this.platform.restart(), 1200);
  }

  /** Erase everything and return to setup. */
  async factoryReset(): Promise<void> {
    for (const entry of await this.vfs.readDir('/')) {
      await this.vfs.remove(entry.path, { recursive: true });
    }
    useUsersStore.getState().hydrate([]);
    useSettingsStore.getState().reset();
    this.stateFile = defaultState();
    for (const p of Object.values(useProcessStore.getState().processes)) this.kill(p.pid);
    await this.platform.restart();
  }

  private async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.stateFile.totalUptimeMs += Date.now() - useSessionStore.getState().bootedAt;
    await Promise.all([this.saveSettings(), this.saveState(), this.saveUsers()]);
  }

  // ── processes & windows ────────────────────────────────────────────────

  /**
   * The file manager. It owns the desktop, so it runs for the whole session
   * whether or not it has a window, and ending it restarts it.
   */
  static readonly FILE_MANAGER: AppId = 'lumen.files';

  launch(appId: AppId, args: LaunchArgs = {}, how: { window?: boolean } = {}): Process | null {
    const app = getApp(appId);
    if (!app) {
      const installed = useRegistryStore.getState().installed[appId];
      if (installed) return this.launchManifest(installed.manifest, args);
      log.error('kernel', `launch: unknown app ${appId}`);
      return null;
    }
    if (app.singleton) {
      const running = useProcessStore.getState().findByApp(appId)[0];
      if (running) {
        const winId = running.windowIds[0];
        if (winId) useWindowStore.getState().focus(winId);
        if (Object.keys(args).length > 0) events.emit('process:args', { pid: running.pid, args });
        return running;
      }
    }
    const windowless = how.window === false;
    // The file manager is one process with as many windows as are open: a
    // window asked for while it is already running joins it rather than
    // starting a second copy of the thing that owns the desktop.
    const running =
      appId === Kernel.FILE_MANAGER
        ? (useProcessStore.getState().findByApp(appId)[0] ?? null)
        : null;
    if (running && windowless) return running;
    const process = running ?? useProcessStore.getState().spawn(appId, app.name, args, windowless);
    if (windowless) {
      log.info('kernel', `launch ${appId} pid=${process.pid} (no window)`);
      return process;
    }
    const remembered = this.stateFile.windowBounds[appId];
    const options =
      remembered && !app.window.centered
        ? {
            ...app.window,
            x: remembered.x,
            y: remembered.y,
            width: remembered.width,
            height: remembered.height,
          }
        : app.window;
    const win = useWindowStore
      .getState()
      .open(process.pid, appId, { ...options, title: options.title ?? app.name });
    useProcessStore.getState().attachWindow(process.pid, win.id);
    if (args.path) this.addRecent(args.path, appId);
    log.info('kernel', `launch ${appId} pid=${process.pid}`, args);
    return useProcessStore.getState().processes[process.pid] ?? process;
  }

  private launchManifest(manifest: AppManifest, args: LaunchArgs): Process | null {
    if (manifest.alias)
      return this.launch(manifest.alias.appId, { ...manifest.alias.args, ...args });
    if (manifest.script)
      return this.launch('lumen.terminal', {
        script: manifest.script,
        title: manifest.name,
        ...args,
      });
    if (manifest.html) return this.launch('lumen.webapp', { manifest, ...args });
    return null;
  }

  /** Open a path with the right app: folders → Files, `.app` → run, files → association. */
  async open(path: string, options: { with?: AppId } = {}): Promise<Process | null> {
    try {
      const st = await this.vfs.stat(path);
      if (st.kind === 'directory') return this.launch(options.with ?? 'lumen.files', { path });
      if (extname(path) === '.app' && !options.with) {
        const manifest = parseManifest(await this.vfs.readText(path));
        return this.launchManifest(manifest, {});
      }
      const app = options.with ? getApp(options.with) : defaultAppForFile(path);
      if (!app) {
        this.notify(
          'lumen.files',
          'No app can open this file',
          `${basename(path)} (${fileCategory(path)})`,
        );
        return null;
      }
      return this.launch(app.id, { path });
    } catch (e) {
      const msg = VfsError.is(e) ? e.message : String(e);
      this.notify('lumen.files', `Could not open ${basename(path)}`, msg);
      log.error('kernel', `open failed: ${path}`, msg);
      return null;
    }
  }

  kill(pid: Pid): void {
    const p = useProcessStore.getState().processes[pid];
    if (!p) return;
    // The desktop is a window of the file manager, so the session has nothing
    // to stand on without it. Ending it restarts it, the way a shell does.
    if (p.appId === Kernel.FILE_MANAGER) {
      this.restartFileManager();
      return;
    }
    for (const id of p.windowIds) {
      this.closeGuards.delete(id);
      useMenuStore.getState().clearMenus(id);
      useWindowStore.getState().close(id);
    }
    useProcessStore.getState().exit(pid);
    log.info('kernel', `exit ${p.appId} pid=${pid}`);
  }

  /** Start the file manager if it is not running. Called when a session opens. */
  ensureFileManager(): Process | null {
    const running = useProcessStore.getState().findByApp(Kernel.FILE_MANAGER)[0];
    if (running) return running;
    return this.launch(Kernel.FILE_MANAGER, {}, { window: false });
  }

  /** Close its windows, end it, and bring it back under a new pid. */
  restartFileManager(): Process | null {
    for (const p of useProcessStore.getState().findByApp(Kernel.FILE_MANAGER)) {
      for (const id of p.windowIds) {
        this.closeGuards.delete(id);
        useMenuStore.getState().clearMenus(id);
        useWindowStore.getState().close(id);
      }
      useProcessStore.getState().exit(p.pid);
    }
    log.info('kernel', 'file manager restarting');
    return this.ensureFileManager();
  }

  /**
   * End the session: every process and window goes, the screen locks, and the
   * files stay exactly as they are. This is what force-killing the file
   * manager under sudo does, and it is meant to feel like a reboot.
   */
  async endSession(reason: string): Promise<void> {
    log.warn('session', `session ended: ${reason}`);
    for (const p of Object.values(useProcessStore.getState().processes)) {
      for (const id of p.windowIds) {
        this.closeGuards.delete(id);
        useMenuStore.getState().clearMenus(id);
        useWindowStore.getState().close(id);
      }
      useProcessStore.getState().exit(p.pid);
    }
    await this.flush();
    useSessionStore.getState().transition('locked');
  }

  /** Apps register a guard that may veto closing (e.g. unsaved document). */
  setCloseGuard(windowId: WindowId, guard: (() => Promise<boolean> | boolean) | null): void {
    if (guard) this.closeGuards.set(windowId, guard);
    else this.closeGuards.delete(windowId);
  }

  /** Close a window, honouring its guard. Exits the process when its last window closes. */
  async closeWindow(windowId: WindowId): Promise<boolean> {
    const win = useWindowStore.getState().windows[windowId];
    if (!win) return true;
    const guard = this.closeGuards.get(windowId);
    if (guard && !(await guard())) return false;
    this.rememberBounds(win);
    this.closeGuards.delete(windowId);
    useMenuStore.getState().clearMenus(windowId);
    useWindowStore.getState().close(windowId);
    useProcessStore.getState().detachWindow(win.pid, windowId);
    const p = useProcessStore.getState().processes[win.pid];
    if (p && p.windowIds.length === 0 && !p.background) useProcessStore.getState().exit(win.pid);
    return true;
  }

  /** Close every window of the process (Quit), honouring guards. */
  async quitApp(pid: Pid): Promise<boolean> {
    const p = useProcessStore.getState().processes[pid];
    if (!p) return true;
    for (const id of [...p.windowIds]) {
      if (!(await this.closeWindow(id))) return false;
    }
    if (useProcessStore.getState().processes[pid]) useProcessStore.getState().exit(pid);
    return true;
  }

  private rememberBounds(win: WindowState) {
    if (win.maximized || win.snap || win.fullscreen) return;
    this.stateFile.windowBounds[win.appId] = { ...win.bounds };
    this.scheduleSave();
  }

  // ── apps (pseudo-programs) ─────────────────────────────────────────────

  async refreshInstalledApps(): Promise<void> {
    const installed: Array<{ manifest: AppManifest; path: string }> = [];
    try {
      for (const entry of await this.vfs.readDir(APPLICATIONS_DIR)) {
        if (entry.kind !== 'file' || extname(entry.name) !== '.app') continue;
        try {
          const manifest = parseManifest(await this.vfs.readText(entry.path));
          if (!getApp(manifest.id)) installed.push({ manifest, path: entry.path });
        } catch (e) {
          log.warn('kernel', `bad manifest ${entry.path}`, String(e));
        }
      }
    } catch {
      /* no applications dir yet */
    }
    useRegistryStore.getState().setInstalled(installed);
  }

  /** Copy a manifest into /Applications so it shows in launchers. */
  async installApp(manifest: AppManifest): Promise<string> {
    const path = join(APPLICATIONS_DIR, `${manifest.name.replace(/[\\/:*?"<>|]/g, '')}.app`);
    await this.vfs.writeText(path, JSON.stringify(manifest, null, 2));
    await this.refreshInstalledApps();
    this.notify('lumen.software', `${manifest.name} installed`, 'Find it in the Start menu.');
    return path;
  }

  async uninstallApp(id: AppId): Promise<void> {
    const installed = useRegistryStore.getState().installed[id];
    if (!installed) return;
    for (const p of useProcessStore.getState().findByApp(id)) this.kill(p.pid);
    await this.vfs.trash(installed.path);
    await this.refreshInstalledApps();
  }

  // ── notifications, recents, state ──────────────────────────────────────

  notify(appId: AppId, title: string, body?: string, extra: { timeout?: number } = {}): void {
    const settings = getSettings().notifications;
    if (settings.muted.includes(appId)) return;
    useNotificationStore.getState().post({
      appId,
      title,
      body,
      timeout: extra.timeout ?? settings.duration,
      silent: settings.doNotDisturb,
    });
  }

  get state(): PersistedState {
    return this.stateFile;
  }

  updateState(patch: Partial<PersistedState> | ((s: PersistedState) => PersistedState)): void {
    this.stateFile =
      typeof patch === 'function' ? patch(this.stateFile) : { ...this.stateFile, ...patch };
    this.scheduleSave();
  }

  addRecent(path: string, appId: AppId): void {
    if (!getSettings().privacy.recents) return;
    if (isInside('/System', path, true)) return;
    const recents = [
      { path, openedAt: Date.now(), appId },
      ...this.stateFile.recents.filter((r) => r.path !== path),
    ].slice(0, 30);
    this.updateState({ recents });
  }

  toggleFavorite(path: string): void {
    const favorites = this.stateFile.favorites.includes(path)
      ? this.stateFile.favorites.filter((f) => f !== path)
      : [...this.stateFile.favorites, path];
    this.updateState({ favorites });
  }

  /** The home directory of the signed-in user, or "/" before setup. */
  get home(): string {
    const user = currentUser();
    return user ? homeDir(user.username) : '/';
  }

  /** Expand "~" and relative paths against the home directory. */
  expandPath(input: string, cwd = this.home): string {
    if (input === '~') return this.home;
    if (input.startsWith('~/')) return join(this.home, input.slice(2));
    if (input.startsWith('/')) return join(input);
    return join(cwd, input);
  }

  /** Human label for a path: home → "Home", /Users/x/Desktop → "Desktop". */
  labelFor(path: string): string {
    if (path === '/') return 'This Computer';
    if (path === this.home) return 'Home';
    if (path === '/Trash') return 'Trash';
    return basename(path) || dirname(path);
  }

  // ── persistence ────────────────────────────────────────────────────────

  private async loadSettings() {
    try {
      useSettingsStore.getState().hydrate(await this.vfs.readJson(SETTINGS_FILE));
    } catch {
      useSettingsStore.getState().hydrate(null);
      await this.saveSettings();
    }
    this.subscriptions.push(
      useSettingsStore.subscribe(() => {
        if (this.settingsTimer) clearTimeout(this.settingsTimer);
        this.settingsTimer = setTimeout(() => void this.saveSettings(), 400);
      }),
    );
  }

  saveSettings(): Promise<void> {
    return this.vfs
      .writeJson(SETTINGS_FILE, getSettings(), {
        recursive: true,
        elevation: elevate('kernel: saveSettings'),
      })
      .catch((e) => log.error('kernel', 'saveSettings', String(e)));
  }

  private async loadUsers() {
    const signedIn = this.stateFile.signedInUserId;
    try {
      const users = await this.vfs.readJson<UserAccount[]>(USERS_FILE);
      useUsersStore.getState().hydrate(Array.isArray(users) ? users : [], signedIn);
    } catch {
      useUsersStore.getState().hydrate([], signedIn);
    }
  }

  private saveUsers(): Promise<void> {
    return this.vfs
      .writeJson(USERS_FILE, useUsersStore.getState().users, {
        recursive: true,
        elevation: elevate('kernel: saveUsers'),
      })
      .catch((e) => log.error('kernel', 'saveUsers', String(e)));
  }

  private async loadState() {
    try {
      const stored = await this.vfs.readJson<Partial<PersistedState>>(STATE_FILE);
      this.stateFile = { ...defaultState(), ...stored };
    } catch {
      this.stateFile = defaultState();
    }
  }

  private saveState(): Promise<void> {
    return this.vfs
      .writeJson(STATE_FILE, this.stateFile, {
        recursive: true,
        elevation: elevate('kernel: saveState'),
      })
      .catch((e) => log.error('kernel', 'saveState', String(e)));
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveState();
    }, 600);
  }

  dispose(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.settingsTimer) clearTimeout(this.settingsTimer);
    this.tickTimer = null;
    this.saveTimer = null;
    this.settingsTimer = null;
    for (const off of this.subscriptions.splice(0)) off();
    stopFollowingSystemTheme();
  }
}

let instance: Kernel | null = null;

export function createKernel(options: KernelOptions): Kernel {
  instance?.dispose();
  instance = new Kernel(options);
  return instance;
}

export function getKernel(): Kernel {
  if (!instance) throw new Error('kernel not created');
  return instance;
}
