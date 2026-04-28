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

- [2026-04-22 04:00 UTC] https://nextjs.org/blog/next-16 — Next.js 16 is STABLE (released Oct 2025, not RC); v16.2 shipped March 18, 2026 — CONTRADICTS prior memory entry (2026-04-21) which said "v16 appears in RC." Platform spec targets Next.js 15 but Dane's Jun/Jul window is post-v16-stable; scaffold decision must explicitly pin version.

- [2026-04-22 04:00 UTC] https://nextjs.org/docs/app/guides/upgrading/version-16 — Next.js 16 additional breaking changes beyond prior memory: params/searchParams in page components are now Promises (not plain objects), middleware.ts renamed to proxy.ts, Turbopack is the default bundler, Node.js 20.9+ required minimum, synchronous request API access fully removed — these affect dos-platform scaffold choices.

- [2026-04-22 04:00 UTC] https://platform.claude.com/docs/en/about-claude/models/overview — Anthropic released Opus 4.7 on April 16, 2026; starting April 23, 2026 the default model for Enterprise pay-as-you-go and Anthropic API users changes to Opus 4.7 — platform spec pins "Claude API (Sonnet 4.6)" which remains valid, but API default will shift; any code without explicit model pinning will route to Opus 4.7 and incur higher cost.

- [2026-04-22 04:00 UTC] https://supabase.com/changelog — Supabase GitHub integration now available on all plans including free tier: connect repo to deploy Postgres migrations from main branch via CI/CD — dos-tour-ops and dos-platform can automate migration deploys at $0 infra cost; use for Phase 0 schema workflow with Josh.

- [2026-04-22 04:00 UTC] https://supabase.com/changelog — Supabase Warehouse announced (Hydra acquisition, co-developed pg_duckdb): analytics queries on Postgres accelerated 600x via DuckDB integration — directly relevant to Phase 6 DOS Market Intel data pipeline; no separate OLAP infra needed if Supabase Warehouse ships before Phase 6.

- [2026-04-22 04:00 UTC] https://supabase.com/changelog — Multigres Kubernetes operator open sourced: horizontal sharding + intelligent sharding for Postgres, zero-downtime rolling upgrades, pgBackRest PITR backups, OTel tracing — long-term scaling option for dos-platform if single-tenant Supabase project hits limits post-Phase 8.

- [2026-04-22 04:00 UTC] https://supabase.com/changelog — BKND (open-source backend framework) joined Supabase; building a Lite offering for agentic workloads — monitor as potential lightweight backend layer for DOS agent architecture in Phase 4; stays open source.

- [2026-04-22 04:00 UTC] https://www.capterra.com/p/151939/FestivalPro/ — FestivalPro pricing starts at £249/month (~$315/mo at current rates) — CONTRADICTS CLAUDE.md which lists $45-499/mo; actual entry price is higher and GBP-denominated, which narrows DOS's festival pricing gap at the low end.

- [2026-04-22 04:00 UTC] https://thinkpeak.ai/self-hosting-n8n-on-railway/ — n8n Railway self-hosted cost is $8-20/mo depending on load — CONTRADICTS prior memory entry (2026-04-21) which cited ~$5/mo Hobby plan; use $8-20 range for Phase 4 budget planning.

- [2026-04-22 04:30 UTC] https://variety.com/2026/film/news/wasserman-agency-rebrands-the-team-1236682723/ — Wasserman rebranded as THE·TEAM effective March 9, 2026; operates at the.team — CLAUDE.md key contact Matt Adler is listed as "Wasserman (madler@the.team)"; email is correct but company name in CLAUDE.md should be updated to THE·TEAM.

- [2026-04-22 04:30 UTC] https://www.slalom.com/us/en/customer-stories/aeg-increased-growth-and-scalability — AEG Presents built a proprietary internal tour management platform called "Elvis" (built with Slalom), described as "industry gold standard for bookers, accountants, marketers, and ticketers"; Excel data flows in, execs get real-time global touring status — Elvis is internal/not commercial SaaS; directly defines the gap DOS fills for indie/mid-tier market that AEG serves only internally.

- [2026-04-22 04:30 UTC] https://www.ticketnews.com/2026/03/live-nation-leans-on-better-product-defense-as-states-press-vertical-integration-case/ — Live Nation antitrust trial ongoing in 2026 (state AGs pressing vertical-integration case, jury verdict already in, stock -6%); Bloomberg Apr 18 framing: "the fight is over yesterday's technology" as AI disrupts the model — structural breakup or forced divestiture would fragment venue+ticketing+promotion stack, creating openings for independent touring tech like DOS.

- [2026-04-22 04:30 UTC] https://newsroom.livenation.com/news/live-nation-entertainment-full-year-and-fourth-quarter-2025-results/ — Live Nation guided double-digit AOI growth in 2026; 80%+ of large-venue shows already booked; adding 20 major venues by end of 2026 (+6-7M fan capacity) — strong live market demand validates DOS's GTM timing; more shows = more ops complexity = more demand for tools like DOS Platform.

- [2026-04-22 05:00 UTC] https://www.iata.org/en/publications/api-pnr-toolkit/ — IATA API/PNR Toolkit: international standard for Advance Passenger Information (API = passport MRZ data: name, DOB, gender, nationality, passport number) and Passenger Name Records (PNR = booking data); 100+ countries require API, ~60 require PNR; EU routes all via eu-LISA centralized router; iAPI (2024) adds real-time pre-departure go/no-go per passenger. For bbno$ EU tour: airlines handle API submission on the Dublin inbound and Warsaw outbound flights; bus legs between Schengen countries have no API requirement. Outstanding French work authorization forms (Paris, Chambord, Villeurbanne) are separate labor permits, NOT resolved by API/PNR compliance. DOS Platform relevance: if DOS Advance collects crew/artist passport data, it touches API-schema fields (PAXLST format) and triggers GDPR Article 9 (identity/biometric data); design the travel document collection feature with this in mind before Phase 4.

- [2026-04-23 00:00 UTC] https://github.com/trpc/trpc/releases — tRPC v11.13.2 released March 2026: adds OpenAPI JSON schema generation for any appRouter (no separate openapi plugin required), new streamHeader option on httpBatchStreamLink — OpenAPI gen is new capability for dos-platform if REST compatibility or public API docs are needed; no breaking changes from prior v11 versions.

- [2026-04-23 00:00 UTC] https://n8n.io/pricing/ — n8n AI node library expanded in 2026 with native Claude and Gemini nodes plus Supabase Vector Store integration; AI Agent node runs LangChain tool agents natively — Phase 4 DOS agent workflows can call Claude and read/write Supabase Vector directly from n8n without custom code nodes.

- [2026-04-23 00:00 UTC] https://nextjs.org/blog/next-16-1 — Next.js 16.1 released: Turbopack file system caching (dev cache persists across server restarts, substantially faster cold starts), new built-in bundle analyzer, improved Node.js debugger integration — no breaking changes from v16.0; relevant for dos-platform dev workflow.

- [2026-04-23 00:00 UTC] https://nextjs.org/docs/app/guides/upgrading/version-16 — Next.js 16 requires TypeScript 5.1.0 minimum (not in prior memory entries) and bundles React 19.2 — dos-platform scaffold must pin TS >=5.1; verify tsconfig strict mode compatibility before scaffolding.

- [2026-04-23 00:00 UTC] https://vercel.com/changelog — Vercel Flags became GA on April 16, 2026: built-in feature flag provider in Vercel Dashboard with targeting rules, user segments, and environment controls — dos-platform can use Vercel Flags for Phase 5+ staged rollouts without adding GrowthBook or LaunchDarkly to the stack.

- [2026-04-23 00:00 UTC] https://vercel.com/pricing — Vercel reduced Turbo build machine pricing 16% in 2026: now $0.0035/CPU/min (was ~$0.00417); 30-CPU Turbo machine = $0.105/min — update build-cost projections in FINANCIALS.md.

- [2026-04-23 00:00 UTC] https://vercel.com/changelog — v0 by Vercel became production-ready February 2026: added Git integration, VS Code-style editor, Snowflake/AWS database connectivity, and agentic workflow support — relevant if Dane uses v0 to accelerate dos-platform scaffold in Jun/Jul window; can generate and push production-grade Next.js 16 code directly to a repo.

- [2026-04-26 04:00 UTC] https://supabase.com/changelog — Supabase dashboard AI-Powered Table Filters: describe in plain text what you want to find and the dashboard generates the correct Postgres filter — speeds Phase 0 schema exploration with Josh; not previously logged.

- [2026-04-26 04:00 UTC] https://supabase.com/changelog — Supabase Edge Functions now support drag-and-drop zip upload to deploy entire function bundles and migrate them between projects — simplifies dos-platform multi-environment Edge Function deployment; not previously logged.

- [2026-04-26 04:00 UTC] https://prism.fm/blog/insights/music-tour-planning-tools-that-unify-your-booking-workflow/ — Prism.fm: music tour planning platform targeting venues, promoters, and agencies; $3M ARR, $15M+ in funding; replaces spreadsheets for booking, financial tracking, and contract management — NEW competitor not in CLAUDE.md or prior memory; DOS differentiator is real-time ops + AI intel vs. Prism's booking/finance focus.

- [2026-04-26 04:00 UTC] https://wifitalents.com/best/music-tour-management-software/ — GigFinesse: musician-side booking and management platform with rider builders, drag-and-drop calendar, automated contracts + e-signatures, and payment processing — NEW competitor not previously tracked; rider builder overlaps DOS Advance feature set; aimed at independent artists/smaller acts, not full-tour ops.

- [2026-04-26 04:00 UTC] https://trpc.io/blog/announcing-trpc-v11 — tRPC v11 (already logged for breaking changes) adds Server-Sent Events (SSE) as a first-class subscription transport — NEW capability not in prior memory entry; relevant for dos-platform real-time advancing/ROS updates without WebSocket complexity.

- [2026-04-26 04:00 UTC] https://trpc.io/blog/announcing-trpc-v11 — tRPC v11 supports non-JSON content types natively: FormData, Blob, File, Uint8Array — NEW capability not in prior memory entry; directly enables file upload flows (advancing rider attachments, contract PDFs) in dos-platform without workarounds.

- [2026-04-26 04:00 UTC] https://trpc.io/docs/migrate-from-v10-to-v11 — tRPC v11 fifth breaking change not in prior memory: removed AbortControllerEsque ponyfill; apps targeting old browsers need abortcontroller-polyfill — low impact for dos-platform (modern browser targets), but flag for any server-side tRPC fetch calls.

- [2026-04-26 04:00 UTC] https://railway.com/deploy/n8n — CONTRADICTS 2026-04-22 memory entry ($8-20/mo from thinkpeak.ai): Railway's own docs and multiple practitioner sources (Medium Mar 2026, Railway deploy page) consistently cite ~$5/mo Hobby plan for standard n8n load; $8-20 range appears to reflect burst/production-stack (worker + webhook + Redis) configurations, not bare n8n — use $5/mo for single-instance Phase 4 estimate, $15-20/mo for production queue-mode stack.

- [2026-04-26 05:00 UTC] https://github.com/supabase/supabase/releases/tag/v1.26.04 — Supabase April 2026 update upgraded Data API to PostgREST v14: ~20% more RPS for GET requests per benchmarks — directly improves dos-platform read-heavy endpoints (advancing, ROS, transport views); no config change needed, automatic upgrade.

- [2026-04-26 05:00 UTC] https://growthlist.co/list-of-funded-music-startups/ — Daysheets: touring software built by tour and production managers, current clients include Billie Eilish and John Legend — NEW competitor not in CLAUDE.md or prior memory; crew-first tooling aimed at same production manager persona DOS targets; monitor for feature overlap with ROS and day-sheet generation.

- [2026-04-26 05:00 UTC] https://growthlist.co/list-of-funded-music-startups/ — Gigwell: vertical SaaS for touring artists, agencies, and management; 100K+ users, $5B+ in gigs facilitated; covers booking workflow, contracts, payments — NEW competitor not previously tracked; booking/contract focus overlaps advancing and rider features; larger installed base than any competitor logged so far.

- [2026-04-27 05:00 UTC] https://buttondown.com/waterandmusic/archive/music-tech-ownership-ouroboros-2026-edition/ — CONTRADICTS 2026-04-22 memory entry (antitrust trial "ongoing"): DOJ reached a surprise settlement with Live Nation in late April 2026 per Cherie Hu's 2026 Ouroboros — settlement removes near-term forced breakup/divestiture scenario; fragmentation tailwind for independent touring tech is reduced but not eliminated.

- [2026-04-27 05:00 UTC] https://github.com/supabase/supabase/releases/tag/v1.26.03 — Supabase Storage March 2026 overhaul: object listing 14.8x faster on 60M+ row datasets (hybrid skip-scan + cursor pagination replacing 6-trigger prefixes table); path traversal vulnerability closed; orphan objects from direct SQL deletes blocked — affects dos-tour-ops and dos-platform storage reliability at scale.

- [2026-04-27 05:00 UTC] https://github.com/supabase/supabase/releases/tag/v1.26.04 — Supabase pg-delta experimental declarative schema CLI (April 2026): describe schema in pure SQL, generate migrations automatically, CI-friendly flags, debug support — distinct from GitHub integration already logged; reduces manual migration drift risk in Phase 0 schema work with Josh.

- [2026-04-27 05:00 UTC] https://edmidentity.com/2025/10/22/blondish-gigwell-eco-rider-2-0/ — Gigwell launched Eco-Rider 2.0 (Oct 2025) with BLOND:ISH Foundation's Bye Bye Plastic, adding sustainability/green rider tooling to their platform across 100K+ users — adds differentiated positioning angle to Gigwell beyond booking/contracts; not a direct DOS threat but signals that eco-rider could become a baseline feature expectation.

- [2026-04-27 05:00 UTC] https://starterpick.com/blog/t3-stack-2026 — Developer community consensus (Apr 2026): Midday.so is the recommended open-source reference architecture for T3 + Supabase without Prisma — Midday uses Next.js + tRPC + Supabase directly (no Prisma ORM layer), which matches the dos-platform target stack; use as scaffold reference before Dane's Jun/Jul build window.

## promoted

<!-- Weekly consolidation moves validated patterns here -->
