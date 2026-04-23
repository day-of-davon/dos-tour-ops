# ROADMAP — Trigger-Based Phases

**Rule:** phases have entry trigger, exit trigger, red flag, and leading indicator. Dates are *targets*, triggers are *truth*.

**Legend:** 🟢 active | 🟡 gated | ⚪️ not started | ✅ done | ❌ killed

---

## Phase 0 — Platform foundation
**Target:** May 3, 2026 | **Status:** ⚪️

- **Entry:** Josh signed SOW + Supabase project created + GitHub org for DOS LLC.
- **Exit:** Next.js 15 + tRPC v11 scaffold, multi-tenant auth, Advance CRUD parity.
- **Red flag:** Josh unavailable 2+ weeks or schema audit not delivered by May 15.
- **Leading indicator:** weekly PRs merged to `dos-platform` repo ≥ 3.

---

## Phase 1 — Dashboard, dispatch, driver PWA
**Target:** May 4–31, 2026 | **Status:** ⚪️

- **Entry:** Phase 0 exit.
- **Exit:** Dispatch ops MVP + PWA installable + logic extracted from v7.
- **Red flag:** Dane bandwidth < 0.3 FTE two weeks running.
- **Leading:** PWA installs by me + Olivia ≥ 2.

---

## Phase 2 — Maps, real-time, GPS tracking, conflict detection
**Target:** Jun 1–28, 2026 | **Status:** ⚪️

- **Entry:** Phase 1 exit.
- **Exit:** GPS live on at least one festival driver's device.
- **Red flag:** Google Maps API cost > $200/mo before revenue.
- **Leading:** GPS-tracked minutes per week ≥ 100.

---

## Phase 3 — Bus schedule, hardening, load test
**Target:** Jun 29–Jul 26, 2026 | **Status:** ⚪️

- **Entry:** Phase 2 exit.
- **Exit:** 350-run load test pass, p95 latency < 500ms.
- **Red flag:** Load test misses > 2 weeks before Elements.
- **Leading:** weekly load-test runs ≥ 1.

---

## Phase 4 — Advances, DOS Advance, n8n, structured logging
**Target:** parallel with P3 | **Status:** ⚪️

- **Entry:** Tour Inbox ≥ 10 paying subs.
- **Exit:** Intel multi-tenant + cost metering + n8n agents live.
- **Red flag:** Claude $/scan > $0.15 (margin breach).
- **Leading:** weekly scan success rate > 85%.

---

## Phase 5 — Crew tab, DOS Benchmark
**Target:** parallel with P3 | **Status:** ⚪️

- **Entry:** Phase 4 exit or 5+ tours comparing data (whichever first).
- **Exit:** Benchmark scoring live with ≥ 3 tours' data.
- **Red flag:** < 3 tours willing to share data.
- **Leading:** opt-in rate from onboarded tours.

---

## Elements festival (hard deadline)
**Target:** Aug 7–10, 2026 | **Status:** 🟡

- **Entry:** Phase 2 exit.
- **Exit:** Zero-downtime 4-day event.
- **Red flag:** Load test fails by Jul 24 → revert to manual ops + offer partial refund.
- **Leading:** weekly dispatch dry-run pass rate.

---

## Phase 6 — DOS Market Intel, Global, DeerFlow
**Target:** Sep–Oct 2026 | **Status:** ⚪️

- **Entry:** Phase 5 exit + $2K+ MRR.
- **Exit:** Weekly market briefs shipping to paid customers.
- **Red flag:** No paid adoption in 4 weeks after launch.
- **Leading:** brief open rate by subscribers.

---

## Phase 7 — DOS Social, production deploy
**Target:** Jul 27–Aug 15, 2026 | **Status:** ⚪️

- **Entry:** Phase 3 exit.
- **Exit:** Production deployment stable, SLO defined.
- **Red flag:** production incident > 1/wk after deploy.
- **Leading:** error rate trend week-over-week.

---

## Phase 8 — Multi-tenant auth, Stripe, public launch
**Target:** Oct–Dec 2026 | **Status:** ⚪️

- **Entry:** Phase 7 exit + 10+ paying tours.
- **Exit:** First external (non-network) customer paid.
- **Red flag:** no external signups in 30 days post-launch.
- **Leading:** signup conversion from landing page.

---

## Phase 9 — API, white-label, Enterprise SSO
**Target:** Q1 2027 | **Status:** ⚪️

- **Entry:** Phase 8 exit + 1 enterprise inbound.
- **Exit:** API docs public, 1 white-label partner signed.
- **Red flag:** zero enterprise inbound by end of Q4 2026.
- **Leading:** enterprise-tier inquiries per quarter.

---

## Revenue Gate alignment

| Gate | Burn ceiling | Infra posture | Current |
|---|---|---|---|
| 0 | $0–200/mo | Supabase free, Vercel hobby | 🟢 |
| 1 | $200–500/mo | Supabase Pro, Vercel Pro, Twilio | |
| 2 | $500–2K/mo | Railway, Stripe Connect, DeerFlow | |
| 3 | $2K+/mo | Dedicated infra, OSRM, enterprise support | |

Do not add infra that breaches current gate without revenue to match.

---

## v7 work-in-progress (pre-EU tour)

Source: CLAUDE.md §7. Ship before May 4.

- [ ] Prompt 1: auth + storage split + notes + custom checklist + status buttons
- [ ] Prompt 2: Gmail intel panel + auto-toggle + show nav
- [ ] Offline read-mode (IndexedDB mirror of `app_storage`) **← revenue-blocking for EU**
- [ ] Mobile thumb-test on iPhone 15
- [ ] Remove hardcoded `MY_EMAIL` in [api/comms.js:7](api/comms.js)
- [ ] Prettier + ESLint + pre-commit
- [ ] Playwright smoke tests: login, intel scan, ledger edit
- [ ] Crew tab — port from v5 `App.jsx` (Phase 5 target)

### Advance status buttons — design spec (Prompt 1 detail)

- Single click cycles: Pending → In Progress → Confirmed.
- Long-press / right-click opens popover with all 9 states.
- Mobile: tap opens popover.
- Colors: Confirmed=green, Escalate=red, Follow Up/Respond=amber, In Progress=blue, Sent/Received=slate, N/A=muted + strikethrough.
- Storage: shared if item is shared, private if item is private.

### Auto-toggle from email scrape (Prompt 2 detail)

- Shared checklist item confirmed → shared storage, visible to all users.
- Private item confirmed → private storage, user only.
- One-click "Confirm" always required before marking complete.
- Undo available for 30 seconds after confirm.
- Never auto-confirms without user action.

---

## Phase 0 blocking backlog (pre-Platform)

Source: CLAUDE.md §11. Unblock before Phase 0 entry.

- [ ] Create GitHub org for DOS LLC.
- [ ] Create `dos-platform` repo (Next.js 15 scaffold).
- [ ] Create new Supabase project for platform (separate from v7).
- [ ] Contact Josh Gallegos (check PayPal first).
- [ ] Install SuperClaude, GWS CLI, Claude Task Master.
