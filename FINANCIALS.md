# FINANCIALS — Projections & Unit Economics

**Cadence:** monthly refresh (1st Sunday).
**Last refresh:** 2026-04-23.

---

## Assumptions baseline

- **Touring ARR mix:** $99–$499/mo/tour, assume $199 blended.
- **Festival:** $2.5K–$15K/event, assume $5K blended.
- **Claude API variable:** $0.03/show-scan × 20 shows × 2 refreshes = **$1.20/tour/mo**.
- **Supabase Pro:** $25/mo base + $0.125/GB egress.
- **Vercel Pro:** $20/mo.
- **Fixed monthly burn to Platform launch:** ~$1,500 (tools + infra + Claude + misc).

---

## Scenario A — Conservative (base case)

| Period | Tours | Festivals | MRR | Annualized | Burn | Net/mo |
|---|---|---|---|---|---|---|
| Q2 2026 | 1 (bbno$ internal) | 0 | $0 | $0 | $50 | −$50 |
| Q3 2026 | 3 | 1 (Elements $5K) | $597 | $7.2K | $200 | +$397 + $5K lump |
| Q4 2026 | 8 | 2 ($10K) | $1,592 | $19K | $500 | +$1,092 + $10K |
| Q1 2027 | 18 | 3 ($15K) | $3,582 | $43K | $1,200 | +$2,382 + $15K |
| Q2 2027 | 35 | 6 ($30K) | $6,965 | $84K | $2,500 | +$4,465 + $30K |
| **FY2027** | → 50 EOY | 10–15 | **$10K MRR EOY** | **$150K ARR + $75K festival** | ~$3K/mo | **~$225K revenue** |

## Scenario B — Optimistic (Tour Inbox hits)

- Tour Inbox $49/mo × 150 tours → $7.3K MRR
- Full Pro $199 × 30 tours → $6K MRR
- Festivals: 8 × $5K = $40K lump
- **FY2027 revenue:** ~$350K. Breakeven Q2 2027.

## Scenario C — Pessimistic (no external PMF)

- v7 remains internal. Festival consulting only (Elements), $40K/yr.
- No SaaS revenue; Platform sunk cost.
- **FY2027 revenue:** $40K. Burn $30K+, founder-funded.

---

## Unit economics

### Tour Inbox ($49/mo standalone)

| Metric | Value |
|---|---|
| CAC (organic) | $0–50 |
| CAC (paid, if needed) | ~$100 |
| COGS/mo | ~$2 (Claude + Supabase portion) |
| Gross margin | **96%** |
| Payback | < 1 month |
| LTV (18-mo tour lifecycle avg) | $882 |
| **LTV / CAC** | **9–18×** |

### Pro ($199/mo)

| Metric | Value |
|---|---|
| COGS/mo | ~$5 |
| Gross margin | 97% |
| Payback | < 1 month |

### Festival ($5K/event)

| Metric | Value |
|---|---|
| Delivery cost | ~$1,000 (ops + infra) |
| Margin | 80% |
| Cadence | one-time; churn = annual re-sign |

---

## Break-even math

Fixed monthly burn to Platform launch: ~$1,500.

Break-even at any of:
- **31 Pro subs**, or
- **8 Pro + 1 festival/quarter**, or
- **35 Tour Inbox subs** ← targeted path.

---

## Funding path

- **Bootstrap through Q4 2026.** Elements revenue ($10–15K) funds Platform build.
- **Seed in Q1 2027** only if Tour Inbox ≥ 50 paying subs. Target: $500K at $5M post.
- **Avoid pre-revenue raise.** Touring market is small; referrals > decks.

---

## Largest risks to forecast

1. **Offline gap kills EU word-of-mouth** → zero inbound from tour network. (See RISKS #1)
2. **Claude repricing 2x** → still 90%+ GM. Safe. (See RISKS #5)
3. **Master Tour ships AI** → 12–18 month window. Use it. (See RISKS #4)
4. **Platform rewrite 2x estimate** → GA slips to Q1 2027. (See RISKS #2)

---

## Monthly review template

Each 1st Sunday, copy this block and fill:

```
### YYYY-MM review
- Actual MRR:
- Actual tours (paying):
- Actual Tour Inbox subs:
- Actual burn:
- Scenario we're tracking: A / B / C
- Delta vs forecast:
- Hypothesis check (HYPOTHESES.md H-001, H-002, H-003):
- Action:
```
