import { describe, expect, it } from 'vitest';
import { en, type MessageKey } from './en';
import { interpolate, languageForLocale, resolveLanguage, translate } from './index';
import { ru } from './ru';

describe('the dictionaries', () => {
  it('translate every key the interface can ask for', () => {
    // The type already forces this; assert it too, because a `Record` built
    // from a spread or a loop would satisfy the type and still be empty.
    const missing = (Object.keys(en) as MessageKey[]).filter((k) => !ru[k]?.trim());
    expect(missing).toEqual([]);
  });

  it('keep the placeholders a message was written with', () => {
    const names = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(names(ru[key]), `${key} takes the same placeholders in both languages`).toEqual(
        names(en[key]),
      );
    }
  });

  /**
   * Words that are the same in both languages because they are names, not
   * words. Listed one by one: a dictionary that is quietly a copy of the
   * source is the failure this whole mechanism exists to make visible, so the
   * exceptions have to be argued for rather than allowed by a rule.
   */
  const SAME_IN_BOTH: MessageKey[] = [
    'region.dateIso', // the standard's name, ISO 8601, which is not translated
  ];

  it('say something different from English', () => {
    const untranslated = (Object.keys(en) as MessageKey[]).filter(
      (k) => ru[k] === en[k] && !SAME_IN_BOTH.includes(k),
    );
    expect(untranslated).toEqual([]);
  });

  it('keeps the same-in-both list honest', () => {
    // An entry that stops being a copy should leave the list, or the list
    // becomes a place where a missing translation can hide.
    const notCopies = SAME_IN_BOTH.filter((k) => ru[k] !== en[k]);
    expect(notCopies, 'these are translated now and can leave SAME_IN_BOTH').toEqual([]);
  });
});

describe('resolveLanguage', () => {
  it('takes the language the person chose over the region', () => {
    expect(resolveLanguage({ language: 'ru', locale: 'en-GB' })).toBe('ru');
    expect(resolveLanguage({ language: 'en', locale: 'ru-RU' })).toBe('en');
  });

  it('follows the region when the language is auto or unset', () => {
    expect(resolveLanguage({ language: 'auto', locale: 'ru-RU' })).toBe('ru');
    expect(resolveLanguage({ locale: 'ru' })).toBe('ru');
    expect(resolveLanguage({ language: 'auto', locale: 'en-US' })).toBe('en');
  });

  it('falls back to English for a language nobody has translated', () => {
    // Guessing Russian for Ukrainian would be worse than staying in English.
    expect(resolveLanguage({ language: 'auto', locale: 'uk-UA' })).toBe('en');
    expect(languageForLocale('ja-JP')).toBe('en');
    expect(resolveLanguage({ language: 'kl', locale: 'kl-GL' })).toBe('en');
  });

  it('reads only the primary subtag', () => {
    expect(languageForLocale('ru-KZ')).toBe('ru');
    expect(languageForLocale('RU_ru')).toBe('ru');
  });
});

describe('interpolate', () => {
  it('fills the names it is given', () => {
    expect(interpolate('Quit {app}', { app: 'Files' })).toBe('Quit Files');
    expect(interpolate('Today is {date} {time}', { date: '6 Sep', time: '11:00' })).toBe(
      'Today is 6 Sep 11:00',
    );
  });

  it('leaves a name it has no value for alone, rather than printing undefined', () => {
    expect(interpolate('Quit {app}', {})).toBe('Quit {app}');
    expect(interpolate('Quit {app}')).toBe('Quit {app}');
  });

  it('is used by translate', () => {
    expect(translate('ru', 'system.quit', { app: 'Файлы' })).toBe('Завершить «Файлы»');
    expect(translate('en', 'system.quit', { app: 'Files' })).toBe('Quit Files');
  });
});
