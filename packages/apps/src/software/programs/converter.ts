// deslop-ignore-file 34 — the quantities are values; design rule 1 sets values
// in the monospace face, and the frame carries its own copy of that rule.

/**
 * Unit Converter: length, mass and temperature, converted both ways as the
 * value is typed. The chosen quantity and units are remembered through the
 * frame's storage bridge, so the window opens where it was left.
 */

import type { AppManifest } from '@lumen/kernel';
import { program } from './shared';

const BODY = `
<h1>Unit Converter</h1>
<p class="lede">Length, mass and temperature. Type in either field.</p>
<div class="panel">
  <label for="quantity">Quantity</label>
  <select id="quantity">
    <option value="length">Length</option>
    <option value="mass">Mass</option>
    <option value="temperature">Temperature</option>
  </select>
  <div class="row" style="margin-top:10px">
    <div style="flex:1"><label for="from">From</label><select id="from"></select></div>
    <div style="flex:1"><label for="to">To</label><select id="to"></select></div>
  </div>
  <div class="row" style="margin-top:10px">
    <div style="flex:1"><label for="left">Value</label><input id="left" class="mono" inputmode="decimal" value="1"></div>
    <div style="flex:1"><label for="right">Result</label><input id="right" class="mono" inputmode="decimal"></div>
  </div>
  <div class="actions"><button id="swap">Swap units</button></div>
</div>
<p class="note mono" id="rate"></p>
`;

const SCRIPT = `<script>
var QUANTITIES = {
  length: [
    ['mm', 'Millimetres', 0.001], ['cm', 'Centimetres', 0.01], ['m', 'Metres', 1],
    ['km', 'Kilometres', 1000], ['in', 'Inches', 0.0254], ['ft', 'Feet', 0.3048],
    ['yd', 'Yards', 0.9144], ['mi', 'Miles', 1609.344]
  ],
  mass: [
    ['mg', 'Milligrams', 0.000001], ['g', 'Grams', 0.001], ['kg', 'Kilograms', 1],
    ['t', 'Tonnes', 1000], ['oz', 'Ounces', 0.028349523125], ['lb', 'Pounds', 0.45359237],
    ['st', 'Stone', 6.35029318]
  ],
  temperature: [['C', 'Celsius', 1], ['F', 'Fahrenheit', 1], ['K', 'Kelvin', 1]]
};

var quantity = document.getElementById('quantity');
var from = document.getElementById('from');
var to = document.getElementById('to');
var left = document.getElementById('left');
var right = document.getElementById('right');
var rate = document.getElementById('rate');

function toBase(value, unit, kind) {
  if (kind !== 'temperature') return value * unitFactor(kind, unit);
  if (unit === 'F') return (value - 32) * 5 / 9;
  if (unit === 'K') return value - 273.15;
  return value;
}

function fromBase(value, unit, kind) {
  if (kind !== 'temperature') return value / unitFactor(kind, unit);
  if (unit === 'F') return value * 9 / 5 + 32;
  if (unit === 'K') return value + 273.15;
  return value;
}

function unitFactor(kind, unit) {
  var list = QUANTITIES[kind];
  for (var i = 0; i < list.length; i++) if (list[i][0] === unit) return list[i][2];
  return 1;
}

function unitName(kind, unit) {
  var list = QUANTITIES[kind];
  for (var i = 0; i < list.length; i++) if (list[i][0] === unit) return list[i][1];
  return unit;
}

function round(value) {
  if (!isFinite(value)) return '';
  var abs = Math.abs(value);
  var digits = abs !== 0 && abs < 0.001 ? 8 : abs < 1 ? 6 : 4;
  return String(parseFloat(value.toFixed(digits)));
}

function fillUnits() {
  var list = QUANTITIES[quantity.value];
  var html = '';
  for (var i = 0; i < list.length; i++) {
    html += '<option value="' + list[i][0] + '">' + list[i][1] + '</option>';
  }
  from.innerHTML = html;
  to.innerHTML = html;
  from.selectedIndex = 0;
  to.selectedIndex = Math.min(2, list.length - 1);
}

function convert(source) {
  var kind = quantity.value;
  var input = source === 'right' ? right : left;
  var output = source === 'right' ? left : right;
  var inUnit = source === 'right' ? to.value : from.value;
  var outUnit = source === 'right' ? from.value : to.value;
  var value = parseFloat(input.value);
  if (isNaN(value)) { output.value = ''; describe(); return; }
  output.value = round(fromBase(toBase(value, inUnit, kind), outUnit, kind));
  describe();
  save();
}

function describe() {
  var kind = quantity.value;
  var one = round(fromBase(toBase(1, from.value, kind), to.value, kind));
  rate.textContent = '1 ' + unitName(kind, from.value) + ' = ' + one + ' ' + unitName(kind, to.value);
}

function save() {
  lumen.storage.set('state', {
    quantity: quantity.value, from: from.value, to: to.value, value: left.value
  });
}

quantity.addEventListener('change', function () { fillUnits(); convert('left'); });
from.addEventListener('change', function () { convert('left'); });
to.addEventListener('change', function () { convert('left'); });
left.addEventListener('input', function () { convert('left'); });
right.addEventListener('input', function () { convert('right'); });
document.getElementById('swap').addEventListener('click', function () {
  var a = from.value;
  from.value = to.value;
  to.value = a;
  convert('left');
});

lumen.setTitle('Unit Converter');
fillUnits();
lumen.storage.get('state').then(function (saved) {
  if (saved && QUANTITIES[saved.quantity]) {
    quantity.value = saved.quantity;
    fillUnits();
    from.value = saved.from;
    to.value = saved.to;
    left.value = saved.value;
  }
  convert('left');
});
</script>`;

export const CONVERTER: AppManifest = {
  id: 'user.converter',
  name: 'Unit Converter',
  description: 'Convert length, mass and temperature between units.',
  version: '1.0',
  category: 'utilities',
  keywords: ['convert', 'units', 'metric', 'imperial', 'temperature'],
  window: { width: 380, height: 430, minWidth: 300, minHeight: 340 },
  html: program(BODY, SCRIPT),
};
