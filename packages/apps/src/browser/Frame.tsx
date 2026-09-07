import { Button, cx, Spinner } from '@lumen/ui';
import { ExternalLink, ListPlus, RotateCw, ShieldOff } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { type BlockedReason, blockedReason, preflight } from './settings';
import type { Tab } from './tabs';
import { displayUrl, hostOf, throughLumen } from './url';

export interface FrameProps {
  tab: Tab;
  active: boolean;
  /** The frame's `sandbox` attribute, derived from the settings. */
  sandbox: string;
  /** How long the frame is given to report a load. */
  timeoutMs: number;
  /**
   * Settings > Browser: fetch the page through Lumen when the site refuses to
   * be framed, rather than showing a wall where the page should be.
   */
  viaLumen: boolean;
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
  viaLumen,
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

  /*
   * Whether this page is being fetched through Lumen rather than framed.
   *
   * The first attempt is always the site itself: a page that will be framed
   * should be, because it keeps its own origin, its cookies and its scripts.
   * Only once it has refused — a known refusal, or a frame that never
   * reported a load — is it asked for again through Lumen, and one failure
   * there is the end of it rather than a loop between the two.
   */
  const [relayed, setRelayed] = useState(false);
  const canRelay = viaLumen && (known === null || known.cause === 'known-refusal');

  // A new address, or the same one asked for again, starts over from direct.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the address and the generation are the intended triggers
  useEffect(() => {
    setRelayed(false);
  }, [url, tab.generation]);

  // Going somewhere new while already loading leaves the status alone, so the
  // address and the generation have to restart the clock themselves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: url and generation restart the timer for a second load
  useEffect(() => {
    if (status !== 'loading') return;
    // Known to refuse a frame, and Lumen may fetch it: there is nothing to
    // wait for, so skip the timeout and ask Lumen straight away.
    if (known && canRelay && !relayed) {
      setRelayed(true);
      return;
    }
    // Known to refuse, and nothing else to try.
    if (known && !relayed) {
      onBlocked(id);
      return;
    }
    /*
     * Otherwise wait for the frame to say it loaded. When the wait runs out
     * the site is either asked again through Lumen — once — or called
     * blocked. Once it has been relayed this is the only clock left, which is
     * what keeps a relayed page from being taken down the moment it starts.
     */
    const timer = setTimeout(() => {
      if (canRelay && !relayed) {
        setRelayed(true);
        return;
      }
      /*
       * A relayed frame is never called blocked. Lumen's own endpoint answers
       * every time — with the page, or with a sentence saying why not — so
       * there is always something on screen, and a panel over the top of it
       * would be covering the answer. Without the message (scripts off in
       * Settings > Browser) this is what clears the spinner.
       */
      if (relayed) onLoaded(id);
      else onBlocked(id);
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [status, id, url, tab.generation, known, canRelay, relayed, timeoutMs, onBlocked, onLoaded]);

  const framed = !external && (relayed || !known);
  const source = relayed ? throughLumen(url) : url;

  /*
   * A relayed page says when it arrived, rather than waiting for `load`.
   *
   * `load` waits for every image, stylesheet and script the page asks for,
   * and those come from the site itself — one slow or unreachable asset and
   * the event never arrives, so a page that is on screen and readable would
   * be called blocked and covered with a panel. Reading the document instead
   * is not an option and should not be: the frame is sandboxed to an opaque
   * origin precisely so a page fetched from anywhere cannot touch Lumen.
   *
   * What is left is the message the served document sends on its way in. It
   * is matched by window rather than by origin, because an opaque origin has
   * nothing to match — and `source` is the browser's own answer to "which
   * frame sent this", which a page cannot forge.
   */
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!relayed || status !== 'loading') return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if ((event.data as { lumen?: string } | null)?.lumen !== 'page-ready') return;
      onLoaded(id);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [relayed, status, id, onLoaded]);
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
            ref={frameRef}
            key={`${tab.generation}-${relayed ? 'lumen' : 'direct'}`}
            title={tab.title}
            src={source}
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

      {framed && relayed && status !== 'blocked' && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-1.5">
          <p className="pointer-events-auto rounded-full border border-rule bg-surface/95 px-2.5 py-1 text-xs text-ink-2 shadow-sm">
            {hostOf(url)} refuses to be framed, so Lumen fetched the page. Signing in and anything
            the site loads from script will not work.
          </p>
        </div>
      )}

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
