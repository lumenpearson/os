import { Image } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';
import { DOCUMENT_EXTENSIONS, IMAGE_EXTENSIONS, MEDIA_EXTENSIONS, TEXT_EXTENSIONS } from './kind';

/**
 * The universal viewer: pictures, PDFs, media, structured text and a hex dump
 * for everything else. Launch with `{ path }`; the folder around that file
 * becomes the sequence the arrows step through.
 *
 * Pictures, PDFs and media open here by default. Text and source claim a
 * lower priority than the Editor, so double-clicking a `.ts` file still
 * opens something that can edit it.
 */
export default defineApp({
  id: 'lumen.preview',
  name: 'Preview',
  description: 'View images, PDFs, media and data files.',
  category: 'media',
  icon: createAppIcon({ glyph: Image, tone: 'violet' }),
  component: lazy(() => import('./Preview')),
  window: { width: 900, height: 660, minWidth: 360, minHeight: 280, titleBar: 'inset' },
  fileAssociations: [
    {
      extensions: [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS, ...MEDIA_EXTENSIONS],
      role: 'viewer',
      priority: 2,
    },
    { extensions: [...TEXT_EXTENSIONS], role: 'viewer', priority: 0 },
  ],
  keywords: ['image', 'view', 'photo', 'pdf', 'preview', 'open'],
});

export type PreviewArgs = { path?: string; paths?: string[] };
