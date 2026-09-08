/**
 * A disabled toggle takes no click, and the cursor says so before the click.
 * The claim sits on the label rather than the input: the whole control is
 * off, the text beside the switch included, and a disabled input is not what
 * a pointer event reports as its target.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Checkbox, Radio, Switch } from './Toggle';

const labelOf = (text: string) => screen.getByText(text).closest('label');

describe('disabled toggles', () => {
  it('claims not-allowed across the whole switch', () => {
    render(<Switch label="Show hidden files" disabled />);
    expect(labelOf('Show hidden files')).toHaveAttribute('data-cursor', 'not-allowed');
  });

  it('claims nothing while the switch is live', () => {
    render(<Switch label="Show hidden files" />);
    expect(labelOf('Show hidden files')).not.toHaveAttribute('data-cursor');
  });

  it('holds for the checkbox and the radio', () => {
    render(
      <>
        <Checkbox label="Include subfolders" disabled />
        <Radio label="Grid" disabled />
      </>,
    );
    expect(labelOf('Include subfolders')).toHaveAttribute('data-cursor', 'not-allowed');
    expect(labelOf('Grid')).toHaveAttribute('data-cursor', 'not-allowed');
  });
});
