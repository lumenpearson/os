import type { ComponentType, LazyExoticComponent } from 'react';

export type AppId = string;
export type Pid = number;
export type WindowId = string;

export type AppCategory =
  | 'system'
  | 'utilities'
  | 'office'
  | 'media'
  | 'internet'
  | 'developer'
  | 'games'
  | 'user';

export interface AppIconProps {
  size: number;
  className?: string;
}

export interface LaunchArgs {
  /** File or folder to open. */
  path?: string;
  /** Several files (viewers cycle through them). */
  paths?: string[];
  url?: string;
  /** Settings section, help topic, etc. */
  section?: string;
  /** Free-form payload for pseudo-programs. */
  [key: string]: unknown;
}

export interface AppProps {
  pid: Pid;
  windowId: WindowId;
  args: LaunchArgs;
}

export type TitleBarStyle = 'default' | 'inset' | 'hidden';

export interface WindowOptions {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  resizable?: boolean;
  maximizable?: boolean;
  minimizable?: boolean;
  closable?: boolean;
  /**
   * `default`: title bar with title text. `inset`: controls float over the
   * app's own toolbar (Files, Browser). `hidden`: no chrome (splash-like).
   */
  titleBar?: TitleBarStyle;
  /** Fixed position on first open; otherwise cascade/centre. */
  x?: number;
  y?: number;
  centered?: boolean;
  alwaysOnTop?: boolean;
  /** Show the app icon next to the title. */
  showIcon?: boolean;
  /** Initial title before the app sets one. */
  title?: string;
}

export interface FileAssociation {
  extensions: string[];
  role: 'viewer' | 'editor';
  /** Higher wins when several apps claim an extension. */
  priority?: number;
}

export interface ShortcutDefinition {
  /** e.g. "Mod+N", "Shift+Mod+S", "F11". Mod = Ctrl on Windows/Linux, Cmd on macOS. */
  keys: string;
  label: string;
  /** Called with the window that has focus. */
  run: (ctx: { pid: Pid; windowId: WindowId }) => void;
}

export interface AppDefinition {
  id: AppId;
  name: string;
  description: string;
  category: AppCategory;
  version?: string;
  keywords?: string[];
  icon: ComponentType<AppIconProps>;
  component: LazyExoticComponent<ComponentType<AppProps>> | ComponentType<AppProps>;
  window: WindowOptions;
  /** Only one window; launching again focuses it and re-sends args. */
  singleton?: boolean;
  fileAssociations?: FileAssociation[];
  /** Hidden from launchers (system dialogs, recovery). */
  hidden?: boolean;
  /** Pinned to the taskbar on a fresh install. */
  pinnedByDefault?: boolean;
  /** Accepts folders (Files, Terminal). */
  acceptsDirectories?: boolean;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SnapSide =
  | 'left'
  | 'right'
  | 'top'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface WindowState {
  id: WindowId;
  pid: Pid;
  appId: AppId;
  title: string;
  bounds: Rect;
  /** Bounds to restore after maximize/snap. */
  restoreBounds: Rect | null;
  minimized: boolean;
  maximized: boolean;
  fullscreen: boolean;
  snap: SnapSide | null;
  zIndex: number;
  options: WindowOptions;
  /** Unsaved changes: the close button shows a dot and closing asks. */
  dirty: boolean;
  /** Path of the document shown, for the title-bar proxy icon and Recents. */
  documentPath: string | null;
  createdAt: number;
  /** Set while the closing animation plays. */
  closing: boolean;
}

export interface Process {
  pid: Pid;
  appId: AppId;
  name: string;
  args: LaunchArgs;
  startedAt: number;
  windowIds: WindowId[];
  /** Simulated load for the browser build; the desktop build reads the host. */
  cpu: number;
  memory: number;
  /** Background processes have no window (e.g. a timer). */
  background: boolean;
}

export type MenuItemType = 'item' | 'separator' | 'submenu' | 'checkbox' | 'radio';

export interface MenuItemTemplate {
  id?: string;
  type?: MenuItemType;
  label?: string;
  /** e.g. "Mod+S". Rendered, and bound while the menu's window has focus. */
  shortcut?: string;
  enabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  onSelect?: () => void;
  submenu?: MenuItemTemplate[];
}

export interface MenuTemplate {
  id: string;
  label: string;
  items: MenuItemTemplate[];
}

export interface NotificationAction {
  id: string;
  label: string;
}

export interface Notification {
  id: string;
  appId: AppId;
  title: string;
  body?: string;
  createdAt: number;
  read: boolean;
  actions?: NotificationAction[];
  /** ms before the banner hides; 0 keeps it until dismissed. */
  timeout?: number;
  onAction?: (actionId: string) => void;
}

export type SessionState =
  | 'booting'
  | 'setup'
  | 'locked'
  | 'desktop'
  | 'sleeping'
  | 'shutdown'
  | 'restarting';

export interface UserAccount {
  id: string;
  name: string;
  username: string;
  /** Data URL or a preset id like "preset:ember". */
  avatar: string;
  passwordHash: string | null;
  salt: string;
  hint: string;
  recoveryKeyHash: string;
  createdAt: number;
  lastLoginAt: number | null;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  level: LogLevel;
  source: string;
  message: string;
  timestamp: number;
  data?: unknown;
}

/** A `.app` manifest: a pseudo-program stored in the file system. */
export interface AppManifest {
  /** Unique id; user apps are prefixed "user." */
  id: string;
  name: string;
  description?: string;
  version?: string;
  /** One of the preset icon glyph ids or a data URL. */
  icon?: string;
  /** Launch a built-in app, optionally with arguments. */
  alias?: { appId: AppId; args?: LaunchArgs };
  /** Or run an HTML document in a sandboxed frame. */
  html?: string;
  /** Or run a Lumen shell script in the Terminal. */
  script?: string;
  window?: Partial<WindowOptions>;
  category?: AppCategory;
  keywords?: string[];
}

export type ClipboardKind = 'text' | 'files';

export interface ClipboardItem {
  kind: ClipboardKind;
  text?: string;
  /** VFS paths and whether they are cut (move) or copied. */
  files?: { paths: string[]; operation: 'copy' | 'cut' };
  copiedAt: number;
}
