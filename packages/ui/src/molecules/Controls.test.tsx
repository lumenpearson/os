import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toolbar } from './Controls';

describe('Toolbar', () => {
  it('keeps the window controls clear only when asked', () => {
    const { rerender } = render(<Toolbar dense>content</Toolbar>);
    // Without the flag the row starts where its own padding puts it.
    expect(screen.getByRole('toolbar').className).not.toContain('lumen-window-controls-w');

    rerender(
      <Toolbar dense windowControls>
        content
      </Toolbar>,
    );
    // With it, the inline-start padding is the controls' own width, so the
    // close/minimize/zoom circles drawn over this row land on nothing.
    expect(screen.getByRole('toolbar').className).toContain('ps-(--lumen-window-controls-w)');
  });
});
