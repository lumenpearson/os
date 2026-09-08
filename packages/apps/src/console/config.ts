/**
 * The one preference worth keeping between sessions: which levels the list
 * shows. Everything else about the view (the search, the source, whether the
 * tail is followed) belongs to the session that is running.
 */
import { LEVELS, type LogLevel } from './types';

export interface ConsoleConfig {
  levels: LogLevel[];
}

export const DEFAULT_CONFIG: ConsoleConfig = { levels: [...LEVELS] };

/** A stored file is whatever is on disk, so every field is checked. */
export function normalizeConfig(value: unknown): ConsoleConfig {
  if (value === null || typeof value !== 'object') return { levels: [...LEVELS] };
  const raw: unknown = (value as { levels?: unknown }).levels;
  if (!Array.isArray(raw)) return { levels: [...LEVELS] };
  const kept = LEVELS.filter((level) => raw.includes(level));
  // Every level hidden would be a window showing nothing with no way to tell
  // why, so an empty list is read as a file that was never written.
  return { levels: kept.length > 0 ? kept : [...LEVELS] };
}

/** Turn one level on or off, keeping the list in level order. */
export function toggleLevel(levels: readonly LogLevel[], level: LogLevel): LogLevel[] {
  const wanted = new Set(levels);
  if (wanted.has(level)) wanted.delete(level);
  else wanted.add(level);
  return LEVELS.filter((candidate) => wanted.has(candidate));
}
