/**
 * What Preview remembers between windows. The file on disk is user-editable
 * and may be anything at all, so it is normalized before it is believed.
 */

export interface PreviewPrefs {
  /** Thumbnail strip under a picture. */
  filmstrip: boolean;
}

export const DEFAULT_PREFS: PreviewPrefs = { filmstrip: false };

export function normalizePrefs(value: unknown): PreviewPrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_PREFS;
  const raw = value as Record<string, unknown>;
  return {
    filmstrip: typeof raw.filmstrip === 'boolean' ? raw.filmstrip : DEFAULT_PREFS.filmstrip,
  };
}
