/**
 * The Web Audio graph behind the visualiser: element → analyser → speakers.
 *
 * A media element can only ever have one `MediaElementAudioSourceNode`, and
 * once it has one its sound travels through the audio context — so the graph
 * is built once, from a user gesture, and only when the context is actually
 * running. If the browser will not give us one, `supported` goes false and the
 * visualiser is hidden rather than animated from nothing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioGraph {
  analyser: AnalyserNode | null;
  supported: boolean;
  /** Build (or resume) the graph. Call from a user gesture, before play(). */
  connect: () => Promise<void>;
}

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const view = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return view.AudioContext ?? view.webkitAudioContext ?? null;
}

export function useAudioGraph(media: HTMLMediaElement | null): AudioGraph {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [supported, setSupported] = useState(() => audioContextCtor() !== null);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<MediaElementAudioSourceNode | null>(null);

  const connect = useCallback(async () => {
    if (!media) return;
    const existing = context.current;
    if (existing) {
      if (existing.state !== 'running') await existing.resume().catch(() => undefined);
      return;
    }
    const Ctor = audioContextCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    try {
      const ctx = new Ctor();
      await ctx.resume();
      if (ctx.state !== 'running') {
        await ctx.close().catch(() => undefined);
        setSupported(false);
        return;
      }
      const node = ctx.createMediaElementSource(media);
      const next = ctx.createAnalyser();
      next.fftSize = 2048;
      next.smoothingTimeConstant = 0.6;
      node.connect(next);
      next.connect(ctx.destination);
      context.current = ctx;
      source.current = node;
      setAnalyser(next);
    } catch {
      setSupported(false);
    }
  }, [media]);

  useEffect(
    () => () => {
      source.current?.disconnect();
      const ctx = context.current;
      source.current = null;
      context.current = null;
      if (ctx) void ctx.close().catch(() => undefined);
    },
    [],
  );

  return { analyser, supported, connect };
}
