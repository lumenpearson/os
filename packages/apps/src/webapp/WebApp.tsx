import { type AppManifest, events, getSettings, resolveTheme } from '@lumen/kernel';
import { useKernel, useVfs } from '@lumen/kernel/react';
import { EmptyState } from '@lumen/ui';
import { join } from '@lumen/vfs';
import { AppWindow } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type AppProps, useNotify, useTitle, useWindowControls } from '../_sdk';
import { FRAME_PRELUDE, isFrameMessage } from './bridge';

export default function WebApp({ args }: AppProps) {
  const manifest = args.manifest as AppManifest | undefined;
  const kernel = useKernel();
  const vfs = useVfs();
  const notify = useNotify();
  const { setTitle, close } = useWindowControls();
  const frame = useRef<HTMLIFrameElement>(null);
  useTitle(manifest?.name ?? 'Web App');

  const storagePath = manifest ? join(kernel.home, '.appdata', `${manifest.id}.json`) : null;

  const readStore = useCallback(async (): Promise<Record<string, unknown>> => {
    if (!storagePath) return {};
    try {
      return await vfs.readJson<Record<string, unknown>>(storagePath);
    } catch {
      return {};
    }
  }, [vfs, storagePath]);

  const sendTheme = useCallback(() => {
    const s = getSettings();
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--lumen-accent')
      .trim();
    frame.current?.contentWindow?.postMessage(
      { type: 'lumen:theme', theme: resolveTheme(s.appearance.theme), accent },
      '*',
    );
  }, []);

  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !isFrameMessage(e.data)) return;
      const msg = e.data;
      switch (msg.type) {
        case 'lumen:title':
          setTitle(msg.title.slice(0, 120));
          break;
        case 'lumen:notify':
          notify(msg.title.slice(0, 120), msg.body?.slice(0, 400));
          break;
        case 'lumen:close':
          void close();
          break;
        case 'lumen:storage:get': {
          const store = await readStore();
          frame.current?.contentWindow?.postMessage(
            {
              type: 'lumen:storage:value',
              id: msg.id,
              key: msg.key,
              value: store[msg.key] ?? null,
            },
            '*',
          );
          break;
        }
        case 'lumen:storage:set': {
          if (!storagePath) return;
          const store = await readStore();
          store[msg.key] = msg.value;
          await vfs.writeJson(storagePath, store, { recursive: true });
          break;
        }
      }
    };
    window.addEventListener('message', onMessage);
    const offTheme = events.on('theme:change', sendTheme);
    return () => {
      window.removeEventListener('message', onMessage);
      offTheme();
    };
  }, [setTitle, notify, close, readStore, storagePath, vfs, sendTheme]);

  const srcDoc = useMemo(() => (manifest?.html ? FRAME_PRELUDE + manifest.html : ''), [manifest]);

  if (!manifest?.html) {
    return (
      <EmptyState
        icon={<AppWindow />}
        title="Nothing to run"
        description="This window expects an app manifest with HTML content."
      />
    );
  }

  return (
    <iframe
      ref={frame}
      title={manifest.name}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock"
      referrerPolicy="no-referrer"
      onLoad={sendTheme}
      className="h-full w-full border-0 bg-surface"
    />
  );
}
