/**
 * Built-in wallpapers, generated as SVG so they cost nothing to ship and
 * scale to any display. Each is a quiet, mostly flat composition: a base tone
 * with one structural element (a horizon, a grid, contour lines). Settings
 * renders the same SVG as a thumbnail.
 */
export interface WallpaperPreset {
  id: string;
  name: string;
  /** Average tone, used to pick light/dark chrome and cursor colour. */
  tone: 'light' | 'dark';
  svg: string;
}

const svg = (body: string, w = 1600, h = 1000) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">${body}</svg>`;

function contours(color: string, count: number, seed: number): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    const y = 120 + i * 90;
    const a = 40 + ((i * 37 + seed) % 50);
    const b = 60 + ((i * 53 + seed) % 70);
    out += `<path d="M -100 ${y} C 300 ${y - a}, 500 ${y + b}, 800 ${y} S 1300 ${y - b}, 1700 ${y + a}" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.55"/>`;
  }
  return out;
}

export const WALLPAPERS: WallpaperPreset[] = [
  {
    id: 'preset:dawn',
    name: 'Dawn',
    tone: 'dark',
    svg: svg(
      // The sun is drawn before the ground so the ground occludes its lower
      // half: a disc sitting on the horizon reads as a rising sun, where a
      // full disc with the horizon line across it reads as a mistake.
      `<rect width="1600" height="1000" fill="#20242c"/>
       <circle cx="1180" cy="640" r="120" fill="#e8dfd0" opacity="0.9"/>
       <rect y="640" width="1600" height="360" fill="#1a1d24"/>
       <rect y="639" width="1600" height="2" fill="#2f3440"/>`,
    ),
  },
  {
    id: 'preset:graphite',
    name: 'Graphite',
    tone: 'dark',
    svg: svg(`<rect width="1600" height="1000" fill="#1f2125"/>${contours('#3a3d45', 10, 3)}`),
  },
  {
    id: 'preset:paper',
    name: 'Paper',
    tone: 'light',
    svg: svg(`<rect width="1600" height="1000" fill="#ecebe6"/>${contours('#d6d3ca', 10, 11)}`),
  },
  {
    id: 'preset:grid',
    name: 'Grid',
    tone: 'dark',
    svg: svg(
      `<rect width="1600" height="1000" fill="#16181c"/>
       <defs><pattern id="g" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M 80 0 L 0 0 0 80" fill="none" stroke="#262930" stroke-width="1"/></pattern></defs>
       <rect width="1600" height="1000" fill="url(#g)"/>
       <rect x="640" y="400" width="320" height="200" fill="none" stroke="#3b7ddd" stroke-width="2"/>`,
    ),
  },
  {
    id: 'preset:tide',
    name: 'Tide',
    tone: 'dark',
    svg: svg(
      `<rect width="1600" height="1000" fill="#12252b"/>
       <rect y="560" width="1600" height="440" fill="#0e1e23"/>
       ${contours('#1f4750', 6, 7)}`,
    ),
  },
  {
    id: 'preset:moss',
    name: 'Moss',
    tone: 'dark',
    svg: svg(
      `<rect width="1600" height="1000" fill="#1c2a1f"/>
       <polygon points="0,1000 0,700 400,520 800,760 1200,480 1600,640 1600,1000" fill="#152118"/>
       <polygon points="0,1000 0,820 500,700 900,880 1300,720 1600,800 1600,1000" fill="#101a12"/>`,
    ),
  },
  {
    id: 'preset:linen',
    name: 'Linen',
    tone: 'light',
    svg: svg(
      `<rect width="1600" height="1000" fill="#e4e1da"/>
       <defs><pattern id="l" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#e4e1da"/><rect width="1" height="1" fill="#d8d4cb"/></pattern></defs>
       <rect width="1600" height="1000" fill="url(#l)"/>
       <rect x="0" y="0" width="1600" height="1000" fill="none" stroke="#cfcac0" stroke-width="40"/>`,
    ),
  },
  {
    id: 'preset:ink',
    name: 'Ink',
    tone: 'dark',
    svg: svg(
      `<rect width="1600" height="1000" fill="#0f1012"/><circle cx="800" cy="500" r="220" fill="none" stroke="#2a2c31" stroke-width="1.5"/><circle cx="800" cy="500" r="330" fill="none" stroke="#212328" stroke-width="1.5"/><circle cx="800" cy="500" r="460" fill="none" stroke="#1a1c20" stroke-width="1.5"/>`,
    ),
  },
  {
    id: 'preset:slate',
    name: 'Slate',
    tone: 'light',
    svg: svg(
      `<rect width="1600" height="1000" fill="#c9ccd2"/><rect x="0" y="0" width="800" height="1000" fill="#bfc3ca"/><rect x="798" y="0" width="2" height="1000" fill="#a9aeb6"/>`,
    ),
  },
];

export function wallpaperById(id: string): WallpaperPreset | undefined {
  return WALLPAPERS.find((w) => w.id === id);
}

/** A CSS `url()` for a preset wallpaper. */
export function wallpaperUrl(preset: WallpaperPreset): string {
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(preset.svg)}")`;
}
