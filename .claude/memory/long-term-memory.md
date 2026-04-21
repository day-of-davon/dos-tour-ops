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

## promoted

<!-- Weekly consolidation moves validated patterns here -->
