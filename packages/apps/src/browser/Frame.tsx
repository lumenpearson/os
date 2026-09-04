import { Button, cx, Spinner } from '@lumen/ui';
import { ExternalLink, RotateCw, ShieldOff } from 'lucide-react';
import { useEffect } from 'react';
import type { Tab } from './tabs';
import { displayUrl, hostOf } from './url';

/**
 * How long to wait for the frame to say it loaded. Sites that refuse to be
 * framed never report anything, so this is the only signal available.
 */
export const FRAME_TIMEOUT_MS = 8000;

export interface FrameProps {
  tab: Tab;
  active: boolean;
  onLoaded: (id: string) => void;
  onBlocked: (id: string) => void;
  onReload: (id: string) => void;
}

/**
 * One web page in a sandboxed frame. The frame is cross-origin, so nothing
 * inside it can be read: no title, no links, no text. All this component
 * knows is whether the frame reported a load.
 */
export function Frame({ tab, active, onLoaded, onBlocked, onReload }: FrameProps) {
  const { id, url, status } = tab;

  // Going somewhere new while already loading leaves the status alone, so the
  // address and the generation have to restart the clock themselves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: url and generation restart the timer for a second load
  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => onBlocked(id), FRAME_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, id, url, tab.generation, onBlocked]);

  return (
    <div className="absolute inset-0 overflow-hidden" hidden={!active}>
      <div className="h-full w-full" style={{ zoom: tab.zoom }}>
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface">
            <Spinner size={14} />
            <span className="mono text-sm text-ink-3">{hostOf(url)}</span>
          </div>
        )}
        <iframe
          key={tab.generation}
          title={tab.title}
          src={url}
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          onLoad={() => onLoaded(id)}
          className={cx(
            'relative h-full w-full border-0',
            status === 'blocked' && 'pointer-events-none',
          )}
        />
      </div>
      {status === 'blocked' && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface p-8">
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <ShieldOff className="size-8 stroke-[1.5] text-ink-3" aria-hidden />
            <p className="text-md font-medium text-ink">This site refused to open in a frame</p>
            <p className="text-base text-ink-2">
              Most sites send a header that stops other pages from embedding them. Lumen cannot
              override it.
            </p>
            <p className="mono w-full truncate-1 rounded-sm border border-rule bg-surface-2 px-2 py-1 text-xs text-ink-2">
              {displayUrl(url)}
            </p>
            <div className="flex gap-2 pt-1">
              <Button icon={<RotateCw />} onClick={() => onReload(id)}>
                Try Again
              </Button>
              <Button
                variant="primary"
                icon={<ExternalLink />}
                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
              >
                Open in a new browser tab
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
