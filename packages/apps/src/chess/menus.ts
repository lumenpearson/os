/**
 * The menubar for a Chess window, built from one snapshot of state so a
 * command reads the same whether it is clicked or typed.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { LEVELS, type LevelId } from './engine';

export interface ChessMenuState {
  canTakeBack: boolean;
  canResign: boolean;
  flipped: boolean;
  coordinates: boolean;
  targets: boolean;
  level: LevelId;
  /** The person plays White. */
  asWhite: boolean;
}

export interface ChessActions {
  newGame: () => void;
  newGameAs: (white: boolean) => void;
  takeBack: () => void;
  resign: () => void;
  flip: () => void;
  close: () => void;
  copyFen: () => void;
  copyPgn: () => void;
  pasteFen: () => void;
  setLevel: (level: LevelId) => void;
  toggleCoordinates: () => void;
  toggleTargets: () => void;
  first: () => void;
  previous: () => void;
  next: () => void;
  last: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildChessMenus(state: ChessMenuState, actions: ChessActions): MenuTemplate[] {
  return [
    {
      id: 'game',
      label: 'Game',
      items: [
        { id: 'new', label: 'New Game', shortcut: 'Mod+N', onSelect: actions.newGame },
        {
          id: 'play-white',
          type: 'radio',
          label: 'Play as White',
          checked: state.asWhite,
          onSelect: () => actions.newGameAs(true),
        },
        {
          id: 'play-black',
          type: 'radio',
          label: 'Play as Black',
          checked: !state.asWhite,
          onSelect: () => actions.newGameAs(false),
        },
        separator,
        {
          id: 'take-back',
          label: 'Take Back',
          shortcut: 'Mod+Z',
          enabled: state.canTakeBack,
          onSelect: actions.takeBack,
        },
        {
          id: 'resign',
          label: 'Resign',
          danger: true,
          enabled: state.canResign,
          onSelect: actions.resign,
        },
        separator,
        { id: 'close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          id: 'copy-fen',
          label: 'Copy Position (FEN)',
          shortcut: 'Mod+C',
          onSelect: actions.copyFen,
        },
        {
          id: 'copy-pgn',
          label: 'Copy Game (PGN)',
          shortcut: 'Shift+Mod+C',
          onSelect: actions.copyPgn,
        },
        {
          id: 'paste-fen',
          label: 'Paste Position…',
          shortcut: 'Mod+V',
          onSelect: actions.pasteFen,
        },
      ],
    },
    {
      id: 'level',
      label: 'Level',
      items: LEVELS.map<MenuItemTemplate>((level) => ({
        id: `level-${level.id}`,
        type: 'radio',
        label: level.label,
        checked: state.level === level.id,
        onSelect: () => actions.setLevel(level.id),
      })),
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'flip', label: 'Flip Board', shortcut: 'Mod+F', onSelect: actions.flip },
        separator,
        { id: 'first', label: 'First Move', shortcut: 'Mod+Up', onSelect: actions.first },
        {
          id: 'previous',
          label: 'Previous Move',
          shortcut: 'Mod+Left',
          onSelect: actions.previous,
        },
        { id: 'next', label: 'Next Move', shortcut: 'Mod+Right', onSelect: actions.next },
        { id: 'last', label: 'Latest Position', shortcut: 'Mod+Down', onSelect: actions.last },
        separator,
        {
          id: 'coordinates',
          type: 'checkbox',
          label: 'Coordinates',
          checked: state.coordinates,
          onSelect: actions.toggleCoordinates,
        },
        {
          id: 'targets',
          type: 'checkbox',
          label: 'Legal Moves',
          checked: state.targets,
          onSelect: actions.toggleTargets,
        },
      ],
    },
  ];
}
