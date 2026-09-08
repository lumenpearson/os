import { useState } from 'react';
import { OS_URL } from '../lib/links';
import { Section } from './Section';

export function TryIt() {
  const [loaded, setLoaded] = useState(false);
  return (
    <Section id="try-it" title="Try it">
      <p className="max-w-[64ch] text-ink-2">
        The live build, embedded in a frame. It boots the same way it does in its own tab and walks
        you through setup the first time.
      </p>
      <div className="mt-6">
        {loaded ? (
          <iframe
            src={OS_URL}
            title="Lumen OS running in the browser"
            className="aspect-[16/10] w-full rounded-md border border-rule bg-canvas"
            allow="clipboard-read; clipboard-write; fullscreen"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-[16/10] w-full items-center justify-center rounded-md border border-rule bg-surface">
            <button type="button" className="btn btn-primary" onClick={() => setLoaded(true)}>
              Load the demo
            </button>
          </div>
        )}
      </div>
      <p className="mt-3 text-sm text-ink-2">
        Everything runs inside the frame, in your browser's storage for that origin. Nothing is
        uploaded.{' '}
        <a href={OS_URL} className="link" rel="noreferrer">
          Open it in its own tab
        </a>{' '}
        for the full screen.
      </p>
    </Section>
  );
}
