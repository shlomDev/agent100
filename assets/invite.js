// Agent #25 — invitation → "they gave you ₪X" → calendar.
import { matchInvite, icsEvent } from './lib.js';
import { loadBitmap, toJpeg, download } from './image.js';
import { notebooks } from './store.js';

const $ = (id) => document.getElementById(id);
const ils = (n) => `${Math.round(Number(n) || 0).toLocaleString('he-IL')} ₪`;
const TYPE = { wedding: 'חתונה', bar_mitzvah: 'בר מצווה', bat_mitzvah: 'בת מצווה', brit: 'ברית', henna: 'חינה', birthday: 'יום הולדת', other: 'אירוע' };
const heDate = (iso) => iso.split('-').reverse().join('.');
let invite = null;
let top = null;

async function read(file) {
  $('error').textContent = '';
  $('thumb').innerHTML = '';
  const img = Object.assign(document.createElement('img'), { alt: 'ההזמנה', src: URL.createObjectURL(file) });
  const fig = document.createElement('figure');
  fig.append(img);
  $('thumb').append(fig);
  $('status').textContent = 'קורא את ההזמנה…';
  try {
    const jpeg = toJpeg(await loadBitmap(file), 1400);
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: { data: jpeg.data, mediaType: jpeg.mediaType } }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'לא הצלחנו לקרוא את ההזמנה.');
    invite = json;
    showEvent();
  } catch (err) {
    $('error').textContent = err.message;
  } finally {
    $('status').textContent = '';
  }
}

function showEvent() {
  $('event').hidden = false;
  const bits = [TYPE[invite.eventType] || 'אירוע', invite.venue, invite.city, invite.time && `בשעה ${invite.time}`].filter(Boolean);
  $('event-line').textContent = bits.join(' · ');
  $('people').value = invite.people.join(', ');
  $('when').value = invite.date || '';
  $('date-text').textContent = invite.date ? '' : invite.dateText ? `בהזמנה כתוב: ${invite.dateText}. בחרו את התאריך הלועזי.` : '';
  match();
}

function match() {
  const people = $('people').value.split(',').map((s) => s.trim()).filter(Boolean);
  const saved = notebooks.all();
  const hits = matchInvite(people, saved);
  const box = $('matches');
  box.innerHTML = '';
  $('answer').hidden = false;
  top = hits[0] || null;
  if (!saved.length) {
    box.innerHTML = '<p class="note">עוד לא שמרתם מחברות בטלפון הזה. <a href="/notebook">סרקו את מחברת המעטפות (סוכן 24)</a> ואז נדע כמה כל אחד נתן.</p>';
  } else if (!hits.length) {
    const p = document.createElement('p');
    p.textContent = 'לא מצאנו אותם במחברות ששמרתם. אולי הם לא היו באירועים שלכם, או שהשם כתוב אחרת: נסו לתקן את השם למעלה.';
    box.append(p);
  } else {
    for (const h of hits.slice(0, 5)) {
      const div = document.createElement('div');
      div.className = 'match';
      const who = document.createElement('strong');
      who.textContent = h.row.name;
      const amt = document.createElement('span');
      amt.className = 'amt';
      amt.textContent = h.row.amount == null ? '—' : ils(h.row.amount);
      const src = document.createElement('span');
      src.className = 'src';
      src.textContent = `${h.notebook.title}${h.notebook.date ? `, ${heDate(h.notebook.date)}` : ''}${h.score < 0.95 ? ' · התאמה חלקית, בדקו שזה אותו אדם' : ''}${h.row.returned ? ` · כבר החזרתם ${ils(h.row.returned.amount)}` : ''}`;
      div.append(who, amt, src);
      box.append(div);
    }
  }
  $('gift').value = top?.row.amount ?? '';
  $('returned').hidden = !top;
  if (top) $('answer-status').textContent = `הם נתנו לכם ${ils(top.row.amount)}. ההצעה: אותו סכום (אתם מחליטים).`;
  else $('answer-status').textContent = '';
}

$('file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) read(f); });
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) read(f); });
$('people').addEventListener('change', match);

$('cal').addEventListener('click', () => {
  const date = $('when').value;
  if (!date) { $('answer-status').textContent = 'בחרו תאריך קודם.'; $('when').focus(); return; }
  const who = $('people').value || 'אירוע';
  const gift = $('gift').value ? `מתנה: ${ils($('gift').value)}` : '';
  const ics = icsEvent({
    title: `${TYPE[invite?.eventType] || 'אירוע'}: ${who}`,
    date,
    description: [gift, invite?.venue, invite?.city, invite?.time && `בשעה ${invite.time}`].filter(Boolean).join(' · '),
  });
  download('event.ics', ics, 'text/calendar;charset=utf-8');
  $('answer-status').textContent = 'קובץ היומן ירד. פתחו אותו כדי להוסיף. יש בו תזכורת ערב קודם.';
});

$('returned').addEventListener('click', () => {
  if (!top) return;
  const nb = notebooks.all().find((x) => x.id === top.notebook.id);
  const idx = nb ? nb.rows.findIndex((r) => r.name === top.row.name && r.amount === top.row.amount) : -1;
  const ok = idx >= 0 && notebooks.markReturned(nb.id, idx, { amount: Number($('gift').value) || null, date: $('when').value || null, event: $('people').value });
  $('answer-status').textContent = ok ? 'נרשם בטלפון: החזרתם ✓' : 'לא הצלחנו לרשום.';
});
