# DECISIONS — ADR-Lite

**Rule:** append-only. Every non-trivial decision gets a row. Include **reversal criteria** — the signal that forces a re-decide.

| # | Date | Decision | Supersedes | Rationale | Reversal criteria |
|---|---|---|---|---|---|
| 1 | 2026-04-13 | v7 TypeScript CLI-first agents are canonical | Python pgvector framework | TS matches platform stack; CLI-first = Claude Code native | Agents fail to ship value by Q3 2026 → revisit framework |
| 2 | 2026-04-13 | Hybrid pricing: touring $99–499/mo, festivals $1K–15K+ | $50/driver/mo | Per-driver doesn't match festival buyer budget authority | < 10 conversions in 90 days after launch → repackage |
| 3 | 2026-04-13 | Festival tiers (boutique→enterprise, $1K–15K+) | Untiered | Budget reality varies 15x by festival size | First 3 festival sales show tier misalignment → re-tier |
| 4 | 2026-04-13 | Structured logging + Claude cost tracking in Phase 4 | No observability plan | Cost is margin risk; need telemetry before scale | If Claude $/scan > $0.15 before Phase 4 → pull forward |
| 5 | 2026-04-13 | New GitHub org for DOS LLC | Personal account repo | Separates IP, allows team access | N/A — one-way door |
| 6 | 2026-04-13 | `day-of-davon/dos-tour-ops` is active v7 repo | "archived" stale note | Currently serves live tour | When Platform hits parity → archive |
| 7 | 2026-04-13 | v7 deployed to Vercel + Supabase multi-user | "not yet deployed" stale note | Shipped and working | N/A |
| 8 | 2026-04-13 | Team/private storage split (team_id shared, user_id private) | Single user_id scoping | Olivia needs shared access; intel stays private | Multi-tenant Platform takes over → retire |
| 9 | 2026-04-13 | Google OAuth required gate | No auth | Gmail scope + multi-user both need it | N/A |
| 10 | 2026-04-13 | Master Tour positioned as $74.99/mo single-user (not $59.99) | $59.99 estimate | Verified pricing | N/A |
| 11 | 2026-04-22 | team_id rescoped tour-level (`dos-bbno-2026`); leg derived from show date | `dos-bbno-eu-2026` | Tour is one unit; leg is a view | Multi-tour customers arrive → re-scope per-tour ID |
| 12 | 2026-04-23 | Adopt LOW-tier operating system (manual docs, $0 API overhead) | No ops doc system | Pre-revenue, solo, EU-tour mode; HIGH tier premature | Skip Sunday review 3x → system is wrong, rebuild |
| 13 | 2026-04-23 | Defer Rowboat IDE + Ruflo integration | N/A | Rowboat targets CX/enterprise (OpenAI); not relevant until Platform Phase 8+. Ruflo (Claude multi-agent, 60+ agents, 75% cost reduction) is strong fit for v7 ROADMAP blockers (ESLint, Playwright, DosApp.jsx refactor) but not worth setup cost during EU tour ops crunch. | v7 ROADMAP blockers still open after tour → evaluate Ruflo first |

---

<!-- Template:

| N | YYYY-MM-DD | Decision | Supersedes | Rationale | Reversal criteria |

-->
