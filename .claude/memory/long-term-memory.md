# Long-Term Memory

## new_learnings

<!-- Scout entries appended here -->

- [2026-06-29 02:00 UTC] https://mlq.ai/news/supabase-raises-500m-series-f-at-105b-valuation-doubles-in-8-months/ — Supabase raised $500M Series F at $10.5B valuation (doubled in 8 months); over $1B total raised; platform maturity de-risks DOS's Supabase dependency
- [2026-06-29 02:00 UTC] https://supabase.com/changelog — Supabase shipped Multigres: scalable Postgres OS with sharding, connection pooling, automatic failover, and backup orchestration; relevant if DOS Platform hits multi-tenant scale limits
- [2026-06-29 02:00 UTC] https://supabase.com/changelog — Supabase Auth now has Passkeys beta (WebAuthn; Face ID, Touch ID, Windows Hello, hardware keys); alternative to current Google OAuth gate
- [2026-06-29 02:00 UTC] https://supabase.com/changelog — Supabase AI Agent Plugin ships: bundles MCP server + agent skills so Claude/coding agents can query DBs, manage migrations, deploy Edge Functions; directly usable in DOS Platform Claude integration
- [2026-06-29 02:00 UTC] https://supabase.com/changelog — Supabase Realtime now supports binary Broadcast payloads (in addition to JSON); useful for high-frequency transport/ROS state updates in DOS
- [2026-06-29 02:00 UTC] https://supabase.com/changelog — Supabase branching without Git is now the default; branches can be created from dashboard without GitHub integration, lowers friction for DOS Platform staging environments
- [2026-06-29 02:00 UTC] https://nextjs.org/blog/next-16 — Next.js 16 is current stable (16.2.7 as of June 2026); DOS Platform is specced on Next.js 15 — key breaking changes: middleware.ts replaced by proxy.ts with different runtime, Turbopack default, async-only params/cookies/headers (sync access removed), legacy AMP and runtime configs removed; plan migration or lock at 15
- [2026-06-29 02:00 UTC] https://tech.eu/2026/01/21/tourmanagement-bv-acquires-beatswitch-in-live-music-software-deal/ — BeatSwitch acquirer is Tourmanagement.com (Leuven, Belgium): a touring mgmt platform that now also owns BeatSwitch's festival advancing product; combined, they cover touring ops + festival artist advancing in one company — closer direct competitor to DOS moat than previously framed
- [2026-06-29 02:00 UTC] https://railway.com/deploy/n8n — n8n on Railway latest template (March 2026) uses n8nio/n8n:2.19.2 in queue mode with dedicated worker pool, Redis (BullMQ), and PostgreSQL; cost ~$5-14/month; confirms current DOS n8n/Railway stack is up to date

- [2026-07-13 03:00 UTC] https://supabase.com/changelog/45827-deprecation-notice-support-for-postgres-14-ending-on-1st-july-2026 — Supabase dropped Postgres 14 support July 1, 2026; v7 Supabase project and DOS Platform must be on PG15+ — verify both projects' Postgres version
- [2026-07-13 03:00 UTC] https://supabase.com/changelog — Supabase self-hosted API_EXTERNAL_URL config changes week of July 6, 2026: must include /auth/v1 path prefix; SAML SSO routes move from /sso/saml/* to /auth/v1/sso/saml/*; affects DOS Platform if self-hosted Supabase is considered
- [2026-07-13 03:00 UTC] https://supabase.com/changelog — @supabase-labs/tanstack-db alpha: syncs TanStack DB collections with Supabase tables over PostgREST + Realtime; alternative real-time state layer worth evaluating for DOS Platform transport/ROS live state
- [2026-07-13 03:00 UTC] https://www.digitalapplied.com/blog/supabase-js-typescript-5-minimum-migration-checklist-2026 — supabase-js now requires TypeScript 5.0+ minimum; migration concern for v7 (Vite + React 18) if pinned on TS4
- [2026-07-13 03:00 UTC] https://github.com/trpc/trpc/releases — tRPC v11.16.0 (March 28, 2026) + v11.18.0 (June 18, 2026) released; no breaking changes from v11.0; v11.18 adds OpenAPI server URL support; DOS Platform tRPC dependency is current and stable
- [2026-07-13 03:00 UTC] https://nextjs.org/docs/app/guides/upgrading/version-16 — Next.js 16 additional breaking details not in prior entry: Node.js 20.9+ minimum (Node 18 dropped); revalidateTag now requires second cacheLife argument; next lint fully removed from CLI (CI can pass silently without linting)
- [2026-07-13 03:00 UTC] https://www.accessallareas.net.au/blog/2026-05-01-touring-logistics-software-2026/ — Master Tour 2026 mobile update polarizing: some users call it "LEAGUES beyond" prior version, others call it "horrible with too many redundant tabs"; UX weakness is a differentiation angle for DOS
- [2026-07-13 03:00 UTC] https://starterpick.com/guides/trpc-v11-vs-orpc-vs-ts-rest-type-safe-rpc-saas-boilerplates-2026 — oRPC emerging as lightweight tRPC alternative in 2026 SaaS boilerplate comparisons; DOS Platform is tRPC-committed but worth monitoring as the ecosystem fragments

## promoted

<!-- Weekly consolidation moves validated patterns here -->
