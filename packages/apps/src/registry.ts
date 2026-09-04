import type { AppDefinition } from '@lumen/kernel';
import browser from './browser';
import calculator from './calculator';
import editor from './editor';
import files from './files';
import media from './media';
import notes from './notes';
import preview from './preview';
import settings from './settings';
import sheets from './sheets';
import slides from './slides';
import sysinfo from './sysinfo';
import taskmanager from './taskmanager';
import terminal from './terminal';
import webapp from './webapp';
import writer from './writer';

/**
 * Every built-in app, in launcher order: the ones people reach for first,
 * then office, then media, then the system tools. Add new apps here; the
 * folder layout is described in README.md. Definitions stay cheap to import —
 * the component behind each one is lazy — because this module loads at boot.
 */
export const builtinApps: AppDefinition[] = [
  files,
  browser,
  terminal,
  editor,
  notes,
  writer,
  sheets,
  slides,
  preview,
  media,
  calculator,
  settings,
  taskmanager,
  sysinfo,
  webapp,
];
