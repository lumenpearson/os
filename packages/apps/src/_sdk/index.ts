/**
 * The app SDK. Every built-in app imports from here (and from @lumen/ui,
 * @lumen/kernel/react, @lumen/vfs). See CONTRIBUTING.md → "Adding an app".
 */
export type {
  AppDefinition,
  AppIconProps,
  AppProps,
  LaunchArgs,
  MenuItemTemplate,
  MenuTemplate,
} from '@lumen/kernel';
export type { AppHostProps } from './AppHost';
export { AppHost } from './AppHost';
export type { AppContextValue } from './context';
export {
  AppProvider,
  useApp,
  useAppMenus,
  useArgs,
  useCloseGuard,
  useDirty,
  useLauncher,
  useNotify,
  useShortcut,
  useShortcutLabel,
  useTitle,
  useWindowControls,
} from './context';
export type { FilePickerOptions } from './FileDialog';
export { FileDialogProvider, useFilePicker } from './FileDialog';
export { FileTypeIcon, fileGlyph } from './FileTypeIcon';
export type { DirectoryState, TextDocument } from './files';
export { useDirectory, useJsonFile, useObjectUrl, useTextDocument, useVfsWatch } from './files';
export { formatDate, formatDateTime, formatRelative, formatTime } from './format';
export type { AppIconOptions, IconTone } from './icon';
export { createAppIcon, ICON_TONES, ManifestIcon } from './icon';

import type { AppDefinition } from '@lumen/kernel';

/** Identity helper so app modules get type checking without annotations. */
export function defineApp(definition: AppDefinition): AppDefinition {
  return definition;
}
