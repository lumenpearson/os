import { Images } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * A library of the pictures already under the user's Pictures folder. There
 * is no import and no catalogue: one walk of that folder is the library, and
 * the folders inside it are the albums, because they are what is actually
 * there. The only thing the app writes is the favourites a person marks.
 *
 * Preview stays the app a picture opens in from anywhere else; this one is
 * for looking through all of them at once.
 */
export default defineApp({
  id: 'lumen.photos',
  name: 'Photos',
  description:
    'Browse the pictures in your Pictures folder, with favourites and a full-window view.',
  category: 'media',
  icon: createAppIcon({ glyph: Images, tone: 'teal' }),
  component: lazy(() => import('./Photos')),
  window: { width: 1040, height: 700, minWidth: 360, minHeight: 320, titleBar: 'inset' },
  singleton: true,
  keywords: ['photos', 'pictures', 'images', 'gallery', 'library', 'album', 'favourites'],
});
