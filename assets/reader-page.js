// Shared page engine for the "screenshot or SMS → act" agents (#13, #14, #23).
// Each agent passes a config: its kind, fields, how an item becomes a calendar
// event, and how a saved item is summarised. Results are editable before use;
// the saved list lives on this phone only.
import { icsCalendar } from './lib.js';
import { loadBitmap, toJpeg, download } from './image.js';
import { newId } from './store.js';

const $ = (id) => document.getElementById(id);

function listStore(kind) {
  const key = `a100:items:${kind}`;
  return {
    all() { try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : []; } catch { return []; } },
    save(list) { try { localStorage.setItem(key, JSON.stringify(list)); return true; } catch { return false; } },
  };
}

function fieldInput(f, value) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const id = `f-${f.key}-${Math.random().toString(36).slice(2, 7)}`;
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = f.label;
  let input;
  if (f.type === 'select') {
    input = document.createElement('select');
    for (const [v, t] of Object.entries(f.options)) input.append(new Option(t, v, false, v === value));
  } else {
    input = document.createElement('input');
    input.type = f.type || 'text';
    if (f.type === 'number') input.inputMode = 'decimal';
    input.value = value ?? '';
  }
  input.id = id;
  input.dataset.key = f.key;
  wrap.append(label, input);
  if (f.hint) {
    const h = document.createElement('span');
    h.className = 'note';
    h.textContent = f.hint;
    wrap.append(h);
  }
  return wrap;
}

function readCard(card, fields) {
  const item = {};
  for (const f of fields) {
    const el = card.querySelector(`[data-key="${f.key}"]`);
    const v = el.value.trim();
    item[f.key] = f.type === 'number' ? (v === '' ? null : Number(v)) : v || null;
  }
  return item;
}

export function startReader(cfg) {
  const store = listStore(cfg.kind);
  let image = null;
  let pending = Promise.resolve(); // photo still being shrunk

  // ---- input ----
  const showThumb = (file) => {
    $('thumb').innerHTML = '';
    const fig = document.createElement('figure');
    fig.append(Object.assign(document.createElement('img'), { alt: 'התמונה שצירפתם', src: URL.createObjectURL(file) }));
    $('thumb').append(fig);
  };
  const takeFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    showThumb(file);
    pending = loadBitmap(file).then((bmp) => { image = toJpeg(bmp, 1600); });
  };
  $('file').addEventListener('change', (e) => { takeFile(e.target.files[0]); e.target.value = ''; });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => takeFile(e.dataTransfer.files[0]));

  $('go').addEventListener('click', async () => {
    await pending.catch(() => {});
    const text = $('text').value.trim();
    $('error').textContent = '';
    if (!image && !text) { $('error').textContent = 'צרפו צילום או הדביקו את ההודעה.'; return; }
    $('go').disabled = true;
    $('status').textContent = 'קורא…';
    try {
      const res = await fetch('/api/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: cfg.kind, text: text || undefined, image: image ? { data: image.data, mediaType: image.mediaType } : undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'לא הצלחנו לקרוא.');
      renderFound(json.items);
    } catch (err) {
      $('error').textContent = err.message;
    } finally {
      $('go').disabled = false;
      $('status').textContent = '';
    }
  });

  // ---- results (editable) ----
  function renderFound(items) {
    const box = $('found');
    box.innerHTML = '';
    $('results').hidden = false;
    if (!items.length) {
      box.textContent = cfg.emptyText;
      $('actions').hidden = true;
      return;
    }
    $('actions').hidden = false;
    for (const it of items) {
      const card = document.createElement('div');
      card.className = it.conf < 0.8 ? 'q' : 'q sure';
      if (it.conf < 0.8) {
        const w = document.createElement('div');
        w.className = 'why';
        w.textContent = 'לא בטוחים בכל הפרטים: בדקו לפני השמירה.';
        card.append(w);
      }
      for (const f of cfg.fields) card.append(fieldInput(f, it[f.key]));
      if (cfg.extra) card.append(cfg.extra(card));
      box.append(card);
    }
  }

  const currentItems = () => [...$('found').children].filter((c) => c.classList.contains('q')).map((c) => readCard(c, cfg.fields));

  $('cal').addEventListener('click', () => {
    const items = currentItems();
    const events = items.map(cfg.toEvent).filter(Boolean);
    if (!events.length) { $('act-status').textContent = cfg.needDateText || 'חסר תאריך. מלאו אותו ונסו שוב.'; return; }
    download(`${cfg.kind}.ics`, icsCalendar(events), 'text/calendar;charset=utf-8');
    $('act-status').textContent = `קובץ יומן עם ${events.length} ${events.length === 1 ? 'אירוע' : 'אירועים'} ירד. פתחו אותו כדי להוסיף ליומן.`;
  });

  $('save').addEventListener('click', () => {
    const items = currentItems().map((it) => ({ ...it, id: newId(), savedAt: new Date().toISOString() }));
    const ok = store.save([...items, ...store.all()]);
    $('act-status').textContent = ok ? 'נשמר ברשימה בטלפון הזה ✓' : 'לא הצלחנו לשמור בטלפון.';
    renderSaved();
  });

  // ---- saved list ----
  function renderSaved() {
    const list = store.all().sort(cfg.sort);
    $('saved').hidden = !list.length;
    const box = $('saved-list');
    box.innerHTML = '';
    for (const it of list) {
      const row = document.createElement('div');
      row.className = 'match';
      const main = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = cfg.title(it);
      const meta = document.createElement('div');
      meta.className = 'note';
      meta.textContent = cfg.meta(it);
      main.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'row';
      for (const [label, fn] of cfg.savedActions ? cfg.savedActions(it) : []) {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn ghost small', textContent: label });
        b.addEventListener('click', () => { store.save(store.all().map((x) => (x.id === it.id ? fn(x) : x))); renderSaved(); });
        actions.append(b);
      }
      const del = Object.assign(document.createElement('button'), { type: 'button', className: 'btn ghost small', textContent: 'מחיקה' });
      del.addEventListener('click', () => {
        if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'בטוח?'; return; }
        store.save(store.all().filter((x) => x.id !== it.id));
        renderSaved();
      });
      actions.append(del);
      row.append(main, actions);
      box.append(row);
    }
  }
  renderSaved();
}
