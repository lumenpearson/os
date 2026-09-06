// deslop-ignore-file 34 — hex, RGB and HSL readouts are values, and design
// rule 1 sets values in the monospace face inside the frame as well.

/**
 * Colour Picker: one colour, read out as hex, RGB and HSL, with the last
 * eight colours kept through the storage bridge. The readouts are read-only
 * fields that select themselves, which is the one copy route a sandboxed
 * frame can offer without asking for clipboard permission.
 */

import type { AppManifest } from '@lumen/kernel';
import { program } from './shared';

const STYLE = `<style>
#swatch { height: 92px; border: 1px solid var(--rule); border-radius: var(--radius); }
#recent { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; padding: 0; list-style: none; }
#recent button { width: 26px; height: 26px; padding: 0; border-radius: 4px; }
.readout { margin-top: 8px; }
</style>`;

const BODY = `
<h1>Colour Picker</h1>
<p class="lede">Pick a colour and read it in three notations.</p>
<div id="swatch"></div>
<div class="row" style="margin-top:10px">
  <div style="flex:0 0 52px"><label for="pick">Pick</label><input type="color" id="pick" value="#3478f6" style="height:29px;padding:2px"></div>
  <div style="flex:1"><label for="hex">Hex</label><input id="hex" class="mono" value="#3478f6" spellcheck="false"></div>
</div>
<div class="readout"><label for="rgb">RGB</label><input id="rgb" class="mono" readonly></div>
<div class="readout"><label for="hsl">HSL</label><input id="hsl" class="mono" readonly></div>
<div class="readout">
  <label>Recent</label>
  <ul id="recent"></ul>
</div>
<p class="note">Click a readout to select it, then copy with the keyboard.</p>
`;

const SCRIPT = `<script>
var swatch = document.getElementById('swatch');
var pick = document.getElementById('pick');
var hex = document.getElementById('hex');
var rgb = document.getElementById('rgb');
var hsl = document.getElementById('hsl');
var recentList = document.getElementById('recent');
var recent = [];

function parseHex(text) {
  var value = String(text).trim().replace(/^#/, '');
  if (value.length === 3) value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

function toHex(parts) {
  return '#' + parts.map(function (n) {
    return ('0' + Math.round(n).toString(16)).slice(-2);
  }).join('');
}

function toHsl(parts) {
  var r = parts[0] / 255, g = parts[1] / 255, b = parts[2] / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var l = (max + min) / 2;
  var d = max - min;
  var h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function drawRecent() {
  recentList.innerHTML = '';
  for (var i = 0; i < recent.length; i++) {
    var value = recent[i];
    var item = document.createElement('li');
    var button = document.createElement('button');
    button.type = 'button';
    button.style.background = value;
    button.title = value;
    button.setAttribute('aria-label', 'Use ' + value);
    button.addEventListener('click', useColour.bind(null, value, true));
    item.appendChild(button);
    recentList.appendChild(item);
  }
}

function remember(value) {
  recent = [value].concat(recent.filter(function (c) { return c !== value; })).slice(0, 8);
  drawRecent();
  lumen.storage.set('recent', recent);
}

function useColour(value, keepList) {
  var parts = parseHex(value);
  if (!parts) return;
  var normalised = toHex(parts);
  swatch.style.background = normalised;
  pick.value = normalised;
  if (hex.value.trim().toLowerCase() !== normalised) hex.value = normalised;
  rgb.value = 'rgb(' + parts[0] + ', ' + parts[1] + ', ' + parts[2] + ')';
  var h = toHsl(parts);
  hsl.value = 'hsl(' + h[0] + ', ' + h[1] + '%, ' + h[2] + '%)';
  lumen.setTitle('Colour Picker — ' + normalised);
  if (!keepList) remember(normalised);
}

hex.addEventListener('input', function () { useColour(hex.value, false); });
pick.addEventListener('input', function () { useColour(pick.value, false); });
rgb.addEventListener('focus', function () { rgb.select(); });
hsl.addEventListener('focus', function () { hsl.select(); });

lumen.storage.get('recent').then(function (saved) {
  if (Array.isArray(saved)) { recent = saved.slice(0, 8); drawRecent(); }
  useColour(recent[0] || '#3478f6', true);
});
</script>`;

export const COLOUR: AppManifest = {
  id: 'user.colour',
  name: 'Colour Picker',
  description: 'Read a colour as hex, RGB and HSL, and keep the last eight.',
  version: '1.0',
  category: 'utilities',
  keywords: ['colour', 'color', 'hex', 'rgb', 'hsl', 'palette'],
  window: { width: 340, height: 470, minWidth: 300, minHeight: 360 },
  html: program(BODY, SCRIPT, STYLE),
};
