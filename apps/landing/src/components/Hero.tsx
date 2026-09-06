import { lazy, Suspense, useState } from 'react';
import { OS_URL, RELEASES_URL } from '../lib/links';
import type { Theme } from '../lib/theme';
import { SceneBoundary } from './SceneBoundary';

const HeroScene = lazy(() => import('../scene/HeroScene'));

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

interface HeroProps {
  theme: Theme;
}

export function Hero({ theme }: HeroProps) {
  const [webgl] = useState(hasWebGL);
  return (
    <section id="top" aria-labelledby="hero-title">
      <div className="container grid items-center gap-10 py-12 md:min-h-[min(calc(100vh-56px),760px)] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-8 md:py-16">
        <div className="max-w-[520px] md:order-none">
          <h1
            id="hero-title"
            className="text-balance text-2xl font-semibold tracking-[-0.01em] md:text-3xl"
          >
            A desktop, in a tab.
          </h1>
          <p className="mt-5 max-w-[42ch] text-lg text-ink-2">
            A desktop environment in TypeScript. Runs in the browser, or on Windows through Tauri.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <a href={OS_URL} className="btn btn-primary" rel="noreferrer">
              Open in browser
            </a>
            <a href={RELEASES_URL} className="btn btn-secondary" rel="noreferrer">
              Download for Windows
            </a>
          </div>
        </div>
        <div className="relative -order-1 h-[240px] sm:h-[320px] md:order-none md:h-[520px]">
          {webgl ? (
            <SceneBoundary>
              <Suspense fallback={null}>
                <HeroScene theme={theme} />
              </Suspense>
            </SceneBoundary>
          ) : null}
        </div>
      </div>
    </section>
  );
}
