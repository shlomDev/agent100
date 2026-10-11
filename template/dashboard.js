/* Live dashboard template.
 *
 *   <link rel="stylesheet" href="dashboard.css">
 *   <div id="dash"></div>
 *   <script src="dashboard.js" data-config="presets/trading.json" defer></script>
 *
 * The config (JSON) names a data source and a list of widgets. Every value in a
 * widget is a path into the data: "equity", "totals.letters", "daily[]" (array),
 * "jobs[].events[]" (flattened). Widgets: hero, kpis, line, feed, ranking,
 * ticker, card, text. Sizes: "full" (default), "two-thirds", "half", "third".
 * Formats: money, money0, money4, signed, price, pct (signed), percent, int, time, date.
 *
 * Source: { "url": "/api/live", "every": 30, "auth": "bearer" } polls a JSON
 * URL (same origin), or { "demo": "trading" } runs a built-in simulation that
 * is always labelled as demo data.
 */
(() => {
  'use strict';
  const script = document.currentScript;
  const root = document.getElementById('dash') || document.body.appendChild(document.createElement('div'));

  // ---------- helpers ----------
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function get(obj, path) {
    if (path == null || path === '') return undefined;
    if (typeof path !== 'string') return path;
    let cur = [obj];
    let many = false;
    for (const part of path.split('.')) {
      const flat = part.endsWith('[]');
      const key = flat ? part.slice(0, -2) : part;
      cur = cur.map((o) => (o == null ? undefined : key ? o[key] : o));
      if (flat) {
        cur = cur.flatMap((v) => (Array.isArray(v) ? v : []));
        many = true;
      }
    }
    return many ? cur : cur[0];
  }

  let CFG = {};
  const locale = () => CFG.locale || (CFG.dir === 'rtl' ? 'he-IL' : 'en-US');
  function fmt(v, kind) {
    if (v == null || v === '' || Number.isNaN(v)) return '—';
    const n = Number(v);
    const cur = CFG.currency || '$';
    const sym = (s) => (CFG.currencyAfter ? `${s} ${cur}` : `${cur}${s}`);
    const neg = (x, f) => (x < 0 ? '−' : '') + sym(f(Math.abs(x)));
    switch (kind) {
      case 'money': return neg(n, (a) => a.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      case 'money0': return neg(n, (a) => Math.round(a).toLocaleString(locale()));
      case 'money4': return neg(n, (a) => a.toLocaleString(locale(), { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
      case 'signed': return (n >= 0 ? '+' : '−') + sym(Math.abs(n).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      case 'price': return n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: n < 10 ? 4 : 2 });
      case 'pct': return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
      case 'percent': return n.toFixed(1) + '%';
      case 'int': return Math.round(n).toLocaleString(locale());
      case 'time': { const d = new Date(v); return Number.isNaN(+d) ? String(v) : d.toTimeString().slice(0, 8); }
      case 'date': { const d = new Date(v); return Number.isNaN(+d) ? String(v) : d.toLocaleDateString(locale()); }
      default: return typeof v === 'number' ? n.toLocaleString(locale()) : String(v);
    }
  }
  const toneOf = (v, map) => {
    if (map && v in map) return map[v];
    const n = Number(v);
    return Number.isFinite(n) ? (n > 0 ? 'g' : n < 0 ? 'l' : '') : '';
  };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------- charts ----------
  function drawLine(canvas, seriesList, { baseline, labels = [] } = {}) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    const all = seriesList.flat().filter(Number.isFinite);
    if (baseline != null) all.push(baseline);
    if (all.length < 2) return;
    const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
    const pad = 6, L = 58;
    const len = Math.max(...seriesList.map((s) => s.length));
    const x = (i) => L + (w - L - pad * 2) * (len > 1 ? i / (len - 1) : 0);
    const y = (v) => pad + (h - pad * 2) * (1 - (v - lo) / span);
    const colors = [css('--accent'), css('--gain'), css('--warn'), css('--loss')];
    g.direction = 'ltr';
    g.textAlign = 'left';
    g.font = `11px ${css('--f-mono')}`;
    g.fillStyle = css('--muted');
    g.textBaseline = 'middle';
    g.strokeStyle = css('--line');
    g.setLineDash([4, 4]);
    [hi, lo].forEach((v) => { g.beginPath(); g.moveTo(L, y(v)); g.lineTo(w, y(v)); g.stroke(); g.fillText(fmt(v, labels[0] || 'num'), 0, y(v)); });
    if (baseline != null) { g.beginPath(); g.moveTo(L, y(baseline)); g.lineTo(w, y(baseline)); g.stroke(); }
    g.setLineDash([]);
    seriesList.forEach((s, k) => {
      const pts = s.map((v, i) => [x(i), y(v)]).filter(([, py]) => Number.isFinite(py));
      if (pts.length < 2) return;
      if (k === 0) {
        g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
        g.lineTo(pts.at(-1)[0], h); g.lineTo(pts[0][0], h); g.closePath();
        g.globalAlpha = 0.12; g.fillStyle = colors[0]; g.fill(); g.globalAlpha = 1;
      }
      g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.strokeStyle = colors[k % colors.length]; g.lineWidth = 2; g.stroke();
      const [ex, ey] = pts.at(-1);
      g.beginPath(); g.arc(ex - 2, ey, 3.5, 0, Math.PI * 2); g.fillStyle = colors[k % colors.length]; g.fill();
    });
  }

  // ---------- widgets: each returns { node, update(data) } ----------
  const W = {
    hero(c) {
      const node = el('div', 'panel');
      node.append(el('div', 'label', c.label || ''));
      const big = el('div', 'big', '—');
      const chips = el('div', 'chips');
      const canvas = el('canvas', 'chart');
      node.append(big, chips);
      if (c.series) node.append(canvas);
      let prev = null, series = [];
      return {
        node,
        update(d) {
          const v = Number(get(d, c.value));
          const text = fmt(v, c.format || 'money');
          if (c.splitDecimals && /\.\d{3,}/.test(String(get(d, c.value)))) {
            const [a, b] = String(Number(get(d, c.value)).toFixed(6)).split('.');
            big.innerHTML = '';
            big.append(fmt(Number(`${a}.${b.slice(0, 2)}`), c.format || 'money'), el('small', '', b.slice(2)));
          } else big.textContent = text;
          if (prev != null && v !== prev) {
            big.classList.remove('up', 'down'); void big.offsetWidth;
            big.classList.add(v > prev ? 'up' : 'down');
            setTimeout(() => big.classList.remove('up', 'down'), 700);
          }
          prev = v;
          chips.innerHTML = '';
          for (const ch of c.chips || []) {
            const val = get(d, ch.value);
            if (val == null) continue;
            const chip = el('span', 'chip ' + (ch.tone === 'auto' ? toneOf(val) : ''), `${ch.prefix || ''}${fmt(val, ch.format)}${ch.suffix || ''}`);
            chips.append(chip);
          }
          if (c.series) {
            series = (get(d, c.series) || []).map((p) => Number(c.y ? get(p, c.y) : p));
            drawLine(canvas, [series], { baseline: c.baseline != null ? Number(get(d, String(c.baseline)) ?? c.baseline) : null, labels: [c.format || 'money'] });
          }
        },
        redraw() { if (c.series) drawLine(canvas, [series], { labels: [c.format || 'money'] }); },
      };
    },

    kpis(c) {
      const node = el('div', 'kpis');
      const cells = (c.items || []).map((it) => {
        const k = el('div', 'kpi');
        k.append(el('span', 'label', it.label));
        const b = el('b', '', '—');
        k.append(b);
        node.append(k);
        return [it, b];
      });
      return {
        node,
        update(d) {
          for (const [it, b] of cells) {
            const v = get(d, it.value);
            b.textContent = fmt(v, it.format);
            b.className = it.tone === 'auto' ? toneOf(v) : '';
          }
        },
      };
    },

    line(c) {
      const node = el('div', 'panel');
      node.append(el('div', 'label', c.title || ''));
      const canvas = el('canvas', 'chart' + (c.tall ? ' tall' : ''));
      const legend = el('div', 'legend');
      node.append(canvas, legend);
      const ys = Array.isArray(c.y) ? c.y : [c.y];
      const colors = ['--accent', '--gain', '--warn', '--loss'];
      ys.forEach((y, i) => {
        if (!y.label) return;
        const s = el('span');
        const sw = el('i'); sw.style.background = `var(${colors[i]})`;
        s.append(sw, y.label);
        legend.append(s);
      });
      let last = [];
      return {
        node,
        update(d) {
          let rows = get(d, c.series) || [];
          if (c.reverse) rows = [...rows].reverse();
          last = ys.map((y) => rows.map((r) => Number(get(r, y.path || y)) || 0));
          drawLine(canvas, last, { labels: [c.format || 'int'] });
        },
        redraw() { drawLine(canvas, last, { labels: [c.format || 'int'] }); },
      };
    },

    feed(c) {
      const node = el('div', 'panel');
      const head = el('div', 'feed-head');
      const count = el('span', 'label mono');
      head.append(el('span', 'label', c.title || ''), count);
      const list = el('ol', 'feed');
      node.append(head, list);
      const f = c.fields || {};
      return {
        node,
        update(d) {
          let items = get(d, c.items) || [];
          if (c.sortBy) items = [...items].sort((a, b) => String(get(b, c.sortBy)).localeCompare(String(get(a, c.sortBy))));
          count.textContent = `${items.length}`;
          list.innerHTML = '';
          if (!items.length) { list.append(el('li', 'empty', c.empty || 'Nothing yet.')); return; }
          for (const it of items.slice(0, c.limit || 60)) {
            const li = el('li', 'ev');
            li.append(el('time', '', fmt(get(it, f.time), 'time')));
            const what = el('div');
            const t = el('div', 't', get(it, f.title) ?? '');
            const tagV = get(it, f.tag);
            if (tagV != null && tagV !== '') t.append(el('span', `tag tone-${toneOf(tagV, c.tones) || ''}`, String(tagV)));
            what.append(t);
            const sub = get(it, f.sub);
            if (sub) what.append(el('div', 's', String(sub)));
            const href = get(it, f.link);
            if (href && /^https:\/\//.test(href)) {
              const a = el('a', 's', c.linkText || 'source ↗');
              a.href = href; a.target = '_blank'; a.rel = 'noopener';
              what.append(a);
            }
            li.append(what);
            // `amount` is shown as is; `minus` (e.g. a cost) is shown as a negative amount.
            let amtV = get(it, f.amount);
            if ((amtV == null || amtV === '') && f.minus && get(it, f.minus) != null) amtV = -Number(get(it, f.minus));
            const tone = toneOf(f.tone ? get(it, f.tone) : amtV, c.tones);
            li.append(el('div', `amt tone-${tone}`, amtV == null ? '' : fmt(amtV, c.amountFormat || 'money')));
            list.append(li);
          }
        },
      };
    },

    ranking(c) {
      const node = el('div', 'panel');
      node.append(el('span', 'label', c.title || ''));
      const box = el('div', 'rank ' + (c.tone || ''));
      node.append(box);
      return {
        node,
        update(d) {
          let rows;
          if (c.prefix != null) {
            const obj = get(d, c.from) || {};
            rows = Object.entries(obj)
              .filter(([k]) => k.startsWith(c.prefix) && !k.slice(c.prefix.length).includes(':'))
              .map(([k, v]) => [c.labels?.[k.slice(c.prefix.length)] || k.slice(c.prefix.length), Number(v)]);
          } else {
            rows = (get(d, c.items) || []).map((r) => [String(get(r, c.label)), Number(get(r, c.value))]);
          }
          rows = rows.filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1]).slice(0, c.limit || 6);
          box.innerHTML = '';
          if (!rows.length) { box.append(el('span', 'empty', c.empty || 'Nothing yet.')); return; }
          const max = Math.max(...rows.map(([, v]) => Math.abs(v))) || 1;
          for (const [k, v] of rows) {
            const r = el('div', 'row');
            r.append(el('span', '', k), el('span', 'v', fmt(v, c.format)));
            const tr = el('div', 'track'); const bar = el('i'); bar.style.width = `${(Math.abs(v) / max) * 100}%`;
            tr.append(bar); r.append(tr); box.append(r);
          }
        },
      };
    },

    ticker(c) {
      const node = el('div', 'ticker');
      const cells = new Map();
      return {
        node,
        update(d) {
          for (const it of get(d, c.items) || []) {
            const key = String(get(it, c.label));
            let cell = cells.get(key);
            if (!cell) {
              cell = { box: el('div', 'tick'), v: el('b'), chg: el('span', 'chg'), last: null };
              cell.box.append(el('span', 'label', key), cell.v, cell.chg);
              node.append(cell.box);
              cells.set(key, cell);
            }
            const v = Number(get(it, c.value));
            const ch = Number(get(it, c.change));
            cell.v.textContent = fmt(v, c.format || 'price');
            cell.chg.textContent = fmt(ch, 'pct');
            cell.chg.className = 'chg ' + toneOf(ch);
            if (cell.last != null && cell.last !== v) { cell.box.classList.remove('flash'); void cell.box.offsetWidth; cell.box.classList.add('flash'); }
            cell.last = v;
          }
        },
      };
    },

    card(c) {
      const node = el('div', 'panel card');
      node.setAttribute('aria-live', 'polite');
      node.append(el('div', 'label', c.label || ''));
      const h = el('h3'); const note = el('div', 'note'); const steps = el('ul', 'steps');
      node.append(h, note, steps);
      return {
        node,
        update(d) {
          h.textContent = get(d, c.title) || c.emptyTitle || '';
          note.textContent = get(d, c.note) || '';
          steps.innerHTML = '';
          for (const s of get(d, c.steps) || []) {
            const li = el('li', get(s, 'status') === 'done' ? 'done' : get(s, 'status') === 'now' ? 'now' : '');
            li.append(el('span', 'dot'), el('span', '', get(s, 'name') || ''), el('span', 'amt', get(s, 'amt') || ''));
            steps.append(li);
          }
        },
      };
    },

    text(c) {
      const node = el('div', 'panel');
      if (c.title) node.append(el('span', 'label', c.title));
      const body = el('div');
      node.append(body);
      for (const line of c.lines || []) body.append(el('p', '', line));
      return { node, update() {} };
    },
  };

  // ---------- demo data (always labelled as demo) ----------
  const DEMOS = {
    trading() {
      const sym = [['AAPL', 228], ['NVDA', 131], ['MSFT', 431], ['TSLA', 251], ['SPY', 574], ['BTC', 62400]];
      const prices = sym.map(([s, p]) => ({ symbol: s, open: p, price: p }));
      const pos = { AAPL: 40, NVDA: 120, SPY: 15 };
      let cash = 50000, equity0 = null, orders = [], news = [], history = [], n = 0, filled = 0, wins = 0;
      const notes = ['Momentum entry', 'Take profit', 'Stop loss', 'Rebalance', 'Mean reversion', 'Breakout'];
      function tick() {
        for (const p of prices) p.price = Math.max(0.01, p.price * (1 + (Math.random() - 0.5) * (p.symbol === 'BTC' ? 0.006 : 0.003)));
        if (Math.random() < 0.45) {
          const p = prices[Math.floor(Math.random() * 5)];
          const side = Math.random() < 0.5 ? 'BUY' : 'SELL';
          const qty = 1 + Math.floor(Math.random() * 20);
          const ok = Math.random() < 0.9;
          if (ok) {
            filled++;
            pos[p.symbol] = (pos[p.symbol] || 0) + (side === 'BUY' ? qty : -qty);
            cash += (side === 'BUY' ? -1 : 1) * qty * p.price;
            if (side === 'SELL' && Math.random() < 0.6) wins++;
          }
          orders.unshift({ t: new Date().toISOString(), symbol: p.symbol, side, qty, price: p.price, amount: (side === 'BUY' ? -1 : 1) * qty * p.price, status: ok ? 'FILLED' : 'REJECTED', note: `${notes[n++ % notes.length]} · ${qty} @ ${p.price.toFixed(2)}` });
          orders = orders.slice(0, 60);
        }
        if (Math.random() < 0.08) {
          news.unshift({ t: new Date().toISOString(), title: 'Sample headline — connect a news feed', src: 'demo' });
          news = news.slice(0, 20);
        }
        const value = (s) => (pos[s] || 0) * prices.find((p) => p.symbol === s).price;
        const positions = Object.keys(pos).filter((s) => pos[s]).map((s) => ({ symbol: `${s} × ${pos[s]}`, value: value(s) }));
        const equity = cash + Object.keys(pos).reduce((t, s) => t + value(s), 0);
        if (equity0 == null) equity0 = equity;
        history.push(equity); history = history.slice(-200);
        const sells = orders.filter((o) => o.side === 'SELL' && o.status === 'FILLED').length;
        return {
          equity, pnl: equity - equity0, pnlPct: ((equity - equity0) / equity0) * 100, history, start: equity0,
          prices: prices.map((p) => ({ symbol: p.symbol, price: p.price, chg: ((p.price - p.open) / p.open) * 100 })),
          orders, news, positions,
          kpis: { orders: n, filled, rejected: n - filled, winRate: sells ? (wins / sells) * 100 : 0, exposure: positions.reduce((t, p) => t + Math.abs(p.value), 0) },
          updatedAt: new Date().toISOString(),
        };
      }
      for (let i = 0; i < 60; i++) tick();
      return { tick, every: 2 };
    },
  };

  // ---------- boot ----------
  async function loadConfig() {
    if (window.DASH_CONFIG) return window.DASH_CONFIG;
    const url = script?.dataset.config;
    if (!url) throw new Error('No data-config on the dashboard script.');
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Config ${url}: HTTP ${r.status}`);
    return r.json();
  }

  function header(cfg) {
    const head = el('header', 'd-head');
    const brand = el('div', 'brand');
    brand.append(el('h1', '', cfg.title || 'Dashboard'));
    if (cfg.subtitle) brand.append(el('span', 'sub', cfg.subtitle));
    const status = el('div', 'd-status');
    const updated = el('span', 'd-updated');
    const live = el('span', 'd-live off');
    live.append(el('i'), document.createTextNode(cfg.liveText || 'Live'));
    status.append(updated, live);
    head.append(brand, status);
    return { head, updated, live };
  }

  function tokenGate(cfg, onToken, message) {
    root.innerHTML = '';
    const form = el('form', 'gate panel');
    form.append(el('h1', '', cfg.title || 'Dashboard'));
    form.append(el('p', 'sub', message || cfg.authText || 'Enter your access token.'));
    const input = el('input');
    input.type = 'password'; input.autocomplete = 'off'; input.id = 'dash-token';
    input.setAttribute('aria-label', cfg.authLabel || 'Access token');
    const btn = el('button', '', cfg.authButton || 'Open');
    btn.type = 'submit';
    form.append(input, btn);
    form.addEventListener('submit', (e) => { e.preventDefault(); if (input.value.trim()) onToken(input.value.trim()); });
    root.append(form);
    input.focus();
  }

  async function start() {
    let cfg;
    try {
      cfg = await loadConfig();
    } catch (err) {
      root.textContent = String(err.message || err);
      return;
    }
    CFG = cfg;
    if (cfg.dir) document.documentElement.dir = cfg.dir;
    if (cfg.lang) document.documentElement.lang = cfg.lang;
    if (cfg.pageTitle || cfg.title) document.title = cfg.pageTitle || cfg.title;

    const src = cfg.source || {};
    const tokenKey = `dash:token:${src.url}`;
    let token = null;
    if (src.auth === 'bearer') {
      try { token = sessionStorage.getItem(tokenKey); } catch { /* storage blocked */ }
      if (!token) return tokenGate(cfg, (t) => { try { sessionStorage.setItem(tokenKey, t); } catch { /* ignore */ } start(); });
    }

    root.innerHTML = '';
    const wrap = el('div', 'dash');
    const { head, updated, live } = header(cfg);
    wrap.append(head);
    const demo = src.demo && DEMOS[src.demo] ? DEMOS[src.demo]() : null;
    const bannerText = demo ? (cfg.demoBanner || 'Demo data: every number here is simulated.') : cfg.banner;
    const banner = el('div', 'd-banner', bannerText || '');
    banner.hidden = !bannerText;
    wrap.append(banner);
    const grid = el('div', 'd-grid');
    const widgets = (cfg.widgets || []).map((c) => {
      const make = W[c.type];
      if (!make) return null;
      const w = make(c);
      const cell = el('section', `w ${c.size || ''}`);
      if (c.heading) cell.append(el('h2', 'label', c.heading));
      cell.append(w.node);
      grid.append(cell);
      return w;
    }).filter(Boolean);
    wrap.append(grid);
    if (cfg.footer) wrap.append(el('p', 'd-updated', cfg.footer));
    root.append(wrap);

    let lastAt = null;
    const setLive = (on, text) => {
      live.classList.toggle('off', !on);
      live.lastChild.textContent = text || (on ? cfg.liveText || 'Live' : cfg.idleText || 'Idle');
    };
    function render(d) {
      for (const w of widgets) {
        try { w.update(d); } catch (err) { console.error('widget failed', err); }
      }
      lastAt = get(d, src.updatedAt || 'updatedAt') || new Date().toISOString();
      setLive(true);
    }
    setInterval(() => {
      if (!lastAt) return;
      const s = Math.max(0, Math.round((Date.now() - new Date(lastAt)) / 1000));
      updated.textContent = `${cfg.updatedText || 'updated'} ${s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`}`;
      if (src.idleAfter && s > src.idleAfter) setLive(false);
    }, 1000);
    addEventListener('resize', () => widgets.forEach((w) => w.redraw && w.redraw()));

    if (demo) {
      render(demo.tick());
      setInterval(() => render(demo.tick()), (demo.every || 2) * 1000);
      return;
    }
    async function poll() {
      try {
        const r = await fetch(src.url, { cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (r.status === 401 || r.status === 403) {
          try { sessionStorage.removeItem(tokenKey); } catch { /* ignore */ }
          return tokenGate(cfg, (t) => { try { sessionStorage.setItem(tokenKey, t); } catch { /* ignore */ } start(); }, cfg.authFailed || 'That token was refused. Try again.');
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        render(await r.json());
        banner.hidden = !bannerText; banner.className = 'd-banner'; banner.textContent = bannerText || '';
      } catch (err) {
        setLive(false, cfg.offlineText || 'Offline');
        banner.hidden = false; banner.className = 'd-banner err';
        banner.textContent = `${cfg.errorText || 'Could not load data'}: ${err.message}`;
      }
      setTimeout(poll, (src.every || 30) * 1000);
    }
    poll();
  }

  start();
})();
