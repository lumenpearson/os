import type { SessionState } from '@lumen/kernel';
import { useKernel } from '@lumen/kernel/react';
import { Button } from '@lumen/ui';
import { useEffect, useState } from 'react';
import { Wordmark } from '../desktop/Wordmark';

/** Sleep, shutdown and restart states. Everything is black; a keypress wakes from sleep. */
export function PowerScreen({
  state,
}: {
  state: Extract<SessionState, 'sleeping' | 'shutdown' | 'restarting'>;
}) {
  const kernel = useKernel();
  const [settled, setSettled] = useState(false);
  const canQuit = kernel.platform.capabilities.canQuit;

  useEffect(() => {
    const id = setTimeout(() => setSettled(true), 1400);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (state !== 'sleeping') return;
    const wake = () => kernel.wake();
    const opts: AddEventListenerOptions = { capture: true, once: true };
    window.addEventListener('keydown', wake, opts);
    window.addEventListener('pointerdown', wake, opts);
    return () => {
      window.removeEventListener('keydown', wake, opts);
      window.removeEventListener('pointerdown', wake, opts);
    };
  }, [state, kernel]);

  if (state === 'sleeping') {
    return (
      <div
        className="fixed inset-0 z-[2000] bg-black select-none"
        aria-label="Sleeping. Press any key to wake."
        role="status"
        data-testid="sleep-screen"
      >
        <p className="mono absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-[#3a3c42] opacity-0 motion-safe:animate-[lumen-fade-in_2s_2s_forwards]">
          press any key
        </p>
        <style>{'@keyframes lumen-fade-in{to{opacity:1}}'}</style>
      </div>
    );
  }

  const restarting = state === 'restarting';
  return (
    <div
      className="fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-8 bg-[#0f1012] text-[#ececee] select-none"
      role="status"
      data-testid="power-screen"
    >
      <Wordmark size={56} />
      {!settled ? (
        <p className="text-md text-[#a3a6ae]">{restarting ? 'Restarting…' : 'Shutting down…'}</p>
      ) : restarting || canQuit ? (
        <p className="text-md text-[#a3a6ae]">{restarting ? 'Reloading' : 'Closing'}</p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-md text-[#a3a6ae]">You can close this tab now.</p>
          <Button variant="secondary" onClick={() => kernel.platform.restart()}>
            Start again
          </Button>
        </div>
      )}
    </div>
  );
}
