# LESSONS — Append-Only Rules

**Rule:** one entry per learning, not per event. Promote from JOURNAL.md when a pattern repeats ≥2x.
**Format:** situation → expected → actual → rule → when it applies.

---

## L-001 — Deep-link + clipboard beats building a compose API
- **Situation:** Needed one-click Gmail reply for intel threads.
- **Expected:** Gmail API compose draft creation (days of work, OAuth write scope).
- **Actual:** `https://mail.google.com/.../#inbox/<threadId>` + `navigator.clipboard` shipped in a day.
- **Rule:** For any "send a message" feature, try deep-link + clipboard before API write access.
- **Applies to:** Slack, iMessage, Linear, anything with a web URL scheme.
- **Source:** 2026-04-23 comms-intelligence ship.

---

<!-- Template:

## L-XXX — Short rule name
- **Situation:**
- **Expected:**
- **Actual:**
- **Rule:**
- **Applies to:**
- **Source:** (date + context)

-->
