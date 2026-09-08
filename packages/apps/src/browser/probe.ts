/**
 * Asking Lumen whether a site will let itself be framed.
 *
 * A browser cannot answer this about its own frames. A frame refused by
 * `X-Frame-Options` or by a `frame-ancestors` rule fires `load` exactly as a
 * frame that arrived does, and never fires `error` — so for as long as the
 * browser only watched its frames, every refusal looked like a page, and only
 * the hosts written down in `KNOWN_REFUSALS` were ever fetched through Lumen.
 * Everything else showed an empty frame and called it loaded.
 *
 * The headers say it plainly, and the server that fetches the page holds
 * them, so the browser asks it first and then chooses: the site's own frame,
 * or the relay.
 */

import { originOf, probeThroughLumen } from './url';

/** `allowed` and `refused` are the site's word; `unknown` is nobody's. */
export type FrameVerdict = 'allowed' | 'refused' | 'unknown';

export interface PageProbe {
  frame: FrameVerdict;
  /** The header that refused, as the site wrote it; null when none did. */
  header: string | null;
  /** Where the address ended up after redirects. */
  url: string;
  /** Why the site could not be asked, for `unknown`. */
  problem?: string;
}

/** How long the question is given before it is treated as unanswered. */
export const PROBE_TIMEOUT_MS = 8000;

/** What a frame should do with one address. */
export type FramePlan = 'outside' | 'blocked' | 'asking' | 'relay' | 'direct';

export interface FrameCase {
  /** The tab is on the open-outside list, so no frame is made at all. */
  external: boolean;
  /** Already being fetched through Lumen; there is no going back from it. */
  relayed: boolean;
  /** The address itself is refused before the network is touched. */
  refusedInAdvance: boolean;
  /** Lumen can fetch this address on the site's behalf, and is set to. */
  canRelay: boolean;
  /** The site's own word, once there is one. */
  verdict: FrameVerdict | null;
}

/**
 * Which of the two ways to show a page applies, written out rather than
 * spread across the effects that carry it out.
 *
 * The first attempt is the site itself wherever the site allows it: a page
 * that will be framed should be, because it keeps its own origin, its cookies
 * and its scripts, and its bytes never pass through Lumen. The relay is for
 * the pages that would otherwise be a wall.
 */
export function framePlan(input: FrameCase): FramePlan {
  if (input.external) return 'outside';
  if (input.relayed) return 'relay';
  if (input.refusedInAdvance) return input.canRelay ? 'relay' : 'blocked';
  /*
   * With no relay to fall back on — the desktop build, or the setting turned
   * off — the frame is the only thing that can show this address, so it is
   * given it at once rather than made to wait on an answer that would change
   * nothing. The answer is still worth having when it comes: it is the
   * difference between an empty frame and a refusal that names its header.
   */
  if (!input.canRelay) return input.verdict === 'refused' ? 'blocked' : 'direct';
  if (input.verdict === null) return 'asking';
  return input.verdict === 'refused' ? 'relay' : 'direct';
}

function unknown(url: string, problem: string): PageProbe {
  return { frame: 'unknown', header: null, url, problem };
}

/** A body that is not the shape we asked for is not an answer. */
export function readProbe(value: unknown, url: string): PageProbe {
  if (typeof value !== 'object' || value === null) return unknown(url, 'The answer was not JSON.');
  const raw = value as Record<string, unknown>;
  const frame = raw.frame;
  if (frame !== 'allowed' && frame !== 'refused' && frame !== 'unknown') {
    return unknown(url, 'The answer did not say.');
  }
  return {
    frame,
    header: typeof raw.header === 'string' ? raw.header : null,
    url: typeof raw.url === 'string' ? raw.url : url,
    ...(typeof raw.problem === 'string' ? { problem: raw.problem } : {}),
  };
}

/**
 * The answers already given, by origin.
 *
 * A frame rule belongs to a site rather than to one of its pages — in the
 * rare case where it differs by path, the first page's answer stands for the
 * rest — so following ten links around one site asks once. The map lives as
 * long as the tab does; a browser restart asks again, which is the right
 * amount of memory for something a site can change at any time.
 */
const answers = new Map<string, Promise<PageProbe>>();

/** For tests, and for a reload that should not trust what it heard before. */
export function forgetProbes(): void {
  answers.clear();
}

export async function askAboutFrame(
  url: string,
  doFetch: typeof fetch = fetch,
): Promise<PageProbe> {
  const origin = originOf(url);
  const asked = origin === '' ? url : origin;
  const known = answers.get(asked);
  if (known) return known;

  const asking = (async (): Promise<PageProbe> => {
    try {
      const response = await doFetch(probeThroughLumen(url), {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (!response.ok) return unknown(url, `Lumen answered ${response.status}.`);
      return readProbe(await response.json(), url);
    } catch (e) {
      return unknown(url, e instanceof Error ? e.message : String(e));
    }
  })();

  answers.set(asked, asking);
  const answer = await asking;
  // An answer nobody could give is worth asking for again next time; one the
  // site gave is not.
  if (answer.frame === 'unknown') answers.delete(asked);
  return answer;
}
