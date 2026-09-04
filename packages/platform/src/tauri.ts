import {
  type DirEntry,
  type FileStat,
  normalize,
  type RemoveOptions,
  type VfsAdapter,
  VfsError,
  type VfsErrorCode,
  type WriteOptions,
} from '@lumen/vfs';
import type { HostConfig, HostProcess, Platform, SystemInfo, SystemMetrics } from './types';
import { KERNEL_VERSION } from './web';

type Invoke = <T>(
  cmd: string,
  args?: Record<string, unknown> | ArrayBuffer | Uint8Array,
  opts?: { headers?: Record<string, string> },
) => Promise<T>;

interface KernelErrorPayload {
  code: VfsErrorCode | 'EHOST';
  path?: string;
  message: string;
}

function toVfsError(e: unknown, path: string): VfsError {
  if (e instanceof VfsError) return e;
  const payload = e as Partial<KernelErrorPayload> | string;
  if (typeof payload === 'object' && payload && typeof payload.code === 'string') {
    const code = payload.code === 'EHOST' ? 'EIO' : payload.code;
    return new VfsError(code, payload.path ?? path, payload.message);
  }
  return new VfsError('EIO', path, typeof payload === 'string' ? payload : String(e));
}

/** Every call is a Tauri command over the Rust sandbox. */
class TauriAdapter implements VfsAdapter {
  readonly id = 'tauri';
  constructor(private readonly invoke: Invoke) {}

  private async call<T>(cmd: string, path: string, args: Record<string, unknown> = {}): Promise<T> {
    try {
      return await this.invoke<T>(cmd, { path, ...args });
    } catch (e) {
      throw toVfsError(e, path);
    }
  }

  stat(path: string): Promise<FileStat> {
    return this.call<FileStat>('fs_stat', normalize(path));
  }
  readDir(path: string): Promise<DirEntry[]> {
    return this.call<DirEntry[]>('fs_read_dir', normalize(path));
  }
  async readFile(path: string): Promise<Uint8Array> {
    const buf = await this.call<ArrayBuffer | number[]>('fs_read_file', normalize(path));
    return buf instanceof ArrayBuffer ? new Uint8Array(buf) : Uint8Array.from(buf);
  }
  async writeFile(path: string, data: Uint8Array, options?: WriteOptions): Promise<void> {
    const n = normalize(path);
    try {
      await this.invoke<void>('fs_write_file', data, {
        headers: {
          'x-lumen-path': encodeURIComponent(n),
          'x-lumen-recursive': options?.recursive ? '1' : '0',
        },
      });
    } catch (e) {
      throw toVfsError(e, n);
    }
  }
  mkdir(path: string, options?: WriteOptions): Promise<void> {
    return this.call<void>('fs_mkdir', normalize(path), { recursive: Boolean(options?.recursive) });
  }
  remove(path: string, options?: RemoveOptions): Promise<void> {
    return this.call<void>('fs_remove', normalize(path), {
      recursive: Boolean(options?.recursive),
    });
  }
  rename(from: string, to: string): Promise<void> {
    return this.call<void>('fs_rename', normalize(from), { to: normalize(to) });
  }
  copyFile(from: string, to: string): Promise<void> {
    return this.call<void>('fs_copy_file', normalize(from), { to: normalize(to) });
  }
  async usage(): Promise<{ used: number; quota: number | null }> {
    return this.call<{ used: number; quota: number | null }>('fs_usage', '/');
  }
}

export async function createTauriPlatform(appVersion = KERNEL_VERSION): Promise<Platform> {
  const core = await import('@tauri-apps/api/core');
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const invoke = core.invoke as unknown as Invoke;
  const win = getCurrentWindow();

  return {
    kind: 'tauri',
    capabilities: {
      hostProcesses: true,
      hostFileSystem: true,
      canQuit: true,
      realMetrics: true,
      relocatableHome: true,
    },
    adapter: new TauriAdapter(invoke),
    window: {
      minimize: () => win.minimize(),
      toggleMaximize: () => win.toggleMaximize(),
      close: () => win.close(),
      setFullscreen: (value) => win.setFullscreen(value),
      isFullscreen: () => win.isFullscreen(),
      setTitle: (title) => win.setTitle(title),
      setAlwaysOnTop: (value) => win.setAlwaysOnTop(value),
    },
    system: {
      async info() {
        const info =
          await invoke<Omit<SystemInfo, 'host' | 'appVersion' | 'display' | 'userAgent'>>(
            'system_info',
          );
        return {
          ...info,
          host: 'tauri',
          appVersion,
          display: { width: screen.width, height: screen.height, scale: devicePixelRatio },
          userAgent: navigator.userAgent,
        };
      },
      metrics: () => invoke<SystemMetrics>('system_metrics'),
      processes: () => invoke<HostProcess[]>('system_processes'),
      killProcess: (pid) => invoke<boolean>('system_kill_process', { pid }),
    },
    shell: {
      openExternal: (url) => invoke<void>('shell_open_external', { url }),
      revealHome: () => invoke<void>('shell_reveal_home'),
    },
    config: {
      get: () => invoke<HostConfig>('config_get'),
      set: (patch) => invoke<HostConfig>('config_set', { patch }),
      pickHomeDir: () => invoke<string | null>('config_pick_home_dir'),
    },
    quit: () => invoke<void>('app_quit'),
    async restart() {
      location.reload();
    },
  };
}
