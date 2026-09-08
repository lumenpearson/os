import { useT } from '@lumen/kernel/react';
import { isTauri } from '@lumen/platform';
import { Button, cx, Spinner } from '@lumen/ui';
import { ExternalLink, ListPlus, RotateCw, ShieldOff } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { askAboutFrame, framePlan, type PageProbe } from './probe';
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
  /** A relayed page followed a link of its own and is now somewhere else. */
  onMoved: (id: string, url: string) => void;
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
  onMoved,
  onOpenOutside,
  onAlwaysOutside,
  onStopOutside,
}: FrameProps) {
  const t = useT();
  const { id, url, status } = tab;
  const external = status === 'external';

  // What can be known without asking the network: the page's own scheme rules
  // this address out, or the host is one that is already known to refuse.
  const known = useMemo(() => preflight(url, pageProtocol()), [url]);

  /** Whether this page is being fetched through Lumen rather than framed. */
  const [relayed, setRelayed] = useState(false);
  /** The site's own word on being framed, once it has been asked for it. */
  const [probe, setProbe] = useState<PageProbe | null>(null);

  /*
   * `/api/page` is served by the host that serves Lumen, which is a thing
   * only the web build has: the desktop app is a bundle of files behind a
   * Tauri protocol and there is nothing there to answer or to ask. So on the
   * desktop the site is asked directly and refused honestly, as before.
   *
   * An address the frame cannot be given at all — `ftp:`, `mailto:` — is not
   * asked about either; there is no page there to fetch. An http address on
   * an https Lumen is: the browser refuses to frame it, and fetching it
   * through here is the only way that address opens.
   */
  const canProbe = !isTauri() && known?.cause !== 'unsupported-scheme';
  const canRelay = viaLumen && canProbe;

  // A new address, or the same one asked for again, starts over from direct.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the address and the generation are the intended triggers
  useEffect(() => {
    setRelayed(false);
    setProbe(null);
  }, [url, tab.generation]);

  // Ask the site whether it would let itself be framed. A host already on the
  // list of known refusals is not asked: the answer would be the same, and
  // that list only ever saves the wait.
  useEffect(() => {
    if (!canProbe || known || relayed || status !== 'loading') return;
    let live = true;
    void askAboutFrame(url).then((answer) => {
      if (live) setProbe(answer);
    });
    return () => {
      live = false;
    };
  }, [canProbe, known, relayed, status, url]);

  const plan = framePlan({
    external,
    relayed,
    refusedInAdvance: known !== null,
    canRelay,
    verdict: probe?.frame ?? null,
  });

  /*
   * Carrying the plan out. Turning the frame over to the relay is state, and
   * saying a page is blocked is the browser's business, so both happen here
   * rather than while rendering.
   *
   * A refusal is reported whatever the tab's status, because a frame the site
   * turned away fires `load` exactly as one that arrived does: the tab can
   * already have been told the page loaded when the site's own answer shows
   * that what loaded was the browser's refusal notice.
   */
  useEffect(() => {
    if (plan === 'blocked') onBlocked(id);
    else if (plan === 'relay' && !relayed && status === 'loading') setRelayed(true);
  }, [plan, relayed, status, id, onBlocked]);

  /*
   * The wait, for a frame that has been given an address and says nothing.
   *
   * With the site's own answer in hand this is no longer how a refusal is
   * found — it is the last resort for a site that hangs, or that tells the
   * server one thing and the browser another.
   */
  useEffect(() => {
    if (status !== 'loading' || (plan !== 'direct' && plan !== 'relay')) return;
    const timer = setTimeout(() => {
      /*
       * A relayed frame is never called blocked. Lumen's own endpoint answers
       * every time — with the page, or with a sentence saying why not — so
       * there is always something on screen, and a panel over the top of it
       * would be covering the answer. Without the message (scripts off in
       * Settings > Browser) this is what clears the spinner.
       */
      if (plan === 'relay') onLoaded(id);
      else if (canRelay) setRelayed(true);
      else onBlocked(id);
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [plan, status, id, canRelay, timeoutMs, onBlocked, onLoaded]);

  const framed = plan === 'direct' || plan === 'relay';
  const source = relayed ? throughLumen(url) : url;

  /*
   * A relayed page says when it arrived, and where it goes next.
   *
   * `load` waits for every image, stylesheet and script the page asks for,
   * and those come from the site itself — one slow or unreachable asset and
   * the event never arrives, so a page that is on screen and readable would
   * be called blocked and covered with a panel. Reading the document instead
   * is not an option and should not be: the frame is sandboxed to an opaque
   * origin precisely so a page fetched from anywhere cannot touch Lumen.
   *
   * What is left is what the served document says for itself: that it
   * arrived, and — when a link inside it is followed — where it is asking to
   * go, which the browser then goes to as though the address had been typed.
   * Both are matched by window rather than by origin, because an opaque
   * origin has nothing to match, and the window is the browser's own answer
   * to "which frame sent this", which a page cannot forge.
   */
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!relayed) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = event.data as { lumen?: string; url?: string } | null;
      if (message?.lumen === 'page-ready') onLoaded(id);
      else if (message?.lumen === 'page-moved' && typeof message.url === 'string') {
        onMoved(id, message.url);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [relayed, id, onLoaded, onMoved]);
  const host = hostOf(url);

  return (
    <div className="absolute inset-0 overflow-hidden" hidden={!active}>
      <div className="h-full w-full" style={{ zoom: tab.zoom }}>
        {(framed || plan === 'asking') && status === 'loading' && (
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
          <p className="pointer-events-auto rounded-sm border border-rule bg-surface px-2.5 py-1 text-xs text-ink-2 shadow-sm">
            {t('browserApp.relayNote', { host: hostOf(url) })}
          </p>
        </div>
      )}

      {external && (
        <Panel
          icon={<ExternalLink className="size-8 stroke-[1.5] text-ink-3" aria-hidden />}
          title={t('browserApp.opensOutside')}
          text={`${host} is on your list of sites that open in the browser Lumen is running in.`}
          url={url}
        >
          <Button variant="primary" icon={<ExternalLink />} onClick={() => onOpenOutside(url)}>
            {t('browserApp.openOutside')}
          </Button>
          <Button onClick={() => onStopOutside(url)}>{t('browserApp.stopOpeningOutside')}</Button>
        </Panel>
      )}

      {status === 'blocked' && (
        <BlockedPanel
          url={url}
          reason={known ?? blockedReason(url, pageProtocol(), probe?.header ?? null)}
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
  const t = useT();
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
        {t('browserApp.tryAgain')}
      </Button>
      {web && (
        <>
          <Button variant="primary" icon={<ExternalLink />} onClick={onOpenOutside}>
            {t('browserApp.openOutside')}
          </Button>
          <Button icon={<ListPlus />} onClick={onAlwaysOutside}>
            {t('browserApp.alwaysOutside')}
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
