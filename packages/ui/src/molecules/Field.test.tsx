/**
 * A label that names nothing is not a label. `Field` used to render
 * `htmlFor` against an id it generated and handed to nobody, so twenty-one
 * fields in the system had a label a screen reader could not connect to a
 * control and a caption that did not focus the field when clicked.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Input, Select, TextArea } from '../atoms';
import { Field } from './Controls';

describe('Field', () => {
  it('labels the input inside it, with nothing asked of the caller', () => {
    render(
      <Field label="Password">
        <Input type="password" />
      </Field>,
    );
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('labels a text area and a select the same way', () => {
    render(
      <>
        <Field label="Notes">
          <TextArea />
        </Field>
        <Field label="Format">
          <Select options={[{ value: 'hex', label: 'Hex' }]} value="hex" onChange={() => {}} />
        </Field>
      </>,
    );
    expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Format').tagName).toBe('SELECT');
  });

  it('focuses the control when the label is clicked', async () => {
    const user = userEvent.setup();
    render(
      <Field label="Name">
        <Input />
      </Field>,
    );
    await user.click(screen.getByText('Name'));
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  it('leaves a control that brought its own id alone', () => {
    render(
      <Field label="Name" htmlFor="chosen">
        <Input id="chosen" />
      </Field>,
    );
    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'chosen');
  });

  it('gives two fields on the same page two different ids', () => {
    render(
      <>
        <Field label="First">
          <Input />
        </Field>
        <Field label="Second">
          <Input />
        </Field>
      </>,
    );
    const first = screen.getByLabelText('First');
    const second = screen.getByLabelText('Second');
    expect(first.id).not.toBe(second.id);
    expect(first.id).toBeTruthy();
  });

  it('shows an error in place of the hint, without losing the label', () => {
    render(
      <Field label="Password" hint="At least eight characters." error="Too short.">
        <Input />
      </Field>,
    );
    expect(screen.getByText('Too short.')).toBeInTheDocument();
    expect(screen.queryByText('At least eight characters.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });
});
