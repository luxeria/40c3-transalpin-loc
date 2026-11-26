'use strict';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'transalpin-vtp-v2';
const OLD_STORE_KEY = 'transalpin-vtp-v1';

// Text inputs whose element id equals the container property.
const FIELDS = ['name', 'dstLocation', 'dstHabitat', 'dstAssembly', 'srcAddr', 'weight',
  'dimL', 'dimW', 'dimH', 'cName', 'cDect', 'cMatrix', 'cPhone', 'notes'];
// Carried over into a new container; everything else starts empty.
const SHARED_FIELDS = ['dstLocation', 'dstHabitat', 'dstAssembly', 'srcAddr', 'cName', 'cDect', 'cMatrix', 'cPhone'];
const DEFAULTS = { dstLocation: 'Messe Hamburg', dstHabitat: 'Transalpin', srcAddr: 'Bitwäscherei, Zürich' };

const QOS = {
  EF: ['Expedited Forwarding', 'must arrive'],
  AF: ['Assured Forwarding', 'should arrive'],
  BE: ['Best Effort', 'nice to have'],
};

/* ---------- small helpers ---------- */

// h('div.cls', 'text' | node | [nodes]...) -> element. Text is never parsed as HTML.
function h(spec, ...children) {
  const [tag, ...classes] = spec.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : String(c));
  }
  return el;
}

function crc32(str) {
  let crc = ~0;
  for (const byte of new TextEncoder().encode(str)) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (~crc >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

const round2 = (n) => Math.round(n * 100) / 100;
// 80 -> "80", 12.5 -> "12.50"
const money = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/* ---------- state: all containers of this browser ---------- */

let state = { currentId: '', email: '', containers: [] };

function newContainer(from) {
  const c = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    qos: '', flags: [], packed: false,
    items: [{ qty: '1', desc: '', value: '' }],
    printed: '', mailed: '', // FCS of the sheet at the time it was marked, '' = not done
  };
  for (const f of FIELDS) c[f] = '';
  Object.assign(c, DEFAULTS);
  if (from) for (const f of SHARED_FIELDS) c[f] = from[f];
  return c;
}

const current = () => state.containers.find((c) => c.id === state.currentId) || state.containers[0];

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* private mode: no persistence */ }
}

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { /* ignore broken data */ }
  if (s && Array.isArray(s.containers) && s.containers.length) {
    state = { currentId: s.currentId || '', email: s.email || '', containers: [] };
    for (const saved of s.containers) {
      const c = Object.assign(newContainer(), saved);
      if (!Array.isArray(c.items) || !c.items.length) c.items = [{ qty: '1', desc: '', value: '' }];
      if (!Array.isArray(c.flags)) c.flags = [];
      state.containers.push(c);
    }
  } else {
    const c = newContainer();
    // Take over the single form of the first version of this page.
    let old = null;
    try { old = JSON.parse(localStorage.getItem(OLD_STORE_KEY)); } catch { /* ignore */ }
    if (old) {
      for (const f of FIELDS) if (typeof old[f] === 'string' && old[f] !== '') c[f] = old[f];
      if (QOS[old.qos]) c.qos = old.qos;
      if (Array.isArray(old.flags)) c.flags = old.flags;
      if (old.payload) { c.name = old.payload; c.items = [{ qty: '1', desc: old.payload, value: old.value || '' }]; }
      state.email = old.email || '';
    }
    state.containers = [c];
  }
  if (!state.containers.some((c) => c.id === state.currentId)) state.currentId = state.containers[0].id;
}

// What gets printed, mailed and encoded for one container.
function sheetData(c) {
  const t = (f) => String(c[f] || '').trim();
  const items = c.items
    .map((i) => [parseInt(i.qty, 10) || 0, String(i.desc || '').trim(), parseFloat(i.value) || 0])
    .filter((i) => i[1]);
  const d = {
    name: t('name'),
    dstLocation: t('dstLocation'), dstHabitat: t('dstHabitat'), dstAssembly: t('dstAssembly'),
    srcAddr: t('srcAddr'),
    weight: t('weight'), dimL: t('dimL'), dimW: t('dimW'), dimH: t('dimH'),
    qos: c.qos,
    cName: t('cName'), cDect: t('cDect'), cMatrix: t('cMatrix'), cPhone: t('cPhone'),
    flags: c.flags, notes: t('notes'),
    items, // [quantity, description, CHF per piece]
    value: round2(items.reduce((sum, i) => sum + i[0] * i[2], 0)),
  };
  // Frame check sequence: identifies this sheet, ties the label to the backup mail.
  d.fcs = '0x' + crc32(JSON.stringify(d));
  return d;
}

const pieces = (d) => d.items.reduce((sum, i) => sum + i[0], 0);

/* ---------- form <-> current container ---------- */

function itemRow(item) {
  const input = (cls, type, value, attrs) => {
    const el = h('input.' + cls);
    el.type = type;
    el.value = value;
    el.required = true;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const del = h('button.plain.icon', '×');
  del.type = 'button';
  del.title = 'Remove this line';
  del.setAttribute('aria-label', 'Remove this line');
  del.dataset.action = 'remove-item';
  return h('div.item-row',
    input('i-qty', 'number', item.qty, { min: '1', max: '9999', step: '1', inputmode: 'numeric', placeholder: 'Qty', 'aria-label': 'Quantity' }),
    input('i-desc', 'text', item.desc, { maxlength: '80', placeholder: 'e.g. Yealink T46G', 'aria-label': 'Description' }),
    input('i-value', 'number', item.value, { min: '0', step: 'any', inputmode: 'decimal', placeholder: 'CHF', 'aria-label': 'Value per piece in CHF' }),
    h('span.i-total'),
    del);
}

function renderItems(c) {
  $('items').replaceChildren(...c.items.map(itemRow));
}

function containerToForm(c) {
  for (const f of FIELDS) $(f).value = c[f];
  for (const r of document.querySelectorAll('input[name=qos]')) r.checked = r.value === c.qos;
  for (const cb of document.querySelectorAll('input[name=flag]')) cb.checked = c.flags.includes(cb.value);
  $('packed').checked = !!c.packed;
  $('email').value = state.email;
  renderItems(c);
}

function formToContainer(c) {
  for (const f of FIELDS) c[f] = $(f).value;
  c.qos = document.querySelector('input[name=qos]:checked')?.value || '';
  c.flags = [...document.querySelectorAll('input[name=flag]:checked')].map((cb) => cb.value);
  c.packed = $('packed').checked;
  c.items = [...document.querySelectorAll('#items .item-row')].map((row) => ({
    qty: row.querySelector('.i-qty').value,
    desc: row.querySelector('.i-desc').value,
    value: row.querySelector('.i-value').value,
  }));
  state.email = $('email').value;
}

/* ---------- sidebar ---------- */

// 'off' | 'on' | 'stale' (marked, but the container was changed afterwards)
const statusOf = (mark, fcs) => (!mark ? 'off' : mark === fcs ? 'on' : 'stale');

function statusChip(c, d, key, word) {
  const st = statusOf(c[key], d.fcs);
  const chip = h('button.plain.chip.' + st,
    st === 'on' ? '✓ ' + word : st === 'stale' ? '! ' + word + ', then changed' : 'not ' + word);
  chip.type = 'button';
  chip.dataset.action = 'toggle-' + key;
  chip.dataset.id = c.id;
  chip.setAttribute('aria-pressed', String(st !== 'off'));
  chip.title = st === 'off' ? `Mark as ${word}` : `Mark as not ${word}`;
  return chip;
}

function renderSidebar() {
  $('containers').replaceChildren(...state.containers.map((c) => {
    const d = sheetData(c);
    const select = h('button.plain.cont-select',
      h('span.cont-name', d.name || 'Unnamed container'),
      h('span.cont-sub', d.items.length
        ? `${d.items.length} ${d.items.length === 1 ? 'line' : 'lines'}, ${pieces(d)} pcs - CHF ${money(d.value)}`
        : 'no items yet'));
    select.type = 'button';
    select.dataset.action = 'select';
    select.dataset.id = c.id;
    const del = h('button.plain.icon', '×');
    del.type = 'button';
    del.title = 'Delete this container';
    del.setAttribute('aria-label', `Delete container ${d.name || 'Unnamed container'}`);
    del.dataset.action = 'delete';
    del.dataset.id = c.id;
    const li = h('li.cont', select,
      h('div.cont-status', statusChip(c, d, 'printed', 'printed'), statusChip(c, d, 'mailed', 'mailed'), del));
    if (c.id === state.currentId) { li.classList.add('current'); select.setAttribute('aria-current', 'true'); }
    return li;
  }));
}

/* ---------- label ---------- */

function field(cls, key, desc, value) {
  return h('div.f.' + cls, h('div.kd', h('div.k', key), h('div.d', desc)), h('div.v', value));
}

function ruler() {
  const tens = h('div.bits');
  const ones = h('div.bits');
  for (let i = 0; i < 32; i++) {
    tens.append(h('span', i % 10 === 0 ? i / 10 : ' '));
    ones.append(h('span', i % 10));
  }
  return h('div.ruler', tens, ones);
}

// The one-line machine-readable copy of a sheet: used in the mail and in the QR code.
function machineLine(d) {
  return 'VTP2 ' + JSON.stringify(d);
}

// Same line in pure ASCII: every other character becomes a JSON \uXXXX escape.
// Many QR scanners garble raw UTF-8 (umlauts vanish); JSON parsers turn the
// escapes back into the original characters, so nothing is lost.
function asciiJson(json) {
  return json.replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

// QR code of `text` as an inline SVG element; null if the text does not fit at this error correction level.
function qrSvg(text, level) {
  if (typeof qrcode !== 'function') return null;
  let qr;
  try {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    qr = qrcode(0, level); // version: auto
    qr.addData(text, 'Byte');
    qr.make();
  } catch { return null; }
  const n = qr.getModuleCount();
  const quiet = 4;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
  }
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${-quiet} ${-quiet} ${n + 2 * quiet} ${n + 2 * quiet}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code with the data of this transport sheet');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', path);
  p.setAttribute('fill', '#000');
  svg.append(p);
  return svg;
}

// QR code for a sheet. It never contains the item list: long lists make the
// code too dense to scan from a label. The list lives in the mailed sheet and
// is matched to the label by the FCS, which is computed over the full data.
function sheetQr(d) {
  const { items, ...rest } = d;
  const text = asciiJson(machineLine({ ...rest, itemCount: items.length }));
  return qrSvg(text, 'M') || qrSvg(text, 'L');
}

function sheetHead(boxTitle, boxSub) {
  const logo = h('img');
  logo.src = 'transalpin-bahnhofsschild-primitive.svg';
  logo.alt = 'Transalpin';
  return h('div.head',
    logo,
    h('div.title', h('div.t1', 'VAN-Transport-Protocol'),
      h('div.t2', `VTP/2.0 - ${CONFIG.event} - one frame = one properly packaged container`)),
    h('div.dir', h('div.t1', boxTitle), h('div.t2', boxSub)));
}

const dash = (s) => s || '-';
const dimsText = (d) => (d.dimL || d.dimW || d.dimH
  ? `${dash(d.dimL)} × ${dash(d.dimW)} × ${dash(d.dimH)} cm` : '-');

function buildLabel(d, dir, qr) {
  const out = dir === 'out';

  const eventAddr = [
    h('div.line', dash(d.dstLocation)),
    h('div.line', 'Habitat: ' + dash(d.dstHabitat)),
    h('div.line.big', 'Assembly: ' + dash(d.dstAssembly)),
  ];
  const homeAddr = [h('div.line.big', dash(d.srcAddr))];

  const contact = [['Name', d.cName], ['DECT', d.cDect], ['Matrix', d.cMatrix], ['Phone', d.cPhone]]
    .filter(([, val]) => val)
    .map(([k, val]) => h('div.line', h('span.ck', k + ':'), val));

  const dimsField = field('top', 'Frame Size:', 'L × W × H in cm', dimsText(d));
  dimsField.querySelector('.v').classList.add('dims');

  const payload = [
    h('div.line.pname', dash(d.name)),
    d.items.length ? h('div.line.psum',
      `${d.items.length} ${d.items.length === 1 ? 'line' : 'lines'}, ${pieces(d)} pcs - see payload list`) : null,
  ];

  const options = [
    d.flags.length ? h('div.flagrow', d.flags.map((f) => h('span.flag', f))) : null,
    d.notes ? h('div.notes', d.notes) : null,
  ];

  return h('div.sheet', h('div.label',
    sheetHead(out ? 'OUTBOUND' : 'RETURN', out ? 'Label 1/2 - way there' : 'Label 2/2 - way back'),
    ruler(),
    h('div.row.r-addr',
      field('side', 'DST ADDR:', 'Where it goes', out ? eventAddr : homeAddr),
      field('side', 'SRC ADDR:', 'Where it is picked up', out ? homeAddr : eventAddr)),
    h('div.row.r-meta',
      field('top', 'Weight:', 'in kilograms', d.weight ? d.weight + ' kg' : '-'),
      dimsField,
      field('top', 'QoS Class:', 'EF = must arrive, AF = should arrive, BE = nice to have',
        d.qos ? [h('span.qos', d.qos), h('span.qosd', QOS[d.qos][1])] : '-'),
      field('top', 'Value:', 'Sum of the payload list in CHF, relevant for Carnet ATA',
        d.items.length ? 'CHF ' + money(d.value) : '-')),
    h('div.lower',
      h('div.row.r-who',
        field('stack', 'Reply-To:', 'Who to call about this', contact.length ? contact : '-'),
        field('stack', 'Payload:', 'What is inside', payload)),
      h('div.row.r-opt',
        field('side', 'Options:', 'Variable length, additional notes', options)),
      h('div.f.qr',
        h('div.kd', h('div.k', 'Frame Dump:'),
          h('div.d', 'Machine-readable, items: see mail')),
        qr ? qr.cloneNode(true) : null)),
    h('div.foot',
      h('div', h('b', 'FCS: ' + d.fcs), ' Frame check sequence - ID of this transport sheet'),
      h('div', `Label lost or found? ${CONFIG.collectorMail}`))));
}

// Payload list: the precise content for the Carnet ATA, on as many sheets as it needs.
// Every sheet is a complete page of its own (header, IDs, table head), so nothing
// depends on how a browser breaks a table across pages. Rows are placed by
// measuring: a row that no longer fits starts the next sheet.
const LIST_FALLBACK_ROWS = 11; // rows per sheet if measuring is impossible (preview not laid out)

function listSheet(d) {
  const th = (cls, text) => h('th' + cls, text);
  const tbody = h('tbody');
  const table = h('table',
    h('thead', h('tr', th('.num', 'Pos'), th('.num', 'Qty'), th('', 'Description'),
      th('.num', 'CHF / piece'), th('.num', 'CHF total'))),
    tbody);
  const area = h('div.parea', table);
  const boxSub = h('div.t2');
  const footLeft = h('div');
  const logo = h('img');
  logo.src = 'transalpin-bahnhofsschild-primitive.svg';
  logo.alt = 'Transalpin';
  const sheet = h('div.sheet.list', h('div.label.plist',
    h('div.head',
      logo,
      h('div.title', h('div.t1', 'VAN-Transport-Protocol'),
        h('div.t2', `VTP/2.0 - ${CONFIG.event} - one frame = one properly packaged container`)),
      h('div.dir', h('div.t1', 'PAYLOAD'), boxSub)),
    h('div.row.r-meta',
      field('top', 'Container:', 'Name of this frame', dash(d.name)),
      field('top', 'Assembly:', 'Who it belongs to', dash(d.dstAssembly)),
      field('top', 'Reply-To:', 'Who to call about this', dash(d.cName)),
      field('top', 'FCS:', 'Same ID as on the labels', d.fcs)),
    area,
    h('div.foot', footLeft,
      h('div', `Content list for the Carnet ATA - ${d.weight ? d.weight + ' kg' : '-'} - ${dimsText(d)}`))));
  return { sheet, area, table, tbody, boxSub, footLeft };
}

// Appends the payload list sheets to `host` (which must be in the document, for measuring).
function appendPayloadList(host, d) {
  const num = (text) => h('td.num', text);
  const rows = d.items.map((it, i) => h('tr',
    num(i + 1), num(it[0] + ' ×'), h('td', it[1]), num(money(it[2])), num(money(round2(it[0] * it[2])))));
  if (!rows.length) rows.push(h('tr', h('td'), h('td'), h('td.empty', 'No items yet'), h('td'), h('td')));
  const total = h('tr.total', h('td'), num(pieces(d) + ' ×'), h('td', 'Total'), h('td'), num(money(d.value)));
  rows.push(total);

  const pages = [];
  const newPage = () => { const p = listSheet(d); host.append(p.sheet); pages.push(p); return p; };
  let page = newPage();
  for (const row of rows) {
    page.tbody.append(row);
    const limit = page.area.clientHeight;
    const count = page.tbody.children.length;
    // 3% reserve: print may wrap a line differently than the small preview.
    const full = limit > 0 ? page.table.offsetHeight > limit * 0.97 : count > LIST_FALLBACK_ROWS;
    if (full && count > 1) {
      row.remove();
      page = newPage();
      page.tbody.append(row);
    }
  }

  pages.forEach((p, i) => {
    p.boxSub.textContent = `List ${i + 1}/${pages.length} - goes inside`;
    p.footLeft.textContent = i < pages.length - 1
      ? 'Continued on the next sheet.'
      : 'Put this list inside the container, on top of the content.';
  });
}

/* ---------- render everything that depends on the current container ---------- */

function render() {
  const c = current();
  const d = sheetData(c);
  const qr = sheetQr(d);
  $('labels').replaceChildren(buildLabel(d, 'out', qr), buildLabel(d, 'back', qr));
  appendPayloadList($('labels'), d);

  // Line totals and grand total in the form.
  const rows = document.querySelectorAll('#items .item-row');
  for (const row of rows) {
    const qty = parseInt(row.querySelector('.i-qty').value, 10) || 0;
    const value = parseFloat(row.querySelector('.i-value').value) || 0;
    row.querySelector('.i-total').textContent = '= ' + money(round2(qty * value));
    row.querySelector('[data-action=remove-item]').disabled = rows.length < 2;
  }
  $('totalValue').textContent = 'CHF ' + money(d.value);

  // Status checkboxes in steps 3 and 4.
  for (const [key, box, note] of [['printed', 'stPrinted', 'printedStale'], ['mailed', 'stMailed', 'mailedStale']]) {
    const st = statusOf(c[key], d.fcs);
    $(box).checked = st !== 'off';
    $(note).hidden = st !== 'stale';
  }

  renderSidebar();
}

// Switch the form to the current container.
function showCurrent() {
  containerToForm(current());
  $('form').classList.remove('validated');
  $('mail').classList.remove('highlight');
  for (const id of ['printNudge', 'mailNudge']) $(id).hidden = true;
  showError('formError', '');
  showError('mailError', '');
  render();
}

function setStatus(c, key, on) {
  c[key] = on ? sheetData(c).fcs : '';
  save();
  render();
}

/* ---------- transport sheet (mail backup) ---------- */

function sheetText(d) {
  const contact = [d.cName, d.cDect && 'DECT ' + d.cDect, d.cMatrix && 'Matrix ' + d.cMatrix,
    d.cPhone && 'Phone ' + d.cPhone].filter(Boolean).join(' / ');
  const lines = [
    'Transalpin VAN-Transport-Protocol - transport sheet',
    '',
    `FCS (ID):   ${d.fcs}`,
    `CONTAINER:  ${d.name}`,
    `DST ADDR:   ${d.dstLocation} / Habitat: ${d.dstHabitat} / Assembly: ${d.dstAssembly}`,
    `SRC ADDR:   ${d.srcAddr}`,
    `WEIGHT:     ${d.weight} kg`,
    `FRAME SIZE: ${d.dimL} x ${d.dimW} x ${d.dimH} cm (L x W x H)`,
    `QOS CLASS:  ${d.qos}${QOS[d.qos] ? ` (${QOS[d.qos][1]})` : ''}`,
    `REPLY-TO:   ${contact}`,
    `OPTIONS:    ${d.flags.join(', ') || '-'}`,
    `NOTES:      ${d.notes.replace(/\s*\n\s*/g, ' | ') || '-'}`,
    '',
    'PAYLOAD LIST:',
    ...d.items.map((it, i) =>
      `${String(i + 1).padStart(3)}. ${it[0]} x ${it[1]} - CHF ${money(it[2])} each = CHF ${money(round2(it[0] * it[2]))}`),
    `VALUE:      CHF ${money(d.value)} total, ${pieces(d)} pieces`,
    '',
    'Machine-readable copy, please leave as is:',
    machineLine(d),
  ];
  return lines.join('\n');
}

function showError(id, msg) {
  $(id).textContent = msg;
  $(id).hidden = !msg;
}

// Returns true if the form is complete; otherwise points the user at the first problem.
function validate(errorId) {
  const form = $('form');
  if (form.checkValidity()) { showError(errorId, ''); return true; }
  const first = form.querySelector(':invalid:not(fieldset)');
  showError(errorId, 'The form is not complete yet - please check the highlighted fields.');
  form.classList.add('validated');
  form.reportValidity();
  first?.scrollIntoView({ block: 'center' });
  return false;
}

/* ---------- theme: light by default, dark on request ---------- */

const THEME_KEY = 'transalpin-vtp-theme';

function initTheme() {
  let choice = 'light';
  try {
    if (localStorage.getItem(THEME_KEY) === 'dark') choice = 'dark';
  } catch { /* private mode: stay light */ }

  const apply = () => {
    document.documentElement.dataset.theme = choice;
    for (const b of document.querySelectorAll('[data-theme-choice]')) {
      b.setAttribute('aria-pressed', String(b.dataset.themeChoice === choice));
    }
  };

  for (const b of document.querySelectorAll('[data-theme-choice]')) {
    b.addEventListener('click', () => {
      choice = b.dataset.themeChoice;
      try {
        if (choice === 'dark') localStorage.setItem(THEME_KEY, choice);
        else localStorage.removeItem(THEME_KEY);
      } catch { /* not persisted */ }
      apply();
    });
  }
  apply();
}

/* ---------- wiring ---------- */

function addContainer() {
  const c = newContainer(current());
  state.containers.push(c);
  state.currentId = c.id;
  save();
  showCurrent();
  $('name').closest('.step').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('name').focus({ preventScroll: true });
}

function init() {
  for (const name of CONFIG.assemblies) {
    const o = document.createElement('option');
    o.value = name;
    $('assemblies').append(o);
  }
  for (const flag of CONFIG.flags) {
    const cb = h('input');
    cb.type = 'checkbox'; cb.name = 'flag'; cb.value = flag;
    $('flags').append(h('label.radio', cb, h('span', flag)));
  }

  initTheme();
  load();
  showCurrent();

  // Any edit goes straight into the current container and into the browser's storage.
  document.addEventListener('input', (e) => {
    if (e.target.id === 'stPrinted' || e.target.id === 'stMailed') return; // handled below
    formToContainer(current());
    save();
    render();
  });

  $('stPrinted').addEventListener('change', (e) => setStatus(current(), 'printed', e.target.checked));
  $('stMailed').addEventListener('change', (e) => setStatus(current(), 'mailed', e.target.checked));

  // Sidebar: select, status chips, delete.
  $('containers').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const c = state.containers.find((x) => x.id === btn.dataset.id);
    if (!c) return;
    const action = btn.dataset.action;
    if (action === 'select') {
      state.currentId = c.id;
      save();
      showCurrent();
    } else if (action === 'toggle-printed' || action === 'toggle-mailed') {
      const key = action.slice('toggle-'.length);
      setStatus(c, key, !c[key]);
    } else if (action === 'delete') {
      const label = sheetData(c).name || 'Unnamed container';
      if (!confirm(`Delete the container "${label}" from this browser? This cannot be undone.`)) return;
      state.containers = state.containers.filter((x) => x !== c);
      if (!state.containers.length) state.containers = [newContainer(c)];
      if (state.currentId === c.id) state.currentId = state.containers[0].id;
      save();
      showCurrent();
    }
  });

  $('btnNewSide').addEventListener('click', addContainer);
  $('btnNew').addEventListener('click', addContainer);

  // Items of the current container.
  $('btnAddItem').addEventListener('click', () => {
    const c = current();
    formToContainer(c);
    c.items.push({ qty: '1', desc: '', value: '' });
    save();
    renderItems(c);
    render();
    $('items').lastElementChild.querySelector('.i-desc').focus();
  });
  $('items').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action=remove-item]');
    if (!btn) return;
    btn.closest('.item-row').remove();
    formToContainer(current());
    save();
    render();
  });

  $('form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate('formError')) return;
    render();
    window.print();
  });

  window.addEventListener('afterprint', () => {
    if (!$('form').checkValidity()) return;
    $('printNudge').hidden = false;
    $('mail').classList.add('highlight');
  });

  $('btnMail').addEventListener('click', () => {
    if (!validate('mailError')) return;
    const email = $('email');
    if (!email.value.trim() || !email.checkValidity()) {
      showError('mailError', 'Please enter your own e-mail address first, so the backup also lands in your inbox.');
      email.focus();
      return;
    }
    const d = sheetData(current());
    const subject = `[Transalpin VTP] ${d.dstAssembly} - ${d.cName} - ${d.name} (${d.fcs})`;
    location.href = `mailto:${encodeURIComponent(email.value.trim())}`
      + `?cc=${encodeURIComponent(CONFIG.collectorMail)}`
      + `&subject=${encodeURIComponent(subject)}`
      + `&body=${encodeURIComponent(sheetText(d))}`;
    $('mailNudge').hidden = false;
  });

  $('btnCopy').addEventListener('click', async () => {
    if (!validate('mailError')) return;
    const text = sheetText(sheetData(current()));
    try {
      await navigator.clipboard.writeText(text);
      $('btnCopy').textContent = 'Copied ✓';
      setTimeout(() => { $('btnCopy').textContent = 'Copy sheet as text'; }, 2000);
      $('mailNudge').hidden = false;
    } catch {
      showError('mailError', 'Copying was blocked by the browser. Please use "Open e-mail draft" instead.');
    }
  });
}

init();
