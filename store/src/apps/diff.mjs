// deslop-ignore-file 34 — line numbers and counts are values; design rule 1
// sets values in the monospace face.

/**
 * Diff Viewer: a line diff between two texts, computed with a Myers-style
 * longest common subsequence and drawn as a unified list with old and new line
 * numbers in the gutter. Marks are a hairline and a letter rather than red and
 * green fills, so the diff stays readable under either theme.
 */

import { appPackage, program } from './shared.mjs';

const STYLE = `<style>
textarea { min-height: 84px; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
#out {
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  overflow: auto;
  max-height: 300px;
  background: var(--surface);
}
.line { display: flex; gap: 0; align-items: baseline; padding: 0 8px; white-space: pre-wrap; word-break: break-word; }
.line .n { color: var(--ink-3); width: 3.5ch; flex: none; text-align: right; padding-right: 8px; }
.line .m { width: 2ch; flex: none; color: var(--ink-2); }
.line.add { border-left: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
.line.del { border-left: 2px solid var(--ink-3); background: color-mix(in srgb, var(--ink-3) 8%, transparent); }
.line.same { border-left: 2px solid transparent; }
.line.gap { color: var(--ink-3); border-left: 2px solid transparent; padding: 2px 8px; }
#stat { font-size: 12px; color: var(--ink-2); margin: 8px 0 0; }
</style>`;

const BODY = `
<h1>Diff Viewer</h1>
<p class="lede">Line differences between two texts, oldest on the left.</p>
<div class="pair">
  <div>
    <label for="left">Before</label>
    <textarea id="left" class="mono" spellcheck="false">one
two
three
four</textarea>
  </div>
  <div>
    <label for="right">After</label>
    <textarea id="right" class="mono" spellcheck="false">one
two and a half
three
four
five</textarea>
  </div>
</div>
<div class="actions">
  <button id="swap">Swap sides</button>
  <button id="context" aria-pressed="true">Collapse unchanged</button>
  <button id="trim" aria-pressed="false">Ignore trailing space</button>
</div>
<h2>Result</h2>
<div id="out" class="mono"></div>
<p id="stat" class="mono"></p>
`;

const SCRIPT = `<script>
var left = document.getElementById('left');
var right = document.getElementById('right');
var out = document.getElementById('out');
var stat = document.getElementById('stat');
var contextButton = document.getElementById('context');
var trimButton = document.getElementById('trim');
var collapse = true;
var trim = false;

function lines(text) {
  var list = text.split('\\n');
  if (list.length && list[list.length - 1] === '') list.pop();
  if (!trim) return list;
  return list.map(function (l) { return l.replace(/[ \\t]+$/, ''); });
}

/** Longest common subsequence table, then walked back into an edit script. */
function diff(a, b) {
  var n = a.length;
  var m = b.length;
  // The table is quadratic, so refuse the pair rather than freezing the frame.
  if (n * m > 4000000) return null;
  var table = [];
  for (var i = 0; i <= n; i++) table.push(new Uint32Array(m + 1));
  for (var i2 = n - 1; i2 >= 0; i2--) {
    for (var j = m - 1; j >= 0; j--) {
      table[i2][j] = a[i2] === b[j]
        ? table[i2 + 1][j + 1] + 1
        : Math.max(table[i2 + 1][j], table[i2][j + 1]);
    }
  }
  var script = [];
  var x = 0;
  var y = 0;
  while (x < n && y < m) {
    if (a[x] === b[y]) { script.push(['same', a[x], x, y]); x++; y++; }
    else if (table[x + 1][y] >= table[x][y + 1]) { script.push(['del', a[x], x, -1]); x++; }
    else { script.push(['add', b[y], -1, y]); y++; }
  }
  while (x < n) { script.push(['del', a[x], x, -1]); x++; }
  while (y < m) { script.push(['add', b[y], -1, y]); y++; }
  return script;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function render() {
  var a = lines(left.value);
  var b = lines(right.value);
  var script = diff(a, b);
  if (script === null) {
    out.innerHTML = '<div class="line gap">Too much text to compare — ' + a.length +
      ' lines against ' + b.length + '.</div>';
    stat.textContent = 'not compared';
    return;
  }
  var keep = new Array(script.length);
  for (var i = 0; i < script.length; i++) {
    if (script[i][0] !== 'same') {
      for (var k = Math.max(0, i - 2); k <= Math.min(script.length - 1, i + 2); k++) keep[k] = true;
    }
  }
  var html = '';
  var hidden = 0;
  var added = 0;
  var removed = 0;
  for (var j = 0; j < script.length; j++) {
    var step = script[j];
    if (step[0] === 'add') added++;
    if (step[0] === 'del') removed++;
    if (collapse && step[0] === 'same' && !keep[j]) { hidden++; continue; }
    if (hidden) {
      html += '<div class="line gap">' + hidden + (hidden === 1 ? ' unchanged line' : ' unchanged lines') + '</div>';
      hidden = 0;
    }
    var mark = step[0] === 'add' ? '+' : step[0] === 'del' ? '-' : ' ';
    html += '<div class="line ' + step[0] + '">' +
      '<span class="n">' + (step[2] >= 0 ? step[2] + 1 : '') + '</span>' +
      '<span class="n">' + (step[3] >= 0 ? step[3] + 1 : '') + '</span>' +
      '<span class="m">' + mark + '</span>' +
      '<span>' + escapeHtml(step[1]) + '</span></div>';
  }
  if (hidden) {
    html += '<div class="line gap">' + hidden + (hidden === 1 ? ' unchanged line' : ' unchanged lines') + '</div>';
  }
  out.innerHTML = html || '<div class="line gap">Both sides are empty.</div>';
  stat.textContent = added + ' added, ' + removed + ' removed, ' +
    (script.length - added - removed) + ' unchanged';
  lumen.storage.set('state', { left: left.value, right: right.value, collapse: collapse, trim: trim });
}

document.getElementById('swap').addEventListener('click', function () {
  var held = left.value;
  left.value = right.value;
  right.value = held;
  render();
});
contextButton.addEventListener('click', function () {
  collapse = !collapse;
  contextButton.setAttribute('aria-pressed', String(collapse));
  render();
});
trimButton.addEventListener('click', function () {
  trim = !trim;
  trimButton.setAttribute('aria-pressed', String(trim));
  render();
});
left.addEventListener('input', render);
right.addEventListener('input', render);

lumen.setTitle('Diff Viewer');
lumen.storage.get('state').then(function (saved) {
  if (saved && typeof saved.left === 'string') {
    left.value = saved.left;
    right.value = saved.right;
    collapse = saved.collapse !== false;
    trim = saved.trim === true;
    contextButton.setAttribute('aria-pressed', String(collapse));
    trimButton.setAttribute('aria-pressed', String(trim));
  }
  render();
});
</script>`;

export const DIFF = appPackage({
  id: 'com.lumen.diff',
  version: '1.0.2',
  updated: '2026-08-19T09:00:00Z',
  tagline: 'What changed between two texts, line by line.',
  description:
    'Paste two versions of a file and read the edit between them. The diff is a ' +
    'longest common subsequence walked back into a unified list: every line ' +
    'carries its number on both sides, and additions and removals are marked ' +
    'with a rule in the gutter and a sign rather than a wash of colour.\n\n' +
    'Long unchanged stretches collapse to a count with three lines of context on ' +
    'either side of each change, and the collapse can be switched off for a full ' +
    'reading. Trailing whitespace can be ignored, which is usually what you want ' +
    'when comparing something a formatter has been over.\n\n' +
    'Both texts are kept between sessions.',
  releaseNotes: 'Context collapsing keeps three lines either side instead of one.',
  capabilities: ['storage'],
  screenshots: [{ shape: 'ramp', seed: 21, tone: 'neutral' }],
  manifest: {
    id: 'user.diff',
    name: 'Diff Viewer',
    description: 'Compare two texts and read the line differences.',
    version: '1.0',
    category: 'developer',
    keywords: ['diff', 'compare', 'patch', 'text', 'changes'],
    window: { width: 560, height: 620, minWidth: 400, minHeight: 420 },
    html: program(BODY, SCRIPT, STYLE),
  },
});
