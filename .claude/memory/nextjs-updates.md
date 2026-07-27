---
name: Next.js Version Status
description: Next.js 16 breaking changes and DOS Platform holding position on v15
type: reference
---

# Next.js Version Status

_Last consolidated: 2026-07-19_

## Current State

- **Next.js 16 is current stable** (16.2.7 as of June 2026).
- **Next.js 14 is officially legacy** as of June 2026.
- **DOS Platform spec on Next.js 15 is the correct holding position.**

## Migration Path

14 → 15 first (async request APIs, fetch caching changes), then 15 → 16.

## Breaking Changes: Next.js 15 → 16

| Breaking Change | Detail |
|---|---|
| `middleware.ts` removed | Replaced by `proxy.ts` with different runtime |
| Turbopack | Now default bundler |
| `params` / `cookies` / `headers` | Async-only; sync access removed |
| Node.js minimum | 20.9+ (Node 18 dropped) |
| `revalidateTag` | Now requires second `cacheLife` argument |
| `next lint` | Fully removed from CLI; CI can pass silently without linting |
| Legacy AMP and runtime configs | Removed |

## Decision

Do not migrate DOS Platform to Next.js 16 until the proxy.ts runtime and async-only API requirements are absorbed. Lock at 15 until a deliberate migration sprint.
