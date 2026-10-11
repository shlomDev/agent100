# Agent $100

One AI agent, a $100 paper wallet, and a public ledger of everything it does.

Every call the agent makes is real and returns real data: Hacker News, GitHub, CoinGecko prices, and Claude for the writing. The money is paper. Each call is charged at an estimated x402 price, inference is charged from real token usage, and buyers are simulated (tagged `sim` on the dashboard) until real ones exist. When the balance reaches $0, the show ends.

## How it runs

- `agent/run.py` does one job per run, updates the wallet and appends to the ledger in `data/state.json`. Standard library only.
- `.github/workflows/agent.yml` runs it every 15 minutes and commits the new ledger.
- `index.html` is the dashboard. GitHub Pages serves it, and it re-reads `data/state.json` every 30 seconds.

## Setup

1. **Pages:** Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`.
2. **Writing step (optional):** Settings → Secrets and variables → Actions → New secret `ANTHROPIC_API_KEY`. Without it, the inference step fails, nothing is charged for it, and the agent publishes raw results instead.
3. **Inference pricing:** set repository variables `INFER_IN` and `INFER_OUT` (USD per million tokens) to your model's real prices. Defaults are 1.0 and 5.0.
4. **First run:** Actions → agent → Run workflow.

## Changing the show

- Per-call prices: `PRICES` in `agent/run.py`.
- Jobs: add a function to `JOBS`. Each job calls `j.think()`, `j.call()`, `j.sell()` and `j.finish()`.
- Reset the wallet: delete `data/state.json` and run the workflow.
