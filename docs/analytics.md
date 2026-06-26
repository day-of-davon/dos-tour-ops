# Product analytics — events mapped to HYPOTHESES.md

PostHog instrumentation exists for one reason: the bets in `HYPOTHESES.md` are
usage-gated and were previously unmeasured. Every event here feeds a specific
kill-date. If an event doesn't map to a hypothesis, it doesn't belong.

## Wiring

- `src/lib/analytics.js` — the only place that touches PostHog. PII-safe config,
  no-op unless `VITE_POSTHOG_KEY` is set.
- `src/main.jsx` — `initAnalytics()` at boot.
- `src/components/AuthGate.jsx` — `identifyUser(supabaseUserId)` on login,
  `resetUser()` on logout. Identity is the Supabase UUID. Never email.
- Event call sites use `track(EVENTS.X, props)`. Properties are counts/enums only.

## Event → hypothesis map

| Event | Hypothesis | What it answers | Status |
|---|---|---|---|
| `intel_scan` | H-004 (hero feature) | scan count per user per week | **live** |
| `$pageview` (auto) | H-001 (Tour Inbox SKU) | DAU/WAU — is anyone using it | **live** |
| `subscription_started` | H-001 | sub count vs the 20-sub Nov-1 floor | **stub** — wire when the standalone signup flow ships |

## Reading the kill-dates

- **H-001** (kill 2026-11-01 if < 20 subs): once the SKU signup exists, a
  `subscription_started` funnel is the sub count. Until then, WAU trend from
  pageviews is the proxy.
- **H-004** (hero feature = retention driver): build an `intel_scan` trend
  grouped by user, weekly. The claim is "#1 retention driver"; the data is
  scan frequency per retained user.

## Safety invariants (do not regress)

- `autocapture: false` and session recording off — the cockpit renders money and
  comms; never scrape or record it.
- URL hash/query stripped in `sanitize_properties` — the Google OAuth redirect
  puts an access token in the hash; it must never reach PostHog.
- Identify by UUID only. No email, no names, no amounts in any event property.

## Follow-up: PostHog MCP (query funnels in-session)

To let Claude read funnels/trends during hypothesis review, add the PostHog MCP
with a **personal** API key (not the project key above):

```
claude mcp add posthog -- npx -y @posthog/mcp@latest
```

Then set `POSTHOG_AUTH_HEADER` / personal API key per the server's README. This
is a separate, optional capability from the SDK instrumentation in this repo.
