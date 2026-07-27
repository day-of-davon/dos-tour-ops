# DOS Tour Ops — Full Viability Analysis
**Date:** 2026-04-23 | **Scope:** v7 artifact only (not Platform) | **Mode:** read-only, analysis

---

## Context
Comprehensive analysis of [dos-tour-ops](.) spanning viability, competitive landscape, feature depth, design, devil's advocate, tech stack, code quality, go-to-market per feature, time-to-market, and financial forecasts. Deliverable is this document.

---

## 1. Viability Verdict

**Internal tool viability: 9/10.** Already running a live $68K EU tour. Zero-user-churn risk (you are the user). The question isn't *can it operate a tour* — it is.

**Productized SaaS viability: 5/10 as-is, 8/10 if decoupled.**
- **Pro:** Gmail→Claude intel + 9-state advance + ROS anchor model is genuinely differentiated. No competitor has the comms-intelligence surface.
- **Con:** 8,016-line single JSX file, zero tests, zero types, hardcoded email, team_id baked into RLS (`dos-bbno-2026`), inline styles. Multi-tenant impossible without a full rewrite — which CLAUDE.md already acknowledges (Platform = separate Next.js/tRPC codebase).
- **Decision validated:** Artifact-first strategy is correct. Don't try to turn v7 into the product.

**Primary risk:** v7 becomes load-bearing for bbno$ while Platform stalls. Every feature added to v7 that isn't later ported is scope debt.

---

## 2. Competitive Analysis

| Competitor | Price | Strengths | Gaps vs DOS |
|---|---|---|---|
| **Master Tour** (Eventric) | $74.99/mo single-user | Itineraries, day sheets, 150K contact DB, offline mode, incumbent in TM workflow | No dispatch, no settlement, no AI, no transport, single-user, no deal pipeline, no email intelligence |
| **FestivalPro** | ~$45–499/mo + 2% txn | 600+ events, ticketing, credentialing, full event lifecycle | No transport/dispatch, no AI, no free tier, no public API, festival-only |
| **Lennd** | Enterprise (unpublished, est. $20K+/yr) | Credentialing, stakeholder portals, form collection | No transport, no ROS anchors, no market intel, slow product cadence |
| **Prism.fm** | $$$ (enterprise) | Booking + deal memo pipeline, strong at agency tier | No DOS operations, no advance, no settlement tracking for TMs |
| **Tourbase / Rehearsal** | $40–150/mo | Day sheets, basic itinerary | Thin product, no dispatch, no intel |
| **Artery** (new) | Unknown | Tour logistics SaaS attempt | Unproven, no market share yet |
| **BeatSwitch** | Acquired Jan 2026 | Artist booking | Dead as independent threat |
| **Homegrown spreadsheets** | $0 | Universal, flexible | Everyone hates them; no real-time, no automation, no audit |

**Moat analysis:**
1. **Gmail + Claude intel layer** — nobody has this. Building it requires LLM ops chops + touring domain chops, a rare combo.
2. **9-state advance status** — granularity (`sent`/`received`/`respond`/`follow_up`/`escalate`) matches real advance workflow. Master Tour has binary checkboxes.
3. **Anchor-based ROS** — offsets to named times (busArrive, doors, curfew) vs static schedules. More robust to day-of changes.
4. **Transport + dispatch combined with advance** — no one else crosses this boundary.

**Weaknesses:**
- Master Tour's 150K-contact network effect is real — DOS starts at zero.
- FestivalPro's credentialing is deeper than DOS will ship in year 1.
- No offline mode (Master Tour's killer feature for international touring). *Critical gap for EU tour.*

---

## 3. Feature-by-Feature Comparison

| Feature | DOS v7 | Master Tour | FestivalPro | Lennd |
|---|---|---|---|---|
| Itineraries / Day Sheets | ✅ (ROS + travel day) | ✅ (best-in-class) | ✅ | ✅ |
| Advance Checklist | ✅ 9-state | ✅ binary | ✅ stages | ✅ |
| Gmail Intel Scan | ✅ **unique** | ❌ | ❌ | ❌ |
| AI Reply Drafting | ✅ **unique** | ❌ | ❌ | ❌ |
| Crew Flights (scan + dedup) | ✅ | Manual entry | Manual | Manual |
| Lodging Room Blocks | ✅ | ✅ | ✅ | ✅ |
| Settlement Stages | ✅ 5-stage | ❌ | Partial | ❌ |
| Ledger / Payouts | ✅ | ❌ | Partial | ❌ |
| Guest List | ✅ | ✅ | ✅ | ✅ (best) |
| Credentialing | ❌ | Partial | ✅ | ✅ (best) |
| Driver Dispatch / VRP | ❌ (display-only) | ❌ | ❌ | ❌ |
| Offline Mode | ❌ | ✅ **critical** | ❌ | ❌ |
| Contact DB | Ad-hoc | ✅ 150K | Partial | ✅ |
| Multi-tenant | ❌ | ✅ | ✅ | ✅ |
| Mobile PWA | Partial | ✅ native | ✅ | Partial |
| Public API | ❌ | Partial | ✅ | ❌ |
| Audit Log | ✅ | ❌ | Partial | ✅ |
| Permissions Matrix | ✅ | Limited | ✅ | ✅ |

**Scorecard:** DOS leads on intelligence and settlement. Loses on offline, contact DB, credentialing, multi-tenant.

---

## 4. Design Feedback

**Strengths:**
- Delta-inspired palette is sophisticated, differentiates from Master Tour's dated UI.
- 9-state status pills with color semantics are crisp and scannable.
- Dark mode passes AAA contrast.
- Command palette (Cmd+K) signals power-user orientation.
- Outfit + JetBrains Mono is a good dual-font system.

**Weaknesses:**
1. **Inline-style monolith.** No design tokens file. Changing a spacing value means find-replace across 8K lines. Refactor blocker.
2. **No type scale.** Font sizes span 9–20px with no rhythm. Looks janky at scale.
3. **Accessibility is thin.** Single `aria-label` in 8K lines. No live regions for scan toasts. Keyboard nav beyond Cmd+K is untested.
4. **No loading skeletons.** Gmail scans take 30–90s; users see blank panes.
5. **Mobile is "functional, not polished."** EU tour is the use case — touchscreen on a bus, one-handed, at 3am. Ship tight mobile before May 4.
6. **No empty states.** Fresh shows and empty ledgers have no onboarding hint.
7. **Status pills cycle on click (3-state)** — good — but no keyboard shortcut documented in-app.
8. **Undo toast is 30s** — generous but invisible after dismissal. No "recently changed" history surface outside Access tab.

**Prescription:**
- Extract `/src/styles/tokens.js` this week. Migrate 6–8 core colors. Stop inline-ing new styles.
- Add a `<StatusPill>` component. Replace the 40+ inline instances.
- Add skeleton loaders to intel/flights/lodging scans.
- Mobile audit on iPhone 15 before EU departure. Actual thumb-test on bus.

---

## 5. Use-Case Devil's Advocate

**Devil's advocate prompts:**

1. **"Why not just use Master Tour + a shared Google Doc?"** Honest answer: for 95% of TMs, that *is* enough. DOS targets the 5% running multi-leg international routing + settlement + driver dispatch simultaneously. That's maybe 500 TMs globally. TAM ceiling.

2. **"Gmail scraping is a liability."** Google OAuth token scope (`gmail.readonly`) + Supabase storage + Claude API roundtrip is a data-processing footprint. If Anthropic leaks a prompt cache, client emails are in it. Before first external customer: DPA, SOC 2 Type 1 at minimum, and a "we don't train on your data" clause front-and-center.

3. **"Offline mode is table stakes for touring. You don't have it."** Correct. Nightliners have spotty cell signal crossing borders. A tour manager in the Alps with no signal can't use v7. Master Tour works offline. This is a *revenue-blocking* gap for serious TMs.

4. **"Single-user bbno$ tour ≠ proof of PMF."** One user, one artist, founder-operated = N of 1. The product works *for you* because *you built it for you*. Next 5 TMs will have different workflows you haven't seen. Expect 6 months of "why doesn't it do X" before PMF across tours.

5. **"Festival pricing is aspirational."** $10K/event for 80-150 artists requires you to beat FestivalPro's full lifecycle. Today you have transport + advance. That's ~30% of festival need. Justify $10K against incumbents shipping 100% at $5K. Probably sell at $2.5K regional tier and grow up.

6. **"The 9-state status is cognitive overload."** For power users it's precise. For new users it's intimidating. Master Tour wins on onboarding with "check the box."

7. **"No routing logic in Transport."** You market transport as a pillar but today it's a read-only schedule. The VRP/VROOM work is all future. Don't sell what doesn't exist yet.

8. **"Claude cost per scan scales linearly with shows."** ~$0.02–0.05/show × 17 shows × refresh frequency × users = could run $50/mo/tour in API costs alone at scale. Margin risk at Pro tier ($99/mo).

9. **"Team_id `dos-bbno-2026` is hardcoded in RLS."** Platform migration isn't a sprint — it's a rewrite. Don't let anyone promise a customer "multi-tenant next quarter."

10. **"Davon goes on tour May 4. Who ships bugs?"** Single point of failure. No tests = no safety net for remote async fixes from a bus.

---

## 6. Tech Stack Assessment

| Layer | Choice | Grade | Notes |
|---|---|---|---|
| Frontend framework | Vite 5 + React 18 | A | Correct for artifact speed |
| State mgmt | `useState` + single Context | C | 40+ slices in one Ctx = re-render storm |
| Styling | Inline styles | D | Token-less, untyped, unmaintainable past 10K LOC |
| Types | None | F | At 8K LOC, cost is real |
| Tests | None | F | Deploying to a live EU tour with no tests |
| Auth | Supabase + Google OAuth | A | Solid |
| DB | Supabase Postgres (KV pattern) | B | KV is pragmatic for v7; will not survive Platform |
| RLS | Team + user scoping | B+ | Works, but team_id hardcoded |
| Serverless | Vercel (6 funcs, 30–120s) | A | Matches workload |
| AI | Claude Sonnet 4.6 + ephemeral cache | A | Cache on system prompt is the right call |
| Gmail | `gmail.readonly` via OAuth | B | Fine; needs token refresh handling |
| Observability | `scan_runs` telemetry + actlog | B+ | Good start; no error aggregation |
| Lint/format | None | F | Add Prettier + ESLint this week |
| CI/CD | Vercel auto-deploy from main | B | Needs preview deploys + a smoke test gate |

**Top 3 stack priorities before EU tour (next 10 days):**
1. Prettier + ESLint (1 day).
2. Extract 3 critical flows into smoke tests via Playwright: login, scan intel, edit ledger (2 days).
3. Offline read-mode using Supabase's built-in local cache or IndexedDB mirror (3 days). **Revenue-blocking if skipped.**

---

## 7. Codebase Assessment

**Metrics:**
- `DosApp.jsx`: 8,016 LOC, single file, 752 declarations, one Context carrying 50+ slices.
- `api/intel.js`: 758 LOC; the cleanest file in the repo. Retry logic, token accounting, cache-aware.
- Zero tests, zero TS, zero lint config.
- 1 hardcoded email (`api/comms.js:7`).
- 1 hardcoded team_id in RLS + constants.
- 1 backward-compat comment for a status rename (`responded` → `in_progress`).

**Top 10 refactor targets (ranked by pain × frequency):**

1. Split `DosApp.jsx` by tab → `/tabs/{Dashboard,Advance,ShowDay,...}.jsx`. Yields ~500 LOC/file. (2 days)
2. Extract `Ctx` into domain-scoped contexts (ShowCtx, FinanceCtx, IntelCtx) to cut re-renders. (1 day)
3. `<StatusPill>`, `<Pill>`, `<Toast>`, `<Modal>` primitives. Remove ~1.5K LOC of inline JSX. (1 day)
4. `/src/styles/tokens.js` — move palette + spacing + type scale. (0.5 day)
5. Playwright smoke tests for 5 critical flows. (2 days)
6. TypeScript migration *of api/lib/* only* (highest leverage — domain types for Intel, Flight, Ledger). (3 days)
7. Replace inline styles with CSS variables already defined in `index.html`. (2 days, partial)
8. Error boundary per tab. (0.5 day)
9. Replace hardcoded `MY_EMAIL` with Supabase session. (10 min — do this today)
10. Add Prettier + ESLint + pre-commit. (0.5 day)

**Don't refactor:**
- `intel.js` and `flights.js` prompt logic. Working, costly to re-verify.
- ROS anchor model. Solid.
- `supabase/schema.sql`. Already close to Platform shape (audit_log, scan_runs are right).

---

## 8. Paths to Market per Feature

**Feature → GTM path ranked by feasibility × revenue:**

| Feature | Path to Market | Feasibility | Wedge |
|---|---|---|---|
| **Gmail Intel Scan** | Standalone "Tour Inbox Copilot" — $29/mo, email-only. Lands on TMs drowning in email. Upsell to full platform. | High | **Strongest wedge.** No direct competitor. |
| **9-state Advance Checklist** | Free tier in Platform. Hook users, upsell everything else. | High | Low conversion as standalone. |
| **Settlement + Ledger** | Mid-tier upsell ($199). Sell to managers, not TMs — they care about the money. | Medium | Differentiator vs Master Tour. |
| **Crew Flight Dedup + Scan** | Packaged with Intel in $99 Pro. | High | Ships today, minimal polish needed. |
| **Transport (VRP + dispatch)** | Festival bolt-on. $2.5K-$10K event fee. **Requires Phase 2 routing engine.** | Low today, high in Q3 | Festival moat. |
| **Comms Intelligence (reply drafts)** | Hero marketing feature. Demo video of "30 emails → 5 drafts in 90s" drives signups. | High | Shareable magic-moment. |
| **ROS Anchor Scheduler** | Bundle with Pro. Not standalone. | Medium | Power-user retention feature. |
| **Audit Log / ActLog** | Enterprise tier only. Compliance angle. | Medium | Needed for label/agency sales. |
| **Guest List** | Included everywhere. Parity feature. | High | Not a moat. |
| **Benchmark / Market Intel** | Q4 2026+. Data network effect. Price $199-499. | Low | Long-term moat. |

**Highest-leverage GTM move:** Package **Intel + Comms + Crew Flight dedup** as a $49/mo standalone "Tour Inbox" product. Zero competitor, clear ROI (saves 5 hrs/week). Landing page + 3 demo videos + a "connect Gmail" flow. Sell to existing TM network (Sam Alavi's client list, Sheck, Nudelman).

---

## 9. Estimated Time to Market (per feature, from today 2026-04-23)

Assumes: Davon available, Dane 0.5 FTE Jun/Jul, Josh contracting dispatch logic.

| Feature | TTM | Notes |
|---|---|---|
| v7 polish for EU tour (Prompts 1 + 2) | 10 days | Blocking May 4 |
| Offline read-mode | 3 days | Revenue-blocking for EU; do now |
| Tour Inbox standalone landing page | 2 weeks | Static Vercel + signup form; no product separation yet |
| Platform scaffold (Next.js 15 + tRPC + Supabase new project) | 3 weeks | Phase 0 |
| Platform: Advance Checklist parity | 4 weeks | Multi-tenant from day 1 |
| Platform: Intel Scan v2 (multi-tenant) | 6 weeks | Includes OAuth per-tenant, cost metering |
| Platform: Settlement + Ledger | 6 weeks | Requires Josh/Borz input on data model |
| Driver PWA | 8 weeks | Dane lead, Jun–Jul |
| VRP routing engine (VROOM integration) | 10 weeks | Josh contract; needs Maps API billing |
| GPS real-time tracking | 4 weeks | After PWA ships |
| Festival dispatch for Elements (Aug 7–10) | 14 weeks | Hard deadline, zero-downtime load test |
| Benchmark + Market Intel | Q4 2026 | Needs >5 tenants for data |
| Multi-tenant Stripe billing | 4 weeks | Phase 8 |
| Public launch | Q4 2026 | Gated on Elements success |
| API + white-label | Q1 2027 | Phase 9 |

**Critical path:** EU polish (May 3) → Platform scaffold (May 31) → Elements load test (Aug 10). Everything else flexes.

---

## 10. Financial Projections & Forecasts

**Assumptions baseline:**
- Touring ARR: $99–499/mo/tour, assume $199 blended.
- Festival: $2,500–$15,000/event, assume $5K blended.
- Infra burn scales with Revenue Gates in CLAUDE.md §10.
- Claude API: $0.03/show-scan × 20 shows/tour/mo × 2 refreshes = $1.20/tour/mo variable.
- Supabase Pro: $25/mo base + $0.125/GB egress.
- Vercel Pro: $20/mo.

### Scenario A — Conservative (base case)

| Period | Tours | Festivals | MRR | Annualized | Burn | Net/mo |
|---|---|---|---|---|---|---|
| Q2 2026 | 1 (bbno$) | 0 | $0 (internal) | $0 | $50 | -$50 |
| Q3 2026 | 3 | 1 (Elements $5K one-time) | $597 | $7.2K | $200 | +$397 + $5K lump |
| Q4 2026 | 8 | 2 ($10K) | $1,592 | $19K | $500 | +$1,092 + $10K |
| Q1 2027 | 18 | 3 ($15K) | $3,582 | $43K | $1,200 | +$2,382 + $15K |
| Q2 2027 | 35 | 6 ($30K) | $6,965 | $84K | $2,500 | +$4,465 + $30K |
| **FY2027** | ramp to 50 | 10–15 | $10K MRR EOY | **$150K ARR + $75K festival** | ~$3K/mo | **~$225K revenue** |

### Scenario B — Optimistic (Tour Inbox standalone hits)

$49/mo × 150 tours (email-only SKU) = $7.3K MRR added by EOY 2026.
Full-platform $199 × 30 tours = $6K MRR.
Festival: 8 events × $5K = $40K lump.
**FY2027: ~$350K revenue, breakeven by Q2 2027.**

### Scenario C — Pessimistic (no external PMF)

v7 remains internal tool. Festival work consulting-based, $40K/yr (Elements only). No SaaS revenue. Platform sunk cost.
**FY2027: $40K revenue, $30K+ burn, founder-funded.**

### Unit Economics

**Tour Inbox (Intel-only SKU, $49/mo):**
- CAC: $0–50 (organic via network). At paid: ~$100.
- COGS: $2/mo (Claude + Supabase).
- Gross margin: **96%**.
- Payback: <1 month.
- LTV (avg 18-mo tour lifecycle): $882.
- **LTV/CAC: 9–18x.** Exceptional.

**Pro $199/mo:**
- COGS: $5/mo.
- Gross margin: 97%.
- Payback: <1 mo.

**Festival $5K/event:**
- Delivery cost: $800 ops + $200 infra = $1,000.
- Margin: 80%.
- One-time; churn = re-sign annually.

### Break-even math

Fixed monthly burn to get to Platform launch: ~$1,500 (tools, infra, Claude API, misc).
Break-even: **31 Pro subs OR 8 Pro + 1 festival/qtr OR 35 Inbox subs.**
Target: **35 Inbox subs by end of Q3 2026.** Achievable via network.

### Funding path

- **Bootstrap through Q4 2026.** Elements festival revenue ($10–15K) funds Platform build.
- **Seed in Q1 2027** only if Tour Inbox hits 50+ paying subs. $500K at $5M post, buys 18mo runway + 2 engineers.
- **Avoid pre-revenue raise.** Story is stronger with paying customers. Touring world is small; one happy TM referral > one pitch deck.

### Largest risks to forecast

1. **Offline mode gap kills EU tour confidence → no word-of-mouth.** Mitigate: ship offline read by May 3.
2. **Claude API pricing change.** Anthropic has repriced 2x in 24mo. Model a 2x Claude cost scenario: still 90%+ GM. Safe.
3. **Master Tour adds AI.** They have the contact DB, you have the LLM chops. 12–18 month window before they copy. Use it.
4. **Platform rewrite takes 2x estimate (normal).** Push customer GA to Q1 2027.

---

## 11. Action Items (next 10 days, EU-tour blocking)

1. Prettier + ESLint + pre-commit.
2. Remove hardcoded `MY_EMAIL` in `api/comms.js:7`.
3. Playwright smoke tests: login, intel scan, ledger edit.
4. Offline read-mode (IndexedDB mirror of app_storage).
5. Mobile thumb-test on iPhone 15 for all 10 tabs.
6. Extract `<StatusPill>` + `/src/styles/tokens.js`.
7. Error boundary per tab.
8. Prompt 1 + Prompt 2 ship (already in-flight per CLAUDE.md §7).
9. Tour Inbox landing page draft (static, signup form).
10. Schedule Josh kickoff call for Platform schema (CLAUDE.md §11 blocker).

---

## 12. Bottom Line

- **v7 as internal tool:** ship-ready. Polish mobile + offline before May 4.
- **v7 as product:** don't. Rewrite on Platform. Already your plan.
- **Strongest wedge:** Tour Inbox SKU ($49/mo) — de-risks revenue before Platform is done.
- **Biggest risk:** offline gap + single-operator tours = fragile story until Platform ships.
- **Financials:** $150–350K FY2027 achievable. Bootstrap-viable. Seed only post-traction.
- **Competitive window:** 12–18 months before Master Tour catches up on AI. Move.

---

*End of analysis. No implementation in this plan — deliverable is the document itself.*
