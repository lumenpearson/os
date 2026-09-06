import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Slider } from './Slider';

const root = (label: string) => screen.getByLabelText(label).parentElement;

describe('Slider', () => {
  it('fills its box when nobody says how wide it is', () => {
    render(<Slider aria-label="Volume" value={50} onChange={() => {}} />);
    expect(root('Volume')?.className).toContain('w-full');
  });

  it('lets the caller size it instead', () => {
    /*
     * `cx` concatenates and does not resolve conflicts, so a `w-full` here
     * alongside the caller's `w-32` left the stylesheet to decide — and it
     * chose `w-full`. Media Player's volume slider took the whole transport
     * row and pushed the playlist and full-screen buttons off the window.
     */
    render(<Slider aria-label="Volume" className="w-32 shrink-0" value={50} onChange={() => {}} />);
    const className = root('Volume')?.className ?? '';
    expect(className).toContain('w-32');
    expect(className).not.toContain('w-full');
  });

  it('treats a flex size as a size too', () => {
    render(<Slider aria-label="Rate" className="min-w-16 flex-1" value={1} onChange={() => {}} />);
    expect(root('Rate')?.className).not.toContain('w-full');
  });

  it('is not fooled by a class that merely contains a width-like word', () => {
    render(<Slider aria-label="Zoom" className="shadow-sm" value={1} onChange={() => {}} />);
    expect(root('Zoom')?.className).toContain('w-full');
  });
});
