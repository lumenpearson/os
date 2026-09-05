import type { AppDefinition } from '@lumen/kernel';
import archive from './archive';
import browser from './browser';
import calculator from './calculator';
import calendar from './calendar';
import chess from './chess';
import clock from './clock';
import consoleApp from './console';
import contacts from './contacts';
import editor from './editor';
import files from './files';
import mail from './mail';
import media from './media';
import minesweeper from './minesweeper';
import notes from './notes';
import paint from './paint';
import preview from './preview';
import reminders from './reminders';
import settings from './settings';
import sheets from './sheets';
import slides from './slides';
import software from './software';
import storage from './storage';
import sysinfo from './sysinfo';
import taskmanager from './taskmanager';
import terminal from './terminal';
import units from './units';
import webapp from './webapp';
import workbench from './workbench';
import writer from './writer';

/**
 * Every built-in app, in launcher order: the ones people reach for first,
 * then office, then media, then the system tools. Add new apps here; the
 * folder layout is described in README.md. Definitions stay cheap to import —
 * the component behind each one is lazy — because this module loads at boot.
 */
export const builtinApps: AppDefinition[] = [
  files,
  mail,
  browser,
  terminal,
  editor,
  notes,
  contacts,
  reminders,
  writer,
  sheets,
  slides,
  preview,
  media,
  paint,
  calculator,
  units,
  calendar,
  clock,
  settings,
  taskmanager,
  sysinfo,
  storage,
  consoleApp,
  workbench,
  archive,
  software,
  minesweeper,
  chess,
  webapp,
];
