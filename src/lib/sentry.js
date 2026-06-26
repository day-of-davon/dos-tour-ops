// @ts-check
/// <reference types="vite/client" />
//
// Error monitoring for the live cockpit. Solo operator, no one else watching
// prod — this is the last gap in the deploy loop.
//
// Why static (not lazy like analytics): Sentry must initialize early enough to
// catch boot-time and render crashes. Lazy-loading would miss exactly the errors
// that matter most. It's ~35 kB gzip in the main bundle; that's the cost of
// catching the white-screen.
//
// Safety: this app renders money and comms in the DOM, and the Google OAuth
// redirect drops an access token in the URL hash. So:
//   - sendDefaultPii: false        (no IP/user-agent/cookies attached)
//   - NO session replay            (never record the financial/comms screen)
//   - URL hash/query scrubbed       (never ship the OAuth token or params)
//   - error-only, no tracing        (minimal data; raise later if needed)
//
// Ships dark: if VITE_SENTRY_DSN is unset, Sentry is never initialized and every
// export here is a safe no-op. Set the DSN in Vercel env to light it up.

import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN;
const ENV = import.meta.env.MODE || "production";

let enabled = false;

/** Strip hash + query so an OAuth token or params can never ride along in a URL. */
function stripUrl(u) {
  return typeof u === "string" ? u.split(/[?#]/)[0] : u;
}

export function initSentry() {
  if (!DSN) return; // ships dark
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    sendDefaultPii: false,
    // Keep Sentry's DEFAULT integrations — they include GlobalHandlers, which is
    // what auto-captures uncaught errors and promise rejections. Do NOT pass
    // `integrations: []`: that replaces the defaults and silently disables capture.
    // Replay and tracing are opt-in (not in the defaults), so "error-only" is
    // achieved simply by not adding them + tracesSampleRate 0. The cockpit is
    // never recorded because replayIntegration() is never added.
    tracesSampleRate: 0,
    beforeSend(event) {
      // Scrub URLs everywhere they appear so the OAuth access-token in the hash
      // (and any query params) never reach Sentry.
      if (event.request?.url) event.request.url = stripUrl(event.request.url);
      if (Array.isArray(event.breadcrumbs)) {
        for (const b of event.breadcrumbs) {
          if (b?.data?.url) b.data.url = stripUrl(b.data.url);
          if (b?.data?.to) b.data.to = stripUrl(b.data.to);
          if (b?.data?.from) b.data.from = stripUrl(b.data.from);
        }
      }
      return event;
    },
  });
  enabled = true;
}

/** Tie a captured error to the Supabase UUID only. Never email or any PII. */
export function setSentryUser(userId) {
  if (!enabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

/** Report an exception caught by the app's ErrorBoundary. */
export function captureError(error, componentStack) {
  if (!enabled) return;
  Sentry.captureException(error, componentStack ? { contexts: { react: { componentStack } } } : undefined);
}
