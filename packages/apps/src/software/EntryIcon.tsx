import type { AppManifest } from '@lumen/kernel';
import { ManifestIcon } from '../_sdk';
import type { LibraryEntry } from './library';

/** A built-in draws its registered tile; a manifest draws its data URL or its initial. */
export function EntryIcon({ entry, size }: { entry: LibraryEntry; size: number }) {
  const Icon = entry.definition?.icon;
  if (Icon) return <Icon size={size} />;
  return <ManifestIcon size={size} name={entry.name} icon={entry.manifest?.icon} />;
}

export function ManifestTile({ manifest, size }: { manifest: AppManifest; size: number }) {
  return <ManifestIcon size={size} name={manifest.name} icon={manifest.icon} />;
}
