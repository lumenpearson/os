// deslop-ignore-file 34 — counts, percentages and generated samples are
// values; design rule 1 sets values in the monospace face.

/**
 * Word Sampler: filler text drawn from a corpus you supply rather than from
 * dog Latin. It counts the words in the source, builds a bigram chain from
 * them, and samples sentences out of it, so the placeholder has the vocabulary,
 * the sentence length and the rhythm of the real copy it stands in for.
 */

import { appPackage, program } from './shared.mjs';

const SAMPLE = [
  'A typeface is a set of decisions about how letters meet.',
  'The counter of an a, the shoulder of an n, the angle at which a stroke is cut:',
  'each one is small, and together they decide whether a page is read or merely looked at.',
  'Body text asks for patience from a face. It must hold a line at thirteen pixels,',
  'set numbers that line up in a column, and stay out of the way of the words.',
  'A display face may be louder, because it is read once and at size.',
  'Spacing does as much work as drawing. Letters set too tight fuse into blocks;',
  'letters set too loose fall apart into beads. The right fit is invisible,',
  'which is why so much of the craft is spent on the parts nobody notices.',
  'Choose two faces at most, give each a job, and let scale and space carry the hierarchy.',
].join(' ');

const STYLE = `<style>
textarea { min-height: 78px; }
#out { min-height: 120px; }
.controls { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
#freq { margin-top: 8px; }
#freq td:last-child { text-align: right; }
.bar { height: 3px; background: var(--accent); border-radius: 2px; }
.scroll { max-height: 140px; overflow: auto; }
#stat { font-size: 12px; color: var(--ink-2); margin: 8px 0 0; }
</style>`;

const BODY = `
<h1>Word Sampler</h1>
<p class="lede">Filler text built from the words of a source you choose.</p>
<label for="source">Source text</label>
<textarea id="source" class="mono" spellcheck="false"></textarea>
<div class="controls">
  <div>
    <label for="sentences">Sentences</label>
    <input id="sentences" class="mono" type="number" min="1" max="60" value="6">
  </div>
  <div>
    <label for="length">Words each</label>
    <input id="length" class="mono" type="number" min="3" max="40" value="14">
  </div>
  <div>
    <label for="seed">Seed</label>
    <input id="seed" class="mono" type="number" min="1" max="99999" value="7">
  </div>
</div>
<div class="actions">
  <button id="generate">Generate</button>
  <button id="chain" aria-pressed="true">Follow word order</button>
  <button id="restore">Restore the sample source</button>
  <button id="select">Select output</button>
</div>
<h2>Output</h2>
<textarea id="out" readonly></textarea>
<p id="stat" class="mono"></p>
<h2>Most frequent words</h2>
<div class="scroll"><table id="freq"><tbody></tbody></table></div>
`;

const SCRIPT = `<script>
var SAMPLE = ${JSON.stringify(SAMPLE)};
var source = document.getElementById('source');
var out = document.getElementById('out');
var stat = document.getElementById('stat');
var freq = document.getElementById('freq').querySelector('tbody');
var sentences = document.getElementById('sentences');
var length = document.getElementById('length');
var seedInput = document.getElementById('seed');
var chainButton = document.getElementById('chain');
var useChain = true;
var random = makeRandom(7);

/** Mulberry32: same seed, same text, every time. */
function makeRandom(seed) {
  var state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function words(text) {
  var found = text.toLowerCase().match(/[a-z][a-z'-]*/g);
  return found || [];
}

function counts(list) {
  var map = {};
  for (var i = 0; i < list.length; i++) map[list[i]] = (map[list[i]] || 0) + 1;
  return map;
}

/** Word to the words that followed it, with repeats kept so likelihood survives. */
function bigrams(list) {
  var map = {};
  for (var i = 0; i < list.length - 1; i++) {
    if (!map[list[i]]) map[list[i]] = [];
    map[list[i]].push(list[i + 1]);
  }
  return map;
}

function weightedList(map) {
  var flat = [];
  for (var key in map) for (var i = 0; i < map[key]; i++) flat.push(key);
  return flat;
}

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

function sentence(flat, follow, wanted) {
  var word = pick(flat);
  var parts = [word];
  for (var i = 1; i < wanted; i++) {
    var next = useChain && follow[word] && follow[word].length ? pick(follow[word]) : pick(flat);
    parts.push(next);
    word = next;
  }
  parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.join(' ') + '.';
}

function generate() {
  var list = words(source.value);
  if (list.length < 4) {
    out.value = '';
    stat.textContent = 'the source needs at least four words';
    freq.innerHTML = '';
    return;
  }
  random = makeRandom(Math.max(1, Number(seedInput.value) || 1));
  var map = counts(list);
  var flat = weightedList(map);
  var follow = bigrams(list);
  var wanted = Math.max(3, Math.min(40, Number(length.value) || 14));
  var howMany = Math.max(1, Math.min(60, Number(sentences.value) || 6));
  var lines = [];
  for (var i = 0; i < howMany; i++) lines.push(sentence(flat, follow, wanted));
  out.value = lines.join(' ');

  var unique = Object.keys(map);
  stat.textContent = list.length + ' words read, ' + unique.length + ' distinct, ' +
    out.value.split(/\\s+/).length + ' words written';

  unique.sort(function (a, b) { return map[b] - map[a] || a.localeCompare(b); });
  var top = unique.slice(0, 12);
  var most = map[top[0]] || 1;
  var rows = '';
  for (var t = 0; t < top.length; t++) {
    var share = (map[top[t]] / list.length) * 100;
    rows += '<tr><td class="mono">' + top[t] + '</td>' +
      '<td><div class="bar" style="width:' + Math.round((map[top[t]] / most) * 100) + '%"></div></td>' +
      '<td class="mono muted">' + map[top[t]] + ' — ' + share.toFixed(1) + '%</td></tr>';
  }
  freq.innerHTML = rows;
  lumen.storage.set('state', {
    source: source.value, sentences: sentences.value,
    length: length.value, seed: seedInput.value, chain: useChain
  });
}

document.getElementById('generate').addEventListener('click', function () {
  seedInput.value = String(Math.floor(Math.random() * 99999) + 1);
  generate();
});
document.getElementById('restore').addEventListener('click', function () {
  source.value = SAMPLE;
  generate();
});
document.getElementById('select').addEventListener('click', function () {
  out.focus();
  out.select();
});
chainButton.addEventListener('click', function () {
  useChain = !useChain;
  chainButton.setAttribute('aria-pressed', String(useChain));
  generate();
});
source.addEventListener('input', generate);
sentences.addEventListener('input', generate);
length.addEventListener('input', generate);
seedInput.addEventListener('input', generate);

lumen.setTitle('Word Sampler');
lumen.storage.get('state').then(function (saved) {
  if (saved && typeof saved.source === 'string' && saved.source.trim()) {
    source.value = saved.source;
    sentences.value = saved.sentences;
    length.value = saved.length;
    seedInput.value = saved.seed;
    useChain = saved.chain !== false;
    chainButton.setAttribute('aria-pressed', String(useChain));
  } else {
    source.value = SAMPLE;
  }
  generate();
});
</script>`;

export const WORDS = appPackage({
  id: 'com.lumen.words',
  version: '1.0.1',
  updated: '2026-08-21T09:00:00Z',
  tagline: 'Placeholder text with your own vocabulary, not dog Latin.',
  description:
    'Filler text is meant to stand in for real copy, and Latin cannot do that: ' +
    'it has the wrong word lengths, the wrong letter frequencies and no ' +
    'vocabulary in common with the thing being designed. This samples from a ' +
    'source you paste instead.\n\n' +
    'The source is split into words, counted, and turned into a chain of which ' +
    'word followed which. Sampling walks that chain, so the output keeps the ' +
    'vocabulary and the local rhythm of the original while saying nothing. ' +
    'Turn the chain off to sample words independently by frequency, which reads ' +
    'more scattered and is useful when you want length without meaning.\n\n' +
    'Generation is seeded, so the same seed and the same source give the same ' +
    'text — a layout can be re-rendered without the copy moving underneath it. ' +
    'The frequency table underneath shows the twelve commonest words with their ' +
    'share of the source.',
  releaseNotes: 'The seed field is editable, so a layout can be reproduced exactly.',
  capabilities: ['storage'],
  screenshots: [
    { shape: 'type', seed: 11, tone: 'neutral' },
    { shape: 'ramp', seed: 5, tone: 'accent' },
  ],
  manifest: {
    id: 'user.words',
    name: 'Word Sampler',
    description: 'Generate placeholder text from the words of a source you supply.',
    version: '1.0',
    category: 'office',
    keywords: ['placeholder', 'filler', 'lorem', 'text', 'frequency'],
    window: { width: 480, height: 620, minWidth: 360, minHeight: 440 },
    html: program(BODY, SCRIPT, STYLE),
  },
});
