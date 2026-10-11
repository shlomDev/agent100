# Verified IL — design and business case

## The bet

AI agents increasingly act for people: they answer, decide and draft. For anything legal or bureaucratic in Israel they mostly guess, from training data that is out of date, in English, and never reviewed. Being wrong costs the agent's operator (a refund refused, a claim lost, a complaint). **Verified IL sells certainty: Israeli rules a lawyer has reviewed, as answers and as computed results, signed so the buyer can prove where they came from.**

It is not a scraped dataset. The moat is the three things scraping can't copy:
1. **Review**: a named Israeli lawyer signs off each rule, with a date. Unreviewed rules are served, clearly marked `verified: false`, and never sold as verified.
2. **Computation**: deadlines, eligibility and fee caps computed in code from those rules, not left to a model.
3. **Proof**: every response is Ed25519-signed with the dataset version and issue time.

## What we sell (value ladder)

| Level | Example | Price now | Why someone pays more |
|---|---|---|---|
| Fact | "Distance-purchase cancellation period?" | $0.02 | cheap, high volume |
| Calculation | "Delivered 6.10. Can they cancel on 11.10? Until when? Max fee on ₪650?" | $0.05 | gets the arithmetic right |
| Check | "Does this spam case qualify, and if not, what next?" | $0.10 | prevents a losing claim |
| Finished work | a rule-checked demand letter (Zuzei's pipeline) | $3–8 (later) | the job itself, done |

**Not auctions.** Answers can be sold to everyone, so there's nothing scarce to bid on. Premium pricing comes from what *is* scarce:
- **Freshness**: a webhook the moment a rule changes (subscription, $X/month).
- **Guarantees**: response-time SLA and a support contact for companies.
- **Volume plans**: monthly billing for Israeli companies (Hebrew chatbots, CRMs, legal-tech) that won't pay per call in crypto.

## Who buys

1. **Israeli companies running Hebrew support bots** (retail, telecom, e-commerce): they need correct cancellation and refund rules. Monthly plan.
2. **Consumer AI assistants** acting for Israelis: per call over x402, no signup.
3. **Legal-tech and consumer apps**: Zuzei itself is customer zero.

Realistic note: (2) is the x402 story and will be small for a while (average x402 payments are about $0.20). (1) is where early money is, through ordinary invoices. Build for both from the same API.

## Revenue math (illustrative, not a forecast)

- 5 companies × ₪1,500/month = ₪7,500/month ≈ $2,000.
- 50,000 agent calls/month × $0.05 = $2,500.
- Together ≈ $150/day. The company plans carry it; agent calls are the upside.

## Expansion (same engine, new rules)

Consumer cancellations → subscriptions → rental deposits → spam law → flight delays (Aviation Services Law) → National Insurance and tax-refund eligibility screens → municipal fees and fines. Each new domain is: rules + lawyer review + calculator + tests.

## Risks

- **Practice of law**: answers are general information, not advice for a specific person. Ask the lawyer how to word the service and the disclaimer (`LEGAL_TODO` in Zuzei has the same question).
- **Liability for a wrong rule**: versioning, review dates and signatures make every answer traceable. Add terms of use limiting liability before charging.
- **Staleness**: each rule needs a re-review date. Schedule it.
- **x402 maturity**: field names and networks evolve. Re-check the spec and the facilitator before enabling payments, and test on `base-sepolia` first.

## Go-live checklist

1. A lawyer reviews `data/rules.json`; fill `reviewed: { by, at }` per rule.
2. Generate the signing key; set `VERIFIED_SIGNING_KEY`. Publish the public key on the landing page.
3. Deploy (Vercel, root `verified-il`).
4. Test payments on Base Sepolia with test USDC: set `X402_NETWORK=base-sepolia`, the test asset address, a test wallet, and the facilitator. Make one paid call end to end.
5. Switch to mainnet: `X402_NETWORK=base`, `X402_PAY_TO` = your wallet, real facilitator.
6. Write terms of use; add the monthly plan for companies (ordinary invoices).
7. List the service where agents look for paid tools (x402 directories, MCP registries).

## Next build steps

- MCP server wrapper, so agents can add Verified IL as a tool directly.
- `/v1/letter` door to Zuzei (paid, $3–8).
- Rule-change webhook (subscription).
- Usage dashboard on the template in `../template/` (calls per tool, paid vs free, revenue).
