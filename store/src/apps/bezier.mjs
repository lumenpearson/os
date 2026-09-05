// deslop-ignore-file 34 — the control point coordinates and the resulting
// declaration are values; design rule 1 sets values in the monospace face.
// deslop-ignore-file 19 24 — the round shapes are a curve's control handles
// and the dot that travels the preview track, not soft corners or an icon.

/**
 * Bezier Editor: the two control points of a CSS cubic-bezier() timing
 * function, dragged on a grid and read back as a declaration. Pointer moves
 * are coalesced into a frame, so dragging writes the SVG once per paint rather
 * than once per event; arrow keys move a focused handle for anyone not using a
 * pointer at all.
 */

import { appPackage, program } from './shared.mjs';

const STYLE = `<style>
#board { display: block; width: 100%; height: auto; touch-action: none; }
#board .frame { fill: var(--surface); stroke: var(--rule); stroke-width: 1; }
#board .grid { stroke: var(--rule); stroke-width: 0.5; }
#board .curve { fill: none; stroke: var(--accent); stroke-width: 2; }
#board .leg { stroke: var(--ink-3); stroke-width: 1; }
#board .handle { fill: var(--bg); stroke: var(--accent); stroke-width: 2; cursor: grab; }
#board .handle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
#board .anchor { fill: var(--ink-3); }
#declaration { font-size: 14px; margin: 12px 0 0; }
#track { margin-top: 12px; height: 24px; border: 1px solid var(--rule); border-radius: var(--radius); background: var(--surface); position: relative; overflow: hidden; }
#dot { position: absolute; top: 5px; left: 0; width: 12px; height: 12px; border-radius: 50%; background: var(--accent); }
.presets { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.presets button { font-size: 12px; }
#numbers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
</style>`;

const BODY = `
<h1>Bezier Editor</h1>
<p class="lede">Drag the handles, or focus one and use the arrow keys.</p>
<svg id="board" viewBox="-30 -60 260 320" role="group" aria-label="Timing curve">
  <rect class="frame" x="0" y="0" width="200" height="200"></rect>
  <line class="grid" x1="0" y1="50" x2="200" y2="50"></line>
  <line class="grid" x1="0" y1="100" x2="200" y2="100"></line>
  <line class="grid" x1="0" y1="150" x2="200" y2="150"></line>
  <line class="grid" x1="50" y1="0" x2="50" y2="200"></line>
  <line class="grid" x1="100" y1="0" x2="100" y2="200"></line>
  <line class="grid" x1="150" y1="0" x2="150" y2="200"></line>
  <line class="leg" id="leg1" x1="0" y1="200" x2="0" y2="0"></line>
  <line class="leg" id="leg2" x1="200" y1="0" x2="0" y2="0"></line>
  <path class="curve" id="curve"></path>
  <circle class="anchor" cx="0" cy="200" r="3"></circle>
  <circle class="anchor" cx="200" cy="0" r="3"></circle>
  <circle class="handle" id="h1" r="7" tabindex="0" role="slider" aria-label="First control point"
    aria-valuemin="0" aria-valuemax="1"></circle>
  <circle class="handle" id="h2" r="7" tabindex="0" role="slider" aria-label="Second control point"
    aria-valuemin="0" aria-valuemax="1"></circle>
</svg>
<p id="declaration" class="mono"></p>
<div id="track"><div id="dot"></div></div>
<div class="actions">
  <button id="play">Play</button>
  <button id="select">Select declaration</button>
</div>
<div class="presets" id="presets"></div>
<div id="numbers">
  <div><label for="x1">x1</label><input id="x1" class="mono" type="number" step="0.01" min="0" max="1"></div>
  <div><label for="y1">y1</label><input id="y1" class="mono" type="number" step="0.01"></div>
  <div><label for="x2">x2</label><input id="x2" class="mono" type="number" step="0.01" min="0" max="1"></div>
  <div><label for="y2">y2</label><input id="y2" class="mono" type="number" step="0.01"></div>
</div>
<p id="copy" class="note"></p>
`;

const SCRIPT = `<script>
var PRESETS = [
  ['linear', [0, 0, 1, 1]],
  ['ease', [0.25, 0.1, 0.25, 1]],
  ['ease-in', [0.42, 0, 1, 1]],
  ['ease-out', [0, 0, 0.58, 1]],
  ['ease-in-out', [0.42, 0, 0.58, 1]],
  ['overshoot', [0.34, 1.56, 0.64, 1]]
];

var board = document.getElementById('board');
var curve = document.getElementById('curve');
var leg1 = document.getElementById('leg1');
var leg2 = document.getElementById('leg2');
var h1 = document.getElementById('h1');
var h2 = document.getElementById('h2');
var declaration = document.getElementById('declaration');
var dot = document.getElementById('dot');
var copyLine = document.getElementById('copy');
var boxes = {
  x1: document.getElementById('x1'), y1: document.getElementById('y1'),
  x2: document.getElementById('x2'), y2: document.getElementById('y2')
};
var point = [0.25, 0.1, 0.25, 1];
var dragging = null;
var frame = 0;

function toBoard(x, y) { return [x * 200, 200 - y * 200]; }

function clampX(v) { return Math.max(0, Math.min(1, v)); }
function clampY(v) { return Math.max(-1, Math.min(2, v)); }

function round(v) { return Math.round(v * 100) / 100; }

function sample(t) {
  var mt = 1 - t;
  var x = 3 * mt * mt * t * point[0] + 3 * mt * t * t * point[2] + t * t * t;
  var y = 3 * mt * mt * t * point[1] + 3 * mt * t * t * point[3] + t * t * t;
  return [x, y];
}

function draw() {
  var a = toBoard(point[0], point[1]);
  var b = toBoard(point[2], point[3]);
  var path = 'M 0 200';
  for (var i = 1; i <= 40; i++) {
    var p = sample(i / 40);
    var q = toBoard(p[0], p[1]);
    path += ' L ' + q[0].toFixed(2) + ' ' + q[1].toFixed(2);
  }
  curve.setAttribute('d', path);
  leg1.setAttribute('x2', a[0]);
  leg1.setAttribute('y2', a[1]);
  leg2.setAttribute('x2', b[0]);
  leg2.setAttribute('y2', b[1]);
  h1.setAttribute('cx', a[0]);
  h1.setAttribute('cy', a[1]);
  h2.setAttribute('cx', b[0]);
  h2.setAttribute('cy', b[1]);
  h1.setAttribute('aria-valuenow', round(point[0]));
  h2.setAttribute('aria-valuenow', round(point[2]));
  h1.setAttribute('aria-valuetext', round(point[0]) + ', ' + round(point[1]));
  h2.setAttribute('aria-valuetext', round(point[2]) + ', ' + round(point[3]));
  var text = 'cubic-bezier(' + round(point[0]) + ', ' + round(point[1]) + ', ' +
    round(point[2]) + ', ' + round(point[3]) + ')';
  declaration.textContent = text;
  copyLine.textContent = 'transition-timing-function: ' + text + ';';
  boxes.x1.value = round(point[0]);
  boxes.y1.value = round(point[1]);
  boxes.x2.value = round(point[2]);
  boxes.y2.value = round(point[3]);
  var named = null;
  for (var k = 0; k < PRESETS.length; k++) {
    var v = PRESETS[k][1];
    if (v[0] === point[0] && v[1] === point[1] && v[2] === point[2] && v[3] === point[3]) {
      named = PRESETS[k][0];
    }
  }
  if (named && named !== 'overshoot') declaration.textContent = text + '  —  ' + named;
  lumen.storage.set('point', point);
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(function () { frame = 0; draw(); });
}

function locate(event) {
  var rect = board.getBoundingClientRect();
  var scale = 260 / rect.width;
  var x = (event.clientX - rect.left) * scale - 30;
  var y = (event.clientY - rect.top) * (320 / rect.height) - 60;
  return [clampX(x / 200), clampY((200 - y) / 200)];
}

function onMove(event) {
  if (dragging === null) return;
  var p = locate(event);
  point[dragging * 2] = p[0];
  point[dragging * 2 + 1] = p[1];
  schedule();
}

function grab(index) {
  return function (event) {
    dragging = index;
    event.target.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
}

h1.addEventListener('pointerdown', grab(0));
h2.addEventListener('pointerdown', grab(1));
board.addEventListener('pointermove', onMove);
board.addEventListener('pointerup', function () { dragging = null; });
board.addEventListener('pointercancel', function () { dragging = null; });

function keys(index) {
  return function (event) {
    var step = event.shiftKey ? 0.1 : 0.01;
    var dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
    var dy = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    point[index * 2] = clampX(point[index * 2] + dx);
    point[index * 2 + 1] = clampY(point[index * 2 + 1] + dy);
    draw();
  };
}

h1.addEventListener('keydown', keys(0));
h2.addEventListener('keydown', keys(1));

for (var key in boxes) {
  (function (name, box) {
    box.addEventListener('input', function () {
      var index = { x1: 0, y1: 1, x2: 2, y2: 3 }[name];
      var value = Number(box.value);
      if (isNaN(value)) return;
      point[index] = index % 2 === 0 ? clampX(value) : clampY(value);
      draw();
    });
  })(key, boxes[key]);
}

var presets = document.getElementById('presets');
for (var i = 0; i < PRESETS.length; i++) {
  (function (label, values) {
    var button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', function () {
      point = values.slice(0);
      draw();
      play();
    });
    presets.appendChild(button);
  })(PRESETS[i][0], PRESETS[i][1]);
}

function play() {
  var text = 'cubic-bezier(' + round(point[0]) + ', ' + round(point[1]) + ', ' +
    round(point[2]) + ', ' + round(point[3]) + ')';
  dot.style.transition = 'none';
  dot.style.transform = 'translateX(0)';
  requestAnimationFrame(function () {
    dot.style.transition = 'transform 1200ms ' + text;
    dot.style.transform = 'translateX(' + (dot.parentNode.clientWidth - 12) + 'px)';
  });
}

document.getElementById('play').addEventListener('click', play);
document.getElementById('select').addEventListener('click', function () {
  var range = document.createRange();
  range.selectNodeContents(declaration);
  var selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
});

lumen.setTitle('Bezier Editor');
lumen.storage.get('point').then(function (saved) {
  if (saved && saved.length === 4) point = saved.map(Number);
  draw();
  play();
});
</script>`;

export const BEZIER = appPackage({
  id: 'com.lumen.bezier',
  version: '1.0.0',
  updated: '2026-08-15T09:00:00Z',
  tagline: 'Shape a CSS timing function and watch it move.',
  description:
    'A cubic-bezier() editor. Two control points sit on a unit grid; drag them ' +
    'and the curve, the declaration and the preview follow. The vertical axis ' +
    'runs from -1 to 2 so a curve can overshoot and settle back, which is what ' +
    'most spring-like easings actually are.\n\n' +
    'The six presets are the four CSS keywords, linear, and one overshoot worth ' +
    'having. When the points land exactly on a keyword the declaration says ' +
    'which one, so you know when the shorter name will do.\n\n' +
    'Dragging coalesces pointer moves into one write per frame rather than one ' +
    'per event. Each handle is a focusable slider: arrow keys move it a ' +
    'hundredth at a time, shift moves it a tenth, and the value is announced as ' +
    'a coordinate pair. The numbers can also be typed directly.',
  releaseNotes: 'First release.',
  capabilities: ['storage'],
  screenshots: [
    { shape: 'rings', seed: 8, tone: 'accent' },
    { shape: 'grid', seed: 15, tone: 'neutral' },
  ],
  manifest: {
    id: 'user.bezier',
    name: 'Bezier Editor',
    description: 'Edit a CSS cubic-bezier timing function and preview it.',
    version: '1.0',
    category: 'developer',
    keywords: ['bezier', 'easing', 'animation', 'css', 'timing'],
    window: { width: 400, height: 640, minWidth: 320, minHeight: 480 },
    html: program(BODY, SCRIPT, STYLE),
  },
});
