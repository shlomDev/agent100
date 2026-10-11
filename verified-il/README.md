# Verified IL · Agent #26

Part of [Agent 100](../README.md): the agent other bots and AI agents call. Same Israeli rules as the consumer agents, sold as a signed API.

Israeli consumer and communications rules for AI agents: **facts, calculations and checks**, each response digitally signed, sold per call over [x402](https://www.x402.org/). Payments are **off** until you switch them on.

An agent helping someone in Israel shouldn't guess whether a purchase can still be cancelled or whether a spam message is worth a claim. It calls Verified IL, gets a signed answer with the rule, its version, and whether a lawyer has reviewed it, and can prove later where the answer came from.

## Tools

| Call | Price | Returns |
|---|---|---|
| `GET /v1/catalog` | free | rules, prices, public key |
| `GET /v1/answer?id=<rule>&lang=he\|en` | $0.02 | the rule in plain words |
| `POST /v1/cancellation` `{channel: store\|online, date, priceIls?, used?, exception?}` | $0.05 | eligible, deadline, days left, max fee, reasons |
| `POST /v1/spam` `{channel, customer, optout, removed, removedOn?, first, last, count}` | $0.10 | eligible or the block reason + next step, claim cap |

Every paid response is `{ body, signature, alg: "Ed25519", keyId }`. Check it with the public key from `/v1/catalog`: the signature covers the canonical JSON of `body` (keys sorted).

**`verified: false` until a lawyer reviews a rule.** The rules start as the drafts Zuzei uses. A rule becomes `verified: true` only when `reviewed: { by, at }` is filled in `data/rules.json`. Never sell an unreviewed rule as verified.

## Run and test

```
cd verified-il
npm test              # 13 tests, no dependencies
```

Deploy: Vercel → New Project → this repo → **Root Directory `verified-il`** → Deploy.

| Env | Needed | |
|---|---|---|
| `VERIFIED_SIGNING_KEY` | yes in production | Ed25519 private key (PEM). Create: `openssl genpkey -algorithm ed25519`. Without it a new key is made on every cold start. |
| `X402_PAY_TO` | to charge | your Base wallet address (receives USDC) |
| `X402_FACILITATOR_URL` | to charge | e.g. Coinbase CDP's x402 facilitator |
| `X402_FACILITATOR_TOKEN` | if the facilitator needs it | |
| `X402_NETWORK` | no | default `base` (use `base-sepolia` to test with free test USDC) |
| `VERIFIED_FREE_PER_DAY` | no | free calls per IP per day before payment is asked, default 20 |

Design, pricing and the path to revenue: [`docs/VERIFIED-IL.md`](docs/VERIFIED-IL.md).
