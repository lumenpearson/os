// deslop-ignore-file 34 — the pattern, the flags and the group table are
// values; design rule 1 sets values in the monospace face.

/**
 * Regex Tester: a pattern, its flags and a subject, with every match painted
 * into the subject as it is typed and each capture group listed underneath.
 * A bad pattern reports the engine's own message instead of clearing the view,
 * so half-typed patterns are not punished.
 */

import { appPackage, program } from './shared.mjs';

const STYLE = `<style>
#subject { min-height: 90px; }
#painted {
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 8px;
  min-height: 60px;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}
#painted mark { background: color-mix(in srgb, var(--accent) 24%, transparent); color: inherit; border-radius: 2px; }
#painted mark.odd { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.flags { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0 0; }
.flags label { display: flex; align-items: center; gap: 4px; margin: 0; cursor: pointer; }
.flags input { width: auto; }
#error { color: var(--ink); border-left: 2px solid var(--accent); padding-left: 8px; font-size: 12px; margin: 8px 0 0; }
#count { color: var(--ink-3); font-size: 12px; }
.scroll { max-height: 150px; overflow: auto; }
</style>`;

const BODY = `
<h1>Regex Tester</h1>
<p class="lede">Matches are painted as you type. Groups are listed below.</p>
<div class="panel">
  <label for="pattern">Pattern</label>
  <input id="pattern" class="mono" spellcheck="false" autocapitalize="off" value="(\\w+)@(\\w+)\\.com">
  <div class="flags" id="flags"></div>
</div>
<h2>Subject</h2>
<textarea id="subject" class="mono" spellcheck="false">ada@example.com wrote to grace@lovelace.com on Tuesday.</textarea>
<h2>Matches <span id="count" class="mono"></span></h2>
<div id="painted" class="mono"></div>
<p id="error" hidden></p>
<div class="scroll"><table id="groups"><tbody></tbody></table></div>
`;

const SCRIPT = `<script>
var FLAGS = [
  ['g', 'global'], ['i', 'ignore case'], ['m', 'multiline'],
  ['s', 'dot matches newline'], ['u', 'unicode']
];

var pattern = document.getElementById('pattern');
var subject = document.getElementById('subject');
var painted = document.getElementById('painted');
var errorBox = document.getElementById('error');
var count = document.getElementById('count');
var groups = document.getElementById('groups').querySelector('tbody');
var flagBox = document.getElementById('flags');
var boxes = {};

for (var i = 0; i < FLAGS.length; i++) {
  var label = document.createElement('label');
  var box = document.createElement('input');
  box.type = 'checkbox';
  box.id = 'flag-' + FLAGS[i][0];
  box.checked = FLAGS[i][0] === 'g';
  label.appendChild(box);
  label.appendChild(document.createTextNode(FLAGS[i][0] + ' — ' + FLAGS[i][1]));
  flagBox.appendChild(label);
  boxes[FLAGS[i][0]] = box;
  box.addEventListener('change', run);
}

function flags() {
  var out = '';
  for (var k = 0; k < FLAGS.length; k++) if (boxes[FLAGS[k][0]].checked) out += FLAGS[k][0];
  return out;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function run() {
  var text = subject.value;
  var source = pattern.value;
  var re;
  try {
    re = new RegExp(source, flags().indexOf('g') === -1 ? flags() + 'g' : flags());
  } catch (err) {
    errorBox.hidden = false;
    errorBox.textContent = err.message;
    painted.textContent = text;
    groups.innerHTML = '';
    count.textContent = '';
    return;
  }
  errorBox.hidden = true;

  var html = '';
  var rows = '';
  var cursor = 0;
  var found = 0;
  var guard = 0;
  var match;
  while ((match = re.exec(text)) !== null && guard++ < 2000) {
    if (match.index >= cursor) {
      html += escapeHtml(text.slice(cursor, match.index));
      html += '<mark class="' + (found % 2 ? 'odd' : '') + '">' + escapeHtml(match[0]) + '</mark>';
      cursor = match.index + match[0].length;
    }
    rows += describe(found + 1, match);
    found += 1;
    if (match[0] === '') re.lastIndex += 1;
    if (!boxes.g.checked) break;
  }
  html += escapeHtml(text.slice(cursor));
  painted.innerHTML = html || '<span class="muted">Nothing to match against.</span>';
  groups.innerHTML = rows;
  count.textContent = found === 1 ? '1 match' : found + ' matches';
  lumen.storage.set('state', { pattern: source, flags: flags(), subject: text });
}

function describe(index, match) {
  var out = '<tr><td>' + index + '</td><td>' + escapeHtml(match[0]) + '</td><td class="muted">at ' + match.index + '</td></tr>';
  for (var g = 1; g < match.length; g++) {
    var value = match[g] === undefined ? '(no match)' : match[g];
    out += '<tr><td class="muted">$' + g + '</td><td colspan="2">' + escapeHtml(value) + '</td></tr>';
  }
  if (match.groups) {
    for (var name in match.groups) {
      out += '<tr><td class="muted">' + escapeHtml(name) + '</td><td colspan="2">' +
        escapeHtml(String(match.groups[name])) + '</td></tr>';
    }
  }
  return out;
}

pattern.addEventListener('input', run);
subject.addEventListener('input', run);

lumen.setTitle('Regex Tester');
lumen.storage.get('state').then(function (saved) {
  if (saved && typeof saved.pattern === 'string') {
    pattern.value = saved.pattern;
    subject.value = saved.subject;
    for (var k = 0; k < FLAGS.length; k++) {
      boxes[FLAGS[k][0]].checked = String(saved.flags || '').indexOf(FLAGS[k][0]) !== -1;
    }
  }
  run();
});
</script>`;

export const REGEX = appPackage({
  id: 'com.lumen.regex',
  version: '1.1.0',
  updated: '2026-08-24T09:00:00Z',
  tagline: 'A pattern, its flags, and every match painted in place.',
  description:
    'A regular expression editor for the browser engine the OS already runs on. ' +
    'Type a pattern and it is compiled on every keystroke; matches are painted ' +
    'into the subject and numbered, and each capture group — positional or ' +
    'named — is listed with the text it caught.\n\n' +
    'The five flags that change matching are checkboxes rather than a string to ' +
    'remember. An invalid pattern shows the engine message under the field and ' +
    'leaves the subject alone, so a pattern can be typed one character at a time ' +
    'without the view flickering. Empty matches advance the cursor rather than ' +
    'looping, and scanning stops after two thousand matches.\n\n' +
    'The pattern, flags and subject are kept in the app data store and come back ' +
    'when the window reopens.',
  releaseNotes:
    'Named capture groups are listed alongside numbered ones. Empty matches no ' +
    'longer spin. The subject is restored when the window reopens.',
  capabilities: ['storage'],
  screenshots: [
    { shape: 'grid', seed: 12, tone: 'accent' },
    { shape: 'type', seed: 3, tone: 'neutral' },
  ],
  manifest: {
    id: 'user.regex',
    name: 'Regex Tester',
    description: 'Test a regular expression against a subject and read its groups.',
    version: '1.1',
    category: 'developer',
    keywords: ['regex', 'regexp', 'pattern', 'match', 'search'],
    window: { width: 460, height: 560, minWidth: 340, minHeight: 380 },
    html: program(BODY, SCRIPT, STYLE),
  },
});
