import { Wordmark } from '../desktop/Wordmark';

/** Shown while the kernel boots: the mark, a thin progress line, and nothing else. */
export function BootScreen({ error }: { error?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={error ? 'Boot failed' : 'Starting Lumen OS'}
      className="fixed inset-0 z-[2200] flex flex-col items-center justify-center gap-10 bg-[#141517] text-[#ececee] select-none"
      data-testid="boot-screen"
    >
      <Wordmark size={64} />
      {error ? (
        <div className="max-w-md text-center">
          <p className="text-md">Lumen OS could not start.</p>
          <p className="mono mt-2 text-sm text-[#a3a6ae] break-words">{error}</p>
        </div>
      ) : (
        <div className="h-px w-40 overflow-hidden bg-[#2b2c31]" aria-hidden>
          <div className="h-full w-1/3 bg-[#ececee] motion-safe:animate-[lumen-boot_1.4s_ease-in-out_infinite]" />
          <style>
            {
              '@keyframes lumen-boot{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'
            }
          </style>
        </div>
      )}
    </div>
  );
}
