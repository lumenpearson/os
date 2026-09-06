/**
 * Which side the person plays.
 *
 * New Game asks the question, so the answer arrives as the id of a button
 * that may also be a dismissal. Turning that id into a colour is the whole of
 * this file, kept apart from the dialog so the drawing of lots for Random can
 * be tested with a clock of our own rather than with luck.
 */

import type { Color } from './board';

export type SideChoice = 'white' | 'black' | 'random';

export const SIDE_CHOICES: readonly SideChoice[] = ['white', 'black', 'random'];

const LABELS: Record<SideChoice, string> = {
  white: 'White',
  black: 'Black',
  random: 'Random',
};

export const sideChoiceLabel = (choice: SideChoice): string => LABELS[choice];

/** The choice a dialog came back with, or null when it was not one of ours. */
export function parseSideChoice(id: string | null): SideChoice | null {
  return SIDE_CHOICES.find((choice) => choice === id) ?? null;
}

/** The colour a choice means. Random draws for White, as drawing lots does. */
export function sideFor(choice: SideChoice, draw: () => number = Math.random): Color {
  if (choice === 'white') return 'w';
  if (choice === 'black') return 'b';
  return draw() < 0.5 ? 'w' : 'b';
}

/** The colour to play, from a dialog answer. Null when the person cancelled. */
export function sideFromAnswer(id: string | null, draw: () => number = Math.random): Color | null {
  const choice = parseSideChoice(id);
  return choice === null ? null : sideFor(choice, draw);
}

/** The choice that matches a colour, which is how the menu marks the current one. */
export const choiceForSide = (side: Color): SideChoice => (side === 'w' ? 'white' : 'black');

export const colorName = (color: Color): string => (color === 'w' ? 'White' : 'Black');
