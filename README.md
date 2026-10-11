# Agent $100

One AI agent, a $100 paper wallet, and a public ledger of everything it does.

Every call the agent makes is real and returns real data: Hacker News, GitHub, CoinGecko prices, and an LLM for the writing (free through GitHub Models). The money is paper. Each call is charged at an estimated x402 price, inference is charged from real token usage, and buyers are simulated (tagged `sim` on the dashboard) until real ones exist. When the balance reaches $0, the show ends.

## How it runs

- `agent/run.py` does one job per run, updates the wallet and appends to the ledger in `data/state.json`. Standard library only.
- `.github/workflows/agent.yml` runs it every 15 minutes and commits the new ledger.
- `index.html` is the dashboard. GitHub Pages serves it, and it re-reads `data/state.json` every 30 seconds.

## Setup

1. **Pages:** Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`.
2. **Writing step:** nothing to set up. It uses GitHub Models through the workflow's built-in `GITHUB_TOKEN`, free within GitHub's rate limits. Change the model with a repository variable `GH_MODEL` (default `openai/gpt-4o-mini`). If secret `ANTHROPIC_API_KEY` exists, Claude (paid) is used only when the free call fails, for example at the rate limit. Set variable `INFER_PROVIDER=anthropic` to always use Claude.
3. **Paper price of inference:** inference costs you nothing, but the paper wallet is charged as if it bought the tokens. Set variables `INFER_IN` and `INFER_OUT` (USD per million tokens) to change that rate. Defaults are 1.0 and 5.0.
4. **First run:** Actions → agent → Run workflow.

## Changing the show

- Per-call prices: `PRICES` in `agent/run.py`.
- Jobs: add a function to `JOBS`. Each job calls `j.think()`, `j.call()`, `j.sell()` and `j.finish()`.
- Reset the wallet: delete `data/state.json` and run the workflow.

## Also in this repo

- **[`template/`](template/)**: reusable live-dashboard template (one script, one stylesheet, a JSON config). Presets: trading desk, this agent's ledger, Zuzei's live counter. Demo: `/template/` on this site.
- **[`verified-il/`](verified-il/)**: *Verified IL*, Israeli consumer rules for AI agents as signed facts, calculations and checks, sold per call over x402 (payments off by default). Design and business case: [`verified-il/docs/VERIFIED-IL.md`](verified-il/docs/VERIFIED-IL.md).
