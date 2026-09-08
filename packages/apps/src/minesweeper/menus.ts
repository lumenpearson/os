import { t } from '@lumen/kernel';
/**
 * The menubar for the game window, built from one snapshot of state so a
 * command does the same thing whether it is clicked or typed.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { DIFFICULTY_LABEL, type DifficultyId, PRESET_IDS, type PresetId } from './difficulty';

export interface MinesweeperMenuState {
  difficulty: DifficultyId;
  questionMarks: boolean;
}

export interface MinesweeperMenuActions {
  newGame: () => void;
  setDifficulty: (id: PresetId) => void;
  openCustom: () => void;
  openBestTimes: () => void;
  toggleQuestionMarks: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildMinesweeperMenus(
  state: MinesweeperMenuState,
  actions: MinesweeperMenuActions,
): MenuTemplate[] {
  return [
    {
      id: 'game',
      label: t('menu.game'),
      items: [
        { id: 'new', label: t('menu.newGame'), shortcut: 'Mod+N', onSelect: actions.newGame },
        separator,
        ...PRESET_IDS.map((id, index) => ({
          id,
          type: 'radio' as const,
          label: DIFFICULTY_LABEL[id],
          shortcut: `Mod+${index + 1}`,
          checked: state.difficulty === id,
          onSelect: () => actions.setDifficulty(id),
        })),
        {
          id: 'custom',
          type: 'radio',
          label: t('minesweeper.custom'),
          shortcut: 'Mod+4',
          checked: state.difficulty === 'custom',
          onSelect: actions.openCustom,
        },
        separator,
        {
          id: 'best-times',
          label: t('minesweeper.bestTimes'),
          shortcut: 'Mod+B',
          onSelect: actions.openBestTimes,
        },
      ],
    },
    {
      id: 'options',
      label: t('minesweeper.options'),
      items: [
        {
          id: 'question-marks',
          type: 'checkbox',
          label: t('minesweeper.questionMarks'),
          shortcut: 'Mod+Q',
          checked: state.questionMarks,
          onSelect: actions.toggleQuestionMarks,
        },
      ],
    },
  ];
}
