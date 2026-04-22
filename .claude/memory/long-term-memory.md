# Long-Term Memory

## new_learnings

<!-- Scout entries appended here -->

- [2026-04-20 00:00 UTC] https://tech.eu/2026/01/21/tourmanagement-bv-acquires-beatswitch-in-live-music-software-deal/ — BeatSwitch acquired by Tourmanagement.com (Belgian artist platform, Jan 22 2026), explicitly combining artist advancing + festival workflows; used by Pukkelpop, Shambhala, Sziget — acquirer identity narrows the competitive gap with DOS's artist+ops moat more than "acquired" alone implied.

- [2026-04-20 00:00 UTC] https://trpc.io/blog/announcing-trpc-v11 — tRPC v11 stable released 2025-03-21; breaking: requires React Query v5 (double migration if on v4), removed .interop() mode, explicit Content-Type header enforcement (returns 415 if wrong), input materialized lazily so createContext no longer has procedure type — platform build must account for all four.

- [2026-04-20 00:00 UTC] https://supabase.com/changelog — pg_graphql disabled by default on all new Supabase projects (security hardening); new dos-platform Supabase project will not expose GraphQL endpoint by default — no action needed unless GraphQL is planned.

- [2026-04-20 00:00 UTC] https://supabase.com/changelog — Log Drains now available on Supabase Pro plan; supports Datadog, Grafana Loki, Sentry, Axiom, S3, custom endpoint — directly enables Phase 4 structured logging plan without extra infra.

- [2026-04-20 00:00 UTC] https://supabase.com/changelog — One-click Stripe Sync Engine integration in Supabase dashboard; query customers, subscriptions, invoices via standard SQL — accelerates Phase 8 Stripe Connect implementation.

- [2026-04-20 00:00 UTC] https://github.com/VROOM-Project/vroom — pyvroom 1.15.0 released March 2026; new API params: max_distance per vehicle (travel distance constraints) and fixed_cost + cost_per_hour per vehicle (cost optimization) — both relevant to festival driver dispatch logic Josh will build.

- [2026-04-20 00:00 UTC] https://railway.com/deploy/n8n-mcp-2 — n8n-MCP Railway template now available, bridging AI assistants to 1,084+ n8n nodes and 2,700+ workflow templates; relevant if DOS agents need to trigger n8n workflows programmatically from Claude.

- [2026-04-20 00:00 UTC] https://www.landbase.com/blog/fastest-growing-travel-tech — TourOptima: AI-powered tour operations SaaS, 400% YoY growth — new competitor not previously tracked; focus appears to be travel/tour operator side, not live music/festival dispatch, but monitor.

- [2026-04-20 00:00 UTC] https://www.researchandmarkets.com/reports/4829971/festival-management-software-market-global — Festival Management Software Market: $872.87M (2025) → $982.69M (2026), 13.69% CAGR through 2032 — confirms market size for DOS Platform GTM and investor materials.

- [2026-04-21 04:00 UTC] https://supabase.com/changelog — RLS now enabled by default on all new Supabase projects; Security Advisor tool live with AI-assisted fix suggestions — dos-platform Phase 0 Supabase project will have RLS on by default; use Security Advisor during schema audit with Josh.

- [2026-04-21 04:00 UTC] https://supabase.com/changelog — Supabase projects can now act as a full Identity Provider ("Sign in with [Your App]"); enables federated auth flows — relevant for Phase 9 multi-tenant SSO and white-label enterprise tier.

- [2026-04-21 04:00 UTC] https://supabase.com/aws-reinvent-2025 — Supabase Vector Buckets (specialized vector storage) and Analytics Buckets (Apache Iceberg + Amazon S3 Tables) announced at AWS re:Invent Dec 2025 — Analytics Buckets directly relevant to Phase 6 DOS Market Intel data pipeline; Vector Buckets relevant if semantic search added to advancing or intel features.

- [2026-04-21 04:00 UTC] https://railway.com/deploy/n8n-production-stack — n8n Railway production stack template includes queue-mode: main UI + worker + webhook processor + Postgres + Redis, one-click deploy, ~$5/mo Hobby plan — more robust than bare n8n deploy; use this template for Phase 4 n8n setup, not the bare template.

- [2026-04-21 05:30 UTC] https://github.com/supabase/supabase/releases/tag/v1.26.03 — Supabase Edge Functions rate limiting live as of March 6, 2026: outbound fetch() calls from Edge Functions to other Edge Functions within the same project are now rate-limited; avoid nested Edge Function call patterns in dos-platform agent architecture.

- [2026-04-21 05:30 UTC] https://github.com/orgs/supabase/discussions/42531 — Supabase OpenAPI schema endpoint via anon key deprecated March 11, 2026: returns "Access to schema is forbidden" — service_role key required for schema introspection; update dev tooling and any schema-diffing scripts for Phase 0 Josh audit to use service_role.

- [2026-04-21 05:30 UTC] https://github.com/VROOM-Project/pyvroom — pyvroom 1.15.0 (March 2026) additional details beyond prior entry: new max_jobs param per vehicle for load distribution control; performance improved to avg 360ms for 100-delivery problems; optimality gap reduced to 1.63% (was 1.81%).

- [2026-04-21 05:30 UTC] https://n8n.io/pricing/ — n8n removed all active workflow limits across all plans (April 2026); billing now execution-only; Community Edition (self-hosted) remains 100% free with unlimited workflows and executions — Phase 4 n8n on Railway has no workflow-count ceiling regardless of growth.

- [2026-04-21 05:30 UTC] https://www.eventric.com/ — Master Tour has expanded product line to include Master Tour Venue, Crew, and Ticketing modules; CLAUDE.md competitive entry understates their scope (previously: itineraries, day sheets, 150K contacts, offline only); reassess competitive gap, particularly on Crew tab which DOS has not yet shipped.

- [2026-04-21 05:30 UTC] https://noadohler.com/live-music-industry-shakeup-touring-tech-tools-and-ticketing-trends-in-2026/ — TourSync launched 2026: creator workflow tools + real-time ticketing analytics + fan discovery marketplace; source is personal blog (low authority), not independently verified — flag for monitoring, not yet confirmed competitive threat.

- [2026-04-21 05:30 UTC] https://techcrunch.com/2025/10/03/supabase-nabs-5b-valuation-four-months-after-hitting-2b/ — Supabase reached $5B valuation Oct 2025 (up from $2B in Jun 2025); infrastructure dependency risk low; Supabase is well-capitalized and scaling; confirms safe bet for both v7 and dos-platform long-term.

- [2026-04-21 06:00 UTC] https://nextjs.org/docs/app/guides/upgrading/version-16 — Next.js 16 upgrade guide is live; current stable is 15.2.4 (March 2026); v16 appears in RC — platform spec targets Next.js 15, but Dane's Jun/Jul build window may coincide with a major version decision; monitor before scaffolding dos-platform.

- [2026-04-21 06:00 UTC] https://github.com/supabase/supabase/releases/tag/v1.26.04 — Supabase Studio April 2026: "Fix with Assistant" buttons live throughout dashboard with Claude/ChatGPT dropdown for SQL error resolution — directly speeds up Phase 0 schema work with Josh; no tooling change needed.

- [2026-04-21 06:00 UTC] https://github.com/supabase/supabase/releases/tag/v1.26.04 — Supabase is co-design partner in Stripe Projects CLI (provisions and connects Supabase + Vercel + Clerk, auto-syncs credentials to .env from terminal) — distinct from the Stripe Sync Engine already logged; reduces Phase 8 Stripe Connect setup friction.

- [2026-04-21 06:00 UTC] https://github.com/supabase/supabase/releases/tag/v1.26.04 — Supabase secret keys now have GitHub Push Protection blocking accidental commits before they land — ops security improvement; relevant for both day-of-davon/dos-tour-ops and future dos-platform repo.

- [2026-04-21 06:00 UTC] https://support.eventric.com/hc/en-us/articles/46286508608532-Master-Tour-Mobile-7-1-10-Beta-2026-02-20 — Master Tour Ticketing allocates comps, sends guest emails, exports guest lists, and feeds data back into nightly settlements; CLAUDE.md competitive entry understates this — Master Tour now has settlement integration via ticketing, partially closing the competitive gap with DOS's Finance tab.

- [2026-04-21 06:00 UTC] https://www.eventric.com/ — Master Tour now supports offline tour editing with automatic sync on reconnect — DOS v7 (Supabase-backed, always-online) has no offline mode; EU tour reliability risk if connectivity drops on show day.

## promoted

<!-- Weekly consolidation moves validated patterns here -->
