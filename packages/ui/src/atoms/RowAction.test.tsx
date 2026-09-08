import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RowAction } from './RowAction';

describe('RowAction', () => {
  it('is a real button that reports its label', () => {
    render(<RowAction>Start</RowAction>);
    expect(screen.getByRole('button', { name: 'Start' })).toHaveAttribute('type', 'button');
  });

  it('carries no border or fill of its own, so a column of them is quiet', () => {
    render(<RowAction>Start</RowAction>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('border-transparent');
    expect(button.className).toContain('bg-transparent');
  });

  it('keeps a minimum width, so Start and Stop do not move the column', () => {
    render(<RowAction>Stop</RowAction>);
    expect(screen.getByRole('button').className).toContain('min-w-16');
  });

  it('calls its handler', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<RowAction onClick={onClick}>Start</RowAction>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all when disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <RowAction disabled onClick={onClick}>
        Stop
      </RowAction>,
    );
    await user.click(screen.getByRole('button')).catch(() => {});
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('takes a title, which is how a disabled action says why', () => {
    render(
      <RowAction disabled title="The system requires this service">
        Stop
      </RowAction>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('title', 'The system requires this service');
  });

  it('reads in the danger colour on approach when it is destructive', () => {
    render(<RowAction danger>Quit</RowAction>);
    expect(screen.getByRole('button').className).toContain('hover:text-danger');
  });

  it('is keyboard reachable with a visible ring', () => {
    render(<RowAction>Start</RowAction>);
    expect(screen.getByRole('button').className).toContain('lumen-focus');
  });
});
