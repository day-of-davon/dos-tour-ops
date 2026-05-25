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

- [2026-04-27 04:00 UTC] https://nextjs.org/blog/next-16 — Next.js 16.2 delivers ~400% faster `next dev` startup and ~50% faster rendering (200+ Turbopack bug fixes); prior memory only noted 16.1 caching; dos-platform scaffold should target 16.2+, not 16.0.

- [2026-04-27 04:00 UTC] https://nextjs.org/blog/next-16 — React Compiler 1.0 stable and built into Next.js 16 by default: automatic component memoization with zero manual code changes — not in prior memory; removes need for manual useMemo/useCallback optimization in dos-platform components.

- [2026-04-27 04:00 UTC] https://vercel.com/pricing — CONTRADICTS 2026-04-23 memory entry: Vercel Turbo build machines are now DEFAULT for all new Pro projects since February 2026 at $0.126/min, not the $0.105/min ($0.0035/CPU/min) logged previously; prior "16% reduction" figure is not corroborated — update FINANCIALS.md build-cost projections upward.

- [2026-04-27 04:00 UTC] https://tech.eu/2026/01/21/tourmanagement-bv-acquires-beatswitch-in-live-music-software-deal/ — BeatSwitch scale at acquisition (Jan 2026): 400+ customers, ~10,000 users globally — addendum to prior entry; sets competitive baseline for DOS Platform market penetration targets.

- [2026-04-27 04:00 UTC] https://play.google.com/store/apps/details?id=com.daysheets.daysheets.android — Daysheets has a native Android app on Google Play in addition to web; prior memory entry omitted this — DOS v7 and dos-platform have no mobile app; Daysheets' mobile-first capability is a direct gap for on-site crew use.

- [2026-04-27 04:00 UTC] https://gitnux.org/best/music-tour-management-software/ — TouringData: automates tour settlements, box office reconciliation, and financial reporting for live music tours — NEW competitor not previously tracked; directly overlaps DOS Finance tab; confirm funding and scale before treating as serious threat.

- [2026-04-27 05:00 UTC] https://buttondown.com/waterandmusic/archive/music-tech-ownership-ouroboros-2026-edition/ — CONTRADICTS 2026-04-22 memory entry (antitrust trial "ongoing"): DOJ reached a surprise settlement with Live Nation in late April 2026 per Cherie Hu's 2026 Ouroboros — settlement removes near-term forced breakup/divestiture scenario; fragmentation tailwind for independent touring tech is reduced but not eliminated.

- [2026-04-27 05:00 UTC] https://github.com/supabase/supabase/releases/tag/v1.26.03 — Supabase Storage March 2026 overhaul: object listing 14.8x faster on 60M+ row datasets (hybrid skip-scan + cursor pagination replacing 6-trigger prefixes table); path traversal vulnerability closed; orphan objects from direct SQL deletes blocked — affects dos-tour-ops and dos-platform storage reliability at scale.

- [2026-04-27 05:00 UTC] https://github.com/supabase/supabase/releases/tag/v1.26.04 — Supabase pg-delta experimental declarative schema CLI (April 2026): describe schema in pure SQL, generate migrations automatically, CI-friendly flags, debug support — distinct from GitHub integration already logged; reduces manual migration drift risk in Phase 0 schema work with Josh.

- [2026-04-27 05:00 UTC] https://edmidentity.com/2025/10/22/blondish-gigwell-eco-rider-2-0/ — Gigwell launched Eco-Rider 2.0 (Oct 2025) with BLOND:ISH Foundation's Bye Bye Plastic, adding sustainability/green rider tooling to their platform across 100K+ users — adds differentiated positioning angle to Gigwell beyond booking/contracts; not a direct DOS threat but signals that eco-rider could become a baseline feature expectation.

- [2026-04-27 05:00 UTC] https://starterpick.com/blog/t3-stack-2026 — Developer community consensus (Apr 2026): Midday.so is the recommended open-source reference architecture for T3 + Supabase without Prisma — Midday uses Next.js + tRPC + Supabase directly (no Prisma ORM layer), which matches the dos-platform target stack; use as scaffold reference before Dane's Jun/Jul build window.

- [2026-05-01 21:30 UTC] https://supabase.com/changelog — Supabase Data API table exposure changing May 30, 2026: new tables created in the public schema will require an explicit Postgres GRANT before PostgREST can expose them; existing tables unaffected; returns a clear error with the missing grant hint rather than silent failure — dos-platform Phase 0 schema work with Josh must include explicit grants for every new table or API calls will 404.

- [2026-05-01 21:30 UTC] https://supabase.com/changelog — Supabase OAuth token endpoint changing from HTTP 201 to 200 on May 22, 2026 (OAuth 2.1 §3.2.3 compliance); only affects integrations that explicitly check for 201 — low direct impact (DOS uses Google OAuth gate, not Supabase token endpoint directly), but flag for any future Supabase Auth SDK upgrade that wraps this endpoint.

- [2026-05-01 21:30 UTC] https://github.com/VROOM-Project/pyvroom/releases — pyvroom latest release is 1.15.2, not 1.15.0 as previously logged (2026-04-20 entry); CONTRADICTS prior version tracking — update any pinned pyvroom dependency specs to >=1.15.2.

- [2026-05-01 21:30 UTC] https://nextjs.org/blog/next-16-2 — Next.js 16.2 AI agent integration features NOT captured in prior memory entries (which only noted perf): agent-ready create-next-app scaffolds AI-ready projects; Browser Log Forwarding pipes browser errors to terminal for agent-powered debugging; Experimental Agent DevTools give AI agents terminal access to React DevTools and Next.js diagnostics — relevant for Dane's Jun/Jul dos-platform scaffold if using AI-assisted development.

- [2026-05-01 21:30 UTC] https://apps.apple.com/us/app/daysheets/id1579012240 — Daysheets has an iOS App Store listing in addition to Android (prior memory entry 2026-04-27 only noted Android/Google Play) — ADDENDUM to prior entry; Daysheets is fully cross-platform mobile; DOS has no mobile app on either platform.

- [2026-05-01 21:30 UTC] https://pitchbook.com/profiles/company/521004-25 — Daysheets investors: Argon Ventures and Two Lanterns Venture Capital — not in prior memory; confirms Daysheets is VC-backed (not bootstrapped), increasing competitive durability; funding amount not publicly disclosed.

- [2026-05-01 21:30 UTC] https://wifitalents.com/best/music-festival-software/ — Pollen: festival management software appearing in 2026 best-of lists, described as designed for planning, execution, and management of festivals at scale — NEW competitor not previously tracked; limited public detail, low authority source; add to monitor list alongside TourSync.

- [2026-05-02 22:00 UTC] https://supabase.com/changelog — Supabase adding sales tax, VAT, or GST to invoices based on billing address; rollout May 1 - Jun 30, 2026 — dos-platform Supabase org must have accurate billing address and Tax ID set before June 30 to avoid incorrect tax charges.

- [2026-05-02 22:00 UTC] https://vercel.com/changelog — Vercel Sandbox (May 1, 2026) can now connect to hosted Postgres databases including Supabase, Neon, AWS RDS via allowed-domain firewall config — dos-platform preview/sandbox environments can now hit Supabase Postgres directly; enables integration testing in Vercel preview deployments without a separate test DB.

- [2026-05-02 22:00 UTC] https://tracxn.com/d/companies/gigfinesse/__tME-0Ec_KSQMSsEjhVMlhdV9gnQznXdeZDdYXTRH36A/funding-and-investors — GigFinesse has raised $9.39M total over 3 rounds (latest $5.79M, May 2024) — ADDENDUM to prior memory entry which listed GigFinesse as unconfirmed; VC-backed at nearly $10M, not bootstrapped; raises competitive durability assessment upward.

- [2026-05-06 05:00 UTC] https://supabase.com/changelog — Supabase "Branching without Git" is now the DEFAULT for all Supabase projects as of May 4, 2026; previously database branching required a connected GitHub repo; branches can now be created directly from the dashboard or CLI without any Git integration — Phase 0 schema work with Josh no longer requires setting up the GitHub integration before branching; simplifies iterative schema exploration.

- [2026-05-06 05:00 UTC] https://nextjs.org/docs/app/guides/upgrading/version-16 — Next.js 16 introduces "use cache" directive and Cache Components: explicit opt-in caching for pages, components, and functions via `"use cache"` at the top of a file or function; `fetch()` is no longer cached by default in dynamic routes (must be explicit); `revalidateTag()` now requires a `cacheLife` profile as the second argument for stale-while-revalidate behavior — NOT in prior memory entries (which covered async params, proxy.ts, Turbopack, Node 20.9+, TS 5.1+); dos-platform scaffold must audit all data-fetching patterns and add explicit cache directives.

- [2026-05-06 05:00 UTC] https://tourflip.com/ — TourFlip: new global booking, ticketing, and tour-routing platform launched 2026 by Mitch Harris (Napalm Death); venue-posting model where artists bid on shows, fans buy tickets, multi-party splits paid at source with automatic global FX handling — NEW competitor not in CLAUDE.md or any prior memory entry; positioning is marketplace/routing, not ops (no advancing/ROS/transport), so limited direct overlap with DOS moat; monitor for feature expansion.

- [2026-05-06 05:00 UTC] https://www.yourtempo.com/touring-pro — YourTempo "Touring Pro": complete artist tour management software appearing in 2026 best-of lists — NEW name not previously tracked in CLAUDE.md or memory; low public detail available; add to monitor list alongside TourSync and Pollen.

- [2026-05-10 04:00 UTC] https://supabase.com/changelog — Supabase new API key model announced: replacing long-lived JWT-based anon and service_role keys with a new format; legacy JWT keys will be removed in late 2026 — both dos-tour-ops (uses anon key for client access) and dos-platform must plan key rotation before late 2026; audit all SDK init calls that hardcode the legacy key format.

- [2026-05-10 04:00 UTC] https://supabase.com/changelog — Supabase is now available for purchase through the AWS Marketplace — relevant for dos-platform enterprise billing if future customers prefer consolidated AWS invoicing; no immediate action.

- [2026-05-10 04:00 UTC] https://vercel.com/changelog/next-js-may-2026-security-release — Next.js May 2026 coordinated security release: 13 advisories covering auth bypass (App Router segment-prefetch), SSRF via WebSocket upgrades, DoS via RSC memory exhaustion (CVE-2026-23864), cache poisoning, and XSS; patched in 15.5.18 and 16.2.6 only — earlier minors of 15.x and 16.x will NOT receive patches; dos-platform scaffold must target Next.js 16.2.6+ (already tracked as 16.2+, now a security requirement not just a perf choice); dos-tour-ops (Vite, not Next.js) is unaffected.

- [2026-05-11 00:00 UTC] https://blog.n8n.io/introducing-n8n-2-0/ — n8n v2.0 released March 9, 2026: Task Runners are no longer bundled in the main Docker image and must run as a separate container; Code nodes block environment variable access by default; ExecuteCommand and LocalFileTrigger nodes disabled by default; v1.x EOL ~June 2026 (3-month window) — CRITICAL: Phase 4 Railway n8n deployment must migrate to v2.0 queue-mode stack before ~June 9, 2026 or use the production-stack template with explicit task-runner container.

- [2026-05-11 00:00 UTC] https://www.linkedin.com/pulse/ontrack-tech-group-acquires-live-event-operations-platform-lennd-hweee — OnTrack Tech Group acquired Lennd (live event operations platform); OnTrack describes itself as "the World's only integrated Event Data Platform" covering scheduling through execution for entertainment, sporting events, and mass gatherings — consolidates two enterprise-tier competitors into one; CLAUDE.md competitive entry for Lennd is stale; reassess tier and overlap with DOS Platform enterprise roadmap.

- [2026-05-11 00:00 UTC] https://www.infoq.com/news/2026/04/vercel-open-agents/ — Vercel released Open Agents (April 2026): open-source reference platform for durable background coding agents; three-layer architecture (web UI + durable workflow + sandboxed VM); GitHub integration for clone/branch/commit/PR; intended for forking not direct use — relevant if Dane uses AI-assisted scaffolding for dos-platform Jun/Jul window; not a production dependency.

- [2026-05-11 00:00 UTC] https://nextjs.org/docs/app/guides/upgrading/version-16 — Next.js 16 PPR config: `experimental_ppr` route segment removed, replaced by `cacheComponents` in next.config; `revalidateTag()` requires `cacheLife` profile as second argument — addendum to 2026-05-06 cache entry; dos-platform scaffold must account for both if ISR/PPR patterns are used.

- [2026-05-11 00:00 UTC] https://docs.n8n.io/2-0-breaking-changes/ — n8n v2.0 additional breaking details: ExecuteCommand node requires explicit re-enable via N8N_ALLOW_EXEC env var; LocalFileTrigger requires N8N_ALLOW_LOCAL_FILE_TRIGGER; migration report tool available to audit existing workflows before upgrade — Phase 4 Railway n8n must set these env vars if those nodes are used.

- [2026-05-22 04:00 UTC] https://supabase.com/blog/custom-oauth-oidc-providers — Supabase now supports connecting any external OAuth2 or OIDC provider (GitHub Enterprise, regional compliance IdPs, internal OAuth2 servers) to Supabase Auth with PKCE by default; free plan allows up to 3 custom providers, Pro+ unlimited — DISTINCT from the previously-logged "Sign in with [Your App]" (Supabase acting as IdP); this is Supabase consuming external IdPs; directly relevant for dos-platform Phase 9 enterprise SSO where customers may bring their own identity stack.

- [2026-05-22 04:00 UTC] https://trpc.io/docs/migrate-from-v10-to-v11 — tRPC v11 sixth breaking change not in prior memory: data transformers are now configured in the links array instead of at tRPC client init; every HTTP link that uses transformers must add `transformer: superjson` explicitly — dos-platform scaffold must audit all link configurations; missed from previous breaking-change logging.

- [2026-05-22 04:00 UTC] https://trpc.io/blog/announcing-trpc-v11 — tRPC v11 adds async generator function support for subscription handlers: handlers can yield multiple values and clean up on finish using native JS generator syntax — NEW capability not in prior memory (prior entry only logged SSE transport); enables complex real-time advancing/ROS update patterns in dos-platform without managing subscription state manually.

- [2026-05-22 04:00 UTC] https://support.eventric.com/hc/en-us/articles/46286508608532-Master-Tour-Mobile-7-1-10-Beta-2026-02-20 — Master Tour Mobile 7.1.10 Beta (Feb 20, 2026) adds Ground Travel Items that auto-calculate Arrival Time, Travel Time, Distance, and Start/End Time Zones from Origin + Destination inputs using the same "pessimistic" model as Desktop — closes the transport logistics automation gap with DOS v7's transport tab; prior Master Tour memory entries (product line, ticketing settlement, offline mode) did not capture this routing intelligence feature.

- [2026-05-22 04:00 UTC] https://nextjs.org/docs/app/api-reference/adapters — Next.js 16.2 ships a stable, public Build Adapter API (was alpha in 16.0); generates a typed, versioned build manifest (routes, prerenders, static assets, caching rules, routing decisions) that third-party adapters map onto any hosting provider; configured via `experimental.adapterPath` in next.config — dos-platform is not locked to Vercel at the infrastructure level; relevant if enterprise customers require self-hosted or non-Vercel deployments.

- [2026-05-22 04:00 UTC] https://blog.n8n.io/introducing-n8n-2-0/ — n8n v2.0 decouples Save from production deploy: Save now preserves edits without going live, a separate Publish button updates the production version — NOT in prior n8n memory entries (which covered Task Runners, Code node env blocking, ExecuteCommand disabled); Phase 4 Railway n8n operator training must explicitly account for this workflow change to avoid accidentally leaving Phase 4 automations in draft state.

- [2026-05-22 04:00 UTC] https://techstrong.ai/features/vercel-labs-builds-a-programming-language-designed-for-ai-agents/ — Vercel Labs released Zero (May 15, 2026): a low-level systems programming language whose compiler emits structured JSON diagnostics with stable error codes and typed repair IDs designed for AI agent consumption; capability-based I/O lets agents reason about behavior from function signatures alone — not a dos-platform dependency; monitor as emerging Vercel-ecosystem AI-native tooling that may surface in Dane's Jun/Jul scaffold workflow.

- [2026-05-22 04:00 UTC] https://releasebot.io/updates/vercel — Vercel CLI gained `vercel alerts` command (May 2026): lists anomaly alerts with timestamps and alert type; `--ai` flag appends AI-investigation results inline — not in prior memory; provides dos-platform production incident triage without opening Vercel dashboard; complements existing Flags (Phase 5) and Log Drains (Phase 4) tooling.

- [2026-05-22 04:00 UTC] https://supabase.com/changelog/45702-developer-update-may-2026 — New @supabase/server SDK announced May 2026: unified SDK handles auth, client creation, CORS, and context injection across runtimes (Edge Functions, Vercel Functions, Deno, Bun, Cloudflare Workers) — not in prior memory; replaces patchwork of runtime-specific adapter packages for dos-platform server-side Supabase usage; simplifies middleware and tRPC context setup.

- [2026-05-22 04:00 UTC] https://supabase.com/changelog/45702-developer-update-may-2026 — Supabase achieved ISO/IEC 27001:2022 certification (announced May 2026), covering the information security management system across the entire platform — not in prior memory; directly strengthens dos-platform enterprise GTM and any compliance-sensitive festival/promoter customers; cite in Phase 9 enterprise sales materials.

- [2026-05-22 04:00 UTC] https://supabase.com/changelog/45702-developer-update-may-2026 — Stripe Sync Engine transferred to Stripe GitHub org and is now open source, maintained by Stripe directly; Supabase app in Stripe Marketplace now GA — ADDENDUM to 2026-04-20 entry; stewardship change means Stripe controls the roadmap; more durable dependency for dos-platform Phase 8 Stripe Connect implementation.

- [2026-05-22 04:00 UTC] https://github.com/supabase/wrappers/releases — Supabase Wrappers v0.6.0 ships an OpenAPI Foreign Data Wrapper (FDW): query any external REST API as a Postgres table using standard SQL — not in prior memory; enables dos-platform Phase 6 DOS Market Intel to pull venue/ticketing/external data sources via SQL joins without building a separate ETL pipeline; complements the already-logged Supabase Warehouse (pg_duckdb) for analytics.

- [2026-05-23 02:00 UTC] https://supabase.com/changelog/45702-developer-update-may-2026 — Supabase Data API revamped with per-table and per-function dashboard toggles controlling PostgREST/GraphQL exposure, plus a default-privileges switch at project creation; anon and authenticated roles now have no automatic table permissions (functions in the api schema are executable, tables are not) — DISTINCT from the May 30 GRANT requirement logged 2026-05-01 (Postgres-level); the dashboard toggles are a UI-level control on top of that; dos-platform Phase 0 schema design must account for both layers: explicit GRANT on tables AND toggle enabled in Data API settings, or API calls will 404.

- [2026-05-23 02:00 UTC] https://supabase.com/changelog/41796-developer-update-january-2026 — Supabase January 2026 release added Performance Advisor (auto-analyzes query patterns, suggests missing indexes, flags unused indexes) and EXPLAIN/Analyze diagrams in the dashboard (visual query plan with table scan vs. index scan highlighting) — not previously in memory (Security Advisor logged 2026-04-21 is separate; that's RLS/security hygiene, this is query performance); both tools run automatically; use Performance Advisor during Phase 0 schema work with Josh to catch missing indexes before production.

- [2026-05-23 22:00 UTC] https://supabase.com/changelog/45702-developer-update-may-2026 — CONTRADICTS/EXTENDS 2026-05-01 entry: Supabase Data API default-exposure change has a third phase not previously captured: Oct 30, 2026 is when ALL EXISTING PROJECTS (not just new ones) will have the "no automatic table permissions" default applied — dos-tour-ops is an existing project and will be affected; audit all table grants before Oct 30 or existing PostgREST calls will silently fail after migration.

- [2026-05-23 22:00 UTC] https://releasebot.io/updates/supabase — ADDENDUM to 2026-04-20 pg_graphql entry: May 18, 2026 is the specific date pg_graphql stops being enabled by default on new projects; prior entry lacked this date — plan any dos-platform GraphQL dependency (if any) to explicitly enable pg_graphql in project settings after May 18.

- [2026-05-23 22:00 UTC] https://releasebot.io/updates/vercel — Vercel Flat Rate CDN now in Limited Beta for Pro teams: replaces usage-based CDN pricing with a fixed monthly fee — NEW, not in any prior memory entry; relevant for dos-platform Phase 5+ cost predictability if CDN egress becomes significant; apply for beta access before GA.

- [2026-05-23 22:00 UTC] https://vercel.com/changelog — Vercel Sandbox now supports Claude Managed Agents: agent tool calls run on Vercel Sandbox infrastructure with isolated Firecracker microVMs — DISTINCT from 2026-05-02 entry (Supabase Postgres connectivity); enables dos-platform AI agent workflows to execute sandboxed tool calls via Vercel infrastructure rather than raw Claude API calls; relevant for Phase 4 agent architecture.

- [2026-05-23 22:00 UTC] https://releasebot.io/updates/vercel — Vercel Flags gains `vercel flags split` CLI command (May 21, 2026): weighted traffic splits to route a percentage of traffic to one variant without touching code — ADDENDUM to 2026-04-23 Vercel Flags GA entry; enables dos-platform Phase 5 canary rollouts directly from CLI, not just dashboard.

- [2026-05-23 22:00 UTC] https://devops-daily.com/posts/nextjs-16-2-6-15-5-18-security-release — ADDENDUM to 2026-05-10 Next.js security entry: severity breakdown is 7 high, 4 moderate, 2 low across 13 advisories; CVE-2026-23870 is an upstream React Server Components vulnerability (not Next.js itself); Vercel confirms vulnerabilities "cannot be reliably blocked at the WAF layer" — WAF mitigation is not sufficient; only patch resolves; dos-platform must target 16.2.6+ as security baseline, not just performance.

- [2026-05-23 22:00 UTC] https://trpc.io/blog/announcing-trpc-v11 — tRPC v11 adds React Server Component (RSC) support: execute a tRPC procedure inside an RSC, then automatically hydrate the React Query cache client-side with the result — NEW capability not in any prior memory entry (prior entries covered SSE, generators, FormData, OpenAPI, breaking changes); enables dos-platform to prefetch advancing/ROS data server-side in Next.js 16 RSCs without a separate fetch layer.

- [2026-05-24 15:00 UTC] https://releasebot.io/updates/supabase — Supabase Postgres 14 deprecated July 1, 2026; all projects still on Postgres 14 will be auto-upgraded to latest Postgres version on that date; projects using extensions no longer supported will be PAUSED instead of upgraded — CRITICAL: dos-tour-ops must verify its Postgres version before July 1 and manually upgrade if on 14; a paused project on show day is a severity-1 incident.

- [2026-05-24 15:00 UTC] https://supabase.com/changelog/44713-developer-update-april-2026 — Supabase RLS Tester preview shipped April 2026: interactive tool in the dashboard for testing RLS policies with different user roles and expected row results — DISTINCT from Security Advisor (logged 2026-04-21, which suggests policy fixes) and Performance Advisor (logged 2026-05-23, query perf); use RLS Tester during Phase 0 schema work with Josh to validate multi-tenant row isolation before go-live.

- [2026-05-24 15:00 UTC] https://supabase.com/changelog/44713-developer-update-april-2026 — Supabase April 2026: PostgREST automatic retries added to all four official client SDKs (JS, Python, Swift, Kotlin); transient network errors no longer require manual retry logic in client code — not in prior memory; dos-tour-ops and dos-platform get retry resilience automatically on next SDK update.

- [2026-05-24 15:00 UTC] https://supabase.com/changelog/44713-developer-update-april-2026 — Supabase Terraform Provider v1.9.0: adds Edge Functions resource, Edge Function secrets resource, and network bans data source — not in prior memory; relevant for dos-platform IaC setup if Terraform is used for infra-as-code in Phase 3+.

- [2026-05-24 15:00 UTC] https://hello.eventotron.com/exciting-changes-ahead-for-eventotron/ — Eventotron (all-in-one arts event management: artist liaison, venue scheduling, ticketing, settlements) is doing a complete ground-up rebuild launching in 2026; beta testing with existing clients before release — NEW: not in CLAUDE.md or prior memory; overlaps DOS advancing and settlements features; monitor beta launch for feature positioning impact.

- [2026-05-24 22:30 UTC] https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17 — Self-hosted Supabase docker-compose default db image moves from Postgres 15 to Postgres 17 the week of June 15, 2026; extensions timescaledb, plv8, plcoffee, plls are dropped from PG 17 images; bringing the new compose file against an existing PG 15 volume fails to start (PG 17 cannot read PG 15 data directory) — relevant if Josh runs local Supabase for Phase 0 schema work; must follow published upgrade guide rather than pulling new images directly.

- [2026-05-24 22:30 UTC] https://releasebot.io/updates/supabase — Self-hosted Supabase docker-compose: analytics (Logflare) and vector services removed from the default docker-compose.yml the week of June 1, 2026; moved to an opt-in overlay (docker-compose.logs.yml); default `docker compose up -d` starts a leaner stack with no log aggregation — local dev environment loses automatic log collection; must explicitly opt in if structured logs are needed during Phase 0/4 local testing.

- [2026-05-24 22:30 UTC] https://releasebot.io/updates/supabase — Self-hosted Supabase docker-compose: Studio and postgres-meta now use the `postgres` role instead of `supabase_admin`, aligning self-hosted behavior with managed platform and reducing privileges; existing instances may need a one-time public schema ownership migration — affects local dev if Josh's Phase 0 environment was set up before this change; run the ownership migration script before upgrading to avoid schema permission errors.

- [2026-05-24 15:00 UTC] https://support.eventric.com/hc/en-us/articles/43482885920276-Master-Tour-Mobile-7-1-6-2025-11-12 — ADDENDUM to 2026-04-21 Master Tour offline entry: Mobile 7.1.6 (Nov 2025) specifically added automatic offline sync with NO manual preloading required, a completely new mobile Dashboard showing an entire Day at a glance, and rearrangeable bottom navigation — prior entry captured the offline sync concept but missed the new Dashboard and navigation UX; Master Tour mobile is now a more complete on-site crew tool than previously assessed.

- [2026-05-25 05:00 UTC] https://supabase.com/blog/mcp-server — Supabase launched an official MCP server: connects AI IDEs (Cursor, Claude Code, Windsurf) directly to Supabase projects for DB management, SQL execution, migration generation, and config fetching via natural language; distinct from the "Fix with Assistant" UI buttons (logged 2026-04-21) — this is IDE-level integration bypassing the dashboard entirely; speeds Phase 0 schema work with Josh if he uses Cursor or Claude Code.

- [2026-05-25 05:00 UTC] https://supabase.com/changelog/43465-developer-update-march-2026 — Supabase March 2026 (partial coverage gap): Table Editor gained queue mode (stage inserts/edits/deletes, review changes in Diff View before committing with cmd+s) and exportable AI prompts (the exact prompts powering Supabase AI Assistant are copyable for use in local agents and tools like Claude Code) — not in prior memory despite the March 2026 update being partially logged for Storage perf and OpenAPI deprecation; both features useful during Phase 0 schema iteration with Josh.

- [2026-05-25 05:00 UTC] https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolmcp/ — n8n supports MCP bidirectionally via two native built-in nodes: MCP Client Tool (n8n AI agents can call any external MCP server as a tool) and MCP Server Trigger (exposes n8n workflows as callable MCP tools for external AI agents, including Claude Code); DISTINCT from the 2026-04-20 memory entry which is a third-party Railway template bridging external tools to n8n via custom REST — this is first-party n8n node support on both sides of the MCP protocol, enabling dos-platform agents to call n8n workflows programmatically without custom code.

- [2026-05-25 05:00 UTC] https://railway.com/deploy/n8n-enterprise-ready-stack-ollama — Railway now offers an "n8n Enterprise-Ready Stack + Ollama" one-click template: n8n + Postgres + Redis + Ollama in a single deploy for fully private LLM-powered automation — NEW template not in prior memory (prior templates: n8n-MCP Railway 2026-04-20, production queue-mode stack 2026-04-21); relevant if DOS agents need a cost-comparison path against Claude API or want local inference for non-sensitive workflow steps.

## promoted

<!-- Weekly consolidation moves validated patterns here -->

<!-- Weekly consolidation moves validated patterns here -->
