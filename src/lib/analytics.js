// @ts-check
/// <reference types="vite/client" />
//
// PII-safe product analytics for the live cockpit.
//
// Why this exists: the bets in HYPOTHESES.md are usage-gated and currently
// unmeasured. H-001 kills Tour Inbox on 2026-11-01 if < 20 subs; H-004's hero
// feature is judged by "scan count per user per week." Without per-user event
// data those kill-dates run on vibes. This wires the minimum taxonomy that
// feeds them — nothing more.
//
// Safety: this app renders money and comms in the DOM, and the Google OAuth
// redirect drops an access token in the URL hash. So:
//   - autocapture OFF        (never scrape the financial/comms DOM)
//   - session recording OFF  (never record the screen)
//   - URL hash/query stripped (never leak the OAuth token or params)
//   - identify by Supabase UUID only — never email or any PII
//   - event properties are counts/enums only — never content
//
// Ships dark: if VITE_POSTHOG_KEY is unset, every export here is a no-op. Add
// the key in Vercel env to light it up. No key in dev = no events.

import posthog from "posthog-js";

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

let enabled = false;

/**
 * Event names mapped 1:1 to HYPOTHESES.md. Don't invent ad-hoc event strings at
 * call sites — add them here with the hypothesis they feed, or they can't be
 * reasoned about at review time.
 */
export const EVENTS = {
  /** H-004 — hero feature. Leading indicator: scan count per user per week. */
  INTEL_SCAN: "intel_scan",
  /** H-001 — Tour Inbox SKU activation. Wire when the standalone signup flow ships. */
  SUBSCRIPTION_STARTED: "subscription_started",
};

/** Strip hash + query so an OAuth token or params can never ride along in a URL. */
function stripUrl(u) {
  return String(u).split(/[?#]/)[0];
}

export function initAnalytics() {
  if (!KEY) return; // ships dark
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    disable_session_recording: true,
    capture_pageview: true, // origin only (see sanitize); feeds DAU/WAU for H-001
    capture_performance: false,
    person_profiles: "identified_only",
    sanitize_properties: (props) => {
      if (props.$current_url) props.$current_url = stripUrl(props.$current_url);
      if (props.$referrer && props.$referrer !== "$direct") props.$referrer = stripUrl(props.$referrer);
      return props;
    },
  });
  enabled = true;
}

/** Identify by Supabase UUID only. Never email or any PII. */
export function identifyUser(userId) {
  if (!enabled || !userId) return;
  posthog.identify(userId, { app: "tour-ops" });
}

/** Call on sign-out so the next user isn't merged into the previous identity. */
export function resetUser() {
  if (!enabled) return;
  posthog.reset();
}

/** Capture a named event. Properties must be counts/enums only — no content. */
export function track(event, props = {}) {
  if (!enabled) return;
  posthog.capture(event, props);
}
