// deslop-ignore-file 34 — the tempo, the bar count and the beat are values;
// design rule 1 sets values in the monospace face.
// deslop-ignore-file 19 — the beat indicators are circles because a beat is a
// point in time, not a card with rounded corners.

/**
 * Metronome: clicks scheduled ahead of time on the Web Audio clock rather than
 * fired from setInterval, so the beat does not drift when the frame is
 * throttled or the main thread is busy. A short timer only tops up a queue of
 * clicks that are already booked against the audio clock.
 */

import { appPackage, program } from './shared.mjs';

const STYLE = `<style>
body { text-align: center; }
#tempo { font-size: 46px; font-weight: 500; letter-spacing: -0.02em; margin: 10px 0 0; }
#tempoName { color: var(--ink-2); font-size: 12px; margin: 0; }
#beats { display: flex; gap: 6px; justify-content: center; margin: 16px 0; }
#beats span {
  width: 12px; height: 12px; border-radius: 50%;
  border: 1px solid var(--rule); background: var(--surface);
  transition: background-color 90ms ease, border-color 90ms ease;
}
#beats span.on { background: var(--accent); border-color: var(--accent); }
#beats span.first { width: 16px; height: 16px; margin-top: -2px; }
.actions { justify-content: center; }
input[type="range"] { padding: 0; }
.field { text-align: left; margin-top: 12px; }
#bars { color: var(--ink-3); font-size: 12px; margin-top: 12px; }
</style>`;

const BODY = `
<h1>Metronome</h1>
<p id="tempo" class="mono">120</p>
<p id="tempoName">Allegro</p>
<div id="beats" role="img" aria-label="Beat indicator"></div>
<div class="actions">
  <button id="toggle">Start</button>
  <button id="tap">Tap tempo</button>
  <button id="accent" aria-pressed="true">Accent the downbeat</button>
</div>
<div class="field">
  <label for="bpm">Tempo — 30 to 260 beats per minute</label>
  <input id="bpm" type="range" min="30" max="260" step="1" value="120">
</div>
<div class="field">
  <label for="meter">Beats in a bar</label>
  <select id="meter">
    <option value="2">2</option>
    <option value="3">3</option>
    <option value="4" selected>4</option>
    <option value="5">5</option>
    <option value="6">6</option>
    <option value="7">7</option>
  </select>
</div>
<p id="bars" class="mono">0 bars</p>
<p class="note">Space starts and stops. T taps the tempo.</p>
`;

const SCRIPT = `<script>
var NAMES = [
  [40, 'Grave'], [60, 'Largo'], [76, 'Adagio'], [108, 'Andante'],
  [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [261, 'Presto']
];

var tempoLabel = document.getElementById('tempo');
var tempoName = document.getElementById('tempoName');
var beatsBox = document.getElementById('beats');
var toggle = document.getElementById('toggle');
var accentButton = document.getElementById('accent');
var bpm = document.getElementById('bpm');
var meter = document.getElementById('meter');
var barsLabel = document.getElementById('bars');

var audio = null;
var running = false;
var nextTime = 0;
var beat = 0;
var bars = 0;
var ticker = null;
var accent = true;
var taps = [];
var pending = [];

function name(value) {
  for (var i = 0; i < NAMES.length; i++) if (value < NAMES[i][0]) return NAMES[i][1];
  return 'Prestissimo';
}

function drawMeter() {
  var count = Number(meter.value);
  var html = '';
  for (var i = 0; i < count; i++) html += '<span class="' + (i === 0 ? 'first' : '') + '"></span>';
  beatsBox.innerHTML = html;
}

function light(index) {
  var dots = beatsBox.children;
  for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i === index);
}

function click(time, strong) {
  var osc = audio.createOscillator();
  var gain = audio.createGain();
  osc.frequency.value = strong && accent ? 1600 : 1000;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(strong && accent ? 0.5 : 0.3, time + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(time);
  osc.stop(time + 0.06);
}

/** Book every click that falls inside the next tenth of a second. */
function schedule() {
  var count = Number(meter.value);
  while (nextTime < audio.currentTime + 0.1) {
    click(nextTime, beat === 0);
    pending.push([nextTime, beat]);
    beat = (beat + 1) % count;
    if (beat === 0) bars += 1;
    nextTime += 60 / Number(bpm.value);
  }
  while (pending.length && pending[0][0] <= audio.currentTime) {
    light(pending[0][1]);
    barsLabel.textContent = bars + (bars === 1 ? ' bar' : ' bars');
    pending.shift();
  }
}

function start() {
  if (!audio) audio = new (self.AudioContext || self.webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume();
  running = true;
  beat = 0;
  bars = 0;
  pending = [];
  nextTime = audio.currentTime + 0.06;
  ticker = setInterval(schedule, 25);
  toggle.textContent = 'Stop';
}

function stop() {
  running = false;
  if (ticker) { clearInterval(ticker); ticker = null; }
  pending = [];
  light(-1);
  toggle.textContent = 'Start';
}

function setTempo(value) {
  var clamped = Math.max(30, Math.min(260, Math.round(value)));
  bpm.value = String(clamped);
  tempoLabel.textContent = clamped;
  tempoName.textContent = name(clamped);
  lumen.setTitle(clamped + ' bpm');
  lumen.storage.set('state', { bpm: clamped, meter: meter.value, accent: accent });
}

function tap() {
  var now = Date.now();
  taps.push(now);
  if (taps.length > 5) taps.shift();
  taps = taps.filter(function (t) { return now - t < 3000; });
  if (taps.length < 2) return;
  var span = taps[taps.length - 1] - taps[0];
  setTempo(60000 / (span / (taps.length - 1)));
}

toggle.addEventListener('click', function () { running ? stop() : start(); });
document.getElementById('tap').addEventListener('click', tap);
accentButton.addEventListener('click', function () {
  accent = !accent;
  accentButton.setAttribute('aria-pressed', String(accent));
  setTempo(Number(bpm.value));
});
bpm.addEventListener('input', function () { setTempo(Number(bpm.value)); });
meter.addEventListener('change', function () {
  drawMeter();
  beat = 0;
  setTempo(Number(bpm.value));
});
addEventListener('keydown', function (e) {
  var tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON') return;
  if (e.key === ' ') { e.preventDefault(); running ? stop() : start(); }
  if (e.key === 't' || e.key === 'T') { e.preventDefault(); tap(); }
});

drawMeter();
lumen.setTitle('Metronome');
lumen.storage.get('state').then(function (saved) {
  if (saved && saved.bpm) {
    meter.value = String(saved.meter || 4);
    accent = saved.accent !== false;
    accentButton.setAttribute('aria-pressed', String(accent));
    drawMeter();
    setTempo(saved.bpm);
  } else {
    setTempo(120);
  }
});
</script>`;

export const METRONOME = appPackage({
  id: 'com.lumen.metronome',
  version: '1.1.0',
  updated: '2026-08-26T09:00:00Z',
  tagline: 'A steady click that does not drift when the tab is busy.',
  description:
    'Thirty to two hundred and sixty beats per minute, two to seven beats in a ' +
    'bar, with the downbeat pitched higher when accenting is on. The tempo ' +
    'carries its Italian name, which is the reason most people look a number up ' +
    'in the first place.\n\n' +
    'Clicks are booked against the Web Audio clock a tenth of a second ahead ' +
    'rather than played from a timer, so the beat holds when the frame is ' +
    'throttled or the main thread stalls. The beat lights and the bar count ' +
    'follow the audio clock rather than leading it, so what you see is what you ' +
    'just heard.\n\n' +
    'Tap tempo averages the last five taps inside three seconds. Space starts ' +
    'and stops; T taps.',
  releaseNotes: 'Odd meters up to seven. The bar count follows the audio clock.',
  capabilities: ['storage', 'audio'],
  screenshots: [{ shape: 'rings', seed: 19, tone: 'accent' }],
  manifest: {
    id: 'user.metronome',
    name: 'Metronome',
    description: 'Keep time with an accented click at a tempo you set.',
    version: '1.1',
    category: 'media',
    keywords: ['metronome', 'tempo', 'beat', 'music', 'practice'],
    window: { width: 320, height: 520, minWidth: 280, minHeight: 420 },
    html: program(BODY, SCRIPT, STYLE),
  },
});
