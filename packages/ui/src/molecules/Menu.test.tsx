/**
 * An item that is off does nothing when it is chosen, which the menu already
 * says in ink and in the hint beside the label. The cursor says it a moment
 * earlier, on the way to the click.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MenuList } from './Menu';

describe('menu item cursors', () => {
  it('marks a disabled item not-allowed and leaves a live one to the arrow', () => {
    render(
      <MenuList
        onClose={() => {}}
        items={[{ label: 'Paste', enabled: false }, { label: 'Select All' }]}
      />,
    );
    expect(screen.getByRole('menuitem', { name: 'Paste' })).toHaveAttribute(
      'data-cursor',
      'not-allowed',
    );
    expect(screen.getByRole('menuitem', { name: 'Select All' })).not.toHaveAttribute('data-cursor');
  });
});
