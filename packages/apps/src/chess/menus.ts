/**
 * The menubar for a Chess window, built from one snapshot of state so a
 * command reads and behaves the same whether it is clicked, chosen from a
 * menu or typed as a shortcut.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import type { Color } from './board';
import { LEVELS, type LevelId } from './engine';

export interface ChessMenuState {
  /** There is a move of the person's own to retract. */
  canTakeBack: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** The game has moved on from its starting position. */
  canRestart: boolean;
  canResign: boolean;
  flipped: boolean;
  coordinates: boolean;
  lastMove: boolean;
  hints: boolean;
  captured: boolean;
  moveList: boolean;
  level: LevelId;
  /** The colour the person is playing. */
  side: Color;
}

export interface ChessActions {
  /** New Game, asking which side to play. */
  newGame: () => void;
  newGameAs: (side: Color) => void;
  restart: () => void;
  undo: () => void;
  redo: () => void;
  takeBack: () => void;
  resign: () => void;
  close: () => void;
  copyFen: () => void;
  copyPgn: () => void;
  pasteFen: () => void;
  flip: () => void;
  toggleCoordinates: () => void;
  toggleLastMove: () => void;
  toggleHints: () => void;
  toggleCaptured: () => void;
  toggleMoveList: () => void;
  first: () => void;
  previous: () => void;
  next: () => void;
  last: () => void;
  setLevel: (level: LevelId) => void;
  howToPlay: () => void;
  about: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildChessMenus(state: ChessMenuState, actions: ChessActions): MenuTemplate[] {
  return [
    {
      id: 'game',
      label: 'Game',
      items: [
        { id: 'new', label: 'New Game…', shortcut: 'Mod+N', onSelect: actions.newGame },
        {
          id: 'new-white',
          label: 'New Game as White',
          onSelect: () => actions.newGameAs('w'),
        },
        {
          id: 'new-black',
          label: 'New Game as Black',
          shortcut: 'Shift+Mod+N',
          onSelect: () => actions.newGameAs('b'),
        },
        {
          id: 'restart',
          label: 'Restart Game',
          shortcut: 'Mod+R',
          enabled: state.canRestart,
          onSelect: actions.restart,
        },
        separator,
        {
          id: 'undo',
          label: 'Undo Move',
          shortcut: 'Mod+Z',
          enabled: state.canUndo,
          onSelect: actions.undo,
        },
        {
          id: 'redo',
          label: 'Redo Move',
          shortcut: 'Shift+Mod+Z',
          enabled: state.canRedo,
          onSelect: actions.redo,
        },
        {
          id: 'take-back',
          label: 'Take Back',
          shortcut: 'Mod+Backspace',
          enabled: state.canTakeBack,
          onSelect: actions.takeBack,
        },
        separator,
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
        separator,
        {
          id: 'paste-fen',
          label: 'Paste Position…',
          shortcut: 'Mod+V',
          onSelect: actions.pasteFen,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'flip',
          type: 'checkbox',
          label: 'Flip Board',
          shortcut: 'Mod+F',
          checked: state.flipped,
          onSelect: actions.flip,
        },
        separator,
        {
          id: 'coordinates',
          type: 'checkbox',
          label: 'Coordinates',
          checked: state.coordinates,
          onSelect: actions.toggleCoordinates,
        },
        {
          id: 'last-move',
          type: 'checkbox',
          label: 'Last Move',
          checked: state.lastMove,
          onSelect: actions.toggleLastMove,
        },
        {
          id: 'hints',
          type: 'checkbox',
          label: 'Legal Moves',
          checked: state.hints,
          onSelect: actions.toggleHints,
        },
        {
          id: 'captured',
          type: 'checkbox',
          label: 'Captured Pieces',
          checked: state.captured,
          onSelect: actions.toggleCaptured,
        },
        {
          id: 'move-list',
          type: 'checkbox',
          label: 'Move List',
          checked: state.moveList,
          onSelect: actions.toggleMoveList,
        },
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
      ],
    },
    {
      id: 'level',
      label: 'Level',
      items: LEVELS.map<MenuItemTemplate>((level, position) => ({
        id: `level-${level.id}`,
        type: 'radio',
        label: level.label,
        shortcut: `Mod+${position + 1}`,
        checked: state.level === level.id,
        onSelect: () => actions.setLevel(level.id),
      })),
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { id: 'how-to-play', label: 'How to Play', onSelect: actions.howToPlay },
        { id: 'about', label: 'About Chess', onSelect: actions.about },
      ],
    },
  ];
}
