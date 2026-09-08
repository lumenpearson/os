// deslop-ignore-file 34 — the editing pane and inline code are code, which is
// exactly where the monospace face belongs.

/**
 * Markdown Scratchpad: a textarea on the left, a rendered preview on the
 * right, and the text kept in the program's own storage file so the window
 * reopens with what was in it. The renderer handles headings, emphasis,
 * inline code, fenced code, lists, quotes and rules — the marks a scratchpad
 * actually uses. Links are printed with their target beside them, because a
 * sandboxed frame cannot navigate.
 */

import type { AppManifest } from '@lumen/kernel';
import { program } from './shared';

const STYLE = `<style>
body { padding: 0; height: 100vh; display: flex; flex-direction: column; }
header { padding: 10px 14px; border-bottom: 1px solid var(--rule); }
#panes { display: flex; flex: 1; min-height: 0; }
#source { flex: 1 1 50%; border: 0; border-right: 1px solid var(--rule); border-radius: 0; padding: 12px 14px; min-height: 0; }
#preview { flex: 1 1 50%; overflow: auto; padding: 12px 14px; min-width: 0; }
#preview h2 { font-size: 15px; margin: 14px 0 6px; }
#preview h3 { font-size: 13px; margin: 12px 0 6px; }
#preview p, #preview ul, #preview ol { margin: 0 0 10px; }
#preview li { margin-bottom: 2px; }
#preview blockquote { margin: 0 0 10px; padding-left: 10px; border-left: 2px solid var(--rule); color: var(--ink-2); }
#preview pre { background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius); padding: 8px 10px; overflow: auto; }
#preview hr { border: 0; border-top: 1px solid var(--rule); margin: 14px 0; }
#preview .url { color: var(--ink-3); }
footer { padding: 6px 14px; border-top: 1px solid var(--rule); color: var(--ink-3); font-size: 12px; display: flex; justify-content: space-between; }
@media (max-width: 520px) { #panes { display: block; overflow: auto; } #source { width: 100%; border-right: 0; border-bottom: 1px solid var(--rule); min-height: 180px; } }
</style>`;

const BODY = `
<header>
  <h1>Markdown Scratchpad</h1>
  <p class="lede" style="margin:0">Kept as you type. Headings, lists, quotes, code.</p>
</header>
<div id="panes">
  <textarea id="source" class="mono" spellcheck="false" aria-label="Markdown source"></textarea>
  <div id="preview" aria-live="polite"></div>
</div>
<footer><span id="count" class="mono">0 words</span><span id="state" class="mono">kept</span></footer>
`;

const SCRIPT = `<script>
var source = document.getElementById('source');
var preview = document.getElementById('preview');
var count = document.getElementById('count');
var state = document.getElementById('state');
var timer = null;

var SAMPLE = [
  '# Scratchpad',
  '',
  'Everything here is kept in *.appdata/user.markdown.json*.',
  '',
  '- lists work',
  '- so does \`inline code\`',
  '',
  '> and quotes'
].join('\\n');

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\\*([^*]+)\\*/g, '$1<em>$2</em>')
    .replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g, '$1 <span class="url">$2</span>');
}

function render(text) {
  var lines = text.split(/\\r?\\n/);
  var out = [];
  var list = null;
  var fenced = false;
  var buffer = [];

  function closeList() {
    if (list) { out.push('</' + list + '>'); list = null; }
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.indexOf('\`\`\`') === 0) {
      if (fenced) { out.push('<pre><code>' + escapeHtml(buffer.join('\\n')) + '</code></pre>'); buffer = []; }
      else closeList();
      fenced = !fenced;
      continue;
    }
    if (fenced) { buffer.push(line); continue; }
    if (line.trim() === '') { closeList(); continue; }
    if (/^---+$/.test(line.trim())) { closeList(); out.push('<hr>'); continue; }
    var heading = line.match(/^(#{1,3})\\s+(.*)$/);
    if (heading) {
      closeList();
      var level = Math.min(3, heading[1].length + 1);
      out.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>');
      continue;
    }
    var quote = line.match(/^>\\s?(.*)$/);
    if (quote) { closeList(); out.push('<blockquote>' + inline(quote[1]) + '</blockquote>'); continue; }
    var bullet = line.match(/^[-*]\\s+(.*)$/);
    if (bullet) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push('<li>' + inline(bullet[1]) + '</li>');
      continue;
    }
    var numbered = line.match(/^\\d+\\.\\s+(.*)$/);
    if (numbered) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push('<li>' + inline(numbered[1]) + '</li>');
      continue;
    }
    closeList();
    out.push('<p>' + inline(line) + '</p>');
  }
  if (fenced && buffer.length) out.push('<pre><code>' + escapeHtml(buffer.join('\\n')) + '</code></pre>');
  closeList();
  return out.join('');
}

function words(text) {
  var parts = text.trim().split(/\\s+/).filter(Boolean);
  return parts.length;
}

function update() {
  preview.innerHTML = render(source.value);
  var n = words(source.value);
  count.textContent = n === 1 ? '1 word' : n + ' words';
}

source.addEventListener('input', function () {
  update();
  state.textContent = 'keeping';
  if (timer) clearTimeout(timer);
  timer = setTimeout(function () {
    lumen.storage.set('text', source.value);
    state.textContent = 'kept';
  }, 400);
});

lumen.setTitle('Markdown Scratchpad');
lumen.storage.get('text').then(function (saved) {
  source.value = typeof saved === 'string' ? saved : SAMPLE;
  update();
});
</script>`;

export const MARKDOWN: AppManifest = {
  id: 'user.markdown',
  name: 'Markdown Scratchpad',
  description: 'A notepad with a live Markdown preview that keeps itself.',
  version: '1.0',
  category: 'office',
  keywords: ['markdown', 'notes', 'scratchpad', 'preview'],
  window: { width: 720, height: 520, minWidth: 340, minHeight: 300 },
  html: program(BODY, SCRIPT, STYLE),
};
