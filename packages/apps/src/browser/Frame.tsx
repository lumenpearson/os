import { Button, cx, Spinner } from '@lumen/ui';
import { ExternalLink, ListPlus, RotateCw, ShieldOff } from 'lucide-react';
import { type ReactNode, useEffect, useMemo } from 'react';
import { type BlockedReason, blockedReason, preflight } from './settings';
import type { Tab } from './tabs';
import { displayUrl, hostOf } from './url';

export interface FrameProps {
  tab: Tab;
  active: boolean;
  /** The frame's `sandbox` attribute, derived from the settings. */
  sandbox: string;
  /** How long the frame is given to report a load. */
  timeoutMs: number;
  onLoaded: (id: string) => void;
  onBlocked: (id: string) => void;
  onReload: (id: string) => void;
  /** Hand the address to the browser Lumen is running in. */
  onOpenOutside: (url: string) => void;
  /** Put this host on the list of sites that open outside Lumen. */
  onAlwaysOutside: (url: string) => void;
  /** Take it off that list again. */
  onStopOutside: (url: string) => void;
}

/** The scheme of the page Lumen itself is served from. */
function pageProtocol(): string {
  return typeof window === 'undefined' ? 'https:' : window.location.protocol;
}

/**
 * One web page in a sandboxed frame. The frame is cross-origin, so nothing
 * inside it can be read: no title, no links, no text, and no response
 * headers. All this component knows is whether the frame reported a load —
 * and, for the few cases that can be decided before it is even created, why
 * it will not.
 */
export function Frame({
  tab,
  active,
  sandbox,
  timeoutMs,
  onLoaded,
  onBlocked,
  onReload,
  onOpenOutside,
  onAlwaysOutside,
  onStopOutside,
}: FrameProps) {
  const { id, url, status } = tab;
  const external = status === 'external';

  // What can be known without asking the network: the page's own scheme rules
  // this address out, or the host is one that is already known to refuse.
  const known = useMemo(() => preflight(url, pageProtocol()), [url]);

  // Going somewhere new while already loading leaves the status alone, so the
  // address and the generation have to restart the clock themselves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: url and generation restart the timer for a second load
  useEffect(() => {
    if (status !== 'loading') return;
    if (known) {
      onBlocked(id);
      return;
    }
    const timer = setTimeout(() => onBlocked(id), timeoutMs);
    return () => clearTimeout(timer);
  }, [status, id, url, tab.generation, known, timeoutMs, onBlocked]);

  const framed = !external && !known;
  const host = hostOf(url);

  return (
    <div className="absolute inset-0 overflow-hidden" hidden={!active}>
      <div className="h-full w-full" style={{ zoom: tab.zoom }}>
        {framed && status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface">
            <Spinner size={14} />
            <span className="mono text-sm text-ink-3">{host}</span>
          </div>
        )}
        {framed && (
          <iframe
            key={tab.generation}
            title={tab.title}
            src={url}
            sandbox={sandbox}
            referrerPolicy="no-referrer"
            onLoad={() => onLoaded(id)}
            className={cx(
              'relative h-full w-full border-0',
              status === 'blocked' && 'pointer-events-none',
            )}
          />
        )}
      </div>

      {external && (
        <Panel
          icon={<ExternalLink className="size-8 stroke-[1.5] text-ink-3" aria-hidden />}
          title="This site opens outside Lumen"
          text={`${host} is on your list of sites that open in the browser Lumen is running in.`}
          url={url}
        >
          <Button variant="primary" icon={<ExternalLink />} onClick={() => onOpenOutside(url)}>
            Open Outside Lumen
          </Button>
          <Button onClick={() => onStopOutside(url)}>Stop Opening Outside</Button>
        </Panel>
      )}

      {status === 'blocked' && (
        <BlockedPanel
          url={url}
          reason={known ?? blockedReason(url, pageProtocol())}
          onReload={() => onReload(id)}
          onOpenOutside={() => onOpenOutside(url)}
          onAlwaysOutside={() => onAlwaysOutside(url)}
        />
      )}
    </div>
  );
}

function BlockedPanel({
  url,
  reason,
  onReload,
  onOpenOutside,
  onAlwaysOutside,
}: {
  url: string;
  reason: BlockedReason;
  onReload: () => void;
  onOpenOutside: () => void;
  onAlwaysOutside: () => void;
}) {
  // Nothing to add to the list, and nothing outside can open it either.
  const web = reason.cause !== 'unsupported-scheme' && hostOf(url) !== '';

  return (
    <Panel
      icon={<ShieldOff className="size-8 stroke-[1.5] text-ink-3" aria-hidden />}
      title={reason.title}
      text={reason.text}
      url={url}
    >
      <Button icon={<RotateCw />} onClick={onReload}>
        Try Again
      </Button>
      {web && (
        <>
          <Button variant="primary" icon={<ExternalLink />} onClick={onOpenOutside}>
            Open Outside Lumen
          </Button>
          <Button icon={<ListPlus />} onClick={onAlwaysOutside}>
            Always Open Outside
          </Button>
        </>
      )}
    </Panel>
  );
}

function Panel({
  icon,
  title,
  text,
  url,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  url: string;
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-surface p-8">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        {icon}
        <p className="text-md font-medium text-ink">{title}</p>
        <p className="text-base text-ink-2">{text}</p>
        <p className="mono w-full truncate-1 rounded-sm border border-rule bg-surface-2 px-2 py-1 text-xs text-ink-2">
          {displayUrl(url)}
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">{children}</div>
      </div>
    </div>
  );
}
