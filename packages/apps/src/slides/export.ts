/**
 * "Export as HTML" writes one self-contained file: every slide is a section,
 * the styles are inline, and a short script moves between them with the same
 * keys the built-in player uses.
 */
import {
  type Deck,
  type DeckTheme,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type Slide,
  trimTrailingBullets,
} from './deck';

/** Data URLs for slide images, keyed by VFS path. Missing paths are skipped. */
export type ImageSources = Readonly<Record<string, string>>;

const THEME_COLORS: Record<DeckTheme, { surface: string; ink: string }> = {
  light: { surface: '#ffffff', ink: '#141517' },
  dark: { surface: '#141517', ink: '#f4f4f5' },
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Base64 for image bytes, chunked so a large picture cannot blow the stack. */
export function toBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let at = 0; at < bytes.length; at += chunk) {
    binary += String.fromCharCode(...bytes.subarray(at, at + chunk));
  }
  return btoa(binary);
}

export function imageDataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${toBase64(bytes)}`;
}

/** Paragraphs from a text block: blank lines separate, single breaks stay. */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function heading(slide: Slide, tag: 'h1' | 'h2'): string {
  return slide.title ? `<${tag}>${escapeHtml(slide.title)}</${tag}>` : '';
}

function slideBody(slide: Slide, images: ImageSources): string {
  switch (slide.layout) {
    case 'title':
      return [
        `<div class="middle">${heading(slide, 'h1')}`,
        slide.subtitle ? `<p class="subtitle">${escapeHtml(slide.subtitle)}</p>` : '',
        '</div>',
      ].join('');
    case 'bullets': {
      const bullets = trimTrailingBullets(slide.bullets ?? []);
      const items = bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
      return `${heading(slide, 'h2')}${items ? `<ul>${items}</ul>` : ''}`;
    }
    case 'text':
      return `${heading(slide, 'h2')}${paragraphs(slide.text ?? '')}`;
    case 'two-column':
      return [
        heading(slide, 'h2'),
        '<div class="columns">',
        `<div>${paragraphs(slide.left ?? '')}</div>`,
        `<div>${paragraphs(slide.right ?? '')}</div>`,
        '</div>',
      ].join('');
    case 'image': {
      const source = slide.imagePath ? images[slide.imagePath] : undefined;
      const figure = source
        ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(slide.title ?? '')}">`
        : '';
      return `${heading(slide, 'h2')}${figure}`;
    }
    case 'blank':
      return '';
  }
}

const STYLES = `*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#0b0b0c;color:#f4f4f5;
font-family:"IBM Plex Sans","Segoe UI",system-ui,sans-serif}
#stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
section{display:none;width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;padding:72px;
transform-origin:center;flex-direction:column;justify-content:flex-start;overflow:hidden}
section.on{display:flex}
section.middle,.middle{display:flex;flex-direction:column;justify-content:center;
align-items:flex-start;flex:1}
h1{font-size:44px;line-height:1.15;font-weight:600;margin:0}
h2{font-size:44px;line-height:1.15;font-weight:600;margin:0 0 32px}
p{font-size:24px;line-height:1.45;margin:0 0 16px}
.subtitle{font-size:24px;opacity:.7;margin-top:16px}
ul{font-size:24px;line-height:1.45;margin:0;padding-left:32px;list-style:square}
li{margin-bottom:16px}
.columns{display:flex;gap:48px;flex:1}
.columns>div{flex:1}
img{max-width:100%;max-height:100%;object-fit:contain;margin:auto}
#bar{position:absolute;left:0;bottom:0;height:1px;background:#4f8ef7}`;

// The slide counter is a number that changes, which the design rules set in
// JetBrains Mono; that font-family is what the scanner flags on the next line.
// deslop-ignore-next-line 34
const COUNTER_STYLE = `#count{position:absolute;right:16px;bottom:12px;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;font-variant-numeric:tabular-nums;color:rgb(255 255 255 / .55)}`;

const SCRIPT = `(function(){
var slides=Array.prototype.slice.call(document.querySelectorAll('section'));
var stage=document.getElementById('stage');
var bar=document.getElementById('bar');
var count=document.getElementById('count');
var at=0;
function fit(){
  var s=Math.min(window.innerWidth/${SLIDE_WIDTH},window.innerHeight/${SLIDE_HEIGHT});
  for(var i=0;i<slides.length;i++)slides[i].style.transform='scale('+s+')';
}
function show(i){
  at=Math.max(0,Math.min(slides.length-1,i));
  for(var j=0;j<slides.length;j++)slides[j].className=slides[j].className.replace(' on','')+(j===at?' on':'');
  bar.style.width=(slides.length?((at+1)/slides.length)*100:0)+'%';
  count.textContent=(at+1)+' / '+slides.length;
}
document.addEventListener('keydown',function(e){
  if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();show(at+1);}
  else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();show(at-1);}
  else if(e.key==='Home'){e.preventDefault();show(0);}
  else if(e.key==='End'){e.preventDefault();show(slides.length-1);}
});
stage.addEventListener('click',function(){show(at+1);});
window.addEventListener('resize',fit);
fit();show(0);
})();`;

/**
 * A stand-alone deck. `images` maps a slide's `imagePath` to a data URL; slides
 * whose image is not supplied export without one.
 */
export function exportDeckHtml(deck: Deck, images: ImageSources = {}): string {
  const colors = THEME_COLORS[deck.theme === 'dark' ? 'dark' : 'light'];
  const sections = deck.slides
    .map((slide) => {
      const classes = slide.layout === 'title' ? 'middle' : '';
      return `<section class="${classes}" style="background:${colors.surface};color:${colors.ink}">${slideBody(slide, images)}</section>`;
    })
    .join('\n');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(deck.title)}</title>`,
    `<style>${STYLES}\n${COUNTER_STYLE}</style>`,
    '</head>',
    '<body>',
    `<div id="stage">\n${sections}\n</div>`,
    '<div id="bar"></div>',
    '<div id="count"></div>',
    `<script>${SCRIPT}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
