import { useSettingsStore } from '../settings/store';
import { en, LANGUAGES, type Language, type MessageKey } from './en';
import { ru } from './ru';

export type { Language, MessageKey };
export { en, LANGUAGES, ru };

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { en, ru };

/**
 * Which dictionary `auto` means for a formatting locale.
 *
 * Only the primary subtag is read: `ru`, `ru-RU` and `ru-KZ` are all the same
 * interface language, and someone who set their region to `uk-UA` gets
 * English rather than Russian, because a language nobody translated is not
 * improved by guessing at a neighbour.
 */
export function languageForLocale(locale: string): Language {
  const primary = locale.toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.find((l) => l === primary) ?? 'en';
}

/** The language the interface should be written in, given the settings. */
export function resolveLanguage(region: { language?: string; locale?: string }): Language {
  const chosen = region.language;
  if (chosen && chosen !== 'auto') {
    const found = LANGUAGES.find((l) => l === chosen);
    if (found) return found;
  }
  return languageForLocale(region.locale ?? 'en');
}

/** Fill `{name}` placeholders. A name with no value is left as it was written. */
export function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}

/** One message in a named language, without going through the settings store. */
export function translate(
  language: Language,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const dictionary = DICTIONARIES[language];
  return interpolate(dictionary[key] ?? en[key], vars);
}

/**
 * One message in the language the system is set to.
 *
 * This reads the store imperatively because most of the text that needs
 * translating is not in a component: the 33 `menus.ts` modules build their
 * `MenuTemplate` as plain data, and the service catalogue is a table. Inside
 * a component prefer `useT` from `@lumen/kernel/react`, which re-renders when
 * the language changes; this one does not.
 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(resolveLanguage(useSettingsStore.getState().settings.region), key, vars);
}
