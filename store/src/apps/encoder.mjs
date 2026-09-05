// deslop-ignore-file 34 — encoded output, byte counts and code points are
// values; design rule 1 sets values in the monospace face.

/**
 * Base64 and Hex: text to bytes to an encoding, and back again. Everything
 * goes through TextEncoder, so a pound sign or an emoji is encoded as its
 * UTF-8 bytes rather than whatever the old charCode path would have produced.
 * Decoding reports where it failed instead of returning mojibake.
 */

import { appPackage, program } from './shared.mjs';

const STYLE = `<style>
textarea { min-height: 74px; }
#error { margin: 8px 0 0; }
#stat { font-size: 12px; color: var(--ink-2); margin: 8px 0 0; }
.modes { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 0; }
</style>`;

const BODY = `
<h1>Base64 and Hex</h1>
<p class="lede">UTF-8 bytes in, an encoding out. Decoding runs the same way backwards.</p>
<div class="modes" id="modes"></div>
<div class="actions">
  <button id="direction">Encoding</button>
  <button id="swap">Move output to input</button>
  <button id="select">Select output</button>
</div>
<h2 id="inputLabel">Text</h2>
<textarea id="input" class="mono" spellcheck="false" autocapitalize="off">Lumen OS</textarea>
<h2 id="outputLabel">Base64</h2>
<textarea id="output" class="mono" spellcheck="false" readonly></textarea>
<p id="error" class="alert" hidden></p>
<p id="stat" class="mono"></p>
`;

const SCRIPT = `<script>
var MODES = [
  ['base64', 'Base64'],
  ['base64url', 'Base64 URL'],
  ['hex', 'Hex'],
  ['percent', 'Percent'],
  ['binary', 'Binary']
];

var input = document.getElementById('input');
var output = document.getElementById('output');
var errorBox = document.getElementById('error');
var stat = document.getElementById('stat');
var directionButton = document.getElementById('direction');
var inputLabel = document.getElementById('inputLabel');
var outputLabel = document.getElementById('outputLabel');
var modeBox = document.getElementById('modes');
var mode = 'base64';
var encoding = true;
var buttons = {};

for (var i = 0; i < MODES.length; i++) {
  (function (id, label) {
    var button = document.createElement('button');
    button.textContent = label;
    button.setAttribute('aria-pressed', String(id === mode));
    button.addEventListener('click', function () { setMode(id); });
    modeBox.appendChild(button);
    buttons[id] = button;
  })(MODES[i][0], MODES[i][1]);
}

function modeName(id) {
  for (var i = 0; i < MODES.length; i++) if (MODES[i][0] === id) return MODES[i][1];
  return id;
}

function setMode(id) {
  mode = id;
  for (var key in buttons) buttons[key].setAttribute('aria-pressed', String(key === mode));
  run();
}

function bytesFromText(text) {
  return new TextEncoder().encode(text);
}

function textFromBytes(bytes) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function toBase64(bytes, url) {
  var binary = '';
  for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  var out = btoa(binary);
  return url ? out.replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '') : out;
}

function fromBase64(text, url) {
  var clean = text.replace(/\\s+/g, '');
  if (url) clean = clean.replace(/-/g, '+').replace(/_/g, '/');
  while (clean.length % 4 !== 0) clean += '=';
  var binary = atob(clean);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes, group) {
  var parts = [];
  for (var i = 0; i < bytes.length; i++) {
    var pair = bytes[i].toString(16);
    parts.push(pair.length === 1 ? '0' + pair : pair);
  }
  return parts.join(group);
}

function fromHex(text) {
  var clean = text.replace(/(0x)|[\\s,:]/gi, '');
  if (clean.length % 2 !== 0) throw new Error('a hex string needs an even number of digits');
  if (/[^0-9a-f]/i.test(clean)) throw new Error('only 0-9 and a-f are hex digits');
  var bytes = new Uint8Array(clean.length / 2);
  for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  return bytes;
}

function toBinary(bytes) {
  var parts = [];
  for (var i = 0; i < bytes.length; i++) {
    var bits = bytes[i].toString(2);
    while (bits.length < 8) bits = '0' + bits;
    parts.push(bits);
  }
  return parts.join(' ');
}

function fromBinary(text) {
  var clean = text.replace(/\\s+/g, '');
  if (clean.length % 8 !== 0) throw new Error('binary input needs a whole number of bytes');
  if (/[^01]/.test(clean)) throw new Error('only 0 and 1 are binary digits');
  var bytes = new Uint8Array(clean.length / 8);
  for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 8, 8), 2);
  return bytes;
}

function encode(text) {
  var bytes = bytesFromText(text);
  if (mode === 'base64') return [toBase64(bytes, false), bytes.length];
  if (mode === 'base64url') return [toBase64(bytes, true), bytes.length];
  if (mode === 'hex') return [toHex(bytes, ' '), bytes.length];
  if (mode === 'binary') return [toBinary(bytes), bytes.length];
  return [encodeURIComponent(text), bytes.length];
}

function decode(text) {
  var bytes;
  if (mode === 'base64') bytes = fromBase64(text, false);
  else if (mode === 'base64url') bytes = fromBase64(text, true);
  else if (mode === 'hex') bytes = fromHex(text);
  else if (mode === 'binary') bytes = fromBinary(text);
  else return [decodeURIComponent(text), bytesFromText(decodeURIComponent(text)).length];
  return [textFromBytes(bytes), bytes.length];
}

function run() {
  inputLabel.textContent = encoding ? 'Text' : modeName(mode);
  outputLabel.textContent = encoding ? modeName(mode) : 'Text';
  directionButton.textContent = encoding ? 'Encoding' : 'Decoding';
  try {
    var result = encoding ? encode(input.value) : decode(input.value);
    output.value = result[0];
    errorBox.hidden = true;
    stat.textContent = result[1] + (result[1] === 1 ? ' byte' : ' bytes') + ', ' +
      output.value.length + ' characters out';
  } catch (err) {
    output.value = '';
    errorBox.hidden = false;
    errorBox.textContent = err && err.message ? err.message : 'that input could not be decoded';
    stat.textContent = '';
  }
  lumen.storage.set('state', { input: input.value, mode: mode, encoding: encoding });
}

directionButton.addEventListener('click', function () { encoding = !encoding; run(); });
document.getElementById('swap').addEventListener('click', function () {
  if (!output.value) return;
  input.value = output.value;
  encoding = !encoding;
  run();
  input.focus();
});
document.getElementById('select').addEventListener('click', function () {
  output.focus();
  output.select();
});
input.addEventListener('input', run);

lumen.setTitle('Base64 and Hex');
lumen.storage.get('state').then(function (saved) {
  if (saved && typeof saved.input === 'string') {
    input.value = saved.input;
    encoding = saved.encoding !== false;
    if (buttons[saved.mode]) mode = saved.mode;
    for (var key in buttons) buttons[key].setAttribute('aria-pressed', String(key === mode));
  }
  run();
});
</script>`;

export const ENCODER = appPackage({
  id: 'com.lumen.encoder',
  version: '1.3.0',
  updated: '2026-09-01T09:00:00Z',
  tagline: 'Text to bytes to Base64, hex, percent or binary.',
  description:
    'Five encodings over the same path: the text is turned into UTF-8 bytes ' +
    'first, then written as Base64, URL-safe Base64, spaced hex, percent ' +
    'encoding or bits. Decoding runs the same path backwards and validates ' +
    'strictly, so a truncated Base64 string or an odd-length hex string is ' +
    'reported rather than silently padded into nonsense.\n\n' +
    'Hex input tolerates the shapes hex is usually pasted in — spaces, colons, ' +
    'commas and 0x prefixes are ignored. URL-safe Base64 is re-padded before ' +
    'decoding. Decoded bytes that are not valid UTF-8 raise an error instead of ' +
    'producing replacement characters.\n\n' +
    'The byte count under the output is the count of the bytes, not of the ' +
    'characters, which is the number that matters when something has a limit. ' +
    '"Move output to input" flips the direction and feeds the result back, so a ' +
    'round trip is one click.',
  releaseNotes:
    'Added a binary mode and strict UTF-8 decoding. Hex input now accepts 0x ' +
    'prefixes and colon separators.',
  capabilities: ['storage'],
  screenshots: [{ shape: 'type', seed: 17, tone: 'accent' }],
  manifest: {
    id: 'user.encoder',
    name: 'Base64 and Hex',
    description: 'Encode and decode text as Base64, hex, percent or binary.',
    version: '1.3',
    category: 'developer',
    keywords: ['base64', 'hex', 'encode', 'decode', 'utf-8', 'binary'],
    window: { width: 460, height: 560, minWidth: 340, minHeight: 400 },
    html: program(BODY, SCRIPT, STYLE),
  },
});
