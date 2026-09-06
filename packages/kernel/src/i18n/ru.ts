import type { MessageKey } from './en';

/**
 * Russian. Typed as a complete record, so adding a key to `en` without a
 * translation here fails the typecheck rather than shipping an English word
 * into a Russian interface.
 *
 * Menu items that open something keep the ellipsis, as they do in English:
 * it is the convention for "this asks you something first", not decoration.
 */
export const ru: Record<MessageKey, string> = {
  'system.about': 'Об этом компьютере',
  'system.settings': 'Настройки системы…',
  'system.software': 'Центр приложений…',
  'system.taskManager': 'Диспетчер задач…',
  'system.sleep': 'Сон',
  'system.restart': 'Перезагрузить…',
  'system.shutDown': 'Выключить…',
  'system.lock': 'Заблокировать экран',
  'system.aboutApp': 'О программе «{app}»',
  'system.hide': 'Скрыть',
  'system.newWindow': 'Новое окно',
  'system.quit': 'Завершить «{app}»',

  'systemBar.controlCenter': 'Пункт управления',
  'systemBar.notifications': 'Уведомления',
  'systemBar.search': 'Поиск',
  'systemBar.settings': 'Настройки строки меню…',

  'action.ok': 'ОК',
  'action.cancel': 'Отмена',
  'action.close': 'Закрыть',
  'action.clear': 'Очистить',
  'action.cut': 'Вырезать',
  'action.copy': 'Копировать',
  'action.paste': 'Вставить',
  'action.selectAll': 'Выбрать всё',
  'action.loading': 'Загрузка',
  'action.sidebar': 'Боковая панель',
  'action.location': 'Расположение',

  'settings.general': 'Основные',
  'settings.appearance': 'Оформление',
  'settings.animation': 'Анимация',
  'settings.wallpaper': 'Обои',
  'settings.taskbar': 'Панель задач и строка меню',
  'settings.display': 'Экран',
  'settings.lock': 'Экран блокировки и защита',
  'settings.notifications': 'Уведомления',
  'settings.sound': 'Звук',
  'settings.network': 'Сеть',
  'settings.keyboard': 'Клавиатура',
  'settings.cursor': 'Курсор',
  'settings.region': 'Язык и регион',
  'settings.files': 'Проводник',
  'settings.storage': 'Хранилище',
  'settings.store': 'Магазин',
  'settings.privacy': 'Конфиденциальность',
  'settings.power': 'Питание',
  'settings.reset': 'Сброс',
  'settings.about': 'О системе',

  'region.description': 'Язык, часовой пояс и запись дат и единиц измерения.',
  'region.groupLanguage': 'Язык',
  'region.interfaceLanguage': 'Язык интерфейса',
  'region.interfaceHint': 'Как в регионе',
  'region.formattingLocale': 'Регион',
  'region.timeZone': 'Часовой пояс',
  'region.groupFormats': 'Форматы',
  'region.firstDay': 'Первый день недели',
  'region.dateFormat': 'Формат даты',
  'region.temperature': 'Температура',
  'region.measurement': 'Единицы измерения',
  'region.groupPreview': 'Пример',
  'region.today': 'Сегодня {date} {time}',

  'region.monday': 'Понедельник',
  'region.sunday': 'Воскресенье',
  'region.dateFromLanguage': 'Как в языке',
  'region.dateIso': 'ISO 8601',
  'region.dateUs': 'США',
  'region.dateEuropean': 'Европейский',
  'region.metric': 'Метрические',
  'region.imperial': 'Имперские',

  'a11y.menuBar': 'Строка меню',
  'a11y.search': 'Поиск',
  'a11y.controlCenter': 'Пункт управления',
};
