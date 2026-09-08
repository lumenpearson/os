import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { formatHex, parseHex, type Rgba } from '../paint/colour';
import { Picker } from './Picker';

function Harness({ initial }: { initial: Rgba }) {
  const [colour, setColour] = useState(initial);
  return (
    <>
      <Picker colour={colour} fieldHeight={160} onChange={setColour} />
      <output data-testid="hex">{formatHex(colour)}</output>
    </>
  );
}

const hex = () => screen.getByTestId('hex').textContent;
const surface = () => screen.getByRole('button', { name: /Saturation and brightness/ });
const thumb = () => surface().lastElementChild as HTMLElement;

function press(key: string, shift = false) {
  fireEvent.keyDown(surface(), { key, shiftKey: shift });
}

function mount(start: string) {
  const colour = parseHex(start);
  if (!colour) throw new Error(`bad colour ${start}`);
  render(<Harness initial={colour} />);
}

describe('the saturation and value field', () => {
  it('is reachable from the keyboard and says what the arrows do', () => {
    mount('#ff0000');
    expect(surface()).toHaveAccessibleName(/Arrow keys adjust/);
  });

  it('moves one step per arrow and ten with Shift held', () => {
    mount('#ff0000');
    press('ArrowLeft');
    expect(hex()).toBe('#ff0303');
    press('ArrowLeft', true);
    expect(hex()).toBe('#ff1c1c');
    press('ArrowDown');
    expect(hex()).toBe('#fc1c1c');
  });

  it('writes the thumb straight to the element', () => {
    mount('#ff0000');
    expect(thumb().style.left).toBe('100%');
    expect(thumb().style.top).toBe('0%');
    press('ArrowDown', true);
    expect(Number.parseFloat(thumb().style.top)).toBeCloseTo(10, 6);
  });

  it('stops at the edges rather than wrapping round', () => {
    mount('#ff0000');
    for (let i = 0; i < 12; i += 1) press('ArrowRight', true);
    expect(hex()).toBe('#ff0000');
    for (let i = 0; i < 12; i += 1) press('ArrowUp', true);
    expect(hex()).toBe('#ff0000');
  });

  it('remembers the hue through black, which RGB cannot', () => {
    mount('#0080ff');
    for (let i = 0; i < 12; i += 1) press('ArrowDown', true);
    expect(hex()).toBe('#000000');
    press('ArrowUp', true);
    // Back up the value axis on the hue it went down on, not on red.
    expect(hex()).toBe('#000d1a');
  });

  it('ignores the keys it has no meaning for', () => {
    mount('#ff0000');
    press('a');
    expect(hex()).toBe('#ff0000');
  });
});

describe('the hue and alpha strips', () => {
  it('turns the hue without touching saturation or value', () => {
    mount('#ff0000');
    fireEvent.change(screen.getByLabelText('Hue'), { target: { value: '240' } });
    expect(hex()).toBe('#0000ff');
  });

  it('sets alpha as a byte and shows it as a percentage', () => {
    mount('#ff0000');
    const alpha = screen.getByLabelText<HTMLInputElement>('Alpha');
    expect(alpha).toHaveValue('255');
    fireEvent.change(alpha, { target: { value: '128' } });
    expect(hex()).toBe('#ff000080');
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('keeps the hue when alpha changes, so a faded colour is the same colour', () => {
    mount('#00ff00');
    fireEvent.change(screen.getByLabelText('Alpha'), { target: { value: '0' } });
    expect(hex()).toBe('#00ff0000');
    expect(screen.getByLabelText('Hue')).toHaveValue('120');
  });
});

describe('a colour that arrived from elsewhere', () => {
  it('moves the thumb and the strips to match it', () => {
    function External() {
      const [colour, setColour] = useState(parseHex('#ff0000') as Rgba);
      return (
        <>
          <Picker colour={colour} fieldHeight={160} onChange={setColour} />
          <button type="button" onClick={() => setColour(parseHex('#404060') as Rgba)}>
            Paste
          </button>
        </>
      );
    }
    render(<External />);
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    expect(screen.getByLabelText('Hue')).toHaveValue('240');
    expect(thumb().style.left).toBe('33.33333333333333%');
  });
});
