# Live dashboard template

One script (`dashboard.js`), one stylesheet (`dashboard.css`) and a JSON config. Point it at any JSON endpoint and choose widgets. No build step, no libraries, works under a strict Content-Security-Policy (no inline script needed).

```html
<link rel="stylesheet" href="dashboard.css">
<div id="dash"></div>
<script src="dashboard.js" data-config="presets/trading.json" defer></script>
```

## Presets

| Preset | Data | Shows |
|---|---|---|
| `trading.json` | built-in simulation (`"source": { "demo": "trading" }`), always labelled demo | price ticker, equity + P&L chart, positions, KPIs, orders feed, news |
| `agent.json` | `../data/state.json` (the Agent $100 ledger) | paper wallet, current job, KPIs, every request |
| `zuzei-live.json` | `/api/live` on Zuzei | Hebrew, right-to-left, anonymous totals |

## Config

```jsonc
{
  "title": "Trading desk", "subtitle": "…", "dir": "rtl", "lang": "he",
  "currency": "$", "currencyAfter": false,
  "banner": "text shown under the header",
  "source": {
    "url": "/api/data",      // same-origin JSON, polled
    "every": 30,             // seconds
    "auth": "bearer",        // optional: asks for a token, sends Authorization: Bearer …
    "updatedAt": "meta.ts",  // path to a timestamp (default "updatedAt")
    "idleAfter": 1800        // seconds without updates before "Idle"
  },
  "widgets": [ … ]
}
```

Values are **paths** into the data: `equity`, `totals.letters`, `totals.cat:spam`, `orders` (array), `jobs[].events[]` (flattened).

| Widget | Keys |
|---|---|
| `hero` | `label`, `value`, `format`, `chips[{value, format, prefix, suffix, tone:"auto"}]`, `series` (numbers), `baseline`, `splitDecimals` |
| `kpis` | `items[{label, value, format, tone}]` |
| `line` | `title`, `series` (array of rows), `y[{path, label}]`, `reverse`, `tall` |
| `feed` | `title`, `items`, `fields{time, title, tag, sub, amount, minus, link}`, `tones{value: "g"\|"l"\|"a"}`, `sortBy`, `limit`, `amountFormat` |
| `ranking` | `title`, `items` + `label` + `value` — or `from` + `prefix` (+ `labels`) to rank an object's keys |
| `ticker` | `items`, `label`, `value`, `change` |
| `card` | `label`, `title`, `note`, `steps[{name, amt, status: done\|now}]` |
| `text` | `title`, `lines[]` |

Every widget takes `size`: `full` (default), `two-thirds`, `half`, `third`. Formats: `money`, `money0`, `money4`, `signed`, `price`, `pct` (signed), `percent`, `int`, `time`, `date`.

**Hooking up a real app (e.g. a trading bot):** have it write or serve one JSON document shaped like the demo (`equity`, `history`, `prices`, `orders`, `positions`, `news`, `kpis`) and set `"source": { "url": "…", "every": 5 }`.
