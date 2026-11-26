'use strict';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'transalpin-vtp-v1';
const TEXT_FIELDS = ['dstLocation', 'dstHabitat', 'dstAssembly', 'srcAddr', 'payload', 'weight',
  'value', 'dimL', 'dimW', 'dimH', 'cName', 'cDect', 'cMatrix', 'cPhone', 'notes', 'email'];
// Cleared by "Register another item"; addresses and contact are kept.
const PER_ITEM_FIELDS = ['payload', 'weight', 'value', 'dimL', 'dimW', 'dimH', 'notes'];

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

/* ---------- form state ---------- */

function readForm() {
  const v = (id) => $(id).value.trim();
  const d = {
    dstLocation: v('dstLocation'), dstHabitat: v('dstHabitat'), dstAssembly: v('dstAssembly'),
    srcAddr: v('srcAddr'), payload: v('payload'),
    weight: v('weight'), value: v('value'),
    dimL: v('dimL'), dimW: v('dimW'), dimH: v('dimH'),
    qos: document.querySelector('input[name=qos]:checked')?.value || '',
    cName: v('cName'), cDect: v('cDect'), cMatrix: v('cMatrix'), cPhone: v('cPhone'),
    flags: [...document.querySelectorAll('input[name=flag]:checked')].map((c) => c.value),
    notes: v('notes'),
  };
  // Frame check sequence: identifies this sheet, ties the label to the backup mail.
  d.fcs = '0x' + crc32(JSON.stringify(d));
  return d;
}

function save() {
  const s = { qos: document.querySelector('input[name=qos]:checked')?.value || '' };
  for (const id of TEXT_FIELDS) s[id] = $(id).value;
  s.flags = [...document.querySelectorAll('input[name=flag]:checked')].map((c) => c.value);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private mode: no persistence */ }
}

function restore() {
  let s;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return; }
  if (!s) return;
  for (const id of TEXT_FIELDS) if (typeof s[id] === 'string' && s[id] !== '') $(id).value = s[id];
  for (const r of document.querySelectorAll('input[name=qos]')) r.checked = r.value === s.qos;
  for (const c of document.querySelectorAll('input[name=flag]')) c.checked = (s.flags || []).includes(c.value);
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

function buildLabel(d, dir) {
  const out = dir === 'out';
  const dash = (s) => s || '-';

  const eventAddr = [
    h('div.line', dash(d.dstLocation)),
    h('div.line', 'Habitat: ' + dash(d.dstHabitat)),
    h('div.line.big', 'Assembly: ' + dash(d.dstAssembly)),
  ];
  const homeAddr = [h('div.line.big', dash(d.srcAddr))];

  const logo = h('img');
  logo.src = 'transalpin-bahnhofsschild-primitive.svg';
  logo.alt = 'Transalpin';

  const contact = [['Name', d.cName], ['DECT', d.cDect], ['Matrix', d.cMatrix], ['Phone', d.cPhone]]
    .filter(([, val]) => val)
    .map(([k, val]) => h('div.line', h('span.ck', k + ':'), val));

  const dims = d.dimL || d.dimW || d.dimH
    ? `${dash(d.dimL)} × ${dash(d.dimW)} × ${dash(d.dimH)} cm` : '-';

  const options = [
    d.flags.length ? h('div.flagrow', d.flags.map((f) => h('span.flag', f))) : null,
    d.notes ? h('div.notes', d.notes) : null,
  ];

  return h('div.sheet', h('div.label',
    h('div.head',
      logo,
      h('div.title', h('div.t1', 'VAN-Transport-Protocol'),
        h('div.t2', `VTP/1.0 - ${CONFIG.event} - one frame = one properly packaged container`)),
      h('div.dir', h('div.t1', out ? 'OUTBOUND' : 'RETURN'),
        h('div.t2', out ? 'Label 1/2 - way there' : 'Label 2/2 - way back'))),
    ruler(),
    h('div.row.r-addr',
      field('side', 'DST ADDR:', 'Where it goes', out ? eventAddr : homeAddr),
      field('side', 'SRC ADDR:', 'Where it is picked up', out ? homeAddr : eventAddr)),
    h('div.row.r-meta',
      field('top', 'Weight:', 'in kilograms', d.weight ? d.weight + ' kg' : '-'),
      field('top', 'Frame Size:', 'L × W × H in cm', dims),
      field('top', 'QoS Class:', 'EF = must arrive, AF = should arrive, BE = nice to have',
        d.qos ? [h('span.qos', d.qos), h('span.qosd', QOS[d.qos][1])] : '-'),
      field('top', 'Value:', 'Estimated worth in CHF, relevant for Carnet ATA',
        d.value ? 'CHF ' + d.value : '-')),
    h('div.row.r-who',
      field('side', 'Reply-To:', 'Who to call about this', contact.length ? contact : '-'),
      field('side', 'Payload:', 'What is inside', dash(d.payload))),
    h('div.row.r-opt',
      field('side', 'Options:', 'Variable length, additional notes', options)),
    h('div.foot',
      h('div', h('b', 'FCS: ' + d.fcs), ' Frame check sequence - ID of this transport sheet'),
      h('div', `Label lost or found? ${CONFIG.collectorMail}`))));
}

function render() {
  const d = readForm();
  $('labels').replaceChildren(buildLabel(d, 'out'), buildLabel(d, 'back'));
}

/* ---------- transport sheet (mail backup) ---------- */

function sheetText(d) {
  const contact = [d.cName, d.cDect && 'DECT ' + d.cDect, d.cMatrix && 'Matrix ' + d.cMatrix,
    d.cPhone && 'Phone ' + d.cPhone].filter(Boolean).join(' / ');
  const lines = [
    'Transalpin VAN-Transport-Protocol - transport sheet',
    '',
    `FCS (ID):   ${d.fcs}`,
    `DST ADDR:   ${d.dstLocation} / Habitat: ${d.dstHabitat} / Assembly: ${d.dstAssembly}`,
    `SRC ADDR:   ${d.srcAddr}`,
    `PAYLOAD:    ${d.payload}`,
    `WEIGHT:     ${d.weight} kg`,
    `FRAME SIZE: ${d.dimL} x ${d.dimW} x ${d.dimH} cm (L x W x H)`,
    `QOS CLASS:  ${d.qos}${QOS[d.qos] ? ` (${QOS[d.qos][1]})` : ''}`,
    `VALUE:      CHF ${d.value}`,
    `REPLY-TO:   ${contact}`,
    `OPTIONS:    ${d.flags.join(', ') || '-'}`,
    `NOTES:      ${d.notes.replace(/\s*\n\s*/g, ' | ') || '-'}`,
    '',
    'Machine-readable copy, please leave as is:',
    'VTP1 ' + JSON.stringify(d),
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
  restore();
  render();

  document.addEventListener('input', () => { save(); render(); });

  $('form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate('formError')) return;
    render();
    window.print();
  });

  window.addEventListener('afterprint', () => {
    if (!$('form').checkValidity()) return;
    $('mailNudge').hidden = false;
    $('mail').classList.add('highlight');
    $('mail').closest('.step').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('btnMail').addEventListener('click', () => {
    if (!validate('mailError')) return;
    const email = $('email');
    if (!email.value.trim() || !email.checkValidity()) {
      showError('mailError', 'Please enter your own e-mail address first, so the backup also lands in your inbox.');
      email.focus();
      return;
    }
    const d = readForm();
    const subject = `[Transalpin VTP] ${d.dstAssembly} - ${d.cName} - ${d.payload} (${d.fcs})`;
    location.href = `mailto:${encodeURIComponent(email.value.trim())}`
      + `?cc=${encodeURIComponent(CONFIG.collectorMail)}`
      + `&subject=${encodeURIComponent(subject)}`
      + `&body=${encodeURIComponent(sheetText(d))}`;
  });

  $('btnCopy').addEventListener('click', async () => {
    if (!validate('mailError')) return;
    const text = sheetText(readForm());
    try {
      await navigator.clipboard.writeText(text);
      $('btnCopy').textContent = 'Copied ✓';
      setTimeout(() => { $('btnCopy').textContent = 'Copy sheet as text'; }, 2000);
    } catch {
      showError('mailError', 'Copying was blocked by the browser. Please use "Open e-mail draft" instead.');
    }
  });

  $('btnNew').addEventListener('click', () => {
    if (!confirm('Start the next item? Addresses and contact are kept; content, size, QoS and options are cleared.\n\nDid you already mail the sheet for the current item?')) return;
    for (const id of PER_ITEM_FIELDS) $(id).value = '';
    for (const el of document.querySelectorAll('input[name=qos], input[name=flag], #packed')) el.checked = false;
    $('form').classList.remove('validated');
    $('mail').classList.remove('highlight');
    $('mailNudge').hidden = true;
    showError('formError', '');
    showError('mailError', '');
    save();
    render();
    $('payload').focus();
  });
}

init();
