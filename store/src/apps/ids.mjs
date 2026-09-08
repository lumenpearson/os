// deslop-ignore-file 34 — identifiers are values; design rule 1 sets values in
// the monospace face.

/**
 * ID Generator: UUID v4, UUID v7, ULID, a URL-safe token and a hex token, all
 * drawn from crypto.getRandomValues. The two time-ordered forms — v7 and ULID —
 * share one millisecond clock and a counter placed immediately after the
 * timestamp, which is what makes ids minted in the same millisecond sort into
 * the order they were made rather than into a random one.
 */

import { appPackage, program } from './shared.mjs';

const STYLE = `<style>
#out { min-height: 150px; }
.controls { display: flex; gap: 8px; align-items: flex-end; margin-top: 10px; }
.controls > div:first-child { flex: 1; }
#explain td:first-child { color: var(--ink-2); width: 10em; }
</style>`;

const BODY = `
<h1>ID Generator</h1>
<p class="lede">Random identifiers from the platform's cryptographic source.</p>
<div class="controls">
  <div>
    <label for="kind">Kind</label>
    <select id="kind">
      <option value="uuid4">UUID v4 — random</option>
      <option value="uuid7">UUID v7 — time ordered</option>
      <option value="ulid">ULID — time ordered, base 32</option>
      <option value="token">URL-safe token</option>
      <option value="hex">Hex token</option>
    </select>
  </div>
  <div style="width:6.5em">
    <label for="count">How many</label>
    <input id="count" class="mono" type="number" min="1" max="500" value="8">
  </div>
</div>
<div class="actions">
  <button id="make">Generate</button>
  <button id="upper" aria-pressed="false">Upper case</button>
  <button id="braces" aria-pressed="false">Wrap in braces</button>
  <button id="select">Select all</button>
</div>
<h2>Result</h2>
<textarea id="out" class="mono" readonly spellcheck="false"></textarea>
<h2>About this kind</h2>
<table id="explain"><tbody></tbody></table>
`;

const SCRIPT = `<script>
var CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
var URL_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
var NOTES = {
  uuid4: [
    ['Bits of randomness', '122'],
    ['Sorts by', 'nothing — order is random'],
    ['Shape', '8-4-4-4-12 hex, version 4, variant 10'],
    ['Use it for', 'keys that never need to sort']
  ],
  uuid7: [
    ['Bits of randomness', '62, after a 12 bit counter'],
    ['Sorts by', 'time, to the millisecond'],
    ['Shape', '48-bit millisecond stamp, counter, then random'],
    ['Use it for', 'database keys that should cluster by age']
  ],
  ulid: [
    ['Bits of randomness', '70, after a 10 bit counter'],
    ['Sorts by', 'time, to the millisecond'],
    ['Shape', '26 Crockford base-32 characters, no padding'],
    ['Use it for', 'ids that are read aloud or typed']
  ],
  token: [
    ['Bits of randomness', '126'],
    ['Sorts by', 'nothing'],
    ['Shape', '21 characters from A-Z a-z 0-9 - _'],
    ['Use it for', 'links, invite codes, session handles']
  ],
  hex: [
    ['Bits of randomness', '128'],
    ['Sorts by', 'nothing'],
    ['Shape', '32 lower-case hex digits'],
    ['Use it for', 'secrets pasted into configuration']
  ]
};

var kind = document.getElementById('kind');
var count = document.getElementById('count');
var out = document.getElementById('out');
var explain = document.getElementById('explain').querySelector('tbody');
var upperButton = document.getElementById('upper');
var bracesButton = document.getElementById('braces');
var upper = false;
var braces = false;
var lastStamp = 0;
var lastCounter = 0;

function randomBytes(n) {
  var bytes = new Uint8Array(n);
  if (self.crypto && self.crypto.getRandomValues) self.crypto.getRandomValues(bytes);
  else for (var i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

function hex(bytes) {
  var out2 = '';
  for (var i = 0; i < bytes.length; i++) {
    var pair = bytes[i].toString(16);
    out2 += pair.length === 1 ? '0' + pair : pair;
  }
  return out2;
}

function dashed(hexText) {
  return hexText.slice(0, 8) + '-' + hexText.slice(8, 12) + '-' + hexText.slice(12, 16) +
    '-' + hexText.slice(16, 20) + '-' + hexText.slice(20, 32);
}

/** A millisecond clock that never goes backwards within one run. */
function stamp() {
  var now = Date.now();
  if (now === lastStamp) lastCounter += 1;
  else { lastStamp = now; lastCounter = 0; }
  return now;
}

function uuid4() {
  var bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return dashed(hex(bytes));
}

function uuid7() {
  var ms = stamp();
  var bytes = randomBytes(16);
  for (var i = 0; i < 6; i++) bytes[5 - i] = Math.floor(ms / Math.pow(256, i)) % 256;
  // The twelve bits after the version hold the counter, so ids minted in one
  // millisecond keep their order when the string is sorted.
  bytes[6] = 0x70 | ((lastCounter >> 8) & 0x0f);
  bytes[7] = lastCounter & 0xff;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return dashed(hex(bytes));
}

function ulid() {
  var ms = stamp();
  var time = '';
  var value = ms;
  for (var i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(value % 32) + time;
    value = Math.floor(value / 32);
  }
  var bytes = randomBytes(16);
  // The first two characters of the tail hold the counter, for the same reason.
  var tail = CROCKFORD.charAt((lastCounter >> 5) & 31) + CROCKFORD.charAt(lastCounter & 31);
  for (var j = 2; j < 16; j++) tail += CROCKFORD.charAt(bytes[j] % 32);
  return time + tail;
}

function token(alphabet, size) {
  var bytes = randomBytes(size);
  var text = '';
  for (var i = 0; i < size; i++) text += alphabet.charAt(bytes[i] % alphabet.length);
  return text;
}

function one() {
  if (kind.value === 'uuid4') return uuid4();
  if (kind.value === 'uuid7') return uuid7();
  if (kind.value === 'ulid') return ulid();
  if (kind.value === 'token') return token(URL_SAFE, 21);
  return hex(randomBytes(16));
}

function decorate(id) {
  var text = upper ? id.toUpperCase() : id;
  return braces ? '{' + text + '}' : text;
}

function make() {
  var wanted = Math.max(1, Math.min(500, Number(count.value) || 1));
  var list = [];
  for (var i = 0; i < wanted; i++) list.push(decorate(one()));
  out.value = list.join('\\n');
  var rows = NOTES[kind.value] || [];
  explain.innerHTML = rows.map(function (row) {
    return '<tr><td>' + row[0] + '</td><td class="mono">' + row[1] + '</td></tr>';
  }).join('');
  lumen.storage.set('state', { kind: kind.value, count: count.value, upper: upper, braces: braces });
}

document.getElementById('make').addEventListener('click', make);
document.getElementById('select').addEventListener('click', function () {
  out.focus();
  out.select();
});
upperButton.addEventListener('click', function () {
  upper = !upper;
  upperButton.setAttribute('aria-pressed', String(upper));
  make();
});
bracesButton.addEventListener('click', function () {
  braces = !braces;
  bracesButton.setAttribute('aria-pressed', String(braces));
  make();
});
kind.addEventListener('change', make);
count.addEventListener('input', make);

lumen.setTitle('ID Generator');
lumen.storage.get('state').then(function (saved) {
  if (saved && NOTES[saved.kind]) {
    kind.value = saved.kind;
    count.value = saved.count;
    upper = saved.upper === true;
    braces = saved.braces === true;
    upperButton.setAttribute('aria-pressed', String(upper));
    bracesButton.setAttribute('aria-pressed', String(braces));
  }
  make();
});
</script>`;

export const IDS = appPackage({
  id: 'com.lumen.ids',
  version: '1.2.1',
  updated: '2026-09-02T09:00:00Z',
  tagline: 'UUIDs, ULIDs and tokens, in the quantity you asked for.',
  description:
    'Five kinds of identifier, generated in batches. UUID v4 is pure randomness; ' +
    'UUID v7 and ULID put a millisecond timestamp at the front so keys made ' +
    'later sort later; the URL-safe token is twenty-one characters of the ' +
    'alphabet that survives a query string; the hex token is sixteen bytes for ' +
    'pasting into configuration.\n\n' +
    'Randomness comes from crypto.getRandomValues, falling back to Math.random ' +
    'only where the platform has no cryptographic source — which no browser the ' +
    'OS runs in does. The two time-ordered forms share one clock with a counter ' +
    'byte, so a hundred ids minted inside the same millisecond still come out in ' +
    'the order they were made.\n\n' +
    'The table under the output states the bits of randomness, what the form ' +
    'sorts by and what it is worth using for, so the choice can be made once and ' +
    'defended later.',
  releaseNotes:
    'The monotonic counter now sits immediately after the timestamp in both ' +
    'UUID v7 and ULID, so a batch minted in one millisecond sorts correctly. ' +
    'Added the hex token.',
  capabilities: ['storage'],
  screenshots: [{ shape: 'grid', seed: 24, tone: 'neutral' }],
  manifest: {
    id: 'user.ids',
    name: 'ID Generator',
    description: 'Generate UUIDs, ULIDs and random tokens.',
    version: '1.2',
    category: 'developer',
    keywords: ['uuid', 'ulid', 'guid', 'token', 'random', 'id'],
    window: { width: 460, height: 560, minWidth: 340, minHeight: 400 },
    html: program(BODY, SCRIPT, STYLE),
  },
});
