/**
 * The menubar for a Chess window, built from one snapshot of state so a
 * command reads and behaves the same whether it is clicked, chosen from a
 * menu or typed as a shortcut.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { t } from '@lumen/kernel';
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
      label: t('menu.game'),
      items: [
        { id: 'new', label: t('chess.newGame'), shortcut: 'Mod+N', onSelect: actions.newGame },
        {
          id: 'new-white',
          label: t('chess.asWhite'),
          onSelect: () => actions.newGameAs('w'),
        },
        {
          id: 'new-black',
          label: t('chess.asBlack'),
          shortcut: 'Shift+Mod+N',
          onSelect: () => actions.newGameAs('b'),
        },
        {
          id: 'restart',
          label: t('chess.restart'),
          shortcut: 'Mod+R',
          enabled: state.canRestart,
          onSelect: actions.restart,
        },
        separator,
        {
          id: 'undo',
          label: t('chess.undoMove'),
          shortcut: 'Mod+Z',
          enabled: state.canUndo,
          onSelect: actions.undo,
        },
        {
          id: 'redo',
          label: t('chess.redoMove'),
          shortcut: 'Shift+Mod+Z',
          enabled: state.canRedo,
          onSelect: actions.redo,
        },
        {
          id: 'take-back',
          label: t('chess.takeBack'),
          shortcut: 'Mod+Backspace',
          enabled: state.canTakeBack,
          onSelect: actions.takeBack,
        },
        separator,
        {
          id: 'resign',
          label: t('chess.resign'),
          danger: true,
          enabled: state.canResign,
          onSelect: actions.resign,
        },
        separator,
        { id: 'close', label: t('menu.close'), shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'edit',
      label: t('menu.edit'),
      items: [
        {
          id: 'copy-fen',
          label: t('chess.copyFen'),
          shortcut: 'Mod+C',
          onSelect: actions.copyFen,
        },
        {
          id: 'copy-pgn',
          label: t('chess.copyPgn'),
          shortcut: 'Shift+Mod+C',
          onSelect: actions.copyPgn,
        },
        separator,
        {
          id: 'paste-fen',
          label: t('chess.pastePosition'),
          shortcut: 'Mod+V',
          onSelect: actions.pasteFen,
        },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        {
          id: 'flip',
          type: 'checkbox',
          label: t('chess.flipBoard'),
          shortcut: 'Mod+F',
          checked: state.flipped,
          onSelect: actions.flip,
        },
        separator,
        {
          id: 'coordinates',
          type: 'checkbox',
          label: t('chess.coordinates'),
          checked: state.coordinates,
          onSelect: actions.toggleCoordinates,
        },
        {
          id: 'last-move',
          type: 'checkbox',
          label: t('chess.lastMove'),
          checked: state.lastMove,
          onSelect: actions.toggleLastMove,
        },
        {
          id: 'hints',
          type: 'checkbox',
          label: t('chess.legalMoves'),
          checked: state.hints,
          onSelect: actions.toggleHints,
        },
        {
          id: 'captured',
          type: 'checkbox',
          label: t('chess.capturedPieces'),
          checked: state.captured,
          onSelect: actions.toggleCaptured,
        },
        {
          id: 'move-list',
          type: 'checkbox',
          label: t('chess.moveList'),
          checked: state.moveList,
          onSelect: actions.toggleMoveList,
        },
        separator,
        { id: 'first', label: t('chess.firstMove'), shortcut: 'Mod+Up', onSelect: actions.first },
        {
          id: 'previous',
          label: t('chess.previousMove'),
          shortcut: 'Mod+Left',
          onSelect: actions.previous,
        },
        { id: 'next', label: t('chess.nextMove'), shortcut: 'Mod+Right', onSelect: actions.next },
        {
          id: 'last',
          label: t('chess.latestPosition'),
          shortcut: 'Mod+Down',
          onSelect: actions.last,
        },
      ],
    },
    {
      id: 'level',
      label: t('chess.level'),
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
      label: t('menu.help'),
      items: [
        { id: 'how-to-play', label: t('chess.howToPlay'), onSelect: actions.howToPlay },
        { id: 'about', label: t('chess.about'), onSelect: actions.about },
      ],
    },
  ];
}
