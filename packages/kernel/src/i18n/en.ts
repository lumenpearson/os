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
  'start.noneMatch': 'No apps match “{query}”',
  'start.installed': 'Installed',
  'start.recent': 'Recent',
  'spotlight.pressEnterToCopy': 'Press Enter to copy',
  'spotlight.installedApp': 'Installed app',
  'spotlight.system': 'System',
  'spotlight.files': 'Files',
  'spotlight.nothingFound': 'Nothing found for “{query}”',
  'notifications.doNotDisturb': 'Do Not Disturb',
  'notifications.remove': 'Remove',
  'notifications.clearAll': 'Clear all',
  'controlCenter.wifi': 'Wi-Fi',
  'controlCenter.bluetooth': 'Bluetooth',
  'controlCenter.airplane': 'Airplane',
  'controlCenter.theme': 'Theme',
  'controlCenter.lock': 'Lock',
  'controlCenter.sound': 'Sound',
  'controlCenter.allSettings': 'All settings',
  'power.pressAnyKey': 'press any key',
  'power.closeTab': 'You can close this tab now.',
  'power.startAgain': 'Start again',
  'desktop.couldNotRename': 'Could not rename',

  // ── the menus every application shares ─────────────────────────────────
  'menu.view': 'View',
  'menu.file': 'File',
  'menu.close': 'Close',
  'menu.edit': 'Edit',
  'menu.undo': 'Undo',
  'menu.redo': 'Redo',
  'menu.open': 'Open…',
  'menu.help': 'Help',
  'menu.findEllipsis': 'Find…',
  'menu.find': 'Find',
  'menu.selectAll': 'Select All',
  'menu.saveAs': 'Save As…',
  'menu.save': 'Save',
  'menu.game': 'Game',
  'menu.sortBy': 'Sort By',
  'menu.previous': 'Previous',
  'menu.next': 'Next',
  'menu.new': 'New',
  'menu.clear': 'Clear',
  'menu.zoomOut': 'Zoom Out',
  'menu.zoomIn': 'Zoom In',
  'menu.timer': 'Timer',
  'menu.sidebar': 'Sidebar',
  'menu.revealInFiles': 'Reveal in Files',
  'menu.getInfo': 'Get Info',
  'menu.fullScreen': 'Full Screen',
  'menu.forward': 'Forward',
  'menu.format': 'Format',
  'menu.favourite': 'Favourite',
  'menu.duplicate': 'Duplicate',
  'menu.descending': 'Descending',
  'menu.ascending': 'Ascending',
  'menu.actualSize': 'Actual Size',
  'menu.showHiddenFiles': 'Show Hidden Files',
  'menu.rotateRight': 'Rotate Right',
  'menu.rotateLeft': 'Rotate Left',
  'menu.right': 'Right',
  'menu.left': 'Left',
  'menu.reset': 'Reset',
  'menu.renameEllipsis': 'Rename…',
  'menu.rename': 'Rename',
  'menu.quickLook': 'Quick Look',
  'menu.putBack': 'Put Back',
  'menu.openInPreview': 'Open in Preview',
  'menu.openInPaint': 'Open in Paint',
  'menu.newTextFile': 'New Text File',
  'menu.newGame': 'New Game',
  'menu.newFolder': 'New Folder',
  'menu.newDocument': 'New Document',
  'menu.moveToTrash': 'Move to Trash…',
  'menu.italic': 'Italic',
  'menu.bold': 'Bold',
  'menu.go': 'Go',
  'menu.flipVertical': 'Flip Vertical',
  'menu.flipHorizontal': 'Flip Horizontal',
  'menu.fitToWindow': 'Fit to Window',
  'menu.filter': 'Filter',
  'menu.exportPlainText': 'Export as Plain Text…',
  'menu.exportMarkdown': 'Export as Markdown…',
  'menu.exportHtml': 'Export as HTML…',
  'menu.emptyTrashEllipsis': 'Empty Trash…',
  'menu.emptyTrash': 'Empty Trash',
  'menu.copyResult': 'Copy Result',
  'menu.clearRecents': 'Clear Recents',
  'menu.back': 'Back',

  // ── the desktop ────────────────────────────────────────────────────────
  'desktop.desktop': 'Desktop',
  'desktop.open': 'Open',
  'desktop.getInfo': 'Get Info',
  'desktop.rename': 'Rename',
  'desktop.duplicate': 'Duplicate',
  'desktop.moveToTrash': 'Move to Trash',
  'desktop.newFolder': 'New Folder',
  'desktop.newTextFile': 'New Text File',
  'desktop.cleanUp': 'Clean Up',
  'desktop.sortBy': 'Sort By',
  'desktop.iconSize': 'Icon Size',
  'desktop.changeWallpaper': 'Change Wallpaper',
  'desktop.moreInSettings': 'More in Settings…',
  'desktop.openInFiles': 'Open in Files',
  'desktop.newName': 'New name',
  'desktop.sortName': 'Name',
  'desktop.sortKind': 'Kind',
  'desktop.sortSize': 'Size',
  'desktop.sortDate': 'Date',
  'desktop.sizeSmall': 'Small',
  'desktop.sizeMedium': 'Medium',
  'desktop.sizeLarge': 'Large',

  // ── the start menu and Spotlight ───────────────────────────────────────
  'start.menu': 'Start menu',
  'start.searchPlaceholder': 'Search apps, files, settings',
  'start.results': 'Results',
  'start.lock': 'Lock',
  'spotlight.emptyTrash': 'Empty Trash',
  'spotlight.searchPlaceholder': 'Search apps, files, or calculate',
  'spotlight.results': 'Results',

  // ── windows ────────────────────────────────────────────────────────────
  'window.minimize': 'Minimize',
  'window.zoom': 'Zoom',
  'window.snapLeft': 'Snap Left',
  'window.snapRight': 'Snap Right',
  'window.switch': 'Switch window',
  'window.quit': 'Quit',

  // ── panels ─────────────────────────────────────────────────────────────
  'notifications.none': 'No notifications',
  'controlCenter.brightness': 'Brightness',
  'controlCenter.volume': 'Volume',
  'power.sleeping': 'Sleeping. Press any key to wake.',

  // ── setup and recovery ─────────────────────────────────────────────────
  'setup.theme': 'Theme',
  'setup.accent': 'Accent',
  'setup.yourAccount': 'Your account',
  'setup.namePlaceholder': 'Ada Lovelace',
  'setup.recoveryKey': 'Recovery key',
  'setup.ready': 'Ready',
  'recovery.title': 'Recover access',
  'recovery.newPassword': 'New password',
  'recovery.yourNewKey': 'Your new recovery key',
  'recovery.eraseComputer': 'Erase this computer',

  // ── the taskbar ────────────────────────────────────────────────────────
  'taskbar.bar': 'Taskbar',
  'taskbar.showDesktop': 'Show desktop',
  'taskbar.search': 'Search',
  'taskbar.start': 'Start',
  'taskbar.trashEmpty': 'Recycle Bin, empty',
  // A count family: `.other` is the one every language has, and the form
  // names are Intl's. English never selects `few` or `many`; Russian does.
  'taskbar.trash.one': 'Recycle Bin, {count} item',
  'taskbar.trash.few': 'Recycle Bin, {count} items',
  'taskbar.trash.many': 'Recycle Bin, {count} items',
  'taskbar.trash.other': 'Recycle Bin, {count} items',

  // ── starting up ────────────────────────────────────────────────────────
  'boot.starting': 'Starting Lumen OS',
  'boot.failed': 'Boot failed',
  'boot.couldNotStart': 'Lumen OS could not start.',

  // ── the lock screen ────────────────────────────────────────────────────
  'lock.user': 'User',
  'lock.pressAnyKey': 'Click or press any key to unlock',
  'lock.password': 'Password',
  'lock.tryAgainIn': 'Try again in {seconds} s',
  'lock.unlock': 'Unlock',
  'lock.wrongPassword': 'Wrong password.',
  'lock.tooManyAttempts': 'Too many attempts.',
  'lock.hint': 'Hint: {hint}',
  'lock.forgotPassword': 'Forgot password?',
  // No ellipsis: from here these act at once, where the system menu's
  // entries of the same name ask first.
  'lock.switchUser': 'Switch User',
  'lock.power': 'Power',
  'lock.sleep': 'Sleep',
  'lock.restart': 'Restart',
  'lock.shutDown': 'Shut Down',

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
