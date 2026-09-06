// deslop-ignore-file 34 — a JSON editor is code; the monospace face is the
// point of it.

/**
 * JSON Formatter: paste JSON, format it at the chosen indent, or minify it.
 * A parse error names the line and column, because "Unexpected token" on its
 * own has never helped anyone. The text is kept in the program's storage
 * file between runs.
 */

import type { AppManifest } from '@lumen/kernel';
import { program } from './shared';

const STYLE = `<style>
body { padding: 0; height: 100vh; display: flex; flex-direction: column; }
header { padding: 10px 14px 8px; border-bottom: 1px solid var(--rule); }
.bar { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
.bar select { width: auto; }
.bar .spacer { flex: 1; }
#text { flex: 1; min-height: 0; border: 0; border-radius: 0; padding: 12px 14px; }
footer { padding: 6px 14px; border-top: 1px solid var(--rule); font-size: 12px; display: flex; gap: 10px; }
#status { color: var(--ink-3); }
#status[data-error="true"] { color: var(--ink); }
</style>`;

const BODY = `
<header>
  <h1>JSON Formatter</h1>
  <div class="bar">
    <button id="format">Format</button>
    <button id="minify">Minify</button>
    <span class="spacer"></span>
    <label for="indent" style="margin:0">Indent</label>
    <select id="indent">
      <option value="2">2 spaces</option>
      <option value="4">4 spaces</option>
      <option value="tab">Tab</option>
    </select>
  </div>
</header>
<textarea id="text" class="mono" spellcheck="false" aria-label="JSON"></textarea>
<footer><span id="status" class="mono">Paste JSON and press Format.</span></footer>
`;

const SCRIPT = `<script>
var text = document.getElementById('text');
var statusLine = document.getElementById('status');
var indent = document.getElementById('indent');
var timer = null;

var SAMPLE = '{"id":"user.example","name":"Example","window":{"width":420,"height":320}}';

function indentValue() {
  return indent.value === 'tab' ? '\\t' : parseInt(indent.value, 10);
}

function position(message, value) {
  var match = /position (\\d+)/.exec(message);
  if (!match) return '';
  var index = Math.min(parseInt(match[1], 10), value.length);
  var before = value.slice(0, index);
  var line = before.split('\\n').length;
  var column = index - before.lastIndexOf('\\n');
  return ' (line ' + line + ', column ' + column + ')';
}

function report(message, isError) {
  statusLine.textContent = message;
  statusLine.setAttribute('data-error', isError ? 'true' : 'false');
}

function shape(value) {
  if (Array.isArray(value)) return value.length + (value.length === 1 ? ' item' : ' items');
  if (value && typeof value === 'object') {
    var n = Object.keys(value).length;
    return n + (n === 1 ? ' key' : ' keys');
  }
  return typeof value;
}

function run(pretty) {
  var value;
  try {
    value = JSON.parse(text.value);
  } catch (e) {
    report(e.message + position(e.message, text.value), true);
    return;
  }
  text.value = pretty ? JSON.stringify(value, null, indentValue()) : JSON.stringify(value);
  report(shape(value) + ', ' + text.value.length + ' characters', false);
  keep();
}

function keep() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(function () { lumen.storage.set('text', text.value); }, 400);
}

document.getElementById('format').addEventListener('click', function () { run(true); });
document.getElementById('minify').addEventListener('click', function () { run(false); });
indent.addEventListener('change', function () { lumen.storage.set('indent', indent.value); });
text.addEventListener('input', keep);
text.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(true); }
});

lumen.setTitle('JSON Formatter');
lumen.storage.get('indent').then(function (saved) {
  if (saved === '2' || saved === '4' || saved === 'tab') indent.value = saved;
});
lumen.storage.get('text').then(function (saved) {
  text.value = typeof saved === 'string' && saved.length > 0 ? saved : SAMPLE;
});
</script>`;

export const JSON_FORMATTER: AppManifest = {
  id: 'user.json',
  name: 'JSON Formatter',
  description: 'Format or minify JSON, with the line and column of any error.',
  version: '1.0',
  category: 'developer',
  keywords: ['json', 'format', 'pretty', 'minify', 'validate'],
  window: { width: 640, height: 480, minWidth: 320, minHeight: 260 },
  html: program(BODY, SCRIPT, STYLE),
};
