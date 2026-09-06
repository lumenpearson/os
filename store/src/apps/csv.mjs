// deslop-ignore-file 34 — cell text, counts and column types are values;
// design rule 1 sets values in the monospace face.

/**
 * CSV Table: paste delimited text and read it as a table. The parser handles
 * quoted fields, doubled quotes inside them and newlines inside quotes, which
 * is where naive splitting on commas gives up. Columns sort by click and the
 * sort is numeric when every value in the column parses as a number.
 */

import { appPackage, program } from './shared.mjs';

const STYLE = `<style>
#source { min-height: 80px; }
#wrap { border: 1px solid var(--rule); border-radius: var(--radius); overflow: auto; max-height: 300px; }
#grid { font-size: 12px; }
#grid th { cursor: pointer; user-select: none; white-space: nowrap; }
#grid th:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
#grid th .dir { color: var(--ink-3); }
#grid td { white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
#grid td.num { text-align: right; }
#summary { font-size: 12px; color: var(--ink-2); margin: 8px 0 0; }
.controls { display: flex; gap: 8px; align-items: flex-end; margin-top: 10px; }
.controls > div { flex: 1; }
</style>`;

const BODY = `
<h1>CSV Table</h1>
<p class="lede">Paste delimited text. Quoted fields and embedded newlines are read correctly.</p>
<textarea id="source" class="mono" spellcheck="false">name,role,commits
Ada,compiler,1204
Grace,linker,318
"Hopper, Jr.",docs,57</textarea>
<div class="controls">
  <div>
    <label for="delim">Delimiter</label>
    <select id="delim">
      <option value="auto">Detect</option>
      <option value=",">Comma</option>
      <option value="&#9;">Tab</option>
      <option value=";">Semicolon</option>
      <option value="|">Pipe</option>
    </select>
  </div>
  <div>
    <label for="filter">Filter</label>
    <input id="filter" class="mono" placeholder="Any text in the row">
  </div>
  <button id="header" aria-pressed="true">First row is a header</button>
</div>
<h2>Rows</h2>
<div id="wrap"><table id="grid"><thead></thead><tbody></tbody></table></div>
<p id="summary" class="mono"></p>
`;

const SCRIPT = `<script>
var source = document.getElementById('source');
var delim = document.getElementById('delim');
var headerButton = document.getElementById('header');
var filter = document.getElementById('filter');
var grid = document.getElementById('grid');
var head = grid.querySelector('thead');
var body = grid.querySelector('tbody');
var summary = document.getElementById('summary');
var hasHeader = true;
var sortColumn = -1;
var sortDescending = false;

/** RFC 4180-ish: quotes protect the delimiter and the newline; "" is one quote. */
function parse(text, sep) {
  var rows = [];
  var row = [];
  var field = '';
  var quoted = false;
  var i = 0;
  while (i < text.length) {
    var ch = text.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { quoted = true; i++; continue; }
    if (ch === sep) { row.push(field); field = ''; i++; continue; }
    if (ch === '\\r') { i++; continue; }
    if (ch === '\\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function detect(text) {
  var first = text.split('\\n')[0] || '';
  var best = ',';
  var bestCount = 0;
  var candidates = [',', '\\t', ';', '|'];
  for (var i = 0; i < candidates.length; i++) {
    var count = first.split(candidates[i]).length - 1;
    if (count > bestCount) { bestCount = count; best = candidates[i]; }
  }
  return best;
}

function isNumber(value) {
  return value !== '' && isFinite(Number(value.replace(/[, ]/g, '')));
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function render() {
  var sep = delim.value === 'auto' ? detect(source.value) : delim.value;
  var rows = parse(source.value, sep);
  if (!rows.length) {
    head.innerHTML = '';
    body.innerHTML = '<tr><td class="muted">Nothing parsed.</td></tr>';
    summary.textContent = '';
    return;
  }
  var columns = hasHeader ? rows[0] : rows[0].map(function (_, i) { return 'Column ' + (i + 1); });
  var data = hasHeader ? rows.slice(1) : rows.slice(0);
  var width = columns.length;

  var numeric = [];
  for (var c = 0; c < width; c++) {
    var all = data.length > 0;
    for (var r = 0; r < data.length; r++) if (!isNumber(data[r][c] || '')) { all = false; break; }
    numeric.push(all);
  }

  var needle = filter.value.trim().toLowerCase();
  var shown = needle
    ? data.filter(function (r) { return r.join(' ').toLowerCase().indexOf(needle) !== -1; })
    : data.slice(0);

  if (sortColumn >= 0 && sortColumn < width) {
    shown.sort(function (a, b) {
      var x = a[sortColumn] || '';
      var y = b[sortColumn] || '';
      var order = numeric[sortColumn]
        ? Number(x.replace(/[, ]/g, '')) - Number(y.replace(/[, ]/g, ''))
        : x.localeCompare(y);
      return sortDescending ? -order : order;
    });
  }

  var headHtml = '<tr>';
  for (var h = 0; h < width; h++) {
    var arrow = sortColumn === h ? '<span class="dir"> ' + (sortDescending ? '\\u2193' : '\\u2191') + '</span>' : '';
    headHtml += '<th tabindex="0" data-col="' + h + '" aria-sort="' +
      (sortColumn === h ? (sortDescending ? 'descending' : 'ascending') : 'none') + '">' +
      escapeHtml(columns[h] || '') + arrow + '</th>';
  }
  head.innerHTML = headHtml + '</tr>';

  var bodyHtml = '';
  for (var y2 = 0; y2 < shown.length && y2 < 500; y2++) {
    bodyHtml += '<tr>';
    for (var x2 = 0; x2 < width; x2++) {
      bodyHtml += '<td class="' + (numeric[x2] ? 'num' : '') + '">' +
        escapeHtml(shown[y2][x2] === undefined ? '' : shown[y2][x2]) + '</td>';
    }
    bodyHtml += '</tr>';
  }
  body.innerHTML = bodyHtml || '<tr><td class="muted">No row matches the filter.</td></tr>';

  var label = shown.length === 1 ? '1 row' : shown.length + ' rows';
  if (shown.length !== data.length) label += ' of ' + data.length;
  if (shown.length > 500) label += ', 500 shown';
  var sepName = sep === '\\t' ? 'tab' : sep;
  summary.textContent = label + ', ' + width + ' columns, separated by ' + sepName;
  lumen.storage.set('state', { source: source.value, delim: delim.value, header: hasHeader });
}

function sortBy(column) {
  if (sortColumn === column) sortDescending = !sortDescending;
  else { sortColumn = column; sortDescending = false; }
  render();
}

head.addEventListener('click', function (e) {
  var th = e.target.closest('th');
  if (th) sortBy(Number(th.dataset.col));
});
head.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var th = e.target.closest('th');
  if (!th) return;
  e.preventDefault();
  sortBy(Number(th.dataset.col));
});
headerButton.addEventListener('click', function () {
  hasHeader = !hasHeader;
  headerButton.setAttribute('aria-pressed', String(hasHeader));
  sortColumn = -1;
  render();
});
source.addEventListener('input', render);
delim.addEventListener('change', render);
filter.addEventListener('input', render);

lumen.setTitle('CSV Table');
lumen.storage.get('state').then(function (saved) {
  if (saved && typeof saved.source === 'string') {
    source.value = saved.source;
    delim.value = saved.delim || 'auto';
    hasHeader = saved.header !== false;
    headerButton.setAttribute('aria-pressed', String(hasHeader));
  }
  render();
});
</script>`;

export const CSV = appPackage({
  id: 'com.lumen.csv',
  version: '1.2.0',
  updated: '2026-08-28T09:00:00Z',
  tagline: 'Read delimited text as a table, quotes and all.',
  description:
    'Paste comma, tab, semicolon or pipe separated text and read it as a table. ' +
    'The parser follows the quoting rules real exports use: a quoted field may ' +
    'contain the delimiter, a newline, or a doubled quote standing for one ' +
    'quote character. The delimiter is detected from the first line unless you ' +
    'pick one.\n\n' +
    'Click a column heading to sort, click again to reverse. A column whose ' +
    'every value parses as a number sorts numerically and is set flush right; ' +
    'everything else sorts as text. The filter box narrows to rows containing ' +
    'what you type, and the summary line reports rows shown against rows read.\n\n' +
    'Headings are keyboard reachable and report their sort direction, so the ' +
    'table can be driven without a pointer.',
  releaseNotes:
    'Columns detect numeric content and sort by value. Added a row filter and ' +
    'pipe as a delimiter.',
  capabilities: ['storage'],
  screenshots: [
    { shape: 'grid', seed: 4, tone: 'neutral' },
    { shape: 'ramp', seed: 9, tone: 'accent' },
  ],
  manifest: {
    id: 'user.csv',
    name: 'CSV Table',
    description: 'Read comma or tab separated text as a sortable table.',
    version: '1.2',
    category: 'office',
    keywords: ['csv', 'tsv', 'table', 'data', 'spreadsheet'],
    window: { width: 560, height: 600, minWidth: 380, minHeight: 400 },
    html: program(BODY, SCRIPT, STYLE),
  },
});
