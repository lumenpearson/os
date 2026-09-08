import { Play } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from './queue';

/**
 * Plays the audio and video the browser can decode, from a playlist held in
 * the VFS. Launch with `{ path }` or `{ paths }` to queue files and start.
 *
 * It claims media above Preview (priority 2) because Preview shows a file
 * while this plays a sequence of them.
 */
export default defineApp({
  id: 'lumen.media',
  name: 'Media Player',
  description: 'Play audio and video files with a playlist, loop and shuffle.',
  category: 'media',
  icon: createAppIcon({ glyph: Play, tone: 'teal' }),
  component: lazy(() => import('./MediaPlayer')),
  window: { width: 820, height: 560, minWidth: 320, minHeight: 220 },
  fileAssociations: [
    { extensions: [...AUDIO_EXTENSIONS], role: 'viewer', priority: 3 },
    { extensions: [...VIDEO_EXTENSIONS], role: 'viewer', priority: 3 },
  ],
  keywords: ['music', 'video', 'audio', 'play', 'player'],
});

export type MediaArgs = { path?: string; paths?: string[] };
