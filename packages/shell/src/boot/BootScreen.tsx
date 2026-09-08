import { useT } from '@lumen/kernel/react';
import { Wordmark } from '../desktop/Wordmark';

/** Shown while the kernel boots: the mark, a thin progress line, and nothing else. */
export function BootScreen({ error }: { error?: string }) {
  /*
   * This screen is up before the settings file has been read, so the language
   * here is whatever the store starts on rather than the one on disk. That is
   * the honest limit of translating a boot screen: it is drawn before the
   * system knows anything about the person in front of it.
   */
  const t = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={error ? t('boot.failed') : t('boot.starting')}
      data-over-page
      className="fixed inset-0 z-[2200] flex flex-col items-center justify-center gap-10 bg-[#141517] text-[#ececee] select-none"
      data-testid="boot-screen"
    >
      <Wordmark size={64} />
      {error ? (
        <div className="max-w-md text-center">
          <p className="text-md">{t('boot.couldNotStart')}</p>
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
