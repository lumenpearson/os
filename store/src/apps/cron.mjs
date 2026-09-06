// deslop-ignore-file 34 — the expression, its fields and the run times are
// values; design rule 1 sets values in the monospace face.

/**
 * Cron Explainer: reads a five-field crontab expression, says what it means in
 * a sentence, and lists the next times it fires in local time. Day-of-month and
 * day-of-week follow the traditional rule — when both are restricted the
 * expression fires if either matches — which is the part people get wrong.
 */

import { appPackage, program } from './shared.mjs';

const STYLE = `<style>
#expression { font-size: 15px; letter-spacing: 0.02em; }
#sentence { font-size: 13px; margin: 10px 0 0; }
#fields td:first-child { color: var(--ink-2); width: 9em; }
#runs li { margin: 2px 0; }
#runs { list-style: none; padding: 0; margin: 0; }
.presets { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.presets button { font-size: 12px; }
</style>`;

const BODY = `
<h1>Cron Explainer</h1>
<p class="lede">Five fields: minute, hour, day of month, month, day of week.</p>
<div class="panel">
  <label for="expression">Expression</label>
  <input id="expression" class="mono" spellcheck="false" autocapitalize="off" value="*/15 9-17 * * 1-5">
  <p id="sentence" class="alert"></p>
  <div class="presets" id="presets"></div>
</div>
<h2>Fields</h2>
<table id="fields"><tbody></tbody></table>
<h2>Next five runs</h2>
<ul id="runs" class="mono"></ul>
<p class="note">Times are this machine's local time.</p>
`;

const SCRIPT = `<script>
var MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
var DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
var DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var MONTH_NAMES = ['January','February','March','April','May','June','July',
  'August','September','October','November','December'];
var ALIASES = {
  '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *'
};
var PRESETS = [
  ['*/15 9-17 * * 1-5', 'Quarter hour, office hours'],
  ['0 3 * * *', 'Nightly at three'],
  ['0 0 1 * *', 'First of the month'],
  ['30 6 * * 1', 'Monday morning'],
  ['@hourly', 'Hourly']
];
var LIMITS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
var FIELD_NAMES = ['Minute', 'Hour', 'Day of month', 'Month', 'Day of week'];

var expression = document.getElementById('expression');
var sentence = document.getElementById('sentence');
var fields = document.getElementById('fields').querySelector('tbody');
var runs = document.getElementById('runs');
var presets = document.getElementById('presets');

for (var p = 0; p < PRESETS.length; p++) {
  (function (value, label) {
    var button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', function () { expression.value = value; run(); });
    presets.appendChild(button);
  })(PRESETS[p][0], PRESETS[p][1]);
}

function nameToNumber(token, index) {
  var upper = token.toUpperCase();
  if (index === 3) {
    var m = MONTHS.indexOf(upper);
    if (m !== -1) return m + 1;
  }
  if (index === 4) {
    var d = DAYS.indexOf(upper);
    if (d !== -1) return d;
  }
  if (!/^\\d+$/.test(token)) throw new Error(FIELD_NAMES[index].toLowerCase() + ': "' + token + '" is not a value');
  return Number(token);
}

/** One field to the sorted set of values it allows. */
function parseField(text, index) {
  var low = LIMITS[index][0];
  var high = LIMITS[index][1];
  var set = {};
  var parts = text.split(',');
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (part === '') throw new Error(FIELD_NAMES[index].toLowerCase() + ': empty list item');
    var step = 1;
    var slash = part.indexOf('/');
    if (slash !== -1) {
      step = Number(part.slice(slash + 1));
      if (!(step >= 1)) throw new Error(FIELD_NAMES[index].toLowerCase() + ': step must be 1 or more');
      part = part.slice(0, slash);
    }
    var from = low;
    var to = high;
    if (part !== '*') {
      var dash = part.indexOf('-', 1);
      if (dash !== -1) {
        from = nameToNumber(part.slice(0, dash), index);
        to = nameToNumber(part.slice(dash + 1), index);
      } else {
        from = nameToNumber(part, index);
        to = slash !== -1 ? high : from;
      }
    }
    if (from < low || to > high || from > to) {
      throw new Error(FIELD_NAMES[index].toLowerCase() + ': ' + from + '-' + to +
        ' is outside ' + low + '-' + high);
    }
    // Sunday is both 0 and 7 in every cron that matters; fold 7 onto 0.
    for (var v = from; v <= to; v += step) set[index === 4 && v === 7 ? 0 : v] = true;
  }
  var list = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  return { values: list, wildcard: text.trim() === '*' };
}

function parse(text) {
  var clean = text.trim().toLowerCase();
  if (ALIASES[clean]) clean = ALIASES[clean];
  var parts = clean.split(/\\s+/);
  if (parts.length !== 5) throw new Error('expected five fields, found ' + parts.length);
  var out = [];
  for (var i = 0; i < 5; i++) out.push(parseField(parts[i], i));
  return out;
}

function list(values, names) {
  var labels = values.map(function (v) { return names ? names[v] : String(v); });
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return labels[0] + ' and ' + labels[1];
  return labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
}

function pad(n) { return (n < 10 ? '0' : '') + n; }

function describe(f) {
  var minute = f[0];
  var hour = f[1];
  var clause;
  if (minute.wildcard && hour.wildcard) clause = 'Every minute';
  else if (minute.values.length === 1 && hour.wildcard) {
    clause = 'At ' + pad(minute.values[0]) + ' minutes past every hour';
  } else if (minute.wildcard) {
    clause = 'Every minute of ' + (hour.values.length === 1 ? 'hour ' : 'hours ') + list(hour.values);
  } else if (hour.wildcard) {
    clause = 'At minute ' + list(minute.values) + ' of every hour';
  } else if (minute.values.length === 1 && hour.values.length === 1) {
    clause = 'At ' + pad(hour.values[0]) + ':' + pad(minute.values[0]);
  } else {
    clause = 'At minute ' + list(minute.values) + ' of ' +
      (hour.values.length === 1 ? 'hour ' : 'hours ') + list(hour.values);
  }

  var dom = f[2];
  var dow = f[4];
  var month = f[3];
  var day;
  if (dom.wildcard && dow.wildcard) day = 'every day';
  else if (dow.wildcard) day = 'on day ' + list(dom.values) + ' of the month';
  else if (dom.wildcard) day = 'on ' + list(dow.values, DAY_NAMES);
  else {
    day = 'on day ' + list(dom.values) + ' of the month, or on ' +
      list(dow.values, DAY_NAMES) + ' — either one is enough';
  }
  var months = month.wildcard ? '' : ' in ' + list(month.values.map(function (m) { return m - 1; }), MONTH_NAMES);
  return clause + ', ' + day + months + '.';
}

function matchesDay(date, f) {
  var dom = f[2];
  var dow = f[4];
  var domHit = dom.values.indexOf(date.getDate()) !== -1;
  var dowHit = dow.values.indexOf(date.getDay()) !== -1;
  if (dom.wildcard && dow.wildcard) return true;
  if (dom.wildcard) return dowHit;
  if (dow.wildcard) return domHit;
  return domHit || dowHit;
}

function nextRuns(f, count) {
  var out = [];
  var now = new Date();
  var day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (var d = 0; d < 1500 && out.length < count; d++) {
    if (f[3].values.indexOf(day.getMonth() + 1) !== -1 && matchesDay(day, f)) {
      for (var h = 0; h < f[1].values.length && out.length < count; h++) {
        for (var m = 0; m < f[0].values.length && out.length < count; m++) {
          var when = new Date(day.getFullYear(), day.getMonth(), day.getDate(),
            f[1].values[h], f[0].values[m], 0, 0);
          if (when.getTime() > now.getTime()) out.push(when);
        }
      }
    }
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  }
  return out;
}

function stamp(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) +
    '  ' + DAY_NAMES[date.getDay()];
}

function summarise(field, index) {
  if (field.wildcard) return 'every value';
  if (field.values.length > 12) return field.values.length + ' values, ' +
    field.values[0] + ' to ' + field.values[field.values.length - 1];
  if (index === 4) return list(field.values, DAY_NAMES);
  if (index === 3) return list(field.values.map(function (m) { return m - 1; }), MONTH_NAMES);
  return list(field.values);
}

function run() {
  var parsed;
  try {
    parsed = parse(expression.value);
  } catch (err) {
    sentence.textContent = err.message;
    fields.innerHTML = '';
    runs.innerHTML = '';
    return;
  }
  sentence.textContent = describe(parsed);
  var rows = '';
  for (var i = 0; i < 5; i++) {
    rows += '<tr><td>' + FIELD_NAMES[i] + '</td><td class="mono">' +
      summarise(parsed[i], i) + '</td></tr>';
  }
  fields.innerHTML = rows;
  var upcoming = nextRuns(parsed, 5);
  if (!upcoming.length) {
    runs.innerHTML = '<li class="muted">No run in the next four years.</li>';
  } else {
    runs.innerHTML = upcoming.map(function (d) { return '<li>' + stamp(d) + '</li>'; }).join('');
  }
  lumen.storage.set('expression', expression.value);
}

expression.addEventListener('input', run);

lumen.setTitle('Cron Explainer');
lumen.storage.get('expression').then(function (saved) {
  if (typeof saved === 'string' && saved) expression.value = saved;
  run();
});
</script>`;

export const CRON = appPackage({
  id: 'com.lumen.cron',
  version: '1.0.0',
  updated: '2026-08-12T09:00:00Z',
  tagline: 'What a crontab line means, and when it fires next.',
  description:
    'Type a five-field cron expression and read it back as a sentence, a table ' +
    'of the values each field allows, and the next five times it fires in local ' +
    'time. Ranges, lists, steps, month names and day names all parse, as do the ' +
    'shorthands @hourly, @daily, @weekly, @monthly and @yearly.\n\n' +
    'Day of month and day of week follow the traditional rule: when both are ' +
    'restricted, the expression fires on a day that matches either one. That is ' +
    'the behaviour of Vixie cron and of most schedulers copying it, and it is ' +
    'the difference people most often trip over — the explanation says so in ' +
    'words rather than leaving it implied.\n\n' +
    'A malformed field says which field and why, so the expression can be fixed ' +
    'without guessing. Nothing is scheduled or run; this only reads.',
  releaseNotes: 'First release.',
  capabilities: ['storage'],
  screenshots: [
    { shape: 'rings', seed: 6, tone: 'accent' },
    { shape: 'grid', seed: 31, tone: 'neutral' },
  ],
  manifest: {
    id: 'user.cron',
    name: 'Cron Explainer',
    description: 'Read a cron expression in words and see when it next fires.',
    version: '1.0',
    category: 'developer',
    keywords: ['cron', 'crontab', 'schedule', 'timer', 'jobs'],
    window: { width: 460, height: 560, minWidth: 340, minHeight: 400 },
    html: program(BODY, SCRIPT, STYLE),
  },
});
