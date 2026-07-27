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
| Product redesign, spine, P0-P4 phases | [../REDESIGN.md](../REDESIGN.md) |
| Productization, asset map, packaging, GTM | [../PRODUCT.md](../PRODUCT.md) |
| Multi-event ops intelligence map | [../OPS-INTELLIGENCE.md](../OPS-INTELLIGENCE.md) |
| Voice + intelligences master index | [../INTELLIGENCE.md](../INTELLIGENCE.md) |
| Cross-project preferences (DOS DS v4, eng defaults) | [../PREFERENCES.md](../PREFERENCES.md) |

**Cadence:** Sunday 8pm, 20 min — update METRICS.md + JOURNAL.md. Monthly 1st Sunday — review HYPOTHESES + RISKS + FINANCIALS.
**Tier:** LOW (manual, $0 API overhead). Revisit Aug 2026 for MEDIUM.

---

## 0. What This Is

DOS is two things built by one team:

1. **DOS Tour Ops v7** — Internal operations dashboard for Davon and Olivia. Vite + React 18 + Supabase. Live at `dos-tour-ops.vercel.app`. Used daily to run bbno$'s Internet Explorer Tour. This is the active build target.

2. **DOS Platform** (../dos-platform): the unified touring product, B2B SaaS (Next.js 15 + tRPC v11 + Supabase). Stack locked 2026-05-29; design canonical in ../REDESIGN.md + ../PRODUCT.md. Davon solo-ships it. The Laravel festival platform is a separate product (../dos-festival; Chris Cole's repo colecut/dos-platform). The earlier "gated on Josh's schema audit" framing is stale.

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
- Do NOT implement DOS Platform features in this repo. The platform is the separate Next.js product in ../dos-platform (design: ../REDESIGN.md). v7 prototypes behavior; the platform automates it.
- Do NOT suggest infrastructure beyond current Revenue Gate.
- Do NOT pad responses. End on substance.
- Do NOT use em dashes.
- Do NOT reference the Python agent framework as active. It is dead.
- Do NOT treat `day-of-davon/dos-tour-ops` as archived. It is the active repo.

---

*Day of Show, LLC | d.johnson@dayofshow.net | 337.326.0041*
*Los Angeles, CA | San Juan, PR*
*CLAUDE.md v3.1 | 2026-04-23; routing table + platform status refreshed 2026-06-22*

---

## GBrain Configuration (configured by /setup-gbrain)
- Mode: local-stdio
- Engine: postgres (Supabase, ref: smlhekrkyverillbkraa, us-east-1)
- Config file: ~/.gbrain/config.json (mode 0600)
- Setup date: 2026-06-25
- MCP registered: yes (user scope, /Users/davon/.bun/bin/gbrain serve)
- Embedding: voyage:voyage-code-3 (1024d)
- Artifacts sync: full → https://github.com/day-of-davon/gstack-artifacts-davon
- Current repo policy: read-write
- Note: GBRAIN_DISABLE_DIRECT_POOL=1 required (IPv6 not available); baked into MCP config. Add to ~/.zshrc for CLI use.

## GBrain Search Guidance (configured by /sync-gbrain)
<!-- gstack-gbrain-search-guidance:start -->

GBrain is set up and synced on this machine. Prefer gbrain over Grep when the question is semantic or when you don't know the exact identifier yet. Two indexed corpora:
- This repo's code (registered as `gstack-code-day-of-davon-dos-tour-ops` source).
- `~/.gstack/` curated memory (registered as `gstack-artifacts-davon` source).

Prefer gbrain when:
- "Where is X handled?" / semantic intent, no exact string yet:
    `gbrain search "<terms>"` or `gbrain query "<question>"`
- "Where is symbol Y defined?" / symbol-based code questions:
    `gbrain code-def <symbol>` or `gbrain code-refs <symbol>`
- "What calls Y?" / "What does Y depend on?":
    `gbrain code-callers <symbol>` / `gbrain code-callees <symbol>`
- "What did we decide last time?" / past plans, retros, learnings:
    `gbrain search "<terms>" --source gstack-artifacts-davon`

Grep is still right for known exact strings, regex, multiline patterns, and file globs. The brain auto-syncs incrementally on every gstack skill start. Run `/sync-gbrain` to force-refresh.

<!-- gstack-gbrain-search-guidance:end -->

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
