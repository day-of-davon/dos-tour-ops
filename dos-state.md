# DOS Tour Ops — State Snapshot
*2026-04-22 | main @ 7f0776d*

## Live
- `dos-tour-ops.vercel.app` — Vite 5 + React 18 + Supabase
- Multi-user (Davon, Olivia) via Google OAuth
- Storage: `app_storage` KV table, team `dos-bbno-2026` (shared) + user scope (private)

## Stack
| Layer | Impl |
|---|---|
| Frontend | Vite 5, React 18, inline styles + design tokens |
| Auth | Supabase Auth + Google OAuth (Gmail readonly) |
| DB | Supabase Postgres, `app_storage` KV + RLS |
| Serverless | Vercel functions in `/api` (60s max) |
| AI | Anthropic Claude (Sonnet parse + Haiku verify) |

## API surface (`/api`)
| File | Purpose | Model |
|---|---|---|
| `intel.js` | Gmail → Claude intel digest per show | Sonnet |
| `flights.js` | Gmail flight sweep, parse+verify, JSON-LD fast path | Sonnet parse, Haiku verify |
| `lodging-scan.js` | Gmail hotel sweep | Sonnet |
| `parse-doc.js` | OCR/PDF → structured data | Sonnet |
| `production.js` | Production doc ingest | Sonnet |
| `lib/gmail.js` | search, batched fetch, body extract, JSON-LD, `extractJson` |
| `lib/anthropic.js` | URL, headers, `DEFAULT_MODEL` (env-overridable) |

## Tabs (DosApp.jsx, ~6300 lines)
| Tab | Status |
|---|---|
| Dashboard | Live — cross-client urgency, next shows |
| Advance | Live — per-show checklist w/ 9-state pills, notes, Gmail intel |
| Show Day | Live — ROS blocks, anchors, timeline |
| Transport | Live — EU bus + festival dispatch |
| Finance | Live — settlement, wires, payouts |
| Flights | Live — scan, dedup, crew match, lifecycle |
| Lodging | Live — scan, rooms, todos |
| Guest List | Live — parties (top) + collapsible categories, templates, activity log |
| Crew | Live — split-day independent selection via `${sel}#${partyId}` keys |

## Storage keys
**Shared** (`team_id`): `dos-v7-shows`, `-ros`, `-advances`, `-finance`, `-settings`, `-crew`, `-production`, `-flights`, `-lodging`, `-guestlists`, `-guestlist-templates`
**Private** (`user_id`): `dos-v7-intel`, `-notes-private`, `-checklist-private`

## Recent work (this session)
- **504 fix**: verify → Haiku, BATCH 12→8, body slice 8000→4000 (`7f0776d`)
- **400 fix**: env model override, structured error surfacing (400-char toast)
- **Crew split-day independence**: composite `scKey`, real-date lifecycle dedup
- **Guest list layout**: parties above categories, categories collapsible
- **Simplify pass**: flight dedup key, matchPaxToCrew tokens, liveStatuses cleanup

## Known open
- Tour insurance — $0, CRITICAL (Sam/Sandro)
- FR immigration: Paris 5/20, Chambord 6/26, Villeurbanne 6/28
- Wasserman UK form outstanding since 4/9
- Platform repo not scaffolded (Phase 0 pending Josh)

## EU tour active 5/4 – 5/30
17 shows Dublin → Warsaw. Pieter Smit nightliner confirmed, Fly By Nite truck confirmed, Neg Earth LX, TSL lighting quoted.
