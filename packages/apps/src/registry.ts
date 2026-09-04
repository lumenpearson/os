import type { AppDefinition } from '@lumen/kernel';
import editor from './editor';
import files from './files';
import settings from './settings';
import sheets from './sheets';
import terminal from './terminal';
import webapp from './webapp';
import writer from './writer';

/**
 * Every built-in app, in launcher order. Add new apps here; the folder layout
 * is described in README.md. Definitions stay cheap to import — the component
 * behind each one is lazy — because this module loads at boot.
 */
export const builtinApps: AppDefinition[] = [
  files,
  terminal,
  editor,
  writer,
  sheets,
  settings,
  webapp,
];
