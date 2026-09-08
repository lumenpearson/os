// deslop-ignore-file 34 — every reading here is a value; design rule 1 sets
// values in the monospace face.

/**
 * Timestamp Converter: one field that accepts a Unix time in seconds, in
 * milliseconds, or a date written out, and reports the same instant in every
 * form worth having. Seconds and milliseconds are told apart by magnitude,
 * with the boundary stated rather than guessed at silently.
 */

import { appPackage, program } from './shared.mjs';

const STYLE = `<style>
#input { font-size: 14px; }
#rows td:first-child { color: var(--ink-2); width: 11em; }
#rows td:last-child { word-break: break-all; }
#relative { font-size: 13px; margin: 10px 0 0; }
#reading { font-size: 12px; color: var(--ink-3); margin-top: 4px; }
</style>`;

const BODY = `
<h1>Timestamp Converter</h1>
<p class="lede">Unix seconds, milliseconds, or a date written out.</p>
<div class="panel">
  <label for="input">Instant</label>
  <input id="input" class="mono" spellcheck="false" autocapitalize="off">
  <p id="reading" class="mono"></p>
  <div class="actions">
    <button id="now">Now</button>
    <button id="tick" aria-pressed="false">Follow the clock</button>
    <button id="back">Minus a day</button>
    <button id="forward">Plus a day</button>
  </div>
</div>
<p id="relative" class="alert"></p>
<h2>The same instant</h2>
<table id="rows" class="mono"><tbody></tbody></table>
`;

const SCRIPT = `<script>
var DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var input = document.getElementById('input');
var rows = document.getElementById('rows').querySelector('tbody');
var relative = document.getElementById('relative');
var reading = document.getElementById('reading');
var tickButton = document.getElementById('tick');
var ticking = false;
var timer = null;

function pad(n, width) {
  var text = String(Math.abs(n));
  while (text.length < width) text = '0' + text;
  return (n < 0 ? '-' : '') + text;
}

/** Below this a number is seconds, above it milliseconds. As seconds the cut
 *  lands in the year 5138; as milliseconds it lands in March 1973, so every
 *  timestamp anyone actually holds falls on the right side of it. */
var BOUNDARY = 100000000000;

function interpret(text) {
  var clean = text.trim();
  if (clean === '') return null;
  if (/^-?\\d+(\\.\\d+)?$/.test(clean)) {
    var number = Number(clean);
    if (Math.abs(number) < BOUNDARY) return { ms: Math.round(number * 1000), unit: 'seconds' };
    return { ms: Math.round(number), unit: 'milliseconds' };
  }
  var parsed = Date.parse(clean);
  if (isNaN(parsed)) return null;
  return { ms: parsed, unit: 'a date string' };
}

function offsetLabel(date) {
  var minutes = -date.getTimezoneOffset();
  var sign = minutes < 0 ? '-' : '+';
  var abs = Math.abs(minutes);
  return 'UTC' + sign + pad(Math.floor(abs / 60), 2) + ':' + pad(abs % 60, 2);
}

function localStamp(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1, 2) + '-' + pad(date.getDate(), 2) +
    ' ' + pad(date.getHours(), 2) + ':' + pad(date.getMinutes(), 2) + ':' + pad(date.getSeconds(), 2);
}

/** ISO 8601 week number, counted from the Thursday of the same week. */
function isoWeek(date) {
  var probe = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var day = probe.getUTCDay() || 7;
  probe.setUTCDate(probe.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(probe.getUTCFullYear(), 0, 1));
  var week = Math.ceil(((probe - yearStart) / 86400000 + 1) / 7);
  return probe.getUTCFullYear() + '-W' + pad(week, 2);
}

function describeGap(ms) {
  var seconds = Math.round(Math.abs(ms) / 1000);
  var units = [
    [31557600, 'year'], [2629800, 'month'], [604800, 'week'],
    [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']
  ];
  for (var i = 0; i < units.length; i++) {
    if (seconds >= units[i][0]) {
      var count = Math.floor(seconds / units[i][0]);
      var name = units[i][1] + (count === 1 ? '' : 's');
      return count + ' ' + name + (ms < 0 ? ' ago' : ' from now');
    }
  }
  return 'now';
}

function render() {
  var read = interpret(input.value);
  if (!read) {
    reading.textContent = input.value.trim() ? 'not a time this can read' : '';
    relative.textContent = '';
    rows.innerHTML = '';
    return;
  }
  var date = new Date(read.ms);
  if (isNaN(date.getTime())) {
    reading.textContent = 'out of the range a date can hold';
    relative.textContent = '';
    rows.innerHTML = '';
    return;
  }
  reading.textContent = 'read as ' + read.unit;
  relative.textContent = describeGap(read.ms - Date.now());
  var seconds = Math.floor(read.ms / 1000);
  var list = [
    ['Unix seconds', String(seconds)],
    ['Unix milliseconds', String(read.ms)],
    ['ISO 8601, UTC', date.toISOString()],
    ['Local time', localStamp(date) + '  ' + offsetLabel(date)],
    ['Day', DAY_NAMES[date.getDay()]],
    ['ISO week', isoWeek(date)],
    ['Day of the year', String(Math.floor(
      (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
       Date.UTC(date.getFullYear(), 0, 1)) / 86400000) + 1)],
    ['RFC 1123', date.toUTCString()]
  ];
  rows.innerHTML = list.map(function (row) {
    return '<tr><td>' + row[0] + '</td><td>' + row[1] + '</td></tr>';
  }).join('');
  lumen.setTitle(date.toISOString().slice(0, 19).replace('T', ' ') + 'Z');
  if (!ticking) lumen.storage.set('input', input.value);
}

function shift(days) {
  var read = interpret(input.value);
  if (!read) return;
  var next = read.ms + days * 86400000;
  input.value = read.unit === 'seconds' ? String(Math.round(next / 1000)) : String(next);
  render();
}

document.getElementById('now').addEventListener('click', function () {
  input.value = String(Math.floor(Date.now() / 1000));
  render();
});
document.getElementById('back').addEventListener('click', function () { shift(-1); });
document.getElementById('forward').addEventListener('click', function () { shift(1); });
tickButton.addEventListener('click', function () {
  ticking = !ticking;
  tickButton.setAttribute('aria-pressed', String(ticking));
  if (timer) { clearInterval(timer); timer = null; }
  if (ticking) {
    timer = setInterval(function () {
      input.value = String(Math.floor(Date.now() / 1000));
      render();
    }, 1000);
  }
});
input.addEventListener('input', function () {
  if (ticking) {
    ticking = false;
    tickButton.setAttribute('aria-pressed', 'false');
    if (timer) { clearInterval(timer); timer = null; }
  }
  render();
});

lumen.setTitle('Timestamp Converter');
lumen.storage.get('input').then(function (saved) {
  input.value = typeof saved === 'string' && saved ? saved : String(Math.floor(Date.now() / 1000));
  render();
});
</script>`;

export const TIMESTAMP = appPackage({
  id: 'com.lumen.timestamp',
  version: '1.1.0',
  updated: '2026-09-03T09:00:00Z',
  tagline: 'One instant, written every way a log might write it.',
  description:
    'Paste a Unix time and read it back as a date, or paste a date and read it ' +
    'back as a Unix time. One field takes all three forms: an integer in ' +
    'seconds, an integer in milliseconds, or anything the platform date parser ' +
    'accepts, including ISO 8601 with an offset.\n\n' +
    'Seconds and milliseconds are told apart by magnitude, with the cut at ' +
    'a hundred billion — below it the number is read as seconds, above it as ' +
    'milliseconds — and the line under the field says which reading was taken, ' +
    'so a number near the boundary is never ambiguous to the reader.\n\n' +
    'The table gives seconds, milliseconds, ISO 8601 in UTC, local time with its ' +
    'offset, the weekday, the ISO week, the day of the year and the RFC 1123 ' +
    'form used in HTTP headers. "Follow the clock" turns the window into a ' +
    'ticking Unix clock; a day forward and a day back step by exactly 86,400 ' +
    'seconds.',
  releaseNotes: 'Added the ISO week, the day of the year and day stepping.',
  capabilities: ['storage'],
  screenshots: [{ shape: 'type', seed: 33, tone: 'neutral' }],
  manifest: {
    id: 'user.timestamp',
    name: 'Timestamp Converter',
    description: 'Convert between Unix time and readable dates.',
    version: '1.1',
    category: 'developer',
    keywords: ['unix', 'epoch', 'timestamp', 'date', 'iso'],
    window: { width: 440, height: 500, minWidth: 340, minHeight: 380 },
    html: program(BODY, SCRIPT, STYLE),
  },
});
