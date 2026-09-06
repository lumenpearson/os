// deslop-ignore-file 34 — hex codes and the ratio are values; design rule 1
// sets values in the monospace face.

/**
 * Contrast Checker: the WCAG 2 contrast ratio between two colours, with the
 * four thresholds reported as pass or fail rather than as a colour-coded badge.
 * "Fix the foreground" scales the foreground towards black and towards white a
 * per cent at a time and takes the first step that clears 4.5:1, which keeps
 * the channel ratios and so keeps the hue.
 */

import { appPackage, program } from './shared.mjs';

const STYLE = `<style>
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.swatch { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
.swatch input[type="color"] { width: 34px; height: 26px; padding: 0; border-radius: var(--radius); }
#preview { border: 1px solid var(--rule); border-radius: var(--radius); padding: 12px; margin-top: 12px; }
#preview .big { font-size: 19px; font-weight: 600; margin: 0 0 4px; }
#preview .small { font-size: 13px; margin: 0; }
#ratio { font-size: 30px; font-weight: 500; letter-spacing: -0.01em; margin: 12px 0 0; }
#checks { margin-top: 8px; }
#checks td:last-child { text-align: right; width: 5em; }
.pass { color: var(--accent); }
.fail { color: var(--ink-3); }
</style>`;

const BODY = `
<h1>Contrast Checker</h1>
<p class="lede">The WCAG 2 ratio between a foreground and a background.</p>
<div class="pair">
  <div>
    <label for="fgText">Foreground</label>
    <div class="swatch">
      <input id="fg" type="color" value="#5c6069" aria-label="Foreground colour picker">
      <input id="fgText" class="mono" spellcheck="false" value="#5C6069">
    </div>
  </div>
  <div>
    <label for="bgText">Background</label>
    <div class="swatch">
      <input id="bg" type="color" value="#ffffff" aria-label="Background colour picker">
      <input id="bgText" class="mono" spellcheck="false" value="#FFFFFF">
    </div>
  </div>
</div>
<div class="actions">
  <button id="swap">Swap</button>
  <button id="fix">Fix the foreground</button>
</div>
<div id="preview">
  <p class="big">Nineteen pixel heading</p>
  <p class="small">Thirteen pixel body text, the size most interfaces set their paragraphs at.</p>
</div>
<p id="ratio" class="mono">—</p>
<table id="checks"><tbody></tbody></table>
<p class="note">Large text is 18.66px bold or 24px regular. Interface targets are borders, icons and focus rings.</p>
`;

const SCRIPT = `<script>
var fg = document.getElementById('fg');
var bg = document.getElementById('bg');
var fgText = document.getElementById('fgText');
var bgText = document.getElementById('bgText');
var preview = document.getElementById('preview');
var ratioLabel = document.getElementById('ratio');
var checks = document.getElementById('checks').querySelector('tbody');

function parseHex(text) {
  var clean = String(text).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    clean = clean.charAt(0) + clean.charAt(0) + clean.charAt(1) + clean.charAt(1) +
      clean.charAt(2) + clean.charAt(2);
  }
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ];
}

function toHex(rgb) {
  var out = '#';
  for (var i = 0; i < 3; i++) {
    var v = Math.max(0, Math.min(255, Math.round(rgb[i]))).toString(16);
    out += v.length === 1 ? '0' + v : v;
  }
  return out.toUpperCase();
}

/** WCAG relative luminance: sRGB channels linearised, then weighted. */
function luminance(rgb) {
  var channels = [];
  for (var i = 0; i < 3; i++) {
    var c = rgb[i] / 255;
    channels.push(c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  }
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  var la = luminance(a);
  var lb = luminance(b);
  var light = Math.max(la, lb);
  var dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

function scale(rgb, factor) {
  return [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor];
}

/** Walk the foreground darker, then lighter, until it clears 4.5:1. */
function repair(front, back) {
  for (var step = 1; step <= 100; step++) {
    var darker = scale(front, 1 - step / 100);
    if (contrast(darker, back) >= 4.5) return darker;
    var lighter = [
      front[0] + (255 - front[0]) * step / 100,
      front[1] + (255 - front[1]) * step / 100,
      front[2] + (255 - front[2]) * step / 100
    ];
    if (contrast(lighter, back) >= 4.5) return lighter;
  }
  return luminance(back) > 0.35 ? [0, 0, 0] : [255, 255, 255];
}

function verdict(ratio, threshold) {
  var ok = ratio >= threshold;
  return '<td class="mono ' + (ok ? 'pass' : 'fail') + '">' + (ok ? 'passes' : 'fails') + '</td>';
}

function run(source) {
  if (source === 'picker') { fgText.value = fg.value.toUpperCase(); bgText.value = bg.value.toUpperCase(); }
  var front = parseHex(fgText.value);
  var back = parseHex(bgText.value);
  if (!front || !back) {
    ratioLabel.textContent = 'not a colour';
    checks.innerHTML = '';
    return;
  }
  fg.value = toHex(front).toLowerCase();
  bg.value = toHex(back).toLowerCase();
  preview.style.background = toHex(back);
  preview.style.color = toHex(front);
  var ratio = contrast(front, back);
  ratioLabel.textContent = ratio.toFixed(2) + ':1';
  checks.innerHTML =
    '<tr><td>Body text, AA</td><td class="muted mono">4.5</td>' + verdict(ratio, 4.5) + '</tr>' +
    '<tr><td>Body text, AAA</td><td class="muted mono">7.0</td>' + verdict(ratio, 7) + '</tr>' +
    '<tr><td>Large text, AA</td><td class="muted mono">3.0</td>' + verdict(ratio, 3) + '</tr>' +
    '<tr><td>Interface targets</td><td class="muted mono">3.0</td>' + verdict(ratio, 3) + '</tr>';
  lumen.storage.set('state', { fg: fgText.value, bg: bgText.value });
}

fgText.addEventListener('input', function () { run('text'); });
bgText.addEventListener('input', function () { run('text'); });
fg.addEventListener('input', function () { run('picker'); });
bg.addEventListener('input', function () { run('picker'); });
document.getElementById('swap').addEventListener('click', function () {
  var held = fgText.value;
  fgText.value = bgText.value;
  bgText.value = held;
  run('text');
});
document.getElementById('fix').addEventListener('click', function () {
  var front = parseHex(fgText.value);
  var back = parseHex(bgText.value);
  if (!front || !back) return;
  fgText.value = toHex(repair(front, back));
  run('text');
});

lumen.setTitle('Contrast Checker');
lumen.storage.get('state').then(function (saved) {
  if (saved && parseHex(saved.fg) && parseHex(saved.bg)) {
    fgText.value = saved.fg;
    bgText.value = saved.bg;
  }
  run('text');
});
</script>`;

export const CONTRAST = appPackage({
  id: 'com.lumen.contrast',
  version: '1.1.0',
  updated: '2026-08-30T09:00:00Z',
  tagline: 'Whether two colours are far enough apart to read.',
  description:
    'Enter a foreground and a background as hex, or pick them, and read the WCAG ' +
    '2 contrast ratio between them. The four thresholds are listed with their ' +
    'numbers and a plain pass or fail: 4.5 for body text at AA, 7 for AAA, 3 for ' +
    'large text, and 3 for interface targets such as borders, icons and focus ' +
    'rings.\n\n' +
    'The preview shows both a heading and a thirteen pixel paragraph in the pair, ' +
    'because a ratio that reads comfortably at nineteen pixels can be hard work ' +
    'at thirteen. Three-digit hex is accepted and normalised.\n\n' +
    '"Fix the foreground" searches outwards from the current colour, one per ' +
    'cent darker and one per cent lighter at a time, and stops at the first ' +
    'value that clears 4.5:1 — so the suggestion is the smallest change that ' +
    'passes rather than a jump to black.',
  releaseNotes: 'Added the interface target threshold and a repair that keeps the hue.',
  capabilities: ['storage'],
  screenshots: [{ shape: 'ramp', seed: 2, tone: 'accent' }],
  manifest: {
    id: 'user.contrast',
    name: 'Contrast Checker',
    description: 'Measure the WCAG contrast ratio between two colours.',
    version: '1.1',
    category: 'developer',
    keywords: ['contrast', 'wcag', 'accessibility', 'colour', 'a11y'],
    window: { width: 440, height: 560, minWidth: 340, minHeight: 420 },
    html: program(BODY, SCRIPT, STYLE),
  },
});
