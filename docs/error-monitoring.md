# Error monitoring — Sentry

Solo operator, live cockpit, no one else watching prod. Sentry is the last gap
in the deploy loop: when the app throws in production, it should reach you with
a stack trace, not die silently on a user's screen.

## Wiring

- `src/lib/sentry.js` — the only place that touches Sentry. PII-safe config,
  no-op unless `VITE_SENTRY_DSN` is set.
- `src/main.jsx` — `initSentry()` runs **first**, before anything else in boot,
  so it can catch crashes during the rest of startup. The existing on-page
  `ErrorBoundary` also calls `captureError(error, componentStack)` so render
  crashes are both shown to the user and reported.
- `src/components/AuthGate.jsx` — `setSentryUser(supabaseUserId)` on login,
  `setSentryUser(null)` on logout. Identity is the Supabase UUID. Never email.

## Why static import (not lazy like analytics)

Sentry must initialize early enough to catch boot-time and render errors —
exactly the failures that matter most. Lazy-loading would miss them. The cost is
~35 kB gzip in the main bundle.

## Safety invariants (do not regress)

- `sendDefaultPii: false` — no IP, user-agent, or cookies attached to events.
- **No session replay** — the cockpit renders money and comms; it must never be
  recorded.
- `beforeSend` scrubs hash/query from every URL — the Google OAuth redirect puts
  an access token in the hash; it must never reach Sentry.
- Error-only (`tracesSampleRate: 0`, no integrations). Raise tracing later only
  if you need perf data, and only after re-checking what it would collect.
- User is the Supabase UUID only. No email, names, or amounts.

## To activate

1. Create a Sentry project (platform: React), copy the **DSN**.
2. Set `VITE_SENTRY_DSN` in Vercel env for dos-tour-ops, then **redeploy**
   (`VITE_*` is build-time — the env change is inert until a fresh build).
3. Trigger a test error and confirm it appears in Sentry > Issues.

## Follow-up

- **Source maps:** stack traces are minified without them. Add
  `@sentry/vite-plugin` with a `SENTRY_AUTH_TOKEN` to upload source maps on
  build for readable traces. Deferred — needs an org auth token.
- **Sentry MCP:** add the Sentry MCP server so Claude can triage issues
  in-session (read a stack trace, map it to the line, propose the fix).
