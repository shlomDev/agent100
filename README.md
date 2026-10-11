# Agent 100

**מאה סוכנים. אחד לכל סידור.** Specific AI agents for Israelis: each one does one Israeli job and does it well. Hebrew, Israeli rules, and the user's data stays on their phone.

The site is a board of 100 numbered "queue tickets" (מספר בתור): live agents, coming soon, free slots.

## Live agents

| # | Agent | Where |
|---|---|---|
| 1–6 | Money back: spam, store refund, online cancellation, defect, subscription, rental deposit | [Zuzei](https://github.com/shlomDev/zuzei) |
| 24 | **מחברת המעטפות**: photos of the handwritten gift notebook → table of who gave how much | `/notebook` |
| 25 | **הזמנה ← כמה הם נתנו**: invitation screenshot → "they gave you ₪X" → calendar | `/invite` |

Coming soon (#7–#23): flight delay compensation, bank fees, price hikes, parking appeals, SMS bill reminders, forms from a photo, and more. The list lives in `assets/catalog.js`.

## How #24 reads handwriting

1. Each photo is shrunk on the phone (≤1600px JPEG) and sent to `/api/notebook`, one page per call.
2. Claude reads every row and returns, per cell, a **confidence** and up to two **alternatives**, plus the row's position on the page and any written page total.
3. The page asks only about rows that need it (`assets/lib.js → reviewReasons`): unclear name or amount, an unusual amount (not a typical gift sum), a name not on the guest list, or a page whose rows don't add up to the written total. It shows the cropped handwriting with the alternatives as buttons.
4. **Learning your handwriting:** every correction keeps a small crop + the right reading **on the phone** (max 30). The newest 6 go along with the next page, so the model sees how this writer forms letters and digits. No model training, nothing stored on the server.
5. Optional guest list (CSV/TXT, one name per line) resolves names.
6. Export to Excel (CSV with BOM), or save on the phone for #25.

#25 reads only the **text** of an invitation (no faces), then matches the names against saved notebooks on the phone (`matchInvite`: Hebrew-aware fuzzy matching), suggests the same amount, makes a calendar file with a reminder the evening before, and can mark "we gave back".

## Files

| Path | What |
|---|---|
| `index.html`, `assets/catalog.js`, `assets/catalog-page.js` | The board of 100 |
| `notebook.html`, `assets/notebook.js` | Agent #24 |
| `invite.html`, `assets/invite.js` | Agent #25 |
| `assets/lib.js` | Shared logic (names, amounts, review, CSV, calendar). Runs in the browser and in tests |
| `assets/image.js`, `assets/store.js` | Photo shrinking and cropping; on-phone storage |
| `api/notebook.js`, `api/invite.js`, `lib/vision.js` | Serverless functions: input checks → Claude vision → cleaned JSON |
| `lib/ratelimit.js`, `lib/http.js` | Per-IP daily limits (Upstash), cross-site check (from Zuzei) |

No inline scripts or styles: the Content-Security-Policy in `vercel.json` allows only this site's own files.

## Run, test, deploy

```
npm ci
npm test        # 20 tests
```

Deploy on **Vercel** (the agents need the serverless functions, so GitHub Pages isn't enough): New Project → `shlomDev/agent100` → Framework **Other** → Deploy. Then set:

| Env | |
|---|---|
| `ANTHROPIC_API_KEY` | required. Set a monthly spend limit in the Anthropic console |
| `A100_MODEL` | optional, default `claude-sonnet-5-5` |
| `A100_PAGES_PER_DAY`, `A100_INVITES_PER_DAY` | per-IP limits, default 60 / 30 |
| `A100_GLOBAL_DAILY_LIMIT` | optional cap for all users together |
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` (or Vercel KV vars) | makes the limits hold across instances |
| `A100_IP_SALT` | random string |

Cost: a notebook page is roughly one image plus a short JSON answer, a few cents with Sonnet. Check real usage in the Anthropic console after a test run.

After the first Vercel deploy, turn off GitHub Pages for this repo (Settings → Pages → None). It still serves the old Agent $100 dashboard, which now lives in [`shlomDev/agent-lab`](https://github.com/shlomDev/agent-lab).

## Before launch

- [ ] Test #24 with real notebook photos (several handwriting styles, a guest list, a page with a written total). Note what it misreads.
- [ ] Fill the placeholders in `privacy.html` (date, contact).
- [ ] A lawyer reviews `privacy.html`: notebooks contain guests' names and amounts (third-party data, processed by Anthropic).
