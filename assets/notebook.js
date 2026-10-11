// Agent #24 — the envelope notebook. Photos → rows → ask only about doubtful
// cells (with the cropped scribble) → table → CSV / save on this phone.
import { reviewReasons, totalMismatch, bestMatches, toCSV, sum } from './lib.js';
import { loadBitmap, toJpeg, cropStrip, stripJpeg, download } from './image.js';
import { notebooks, handwriting, newId } from './store.js';

const $ = (id) => document.getElementById(id);
const ils = (n) => `${Math.round(Number(n) || 0).toLocaleString('he-IL')} ₪`;
const WHY = {
  'name-unsure': 'השם לא ברור',
  'name-missing': 'לא מצאנו שם',
  'amount-unsure': 'הסכום לא ברור',
  'amount-missing': 'לא מצאנו סכום',
  'amount-odd': 'סכום לא שגרתי',
  'name-not-in-list': 'השם לא ברשימת המוזמנים',
  'page-total': 'סכום העמוד לא מסתדר עם הסה"כ שכתוב בו',
};

const state = { pages: [], names: [], rows: [], reviewed: 0, id: newId() };

// ---------- inputs ----------
function addFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    state.pages.push({ file, status: 'new' });
  }
  renderThumbs();
}

function renderThumbs() {
  const box = $('thumbs');
  box.innerHTML = '';
  state.pages.forEach((p, i) => {
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.alt = `עמוד ${i + 1}`;
    img.src = p.preview || (p.preview = URL.createObjectURL(p.file));
    const cap = document.createElement('figcaption');
    cap.textContent = { new: `עמוד ${i + 1}`, reading: 'קורא…', done: '✓', error: 'שגיאה' }[p.status];
    fig.append(img, cap);
    box.append(fig);
  });
  $('read').disabled = !state.pages.length;
}

$('pages').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

$('guests').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  state.names = [...new Set(text.split(/\r?\n/).map((l) => l.split(/[,\t;]/)[0].replace(/^"|"$/g, '').trim()).filter((s) => s && s.length < 60))].slice(0, 400);
  $('guests-note').textContent = `נטענו ${state.names.length} שמות.`;
});

// ---------- reading ----------
async function readPage(p, i) {
  p.status = 'reading';
  renderThumbs();
  p.bitmap = p.bitmap || (await loadBitmap(p.file));
  const jpeg = toJpeg(p.bitmap);
  const res = await fetch('/api/notebook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: { data: jpeg.data, mediaType: jpeg.mediaType }, examples: handwriting.forRequest(6), names: state.names }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'לא הצלחנו לקרוא את העמוד.');
  p.rows = json.rows.map((r) => ({ ...r, page: i, original: { name: r.name, amount: r.amount } }));
  p.total = json.total;
  p.status = 'done';
  renderThumbs();
}

$('read').addEventListener('click', async () => {
  $('error').textContent = '';
  $('read').disabled = true;
  const todo = state.pages.map((p, i) => [p, i]).filter(([p]) => p.status !== 'done');
  let done = 0;
  const failures = [];
  const worker = async () => {
    while (todo.length) {
      const [p, i] = todo.shift();
      $('status').textContent = `קורא עמוד ${done + 1} מתוך ${state.pages.length}… (כחצי דקה לעמוד)`;
      try { await readPage(p, i); } catch (err) { p.status = 'error'; failures.push(`עמוד ${i + 1}: ${err.message}`); renderThumbs(); }
      done++;
    }
  };
  await Promise.all([worker(), worker()]);
  $('status').textContent = '';
  if (failures.length) $('error').textContent = failures.join(' ');
  $('read').disabled = false;
  buildReview();
});

// ---------- review: only the doubtful cells ----------
function buildReview() {
  state.rows = state.pages.flatMap((p) => p.rows || []);
  if (!state.rows.length) return;
  for (const p of state.pages) {
    if (!p.rows) continue;
    const mismatch = totalMismatch(p.rows, p.total);
    p.mismatch = mismatch;
    for (const r of p.rows) {
      r.reasons = reviewReasons(r, { names: state.names });
      if (mismatch && !r.reasons.length && r.conf.amount < 0.97) r.reasons.push('page-total');
      r.checked = !r.reasons.length;
    }
  }
  renderQueue();
  renderResult();
}

function choiceButtons(values, current, field, fmt = (v) => v) {
  const box = document.createElement('div');
  box.className = 'choices';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', field === 'name' ? 'אפשרויות לשם' : 'אפשרויות לסכום');
  for (const v of [...new Set(values.filter((x) => x !== null && x !== '' && x !== undefined))]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.field = field;
    b.dataset.value = String(v);
    b.textContent = fmt(v);
    b.setAttribute('aria-pressed', String(v === current));
    box.append(b);
  }
  return box;
}

function renderQueue() {
  const open = state.rows.filter((r) => !r.checked);
  const q = $('queue');
  q.innerHTML = '';
  $('review').hidden = false;
  $('review-note').textContent = open.length
    ? `${open.length} מתוך ${state.rows.length} שורות צריכות את העין שלכם. כל השאר נקרא בביטחון.`
    : `כל ${state.rows.length} השורות ברורות ✓`;
  for (const r of open) {
    const card = document.createElement('div');
    card.className = 'q';
    const why = document.createElement('div');
    why.className = 'why';
    why.textContent = `עמוד ${r.page + 1} · ${r.reasons.map((x) => WHY[x]).join(' · ')}`;
    const strip = cropStrip(state.pages[r.page].bitmap, r.y);
    strip.setAttribute('role', 'img');
    strip.setAttribute('aria-label', 'השורה כפי שנכתבה ביד');
    const guest = state.names.length && r.name ? bestMatches(r.name, state.names, 2, 0.55).map((m) => m.name) : [];
    const names = choiceButtons([r.name, ...r.alt.name, ...guest], r.name, 'name');
    const amounts = choiceButtons([r.amount, ...r.alt.amount], r.amount, 'amount', (v) => ils(v));
    const edit = document.createElement('div');
    edit.className = 'edit';
    const nameIn = Object.assign(document.createElement('input'), { type: 'text', value: r.name, maxLength: 80 });
    nameIn.setAttribute('aria-label', 'שם');
    const amtIn = Object.assign(document.createElement('input'), { type: 'number', inputMode: 'numeric', value: r.amount ?? '' });
    amtIn.setAttribute('aria-label', 'סכום בש"ח');
    edit.append(nameIn, amtIn);
    const actions = document.createElement('div');
    actions.className = 'row';
    const ok = Object.assign(document.createElement('button'), { type: 'button', className: 'btn small', textContent: 'נכון, הלאה' });
    actions.append(ok);
    card.append(why, strip, names, amounts, edit, actions);
    q.append(card);

    card.addEventListener('click', (e) => {
      const b = e.target.closest('.choices button');
      if (!b) return;
      for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(x === b));
      if (b.dataset.field === 'name') nameIn.value = b.dataset.value;
      else amtIn.value = b.dataset.value;
    });
    ok.addEventListener('click', () => {
      const name = nameIn.value.trim();
      const amount = amtIn.value === '' ? null : Math.round(Number(amtIn.value));
      if (!name) { nameIn.focus(); return; }
      const changed = name !== r.original.name || amount !== r.original.amount;
      r.name = name;
      r.amount = amount;
      r.checked = true;
      state.reviewed++;
      // Teach the agent this writer's hand: keep the crop + right reading on the phone.
      if (changed) handwriting.add({ dataUrl: stripJpeg(strip).dataUrl, text: `${name}${amount != null ? ` · ${amount}` : ''}` });
      renderQueue();
      renderResult();
      renderSaved();
    });
  }
}

// ---------- result ----------
function renderResult() {
  $('result').hidden = false;
  const rows = state.rows;
  const open = rows.filter((r) => !r.checked).length;
  $('kpis').innerHTML = '';
  for (const [v, label] of [[rows.length, 'שורות'], [ils(sum(rows)), 'סה"כ'], [open ? `${open}` : '✓', open ? 'עוד לבדוק' : 'הכל נבדק']]) {
    const d = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = v;
    const s = document.createElement('span');
    s.textContent = label;
    d.append(b, s);
    $('kpis').append(d);
  }
  const alerts = $('alerts');
  alerts.innerHTML = '';
  state.pages.forEach((p, i) => {
    if (!p.rows) return;
    const m = totalMismatch(p.rows, p.total);
    if (!m) return;
    const a = document.createElement('p');
    a.className = 'alert';
    a.textContent = `עמוד ${i + 1}: כתוב סה"כ ${ils(m.written)}, והשורות מסתכמות ב-${ils(m.counted)}. כנראה שסכום אחד נקרא לא נכון.`;
    alerts.append(a);
  });
  const tbody = $('table').tBodies[0];
  tbody.innerHTML = '';
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (!r.checked) tr.className = 'flag';
    for (const [v, cls] of [[i + 1], [r.name], [r.amount == null ? '—' : ils(r.amount), 'amt'], [r.note || '']]) {
      const td = document.createElement('td');
      if (cls) td.className = cls;
      td.textContent = v;
      tr.append(td);
    }
    tbody.append(tr);
  });
  $('table').tFoot.innerHTML = `<tr><td></td><td>סה"כ</td><td class="amt">${ils(sum(rows))}</td><td></td></tr>`;
}

// ASCII file names: some mobile browsers drop Hebrew names and save "download".
const fileName = () => `notebook-${new Date().toISOString().slice(0, 10)}.csv`;
const cleanRows = () => state.rows.map(({ name, amount, note }) => ({ name, amount, note }));

$('csv').addEventListener('click', () => {
  const title = $('title').value.trim() || 'מחברת';
  download(fileName(), toCSV(cleanRows(), { title }), 'text/csv;charset=utf-8');
});

$('save').addEventListener('click', () => {
  const ok = notebooks.upsert({ id: state.id, title: $('title').value.trim() || 'מחברת', date: $('date').value || null, rows: cleanRows(), savedAt: new Date().toISOString() });
  $('save-status').textContent = ok ? 'נשמר בטלפון הזה ✓' : 'לא הצלחנו לשמור. ייתכן שהאחסון בדפדפן מלא או חסום.';
  renderSaved();
});

// ---------- saved notebooks ----------
function renderSaved() {
  const list = notebooks.all();
  $('hw-count').textContent = handwriting.all().length;
  $('saved').hidden = !list.length && !handwriting.all().length;
  const box = $('saved-list');
  box.innerHTML = '';
  for (const nb of list) {
    const div = document.createElement('div');
    div.className = 'match';
    const t = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = nb.title;
    const owed = nb.rows.filter((r) => !r.returned).length;
    const meta = document.createElement('div');
    meta.className = 'note';
    meta.textContent = `${nb.rows.length} איש · ${ils(sum(nb.rows))}${nb.date ? ` · ${nb.date.split('-').reverse().join('.')}` : ''} · עוד לא החזרנו ל-${owed}`;
    t.append(strong, meta);
    const actions = document.createElement('div');
    actions.className = 'row';
    const exp = Object.assign(document.createElement('button'), { type: 'button', className: 'btn ghost small', textContent: 'אקסל' });
    exp.addEventListener('click', () => download(fileName(), toCSV(nb.rows, { title: nb.title }), 'text/csv;charset=utf-8'));
    const del = Object.assign(document.createElement('button'), { type: 'button', className: 'btn ghost small', textContent: 'מחיקה' });
    del.addEventListener('click', () => {
      if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'בטוח? לחצו שוב'; return; }
      notebooks.remove(nb.id);
      renderSaved();
    });
    actions.append(exp, del);
    div.append(t, actions);
    box.append(div);
  }
}

$('hw-clear').addEventListener('click', () => { handwriting.clear(); renderSaved(); });
renderSaved();
