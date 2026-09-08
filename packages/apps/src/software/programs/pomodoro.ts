// deslop-ignore-file 34 — the clock is a number that changes; design rule 1
// puts it in the monospace face with tabular figures.

/**
 * Pomodoro Timer: twenty-five minutes of work, five of break, counted off a
 * deadline rather than a tick so a throttled background frame still lands on
 * the right second. It sets the window title to the time left and posts a
 * notification when a phase ends; the finished count survives a restart.
 */

import type { AppManifest } from '@lumen/kernel';
import { program } from './shared';

const STYLE = `<style>
body { text-align: center; }
#clock { font-size: 44px; font-weight: 500; letter-spacing: -0.01em; margin: 18px 0 2px; }
#phase { color: var(--ink-2); font-size: 12px; }
#track { height: 3px; background: var(--surface); border: 1px solid var(--rule); margin: 16px 0; }
#bar { height: 100%; background: var(--accent); width: 0%; }
.actions { justify-content: center; }
#done { margin-top: 14px; color: var(--ink-3); font-size: 12px; }
</style>`;

const BODY = `
<h1>Pomodoro Timer</h1>
<p id="clock" class="mono">25:00</p>
<p id="phase">Focus</p>
<div id="track"><div id="bar"></div></div>
<div class="actions">
  <button id="toggle">Start</button>
  <button id="reset">Reset</button>
  <button id="skip">Skip</button>
</div>
<p id="done" class="mono">0 sessions finished</p>
`;

const SCRIPT = `<script>
var FOCUS_MS = 25 * 60 * 1000;
var BREAK_MS = 5 * 60 * 1000;

var clock = document.getElementById('clock');
var phaseLabel = document.getElementById('phase');
var bar = document.getElementById('bar');
var toggle = document.getElementById('toggle');
var doneLabel = document.getElementById('done');

var phase = 'focus';
var remaining = FOCUS_MS;
var deadline = null;
var ticker = null;
var finished = 0;

function total() { return phase === 'focus' ? FOCUS_MS : BREAK_MS; }

function pad(n) { return (n < 10 ? '0' : '') + n; }

function draw() {
  var ms = Math.max(0, remaining);
  var seconds = Math.ceil(ms / 1000);
  var label = pad(Math.floor(seconds / 60)) + ':' + pad(seconds % 60);
  clock.textContent = label;
  phaseLabel.textContent = phase === 'focus' ? 'Focus' : 'Break';
  bar.style.width = Math.round((1 - ms / total()) * 100) + '%';
  lumen.setTitle(label + ' — ' + (phase === 'focus' ? 'Focus' : 'Break'));
  doneLabel.textContent = finished === 1 ? '1 session finished' : finished + ' sessions finished';
}

function stop() {
  if (ticker) { clearInterval(ticker); ticker = null; }
  deadline = null;
  toggle.textContent = 'Start';
}

function tick() {
  remaining = deadline - Date.now();
  if (remaining <= 0) {
    remaining = 0;
    draw();
    stop();
    if (phase === 'focus') {
      finished += 1;
      lumen.storage.set('finished', finished);
      lumen.notify('Focus finished', 'Take five minutes.');
      setPhase('break');
    } else {
      lumen.notify('Break over', 'Back to it.');
      setPhase('focus');
    }
    return;
  }
  draw();
}

function setPhase(next) {
  phase = next;
  remaining = total();
  draw();
}

function start() {
  deadline = Date.now() + remaining;
  ticker = setInterval(tick, 250);
  toggle.textContent = 'Pause';
  draw();
}

toggle.addEventListener('click', function () {
  if (ticker) { remaining = deadline - Date.now(); stop(); draw(); }
  else start();
});
document.getElementById('reset').addEventListener('click', function () {
  stop();
  setPhase(phase);
});
document.getElementById('skip').addEventListener('click', function () {
  stop();
  setPhase(phase === 'focus' ? 'break' : 'focus');
});

lumen.storage.get('finished').then(function (saved) {
  if (typeof saved === 'number' && saved >= 0) finished = saved;
  draw();
});
draw();
</script>`;

export const POMODORO: AppManifest = {
  id: 'user.pomodoro',
  name: 'Pomodoro Timer',
  description: 'Twenty-five minutes of work, five of break, counted off.',
  version: '1.0',
  category: 'utilities',
  keywords: ['timer', 'pomodoro', 'focus', 'break'],
  window: { width: 300, height: 340, minWidth: 260, minHeight: 300 },
  html: program(BODY, SCRIPT, STYLE),
};
