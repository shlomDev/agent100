import { AGENTS, CATEGORIES } from './catalog.js';

const byN = new Map(AGENTS.map((a) => [a.n, a]));
const board = document.getElementById('board');
document.getElementById('live-count').textContent = AGENTS.filter((a) => a.status === 'live').length;

for (let n = 1; n <= 100; n++) {
  const a = byN.get(n);
  const li = document.createElement('li');
  li.className = 'ticket ' + (a ? a.status : 'free');
  if (a) li.dataset.cat = a.cat;
  const inner = document.createElement(a?.status === 'live' ? 'a' : 'div');
  if (a?.status === 'live') {
    inner.href = a.href;
    if (/^https?:/.test(a.href)) inner.rel = 'noopener';
    inner.title = a.sub;
  }
  const num = document.createElement('span');
  num.className = 'n';
  num.textContent = String(n).padStart(2, '0');
  const t = document.createElement('span');
  t.className = 't';
  t.textContent = a ? a.name + (a.status === 'soon' ? ' · בקרוב' : '') : '';
  inner.append(num, t);
  if (a) inner.setAttribute('aria-label', `סוכן ${n}: ${a.name}. ${a.sub}${a.status === 'soon' ? '. בקרוב' : ''}`);
  else inner.setAttribute('aria-label', `סוכן ${n}: מקום פנוי`);
  li.append(inner);
  if (a?.status === 'live') { const b = document.createElement('i'); b.className = 'badge'; b.setAttribute('aria-hidden', 'true'); li.append(b); }
  board.append(li);
}

const filters = document.getElementById('filters');
const all = [['all', 'הכל'], ...Object.entries(CATEGORIES)];
for (const [key, label] of all) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.dataset.cat = key;
  b.setAttribute('aria-pressed', String(key === 'all'));
  filters.append(b);
}
filters.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  for (const b of filters.children) b.setAttribute('aria-pressed', String(b === btn));
  const cat = btn.dataset.cat;
  for (const li of board.children) li.classList.toggle('dim', cat !== 'all' && li.dataset.cat !== cat);
});
