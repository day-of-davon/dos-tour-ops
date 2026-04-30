# CLAUDE.md — DOS Platform + Tour Ops
## Day of Show, LLC | Davon Johnson
## Place in repo root. Claude Code reads this automatically on every session.

---

## Operating System — where to look

This file is **identity + communication rules + anti-patterns + pointers**. When this file and a topic file conflict, the topic file wins.

| Topic | Canonical file |
|---|---|
| Architecture, tech stack, storage keys, tabs (was §3/§5/§6) | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Team roster + external contacts (was §2) | [TEAM.md](TEAM.md) |
| Active tour snapshot (was §12) | [TOUR.md](TOUR.md) |
| Weekly KPIs | [METRICS.md](METRICS.md) |
| Weekly log | [JOURNAL.md](JOURNAL.md) |
| Extracted rules | [LESSONS.md](LESSONS.md) |
| Show + phase retros | [RETROS.md](RETROS.md) |
| Decisions log (was §4) | [DECISIONS.md](DECISIONS.md) |
| Decision frameworks + pricing (was §8) | [STRATEGY.md](STRATEGY.md) |
| Phases + v7 WIP + Phase 0 backlog (was §7/§10/§11) | [ROADMAP.md](ROADMAP.md) |
| Risks | [RISKS.md](RISKS.md) |
| Active bets | [HYPOTHESES.md](HYPOTHESES.md) |
| Competitive map (was §9) | [COMPETITORS.md](COMPETITORS.md) |
| Projections | [FINANCIALS.md](FINANCIALS.md) |

**Cadence:** Sunday 8pm, 20 min — update METRICS.md + JOURNAL.md. Monthly 1st Sunday — review HYPOTHESES + RISKS + FINANCIALS.
**Tier:** LOW (manual, $0 API overhead). Revisit Aug 2026 for MEDIUM.

---

## 0. What This Is

DOS is two things built by one team:

1. **DOS Tour Ops v7** — Internal operations dashboard for Davon and Olivia. Vite + React 18 + Supabase. Live at `dos-tour-ops.vercel.app`. Used daily to run bbno$'s Internet Explorer Tour. This is the active build target.

2. **DOS Platform** — B2B tour operations SaaS (Next.js 15, tRPC v11, Supabase). Customer-facing product. Not yet scaffolded. No platform feature code until Josh delivers schema audit.

The artifact informs the platform. Features are prototyped manually in v7, then automated in the platform. They share domain knowledge but are separate codebases.

---

## 1. Communication Rules (non-negotiable)

- Lead with the answer. Reasoning follows.
- Fewest words. No filler, no affirmations.
- No em dashes. Use commas, periods, semicolons.
- Challenge framing when wrong. Honesty over comfort.
- Quantify uncertainty when it matters.
- Never explain: SaaS basics, multi-tenant patterns, RLS, tRPC, VRP, festival production workflows.
- Ask clarifying questions when confidence < 0.80.
- Minimize exclamation points.
- Default to files for anything over 20 lines.

Davon profile + team roster live in [TEAM.md](TEAM.md).

---

## 13. Anti-Patterns

- Do NOT explain basics (SaaS, RLS, tRPC, VRP, festival workflows).
- Do NOT interrupt build mode with strategy or vice versa.
- Do NOT build platform features before Josh's schema audit.
- Do NOT suggest infrastructure beyond current Revenue Gate.
- Do NOT pad responses. End on substance.
- Do NOT use em dashes.
- Do NOT reference the Python agent framework as active. It is dead.
- Do NOT treat `day-of-davon/dos-tour-ops` as archived. It is the active repo.

---

*Day of Show, LLC | d.johnson@dayofshow.net | 337.326.0041*
*Los Angeles, CA | San Juan, PR*
*CLAUDE.md v3.0 | 2026-04-23*
