# Long-Term Memory — DOS Research Scout

## new_learnings

- [2026-06-14 06:00 UTC] https://supabase.com/changelog/45702-developer-update-may-2026 — Supabase raised $500M Series F at $10B pre-money valuation (GIC-led, June 2026); platform stability de-risked for long-term bet
- [2026-06-14 06:00 UTC] https://supabase.com/changelog/45702-developer-update-may-2026 — Supabase RLS Tester preview (April 2026); directly useful for auditing DOS's RLS policies before platform launch
- [2026-06-14 06:00 UTC] https://supabase.com/changelog/45702-developer-update-may-2026 — Supabase now supports per-table and per-function toggles to control PostgREST/GraphQL exposure (May 2026); relevant to team/private Supabase storage split decision
- [2026-06-14 06:00 UTC] https://supabase.com/changelog/41796-developer-update-january-2026 — Supabase Beta Passkeys (WebAuthn) for Auth (June 2026); passwordless alternative to Google OAuth gate — worth evaluating against current OAuth-only strategy
- [2026-06-14 06:00 UTC] https://tech.eu/2026/01/21/tourmanagement-bv-acquires-beatswitch-in-live-music-software-deal/ — BeatSwitch acquirer confirmed as Tourmanagement.com (Tourmanagement BV, Leuven, Belgium); combined entity now serves 400+ customers and ~10,000 users; creates end-to-end touring+festival advancing platform — direct competitive threat to DOS's combined ROS+advancing moat
- [2026-06-14 06:00 UTC] https://www.abhs.in/blog/nextjs-current-version-march-2026-stable-release-whats-new — Next.js 16.2.7 is current stable as of June 2026; DOS Platform planned on Next.js 15 — evaluate upgrade path before platform scaffolding begins
- [2026-06-14 06:00 UTC] https://railway.com/deploy/n8n-production-stack — n8n Railway production stack template (March 2026) now includes full queue-mode: main instance + dedicated worker + webhook processor + PostgreSQL + Redis, all pre-wired; upgrade path available from current single-node deploy
- [2026-06-14 06:00 UTC] https://trpc.io/blog/announcing-trpc-v11 — tRPC v11 Next.js adapter rewritten to support React Server Components and server actions natively; no separate adapter shim needed in DOS Platform's Next.js 15/16 app router setup

- [2026-06-14 06:00 UTC] https://supabase.com/changelog/41796-developer-update-january-2026 — UPDATES 2026-04-21 valuation entry ($5B Oct 2025): Supabase raised $500M Series F at $10B pre-money valuation in June 2026, led by GIC; infrastructure dependency risk now de-risked further; Supabase is well-capitalized with category-defining scale — no change to dos-platform stack decision, reinforces the bet.

- [2026-06-14 06:00 UTC] https://supabase.com/changelog/41796-developer-update-january-2026 — Supabase Beta Passkeys (WebAuthn) now available in Supabase Auth (June 2026); passwordless, phishing-resistant sign-in as a first-class Auth option — NOT in prior memory; relevant to dos-platform auth architecture: current plan gates on Google OAuth only; Passkeys could be offered as an alternative for touring professionals who prefer hardware keys or biometric device auth; evaluate against Google OAuth gate before platform scaffolding.

- [2026-05-29 00:00 UTC] https://supabase.com/changelog — Supabase Passkeys beta launched May 28, 2026: WebAuthn-based passwordless auth (biometrics via Face ID/Touch ID/Windows Hello, device PIN, hardware security keys); public key stored in Supabase Auth, private key stays on user's authenticator; configured via CLI and Management API; currently experimental with explicit opt-in required (API may change without notice) — distinct from Google OAuth gate and custom OIDC entries already logged; relevant for dos-platform Phase 9 enterprise auth if customers require phishing-resistant MFA beyond OAuth; not production-ready yet, monitor for GA.

- [2026-06-15 05:00 UTC] https://valueaddvc.com/blog/supabase-500m-series-f-10-billion-valuation-june-2026 — Supabase raised $500M Series F at $10.5B valuation (June 4, 2026), led by GIC with Accel, YC, Coatue, Stripe, Salesforce Ventures; AI agents (Claude Code cited as single largest contributor since Jan 2026) now drive majority of new database creation on the platform; platform health signal: Supabase is well-capitalized at decacorn scale, infrastructure dependency risk remains low.

- [2026-06-15 05:01 UTC] https://www.eventric.com/pricing-plans-tour-management-software/ — Master Tour annual plan confirmed at $64.99/mo (vs $74.99/mo month-to-month); prior context only noted the monthly price; annual option tightens the gap with DOS's $99/mo entry tier — DOS pricing deck should acknowledge and justify the delta vs Master Tour annual.

- [2026-06-15 06:30 UTC] https://supabase.com/blog/branching-without-git-is-now-the-default — Supabase branching without Git is now default for all projects (May 4, 2026); full branch/merge workflow via dashboard only, no GitHub connection required; each branch gets isolated instance with schema copy but no production data — changes DOS v7 environment management: can safely preview schema changes before merging to main without CLI setup

- [2026-06-15 06:30 UTC] https://trpc.io/docs/migrate-from-v10-to-v11 — tRPC v11 concrete breaking changes beyond RSC support (not in prior entry): (1) requires TanStack Query v5 — v4 users face double migration; (2) enforces Content-Type header on POST requests — mismatches return 415 Unsupported Media Type; (3) AbortController ponyfill removed; subscription type inference changed for async generators — all must be accounted for before DOS Platform scaffolding

- [2026-06-15 06:30 UTC] https://nextjs.org/blog/next-16 — Next.js 16 (Oct 2025): Turbopack now stable AND default for both dev and production builds (was experimental); "use cache" directive for explicit, granular cache control on pages/components/functions; bundles React 19.2; 16.2 (March 2026) adds AI Agent DevTools and browser log forwarding — prior memory only said "evaluate upgrade path"; these are concrete features that affect DOS Platform build config and caching strategy

- [2026-06-15 06:30 UTC] https://supabase.com/changelog/45702-developer-update-may-2026 — Supabase Stripe Sync Engine one-click dashboard integration (early 2026): query Stripe customers, subscriptions, invoices, and payments directly via SQL in Supabase dashboard; no custom ETL needed — relevant to DOS Platform billing layer; reduces implementation cost for subscription management visibility

- [2026-06-15 06:30 UTC] https://supabase.com/changelog/45702-developer-update-may-2026 — Supabase Log Drains launched on Pro plan (March 2026): supported destinations include Datadog, Grafana Loki, Sentry, Axiom, and S3; also object listing is 14.8x faster on 60M+ row datasets — Log Drains relevant to DOS Platform observability stack; object listing improvement relevant if tour media/assets scale

## promoted

<!-- entries graduate here after being actioned or built against -->
