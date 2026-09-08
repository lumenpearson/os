import { useSettingsStore } from '../settings/store';
import { en, LANGUAGES, type Language, type MessageKey } from './en';
import { ru } from './ru';

export type { Language, MessageKey };

/**
 * The translator, as a type. Tables of options live outside the component
 * that draws them and take this rather than reaching for the store, so that
 * they are filled in at render and follow the language instead of freezing at
 * whatever it was when the module first loaded.
 */
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;
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

/**
 * The forms a count can take. English uses two of these and Russian four, so
 * a dictionary with only a singular and a plural writes «5 элемент» — which
 * is the sort of thing that makes a translated interface read as a
 * translation rather than as the interface.
 */
export type PluralForm = 'one' | 'few' | 'many' | 'other';

/**
 * A key with a `.one` / `.few` / `.many` / `.other` family behind it.
 *
 * The family is declared in `en` like any other key, so the compiler still
 * refuses a base nobody wrote, and `scripts/check-i18n.mjs` checks the rest
 * of the family is there. `.other` is what every language has and what any
 * missing form falls back to.
 */
type BaseOf<K> = K extends `${infer Base}.other` ? Base : never;
export type PluralKey = BaseOf<MessageKey>;

/** Which form `count` takes in `language`, as Intl has it. */
export function formFor(language: Language, count: number): PluralForm {
  const form = new Intl.PluralRules(language).select(count);
  return form === 'one' || form === 'few' || form === 'many' ? form : 'other';
}

/**
 * One message for a count, in the form the language actually uses.
 *
 * `{count}` is filled in for you, because a form that does not show the
 * number it agrees with is a form nobody needed.
 */
export function translateCount(
  language: Language,
  base: PluralKey,
  count: number,
  vars?: Record<string, string | number>,
): string {
  const form = formFor(language, count);
  const key = `${base}.${form}` as MessageKey;
  const fallback = `${base}.other` as MessageKey;
  const dictionary = DICTIONARIES[language];
  const text = dictionary[key] ?? dictionary[fallback] ?? en[fallback];
  return interpolate(text, { count, ...vars });
}

export function plural(
  base: PluralKey,
  count: number,
  vars?: Record<string, string | number>,
): string {
  const language = resolveLanguage(useSettingsStore.getState().settings.region);
  return translateCount(language, base, count, vars);
}
