# Long-Term Memory

## new_learnings

<!-- Scout entries appended here -->

- [2026-07-19 03:00 UTC] https://pypi.org/project/pyvroom/ — VROOM active: pyvroom 1.15.2 released April 22, 2026 (1.15.0 March 2026); vroom-express also updated March 2026; confirms VROOM VRP solver is under active maintenance, not stale
- [2026-07-25 03:00 UTC] https://supabase.com/changelog/47796-developer-update-july-2026 — Supabase Pipelines now in public alpha with schema change support, faster initial sync, and new destination request form for ClickHouse, Snowflake, DuckLake; actionable for DOS Platform analytics pipeline
- [2026-07-25 03:00 UTC] https://www.digitalapplied.com/blog/supabase-self-hosted-envoy-gateway-migration-2026 — Supabase self-hosted Docker stack switches default API gateway from Kong to Envoy week of August 9, 2026; Kong becomes opt-in override; breaking for any self-hosted DOS infra
- [2026-07-25 03:00 UTC] https://supabase.com/changelog/47796-developer-update-july-2026 — Supabase Wrappers v0.6.2 adds MongoDB foreign data wrapper; can query/join MongoDB collections directly from Postgres
- [2026-07-25 03:00 UTC] https://supabase.com/changelog/47796-developer-update-july-2026 — Supabase Postgres log_connections now defaults to off for new projects as of July 9, 2026; existing Free/Pro projects being migrated; minor ops/debugging impact
- [2026-07-25 03:00 UTC] https://nodesify.com/blog/n8n-workflow-automation-guide-2026 — n8n 2.x (self-hosted Community Edition) ships full AI Agent node with native tool-calling across Claude, GPT-4o, Gemini, Groq; multi-agent orchestration, RAG, human-in-the-loop controls, spatial Canvas UI, autosave/versioned publishing; no execution limits in CE; significantly expands DOS n8n utility beyond basic workflows
- [2026-07-25 03:00 UTC] https://blog.lennd.com/monterey-jazz-festival-lennd-partnership — Lennd announced acquisition of OnTrack ("Lennd grows stronger with OnTrack to revolutionize global event management"); competitive consolidation in festival ops space; Lennd now covers more of the advancing+ops surface
- [2026-07-25 03:00 UTC] https://www.streetinsider.com/Press+Releases/TourSyncer+Announces+Launch+of+All+in+One+Tour+Management+Platform+TourSyncer.com+to+Streamline+Post+Booking+Operations+for+Tour+Operators/26623042.html — TourSyncer.com launched June 9, 2026 (Dallas TX); all-in-one tour management platform targeting post-booking ops, staff scheduling, itinerary, invoicing, analytics; focused on travel/tourism operators but adjacent; monitor for music touring pivot

## promoted

<!-- Weekly consolidation moves validated patterns here -->

### [PROMOTED 2026-07-19] Supabase

- [2026-06-29] Supabase raised $500M Series F at $10.5B valuation; platform maturity de-risks DOS Supabase dependency → supabase-updates.md
- [2026-06-29] Supabase shipped Multigres: sharding, connection pooling, automatic failover, backup orchestration → supabase-updates.md
- [2026-06-29] Supabase Auth Passkeys beta (WebAuthn; Face ID, Touch ID, Windows Hello, hardware keys) → supabase-updates.md
- [2026-06-29] Supabase AI Agent Plugin: MCP server + agent skills for Claude/coding agents → supabase-updates.md
- [2026-06-29] Supabase Realtime binary Broadcast payloads (in addition to JSON) → supabase-updates.md
- [2026-06-29] Supabase branching without Git now default → supabase-updates.md
- [2026-07-13] Supabase dropped Postgres 14 support July 1, 2026; v7 and DOS Platform must be on PG15+ → supabase-updates.md
- [2026-07-13] Supabase self-hosted API_EXTERNAL_URL must include /auth/v1 path prefix (breaking, week of July 6) → supabase-updates.md
- [2026-07-13] @supabase-labs/tanstack-db alpha: syncs TanStack DB with Supabase over PostgREST + Realtime → supabase-updates.md
- [2026-07-13] supabase-js requires TypeScript 5.0+ minimum → supabase-updates.md
- [2026-07-19] Supabase Postgres 17 available as opt-in since April 2026 on hosted → supabase-updates.md
- [2026-07-19] supabase-js client libraries emit W3C-compatible OpenTelemetry traces → supabase-updates.md
- [2026-07-19] ChatGPT + Supabase integration GA: 29 MCP tools → supabase-updates.md
- [2026-07-19] Supabase app in Stripe Marketplace GA → supabase-updates.md

### [PROMOTED 2026-07-19] Next.js

- [2026-06-29] Next.js 16 current stable (16.2.7); middleware.ts replaced by proxy.ts, Turbopack default, async-only params/cookies/headers, legacy AMP removed → nextjs-updates.md
- [2026-07-13] Next.js 16 additional breaking: Node.js 20.9+ required, revalidateTag needs cacheLife arg, next lint removed from CLI → nextjs-updates.md
- [2026-07-19] Next.js 14 officially legacy June 2026; migration path 14→15→16; DOS Platform spec on 15 is correct holding position → nextjs-updates.md

### [PROMOTED 2026-07-19] Competitors

- [2026-06-29] BeatSwitch acquired by Tourmanagement.com (Leuven, Belgium); combined entity covers touring ops + festival advancing; closer direct competitor than previously framed → competitor-intel.md
- [2026-07-13] Master Tour 2026 mobile update polarizing; UX weakness is DOS differentiation angle → competitor-intel.md
- [2026-07-19] Convene (Show HN, March 2026): marketplace + management for event organizers; adjacent to DOS festival space → competitor-intel.md

### [PROMOTED 2026-07-19] tRPC

- [2026-07-13] tRPC v11.16.0 + v11.18.0 released; no breaking changes from v11.0; v11.18 adds OpenAPI server URL support → trpc-updates.md
- [2026-07-13] oRPC emerging as lightweight tRPC alternative; DOS Platform tRPC-committed but monitor → trpc-updates.md

### [PROMOTED 2026-07-19] n8n / Railway

- [2026-06-29] n8n Railway template (n8nio/n8n:2.19.2, queue mode, Redis/BullMQ, PostgreSQL, ~$5-14/mo) confirmed up to date → n8n-railway-updates.md
- [2026-07-19] n8n-MCP Railway one-click template (czlonkowski/n8n-mcp): exposes 1,084+ n8n nodes + 2,700+ workflow templates to Claude; direct bridge between DOS Claude integration and n8n → n8n-railway-updates.md
