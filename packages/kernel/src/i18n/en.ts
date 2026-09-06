/**
 * The source text of the interface, and the only dictionary written out in
 * full by hand. Every other language is typed against `keyof typeof en`, so a
 * missing translation is a compile error rather than a word that quietly
 * stays English at runtime.
 *
 * Keys read as `area.thing`, which is how they group in review and how
 * `scripts/check-i18n.mjs` reports them. A key is never composed at run time:
 * `t('menu.' + name)` can be neither typechecked nor found by the scanner, so
 * write the key out or add a branch. Placeholders are `{name}` and are filled
 * from the `vars` argument to `t`.
 */
export const en = {
  // ── the system menu ────────────────────────────────────────────────────
  'system.about': 'About This Computer',
  'system.settings': 'System Settings…',
  'system.software': 'Software Center…',
  'system.taskManager': 'Task Manager…',
  'system.sleep': 'Sleep',
  'system.restart': 'Restart…',
  'system.shutDown': 'Shut Down…',
  'system.lock': 'Lock Screen',
  'system.aboutApp': 'About {app}',
  'system.hide': 'Hide',
  'system.newWindow': 'New Window',
  'system.quit': 'Quit {app}',

  // ── the system bar's own menu ──────────────────────────────────────────
  'systemBar.controlCenter': 'Control Center',
  'systemBar.notifications': 'Notifications',
  'systemBar.search': 'Search',
  'systemBar.settings': 'Menubar Settings…',

  // ── actions that appear in more than one place ─────────────────────────
  'action.ok': 'OK',
  'action.cancel': 'Cancel',
  'action.close': 'Close',
  'action.clear': 'Clear',
  'action.cut': 'Cut',
  'action.copy': 'Copy',
  'action.paste': 'Paste',
  'action.selectAll': 'Select All',
  'action.loading': 'Loading',
  'action.sidebar': 'Sidebar',
  'action.location': 'Location',

  // ── Settings: the section list ─────────────────────────────────────────
  'settings.general': 'General',
  'settings.appearance': 'Appearance',
  'settings.animation': 'Animation',
  'settings.wallpaper': 'Wallpaper',
  'settings.taskbar': 'Taskbar & Menubar',
  'settings.display': 'Display',
  'settings.lock': 'Lock Screen & Security',
  'settings.notifications': 'Notifications',
  'settings.sound': 'Sound',
  'settings.network': 'Network',
  'settings.keyboard': 'Keyboard',
  'settings.cursor': 'Cursor',
  'settings.region': 'Language & Region',
  'settings.files': 'Files',
  'settings.storage': 'Storage',
  'settings.store': 'Store',
  'settings.privacy': 'Privacy',
  'settings.power': 'Power',
  'settings.reset': 'Reset',
  'settings.about': 'About',

  // ── Settings: Language & Region ────────────────────────────────────────
  'region.description': 'Language, time zone and how dates and units are written.',
  'region.groupLanguage': 'Language',
  'region.interfaceLanguage': 'Interface language',
  'region.interfaceHint': 'Match the region',
  'region.formattingLocale': 'Region',
  'region.timeZone': 'Time zone',
  'region.groupFormats': 'Formats',
  'region.firstDay': 'First day of week',
  'region.dateFormat': 'Date format',
  'region.temperature': 'Temperature',
  'region.measurement': 'Measurement',
  'region.groupPreview': 'Preview',
  'region.today': 'Today is {date} {time}',

  // ── Settings: the choices Language & Region offers ─────────────────────
  'region.monday': 'Monday',
  'region.sunday': 'Sunday',
  'region.dateFromLanguage': 'From language',
  'region.dateIso': 'ISO 8601',
  'region.dateUs': 'US',
  'region.dateEuropean': 'European',
  'region.metric': 'Metric',
  'region.imperial': 'Imperial',

  // ── the shell's landmarks, read out rather than shown ──────────────────
  'a11y.menuBar': 'Menu bar',
  'a11y.search': 'Search',
  'a11y.controlCenter': 'Control Center',
} as const;

/** Every key the interface may ask for. */
export type MessageKey = keyof typeof en;

/**
 * A language the interface is written in, which is a different question from
 * the region it formats dates and numbers for: someone in Kazakhstan may want
 * kk-KZ dates under a Russian interface, and the system should not have to
 * guess which they meant from one setting.
 */
export type Language = 'en' | 'ru';

/** The languages with a complete dictionary, in the order Settings lists them. */
export const LANGUAGES: readonly Language[] = ['en', 'ru'];
