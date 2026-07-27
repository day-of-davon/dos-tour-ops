# RISKS — Top 10, Ranked

**Rule:** probability × impact, 1–5 each, score = P×I. Each has signal, mitigation, trip-wire.
**Cadence:** monthly review (1st Sunday). Demote/promote as reality shifts.

---

| # | Risk | P | I | Score | Signal to watch | Mitigation | Trip-wire |
|---|---|---|---|---|---|---|---|
| 1 | **No offline mode on EU tour** (Alps, borders, spotty signal) | 5 | 5 | 25 | Any bus ride with >30min no-signal | IndexedDB read-mirror of `app_storage` before May 4 | If unshipped by May 1 → feature freeze, ship only offline work |
| 2 | **Platform rewrite takes 2x estimate** | 4 | 5 | 20 | Phase 0 slips past May 15 | Buffer 1.5x in ROADMAP. Cut scope, not quality. | Slip > 30 days → defer customer GA to Q2 2027 |
| 3 | **Single-operator fragility on tour** (Davon on bus, no tests) | 4 | 5 | 20 | Any bug reported by Olivia during EU | Playwright smokes + error boundaries per tab | 2 prod bugs in 7 days → pause features, add tests |
| 4 | **Master Tour ships AI** (contact-DB + AI = moat collapse) | 3 | 5 | 15 | Any public release note mentioning AI | Accelerate Tour Inbox GTM, own the "AI for touring" narrative | Within 30 days of their launch → publish our differentiator brief |
| 5 | **Claude API repricing or outage** | 3 | 4 | 12 | Anthropic changelog, status page | Cache everything, Haiku-route when possible, cost alerts | 2x price hike → re-quote Pro tier or cap usage |
| 6 | **Tour Inbox fails to hit 35 subs by Q3 end** | 3 | 4 | 12 | Weekly signup rate | See HYPOTHESES H-001; channel expansion | < 10 subs by Aug 31 → kill or pivot to consulting revenue |
| 7 | **Josh unavailable / dispatch logic doesn't land** | 3 | 4 | 12 | Weekly comms with Josh | Borz as backup architect; simpler heuristic dispatch first | 2 weeks silence → scope down to schedule-viewer-only |
| 8 | **Data breach / Gmail scope liability** | 2 | 5 | 10 | Any customer email in Anthropic prompt cache logs | DPA ready, "no training" clause, scope minimization | Any external customer asks → must have SOC 2 Type 1 in progress |
| 9 | **Elements festival goes badly** | 2 | 5 | 10 | Load test fail rate, dry-run miss | Manual fallback plan, on-site eng presence | Fail by Jul 24 → revert to manual ops, refund partial |
| 10 | **Tour insurance gap** (business-level, per CLAUDE.md §11) | 3 | 3 | 9 | Sam/Sandro routing status | Daily follow-up until placed | Still open May 1 → go directly to broker, bypass |

---

## Retired risks

_None yet. Move here once a trip-wire resolves or a decision in DECISIONS.md supersedes._

---

## Watched but not ranked (emerging)

- FR immigration forms slipping (Paris May 20, Chambord Jun 26, Villeurbanne Jun 28) — business ops, not product.
- Wasserman UK form outstanding since Apr 9.
- Claude Code subscription policy changes (affects dev productivity, not direct cost).
