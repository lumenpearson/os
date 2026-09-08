/**
 * The decisions taken before anything is written or deleted.
 *
 * `Kernel.installApp` writes /Applications/<name>.app and re-reads the folder;
 * `Kernel.uninstallApp` moves that file to the Trash and kills the app's
 * processes. Both are one-liners with no opinion about collisions, so the
 * opinions live here: an id that belongs to a built-in can never be installed
 * (the kernel would ignore the file), a second manifest under a name that is
 * already taken would silently overwrite someone else's program, and
 * reinstalling under a new name leaves the old file behind unless it is
 * removed first.
 */

import { APPLICATIONS_DIR, type AppManifest, type InstalledApp } from '@lumen/kernel';
import { join } from '@lumen/vfs';
import type { LibraryEntry } from './library';

/** Where the manifest's data lives if it saves any (see webapp/bridge.ts). */
export const APPDATA_DIR = '.appdata';

/** The file name `Kernel.installApp` derives from the manifest name. */
export function manifestFileName(name: string): string {
  return `${name.replace(/[\\/:*?"<>|]/g, '')}.app`;
}

export function installPath(name: string): string {
  return join(APPLICATIONS_DIR, manifestFileName(name));
}

export type InstallAction = 'install' | 'replace' | 'blocked';

export type BlockedReason = 'built-in' | 'name-conflict' | 'unusable-name';

export interface InstallPlan {
  action: InstallAction;
  /** Where the `.app` file is written; empty when blocked. */
  path: string;
  /** Files to move to the Trash first, so one id keeps one file. */
  removePaths: string[];
  /** The manifest this replaces, when the id is already installed. */
  previous: InstalledApp | null;
  blockedBy: BlockedReason | null;
  /** One sentence stating what pressing Install does. */
  summary: string;
}

export interface InstallContext {
  /** Ids the kernel has registered as built-in apps. */
  builtInIds: readonly string[];
  /** Manifests already under /Applications. */
  installed: readonly InstalledApp[];
}

export function planInstall(manifest: AppManifest, context: InstallContext): InstallPlan {
  const blocked = (blockedBy: BlockedReason, summary: string): InstallPlan => ({
    action: 'blocked',
    path: '',
    removePaths: [],
    previous: null,
    blockedBy,
    summary,
  });

  const fileName = manifestFileName(manifest.name);
  if (fileName === '.app') {
    return blocked(
      'unusable-name',
      `"${manifest.name}" leaves no characters for a file name. Rename the app.`,
    );
  }

  if (context.builtInIds.includes(manifest.id)) {
    return blocked(
      'built-in',
      `${manifest.id} is the identifier of an app built into Lumen OS. The system would keep running its own and ignore this file.`,
    );
  }

  const path = installPath(manifest.name);
  const previous = context.installed.find((a) => a.manifest.id === manifest.id) ?? null;
  const occupant = context.installed.find((a) => a.path === path && a.manifest.id !== manifest.id);
  if (occupant) {
    return blocked(
      'name-conflict',
      `${path} already holds ${occupant.manifest.id}. Rename this app so it gets a file of its own.`,
    );
  }

  if (previous) {
    const removePaths = previous.path === path ? [] : [previous.path];
    const moved =
      removePaths.length > 0 ? ` The old file ${previous.path} moves to the Trash.` : '';
    return {
      action: 'replace',
      path,
      removePaths,
      previous,
      blockedBy: null,
      summary: `Replaces the installed ${previous.manifest.name} (${manifest.id}) with this manifest.${moved}`,
    };
  }

  return {
    action: 'install',
    path,
    removePaths: [],
    previous: null,
    blockedBy: null,
    summary: `Writes ${path}. ${manifest.name} then appears in the Start menu and in search.`,
  };
}

export interface RemovalCheck {
  removable: boolean;
  /** Why not, when it cannot be removed. */
  reason: string;
}

export function checkRemoval(entry: LibraryEntry): RemovalCheck {
  if (entry.source === 'built-in') {
    return { removable: false, reason: 'Part of Lumen OS. Built-in apps stay with the system.' };
  }
  if (!entry.path) {
    return { removable: false, reason: 'No file to remove: this app has no manifest on disk.' };
  }
  return { removable: true, reason: '' };
}

export interface UninstallPlan {
  /** The file that moves to the Trash. */
  filePath: string;
  /** Where the program's own data sits, when it can save any. */
  dataPath: string | null;
  /** An uninstall never deletes data under the home directory. */
  keepsData: boolean;
  title: string;
  /** The exact sentences shown in the confirmation. */
  message: string;
}

/** What removing this app does, stated in full. Null for anything not removable. */
export function planUninstall(entry: LibraryEntry, home: string): UninstallPlan | null {
  if (!checkRemoval(entry).removable || !entry.path) return null;
  const dataPath = entry.kind === 'html' ? join(home, APPDATA_DIR, `${entry.id}.json`) : null;
  const lines = [`${entry.path} moves to the Trash, and ${entry.name} leaves the Start menu.`];
  lines.push(
    dataPath
      ? `Anything the program saved stays in ${dataPath}; removing the app does not delete it.`
      : 'It keeps no data of its own under your home directory.',
  );
  if (entry.kind === 'alias') {
    lines.push('The built-in app it points at is not touched.');
  }
  return {
    filePath: entry.path,
    dataPath,
    keepsData: true,
    title: `Remove ${entry.name}?`,
    message: lines.join(' '),
  };
}
