/**
 * The I-beam over a text field is not free here. The OS hides the native
 * cursor and draws its own, and the drawn layer reads `data-cursor`: while it
 * is on, computed style says `none` for every element on the screen. So each
 * field states what it is, and states nothing where the arrow is the answer.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input, TextArea } from './Input';

describe('field cursors', () => {
  it('asks for the I-beam over a field with a caret', () => {
    render(<Input aria-label="Name" />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('data-cursor', 'text');
  });

  it('keeps the arrow over a date field, which is stepped segments', () => {
    render(<Input aria-label="Due" type="date" />);
    expect(screen.getByLabelText('Due')).not.toHaveAttribute('data-cursor');
  });

  it('says not-allowed once the field is disabled', () => {
    render(<Input aria-label="Name" disabled />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('data-cursor', 'not-allowed');
  });

  it('makes the same two claims on a text area', () => {
    const { rerender } = render(<TextArea aria-label="Notes" />);
    expect(screen.getByLabelText('Notes')).toHaveAttribute('data-cursor', 'text');
    rerender(<TextArea aria-label="Notes" disabled />);
    expect(screen.getByLabelText('Notes')).toHaveAttribute('data-cursor', 'not-allowed');
  });
});
