/**
 * Reading the open file. Which bytes are needed depends on the viewer: a
 * picture only needs an object URL (the `useObjectUrl` hook makes that one),
 * text viewers need the decoded characters, and the hex dump needs the bytes
 * themselves. Files with no known extension are sniffed before deciding.
 */
import { useVfs } from '@lumen/kernel/react';
import { type FileStat, VfsError } from '@lumen/vfs';
import { useCallback, useEffect, useState } from 'react';
import { useVfsWatch } from '../_sdk';
import { decodeText, limitText } from './document';
import { refineKind, type ViewerKind, viewerKind } from './kind';

/** Bytes decoded for a text viewer; the rest is cut with a note on screen. */
export const TEXT_BYTE_LIMIT = 4_000_000;

/** Bytes held in memory for the hex dump. */
export const HEX_BYTE_LIMIT = 32_000_000;

const TEXTUAL: ReadonlySet<ViewerKind> = new Set<ViewerKind>([
  'text',
  'markdown',
  'json',
  'csv',
  'svg',
]);

export interface PreviewFile {
  path: string | null;
  stat: FileStat | null;
  kind: ViewerKind;
  /** Decoded characters for the text viewers, else null. */
  text: string | null;
  /** Raw bytes for the hex dump, else null. */
  bytes: Uint8Array | null;
  /** Characters or bytes left unread because the file is very large. */
  dropped: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const IDLE: PreviewFile = {
  path: null,
  stat: null,
  kind: 'unsupported',
  text: null,
  bytes: null,
  dropped: 0,
  loading: false,
  error: null,
  reload: () => {},
};

export function usePreviewFile(path: string | null): PreviewFile {
  const vfs = useVfs();
  const [state, setState] = useState<Omit<PreviewFile, 'reload'>>({
    ...IDLE,
    loading: Boolean(path),
  });
  const [token, setToken] = useState(0);
  const reload = useCallback(() => setToken((t) => t + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `token` is what Reload increments to re-run this
  useEffect(() => {
    if (!path) {
      setState({ ...IDLE });
      return;
    }
    let cancelled = false;
    setState({ ...IDLE, path, kind: viewerKind(path), loading: true });
    (async () => {
      try {
        const stat = await vfs.stat(path);
        if (cancelled) return;
        const declared = viewerKind(path);
        if (!TEXTUAL.has(declared) && declared !== 'hex') {
          setState({ ...IDLE, path, stat, kind: declared });
          return;
        }
        const bytes = await vfs.readFile(path);
        if (cancelled) return;
        const kind = refineKind(declared, bytes);
        if (kind === 'hex') {
          setState({
            ...IDLE,
            path,
            stat,
            kind,
            bytes: bytes.subarray(0, HEX_BYTE_LIMIT),
            dropped: Math.max(0, bytes.length - HEX_BYTE_LIMIT),
          });
          return;
        }
        const readable = bytes.subarray(0, TEXT_BYTE_LIMIT);
        const { text, dropped } = limitText(decodeText(readable));
        setState({
          ...IDLE,
          path,
          stat,
          kind,
          text,
          dropped: dropped + Math.max(0, bytes.length - readable.length),
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          ...IDLE,
          path,
          kind: viewerKind(path),
          error: VfsError.is(error) ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vfs, path, token]);

  useVfsWatch(path, reload);

  return { ...state, reload };
}
