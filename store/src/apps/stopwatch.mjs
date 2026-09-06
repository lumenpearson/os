// deslop-ignore-file 34 — the clock, the splits and the lap times are values;
// design rule 1 sets values in the monospace face.

/**
 * Stopwatch: elapsed time measured against performance.now, painted once per
 * animation frame. Laps record both the split from the start and the time
 * since the previous lap, and the fastest and slowest laps are marked, which
 * is the comparison a lap list exists to support.
 */

import { appPackage, program } from './shared.mjs';

const STYLE = `<style>
#clock { font-size: 42px; font-weight: 500; letter-spacing: -0.02em; margin: 14px 0 0; text-align: center; }
#clock .frac { font-size: 24px; color: var(--ink-2); }
.actions { justify-content: center; }
#laps { margin-top: 14px; }
#laps td { padding: 3px 6px; }
#laps td:first-child { color: var(--ink-2); width: 3em; }
#laps td:last-child { text-align: right; }
#laps tr.best td:nth-child(2) { color: var(--accent); }
#laps tr.worst td:nth-child(2) { color: var(--ink-3); }
.scroll { max-height: 190px; overflow: auto; }
#tally { font-size: 12px; color: var(--ink-3); margin-top: 8px; text-align: center; }
</style>`;

const BODY = `
<h1>Stopwatch</h1>
<p id="clock" class="mono">0:00<span class="frac">.00</span></p>
<div class="actions">
  <button id="toggle">Start</button>
  <button id="lap" disabled>Lap</button>
  <button id="reset" disabled>Reset</button>
</div>
<div class="scroll"><table id="laps" class="mono"><tbody></tbody></table></div>
<p id="tally"></p>
<p class="note">Space starts and stops. L takes a lap. R resets.</p>
`;

const SCRIPT = `<script>
var clock = document.getElementById('clock');
var toggle = document.getElementById('toggle');
var lapButton = document.getElementById('lap');
var resetButton = document.getElementById('reset');
var lapBody = document.getElementById('laps').querySelector('tbody');
var tally = document.getElementById('tally');

var running = false;
var startedAt = 0;
var carried = 0;
var lastLapAt = 0;
var laps = [];
var frame = 0;

function pad(n, width) {
  var text = String(n);
  while (text.length < width) text = '0' + text;
  return text;
}

function format(ms) {
  var total = Math.max(0, Math.floor(ms));
  var hundredths = Math.floor((total % 1000) / 10);
  var seconds = Math.floor(total / 1000) % 60;
  var minutes = Math.floor(total / 60000) % 60;
  var hours = Math.floor(total / 3600000);
  var head = hours > 0
    ? hours + ':' + pad(minutes, 2) + ':' + pad(seconds, 2)
    : minutes + ':' + pad(seconds, 2);
  return [head, pad(hundredths, 2)];
}

function elapsed() {
  return carried + (running ? performance.now() - startedAt : 0);
}

function paint() {
  var parts = format(elapsed());
  clock.innerHTML = parts[0] + '<span class="frac">.' + parts[1] + '</span>';
  if (running) frame = requestAnimationFrame(paint);
}

function setTitle() {
  var parts = format(elapsed());
  lumen.setTitle(parts[0] + '.' + parts[1]);
}

function start() {
  running = true;
  startedAt = performance.now();
  toggle.textContent = 'Stop';
  lapButton.disabled = false;
  resetButton.disabled = false;
  paint();
}

function stop() {
  carried = elapsed();
  running = false;
  cancelAnimationFrame(frame);
  toggle.textContent = 'Start';
  paint();
  setTitle();
  save();
}

function reset() {
  running = false;
  cancelAnimationFrame(frame);
  carried = 0;
  lastLapAt = 0;
  laps = [];
  toggle.textContent = 'Start';
  lapButton.disabled = true;
  resetButton.disabled = true;
  paint();
  render();
  lumen.setTitle('Stopwatch');
  save();
}

function takeLap() {
  var at = elapsed();
  laps.push({ at: at, span: at - lastLapAt });
  lastLapAt = at;
  render();
  save();
}

function render() {
  if (!laps.length) {
    lapBody.innerHTML = '';
    tally.textContent = '';
    return;
  }
  var fastest = 0;
  var slowest = 0;
  for (var i = 1; i < laps.length; i++) {
    if (laps[i].span < laps[fastest].span) fastest = i;
    if (laps[i].span > laps[slowest].span) slowest = i;
  }
  var rows = '';
  for (var j = laps.length - 1; j >= 0; j--) {
    var mark = laps.length > 2 && j === fastest ? 'best' : laps.length > 2 && j === slowest ? 'worst' : '';
    var span = format(laps[j].span);
    var at = format(laps[j].at);
    rows += '<tr class="' + mark + '"><td>' + (j + 1) + '</td><td>' + span[0] + '.' + span[1] +
      '</td><td class="muted">' + at[0] + '.' + at[1] + '</td></tr>';
  }
  lapBody.innerHTML = rows;
  var total = 0;
  for (var k = 0; k < laps.length; k++) total += laps[k].span;
  var mean = format(total / laps.length);
  tally.textContent = laps.length + (laps.length === 1 ? ' lap, average ' : ' laps, average ') +
    mean[0] + '.' + mean[1];
}

function save() {
  lumen.storage.set('state', { carried: carried, laps: laps, lastLapAt: lastLapAt });
}

toggle.addEventListener('click', function () { running ? stop() : start(); });
lapButton.addEventListener('click', takeLap);
resetButton.addEventListener('click', reset);
addEventListener('keydown', function (e) {
  var tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'BUTTON') return;
  if (e.key === ' ') { e.preventDefault(); running ? stop() : start(); }
  if (e.key === 'l' || e.key === 'L') { if (!lapButton.disabled) takeLap(); }
  if (e.key === 'r' || e.key === 'R') { if (!resetButton.disabled) reset(); }
});

lumen.setTitle('Stopwatch');
lumen.storage.get('state').then(function (saved) {
  if (saved && typeof saved.carried === 'number') {
    carried = saved.carried;
    laps = Array.isArray(saved.laps) ? saved.laps : [];
    lastLapAt = saved.lastLapAt || 0;
    if (carried > 0 || laps.length) {
      lapButton.disabled = false;
      resetButton.disabled = false;
    }
  }
  paint();
  render();
});
</script>`;

export const STOPWATCH = appPackage({
  id: 'com.lumen.stopwatch',
  version: '1.0.3',
  updated: '2026-08-08T09:00:00Z',
  tagline: 'Elapsed time, with laps that can be compared.',
  description:
    'Time is measured against performance.now, which is monotonic — the reading ' +
    'cannot jump when the system clock is corrected — and the display is ' +
    'repainted once per animation frame rather than on a timer.\n\n' +
    'Each lap records two numbers: the split from the start and the time since ' +
    'the previous lap. Once there are three laps the fastest is marked in the ' +
    'accent and the slowest in grey, and the tally underneath gives the average ' +
    'lap. Laps are listed newest first, so the one you just took is the one ' +
    'under your eye.\n\n' +
    'Space starts and stops, L takes a lap, R resets. A stopped time and its ' +
    'laps survive closing the window; a running one is not resumed, because a ' +
    'reading taken across a reload would be a guess.',
  releaseNotes: 'The average lap is shown under the list. Laps survive a restart.',
  capabilities: ['storage'],
  screenshots: [{ shape: 'ramp', seed: 27, tone: 'neutral' }],
  manifest: {
    id: 'user.stopwatch',
    name: 'Stopwatch',
    description: 'Time something and record laps with splits.',
    version: '1.0',
    category: 'utilities',
    keywords: ['stopwatch', 'timer', 'laps', 'split', 'time'],
    window: { width: 320, height: 480, minWidth: 280, minHeight: 360 },
    html: program(BODY, SCRIPT, STYLE),
  },
});
