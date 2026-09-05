import type { ComponentType } from 'react';
import type { SectionId } from '../sections';
import { AboutPage } from './About';
import { AnimationPage } from './Animation';
import { AppearancePage } from './Appearance';
import { CursorPage } from './Cursor';
import { DisplayPage } from './Display';
import { FilesPage } from './Files';
import { GeneralPage } from './General';
import { KeyboardPage } from './Keyboard';
import { NetworkPage } from './Network';
import { NotificationsPage } from './Notifications';
import { PowerPage } from './Power';
import { PrivacyPage } from './Privacy';
import { RegionPage } from './Region';
import { ResetPage } from './Reset';
import { SecurityPage } from './Security';
import { SoundPage } from './Sound';
import { StoragePage } from './Storage';
import { StorePage } from './Store';
import { TaskbarPage } from './Taskbar';
import { WallpaperPage } from './Wallpaper';

export const PAGES: Record<SectionId, ComponentType> = {
  general: GeneralPage,
  appearance: AppearancePage,
  animation: AnimationPage,
  wallpaper: WallpaperPage,
  taskbar: TaskbarPage,
  display: DisplayPage,
  security: SecurityPage,
  notifications: NotificationsPage,
  sound: SoundPage,
  network: NetworkPage,
  keyboard: KeyboardPage,
  cursor: CursorPage,
  region: RegionPage,
  files: FilesPage,
  storage: StoragePage,
  store: StorePage,
  privacy: PrivacyPage,
  power: PowerPage,
  reset: ResetPage,
  about: AboutPage,
};
