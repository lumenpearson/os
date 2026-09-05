/**
 * The section list and the per-row search index. Pure data plus the search
 * function, so the shell's Spotlight can import SETTINGS_SECTIONS without
 * pulling React in, and the ranking can be unit tested.
 */

export type SectionId =
  | 'general'
  | 'appearance'
  | 'animation'
  | 'wallpaper'
  | 'taskbar'
  | 'display'
  | 'security'
  | 'notifications'
  | 'sound'
  | 'network'
  | 'keyboard'
  | 'cursor'
  | 'region'
  | 'files'
  | 'storage'
  | 'privacy'
  | 'power'
  | 'reset'
  | 'about';

export interface SettingsSection {
  id: SectionId;
  label: string;
  keywords: string[];
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'general',
    label: 'General',
    keywords: ['user', 'name', 'avatar', 'computer', 'update', 'about'],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    keywords: ['theme', 'dark', 'light', 'accent', 'colour', 'color', 'font', 'contrast', 'motion'],
  },
  {
    id: 'animation',
    label: 'Animation',
    keywords: ['motion', 'transitions', 'speed', 'duration', 'minimise', 'minimize', 'drag'],
  },
  { id: 'wallpaper', label: 'Wallpaper', keywords: ['desktop', 'background', 'picture', 'icons'] },
  {
    id: 'taskbar',
    label: 'Taskbar & Menubar',
    keywords: ['dock', 'pinned', 'clock', 'menu bar', 'tray'],
  },
  {
    id: 'display',
    label: 'Display',
    keywords: ['scale', 'resolution', 'screen', 'zoom', 'shadows', 'snapping'],
  },
  {
    id: 'security',
    label: 'Lock Screen & Security',
    keywords: ['password', 'lock', 'screensaver', 'recovery key', 'sign in'],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    keywords: ['alerts', 'banners', 'do not disturb', 'focus'],
  },
  { id: 'sound', label: 'Sound', keywords: ['volume', 'audio', 'mute', 'speaker'] },
  {
    id: 'network',
    label: 'Network',
    keywords: ['wi-fi', 'wifi', 'bluetooth', 'airplane', 'internet'],
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    keywords: ['shortcuts', 'hotkeys', 'modifier', 'ctrl', 'cmd'],
  },
  { id: 'cursor', label: 'Cursor', keywords: ['mouse', 'pointer', 'arrow', 'trail'] },
  {
    id: 'region',
    label: 'Language & Region',
    keywords: ['locale', 'time zone', 'date', 'format', 'units', 'temperature'],
  },
  {
    id: 'files',
    label: 'Files',
    keywords: ['finder', 'explorer', 'hidden', 'extensions', 'home folder', 'trash'],
  },
  { id: 'storage', label: 'Storage', keywords: ['disk', 'space', 'usage', 'trash', 'quota'] },
  { id: 'privacy', label: 'Privacy', keywords: ['recents', 'history', 'log', 'telemetry'] },
  { id: 'power', label: 'Power', keywords: ['sleep', 'restart', 'shut down', 'battery', 'energy'] },
  { id: 'reset', label: 'Reset', keywords: ['defaults', 'erase', 'factory', 'start over'] },
  {
    id: 'about',
    label: 'About',
    keywords: ['version', 'kernel', 'licence', 'license', 'github', 'uptime'],
  },
];

export const SECTION_IDS: SectionId[] = SETTINGS_SECTIONS.map((s) => s.id);

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === 'string' && (SECTION_IDS as string[]).includes(value);
}

export function sectionById(id: SectionId): SettingsSection {
  const found = SETTINGS_SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`unknown settings section ${id}`);
  return found;
}

/** Sidebar groups, in display order. Unlabelled: the gap alone separates them. */
export const SIDEBAR_GROUPS: SectionId[][] = [
  ['general', 'appearance', 'animation', 'wallpaper', 'taskbar', 'display'],
  ['security', 'notifications', 'sound', 'network'],
  ['keyboard', 'cursor', 'region', 'files', 'storage'],
  ['privacy', 'power', 'reset', 'about'],
];

export interface SettingsRowIndex {
  /** `<section>.<row>`; the page renders the row with the same id. */
  id: string;
  section: SectionId;
  label: string;
  keywords: string[];
}

const row = (
  section: SectionId,
  id: string,
  label: string,
  keywords: string[] = [],
): SettingsRowIndex => ({
  id: `${section}.${id}`,
  section,
  label,
  keywords,
});

export const SETTINGS_ROWS: SettingsRowIndex[] = [
  row('general', 'user', 'Name and avatar', ['account', 'picture', 'profile']),
  row('general', 'computer', 'Computer name', ['hostname']),
  row('general', 'about', 'About this computer', ['version', 'system information']),
  row('general', 'updates', 'Software update', ['check for updates', 'version']),
  row('general', 'updates.channel', 'Update channel', ['stable', 'beta']),
  row('general', 'updates.automatic', 'Automatic updates', ['install automatically']),
  row('appearance', 'theme', 'Theme', ['dark', 'light', 'auto', 'mode']),
  row('appearance', 'accent', 'Accent colour', ['color', 'blue', 'tint', 'highlight']),
  row('appearance', 'contrast', 'Contrast', ['high contrast', 'accessibility']),
  row('appearance', 'motion', 'Reduce motion', ['animation', 'accessibility']),
  row('appearance', 'transparency', 'Reduce transparency', ['blur', 'glass']),
  row('appearance', 'blur', 'Blur', ['transparency', 'glass', 'frosted', 'opaque']),
  row('appearance', 'fontScale', 'Font size', ['text size', 'zoom', 'accessibility']),
  row('animation', 'speed', 'Animation speed', ['duration', 'faster', 'slower', 'off', 'motion']),
  row('animation', 'windows', 'Open and close', ['window', 'zoom', 'scale']),
  row('animation', 'minimize', 'Minimise', ['minimize', 'taskbar', 'slide', 'fade']),
  row('animation', 'windowMove', 'Smooth a window while it is dragged', [
    'move',
    'drag',
    'smoothing',
    'lag',
  ]),
  row('animation', 'menus', 'Menus', ['popover', 'start menu', 'context menu']),
  row('animation', 'dialogs', 'Dialogs', ['sheet', 'alert', 'prompt']),
  row('animation', 'panels', 'Panels', ['taskbar', 'system bar', 'control centre']),
  row('animation', 'pages', 'Pages', ['views', 'transition', 'navigation']),
  row('animation', 'press', 'Press', ['click', 'mouse button', 'right click', 'feedback']),
  row('wallpaper', 'picker', 'Wallpaper', ['background', 'picture', 'image']),
  row('wallpaper', 'fit', 'Fit', ['cover', 'contain', 'tile', 'center']),
  row('wallpaper', 'icons', 'Desktop icons', ['show icons']),
  row('wallpaper', 'iconSize', 'Icon size', []),
  row('wallpaper', 'sortBy', 'Sort desktop by', ['name', 'kind', 'date']),
  row('wallpaper', 'dynamicChrome', 'Dynamic chrome', ['tint', 'menubar colour']),
  row('taskbar', 'position', 'Position', ['bottom', 'left', 'right', 'dock']),
  row('taskbar', 'size', 'Icon size', ['dock size']),
  row('taskbar', 'autoHide', 'Auto-hide', ['hide taskbar']),
  row('taskbar', 'magnify', 'Magnify on hover', ['magnification']),
  row('taskbar', 'labels', 'Show labels', ['titles']),
  row('taskbar', 'centered', 'Centred', ['center', 'align']),
  row('taskbar', 'recents', 'Show recent apps', ['recents']),
  row('taskbar', 'pinned', 'Pinned apps', ['dock apps', 'add app', 'reorder']),
  row('taskbar', 'clock', 'Show clock', ['time', 'menubar']),
  row('taskbar', 'clock24h', '24-hour clock', ['time format', 'am pm']),
  row('taskbar', 'seconds', 'Show seconds', []),
  row('taskbar', 'date', 'Show date', []),
  row('taskbar', 'weekday', 'Show day of week', []),
  row('taskbar', 'battery', 'Show battery', ['status', 'menubar']),
  row('taskbar', 'network', 'Show network', ['wi-fi icon', 'menubar']),
  row('taskbar', 'sound', 'Show sound', ['volume icon', 'menubar']),
  row('taskbar', 'user', 'Show user', ['account', 'menubar']),
  row('display', 'scale', 'Scale', ['zoom', 'size', 'resolution', 'dpi']),
  row('display', 'snapping', 'Window snapping', ['tiling', 'edges']),
  row('display', 'shadows', 'Window shadows', ['performance']),
  row('display', 'overlay', 'Performance overlay', ['fps', 'memory', 'debug']),
  row('display', 'viewport', 'Viewport', ['resolution', 'pixel ratio', 'size']),
  row('security', 'autoLock', 'Lock after', ['auto lock', 'idle', 'timeout']),
  row('security', 'screensaver', 'Screensaver', ['clock', 'drift', 'starfield']),
  row('security', 'screensaverAfter', 'Start screensaver after', ['idle']),
  row('security', 'wake', 'Require password on wake', ['sleep']),
  row('security', 'hint', 'Show password hint', []),
  row('security', 'clock', 'Show clock on lock screen', []),
  row('security', 'message', 'Lock screen message', ['if found']),
  row('security', 'password', 'Change password', ['passcode']),
  row('security', 'recovery', 'Recovery key', ['forgot password', 'reset']),
  row('security', 'lockNow', 'Lock now', ['lock screen']),
  row('notifications', 'dnd', 'Do Not Disturb', ['focus', 'silence', 'quiet']),
  row('notifications', 'previews', 'Show previews', ['content']),
  row('notifications', 'sound', 'Play sound', ['alert sound']),
  row('notifications', 'duration', 'Banner duration', ['timeout', 'seconds']),
  row('notifications', 'apps', 'Notifications per app', ['mute', 'allow']),
  row('notifications', 'test', 'Send a test notification', []),
  row('sound', 'volume', 'Volume', ['loudness']),
  row('sound', 'mute', 'Mute', ['silent']),
  row('sound', 'ui', 'Interface sounds', ['clicks', 'alerts']),
  row('sound', 'startup', 'Startup sound', ['chime', 'boot']),
  row('network', 'wifi', 'Wi-Fi', ['wireless', 'wlan']),
  row('network', 'ssid', 'Network name', ['ssid']),
  row('network', 'bluetooth', 'Bluetooth', ['devices']),
  row('network', 'airplane', 'Airplane mode', ['flight mode', 'offline']),
  row('network', 'status', 'Status', ['connected']),
  row('keyboard', 'modifier', 'Modifier key', ['ctrl', 'cmd', 'command', 'control', 'meta']),
  row('keyboard', 'shortcuts', 'Shortcuts', ['hotkeys', 'keys', 'bindings', 'record']),
  row('cursor', 'style', 'Style', ['pointer', 'arrow', 'native', 'classic']),
  row('cursor', 'size', 'Size', ['big cursor', 'accessibility']),
  row('cursor', 'color', 'Colour', ['color', 'light', 'dark']),
  row('cursor', 'trail', 'Trail', ['motion']),
  row('region', 'locale', 'Language', ['locale', 'english', 'deutsch']),
  row('region', 'timeZone', 'Time zone', ['utc', 'clock']),
  row('region', 'firstDay', 'First day of week', ['monday', 'sunday', 'calendar']),
  row('region', 'dateFormat', 'Date format', ['iso', 'us', 'eu']),
  row('region', 'temperature', 'Temperature', ['celsius', 'fahrenheit', 'weather']),
  row('region', 'measurement', 'Measurement', ['metric', 'imperial', 'units']),
  row('region', 'preview', 'Preview', ['today']),
  row('files', 'hidden', 'Show hidden files', ['dotfiles']),
  row('files', 'extensions', 'Show file extensions', ['suffix']),
  row('files', 'view', 'Default view', ['list', 'grid', 'columns']),
  row('files', 'confirmDelete', 'Confirm before moving to Trash', ['delete', 'warn']),
  row('files', 'singleClick', 'Open with a single click', ['double click']),
  row('files', 'home', 'Home folder', ['start folder', 'default location']),
  row('storage', 'usage', 'Usage', ['space', 'quota', 'free']),
  row('storage', 'breakdown', 'Breakdown', ['folders', 'sizes']),
  row('storage', 'trash', 'Empty Trash', ['delete', 'free space']),
  row('storage', 'home', 'Home directory', ['location', 'move', 'explorer']),
  row('storage', 'details', 'Storage app', ['details']),
  row('privacy', 'recents', 'Keep Recents', ['history', 'recent files']),
  row('privacy', 'logging', 'Keep session log', ['logs', 'diagnostics']),
  row('privacy', 'note', 'Data', ['telemetry', 'analytics', 'offline']),
  row('power', 'sleep', 'Sleep after', ['idle', 'energy']),
  row('power', 'lowPower', 'Low power mode', ['battery saver', 'energy']),
  row('power', 'actions', 'Sleep, restart, shut down', ['power off', 'reboot']),
  row('reset', 'defaults', 'Restore default settings', ['reset settings']),
  row('reset', 'erase', 'Erase everything', ['factory reset', 'wipe', 'start over']),
  row('about', 'system', 'Host', ['version', 'kernel', 'web', 'tauri', 'desktop']),
  row('about', 'system.os', 'Platform', ['operating system', 'windows', 'macos', 'linux', 'arch']),
  row('about', 'system.cpu', 'Processor', ['cpu', 'cores']),
  row('about', 'system.memory', 'Memory', ['ram']),
  row('about', 'system.display', 'Display', ['screen', 'resolution']),
  row('about', 'system.uptime', 'Uptime', ['running time']),
  row('about', 'userAgent', 'User agent', ['browser']),
  row('about', 'links', 'Source and licence', ['github', 'mit', 'license']),
];

export interface SearchResult {
  section: SettingsSection;
  /** Higher ranks first: label match beats keyword match beats row match. */
  score: number;
  /** Ids of rows in this section that match the query. */
  rows: string[];
}

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

const SCORE = {
  labelPrefix: 100,
  labelIncludes: 80,
  keywordPrefix: 60,
  keywordIncludes: 50,
  rowLabel: 40,
  rowKeyword: 20,
} as const;

function matchField(field: string, q: string): 'prefix' | 'includes' | null {
  const f = field.toLowerCase();
  if (f.startsWith(q)) return 'prefix';
  if (f.includes(q)) return 'includes';
  return null;
}

function bestKeyword(keywords: string[], q: string): 'prefix' | 'includes' | null {
  let best: 'prefix' | 'includes' | null = null;
  for (const k of keywords) {
    const m = matchField(k, q);
    if (m === 'prefix') return 'prefix';
    if (m === 'includes') best = 'includes';
  }
  return best;
}

/**
 * Sections matching a query, best first. An empty query returns every
 * section in its natural order with no row matches.
 */
export function searchSettings(query: string): SearchResult[] {
  const q = normalizeQuery(query);
  if (!q) return SETTINGS_SECTIONS.map((section) => ({ section, score: 0, rows: [] }));

  const results: SearchResult[] = [];
  SETTINGS_SECTIONS.forEach((section, order) => {
    let score = 0;
    const label = matchField(section.label, q);
    if (label === 'prefix') score = SCORE.labelPrefix;
    else if (label === 'includes') score = SCORE.labelIncludes;
    else {
      const kw = bestKeyword(section.keywords, q);
      if (kw === 'prefix') score = SCORE.keywordPrefix;
      else if (kw === 'includes') score = SCORE.keywordIncludes;
    }

    const rows: string[] = [];
    let rowScore = 0;
    for (const r of SETTINGS_ROWS) {
      if (r.section !== section.id) continue;
      if (matchField(r.label, q)) {
        rows.push(r.id);
        rowScore = Math.max(rowScore, SCORE.rowLabel);
      } else if (bestKeyword(r.keywords, q)) {
        rows.push(r.id);
        rowScore = Math.max(rowScore, SCORE.rowKeyword);
      }
    }

    const total = Math.max(score, rowScore);
    if (total > 0) results.push({ section, score: total - order / 1000, rows });
  });

  return results.sort((a, b) => b.score - a.score);
}
