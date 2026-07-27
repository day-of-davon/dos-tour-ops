---
name: Supabase Platform Updates
description: Supabase feature releases, version changes, and breaking changes relevant to v7 and DOS Platform
type: reference
---

# Supabase Platform Updates

_Last consolidated: 2026-07-19_

## Business / Risk

- **$500M Series F at $10.5B valuation** (2026-06): doubled in 8 months, >$1B total raised. Supabase dependency on DOS Platform is de-risked.

## Postgres Versions

- **PG14 support dropped July 1, 2026.** Both v7 Supabase project and DOS Platform must be on PG15+. Verify now.
- **PG17 available as opt-in** since April 2026 on hosted; will become default in next self-hosted release. DOS Platform should plan for PG17.

## Auth

- **Passkeys beta (WebAuthn)**: Face ID, Touch ID, Windows Hello, hardware keys. Alternative to current Google OAuth gate.
- **Self-hosted API_EXTERNAL_URL** (breaking, week of July 6, 2026): must include `/auth/v1` path prefix. SAML SSO routes move from `/sso/saml/*` to `/auth/v1/sso/saml/*`. Affects DOS Platform if self-hosted Supabase is considered.

## Infrastructure

- **Multigres**: scalable Postgres OS with sharding, connection pooling, automatic failover, and backup orchestration. Relevant if DOS Platform hits multi-tenant scale limits.
- **Branching without Git** is now the default: branches can be created from dashboard without GitHub integration. Lowers friction for DOS Platform staging environments.

## Realtime

- **Binary Broadcast payloads** now supported (in addition to JSON). Useful for high-frequency transport/ROS state updates.
- **@supabase-labs/tanstack-db alpha**: syncs TanStack DB collections with Supabase tables over PostgREST + Realtime. Alternative real-time state layer worth evaluating for DOS Platform.

## AI / MCP

- **Supabase AI Agent Plugin**: bundles MCP server + agent skills so Claude/coding agents can query DBs, manage migrations, deploy Edge Functions. Directly usable in DOS Platform Claude integration.
- **ChatGPT + Supabase integration GA**: 29 MCP tools (SQL execution, schema changes, branching). Signals Supabase MCP tooling standardizing beyond Claude; DOS Platform AI Agent Plugin stays relevant.

## Observability / DX

- **supabase-js OpenTelemetry traces**: client libraries now emit W3C-compatible traces (Sentry, Datadog, Honeycomb). Zero-config observability option for DOS Platform.
- **supabase-js requires TypeScript 5.0+ minimum.** Migration concern for v7 (Vite + React 18) if pinned on TS4; check current version.
- **Supabase app in Stripe Marketplace GA**: simplifies billing integration path for DOS Platform subscription tiers.
