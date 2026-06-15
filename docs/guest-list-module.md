# DOS Guest List Module
## Design Spec v1.0 | April 21, 2026

---

## 0. Problem Statement

Every competing platform forces a choice: crew-centric (Master Tour) or venue-centric (Lennd, FestivalPro). None automatically propagates allotments across a touring route, none ties allotments to contract terms, and none gives both sides of a show a purpose-built view. DOS solves all three.

---

## 1. Core Concepts

### Allotment
A negotiated bucket of passes for a specific category at a specific show. Set during contracting or advanced. Enforced hard by default, override requires TM approval.

### Category
A named pass type with access zones attached. Categories live at the tour level and can be overridden per show.

### Entry
A single person on a list. Belongs to one category, submitted by one party, checked in once.

### Submission
A named batch of entries from one party (e.g., "Manager — Artist Guests"). A party can update their submission until cutoff.

### Access Zone
A physical area at the venue. Attached to categories, not individuals.

---

## 2. Data Model

```
GuestListTemplate           ← tour-level default allotments
  id, tour_id
  category_allotments: [{category_id, qty, walk_on_qty}]

GuestListShow               ← per-show config (extends or overrides template)
  id, show_id, template_id
  cutoff_at: timestamp      ← when submissions lock
  walk_on_cap: int          ← total same-day add limit
  notes: text               ← e.g. "Venue hard cap 500"
  status: pending_approval|draft|open|locked|closed
  approver_party_id: uuid   ← talent buyer | advance contact | venue prod mgr
  approved_at: timestamp
  approval_note: text       ← any conditions attached by venue approver
  box_office_pin: string    ← PIN for read-only door list access

GuestListCategory
  id, tour_id
  name: string              ← "Artist Guest", "AAA Crew", "Media", etc.
  access_zones: string[]    ← ["FOH", "Backstage", "Stage", "Catering", "DR"]
  badge_color: string
  requires_id: bool
  is_venue_side: bool       ← if true, venue party sees/manages this category

GuestListAllotment
  id, show_gl_id, category_id, party_id
  qty: int                  ← hard cap
  walk_on_qty: int          ← same-day cap within this allotment
  source: contract|advance|manual

GuestListParty              ← a person or org that holds an allotment
  id, tour_id
  name: string              ← "bbno$ Manager", "MCD Promoter", etc.
  side: artist|venue
  role: artist|crew|agent|manager|publicist|family|feature|production
       |promoter|venue_mgr|ar_manager|hospo_mgr|talent_buyer
       |advance_contact|venue_prod_mgr|box_office
  is_approver: bool         ← can approve/counter artist allotments
  contact_email: string     ← invite sent here
  show_ids: uuid[]          ← which shows this party has access to (null = all)
  auth_type: login_tour|login_guest_tier|login_org|magic_link|pin_only
                            ← artist/mgmt = login_tour (scoped to their tours)
                               agent/publicist = login_guest_tier (guest entries only)
                               venue parties/box office = login_org (all shows at org)
                               feature/crew/family = magic_link (per show)
                               door team = pin_only (per show, expires)
  list_visibility: full|guest_tier|venue_scoped|own_category|locked_only
                            ← full: artist/mgmt/TM
                               guest_tier: agent/publicist (no crew/ops)
                               venue_scoped: venue parties per role (see Section 11)
                               own_category: magic link submitters
                               locked_only: door team PIN
  org_id: uuid|null         ← set for login_org accounts; links to venue/promoter org

GuestListEntry
  id, show_gl_id, allotment_id, submission_id
  name: string
  plus_one: bool
  note: string              ← dietary, accessibility, etc.
  is_walk_on: bool
  status: pending|approved|checked_in|no_show|denied
  checked_in_at: timestamp
  checked_in_by: uuid

GuestListSubmission
  id, show_gl_id, party_id
  submitted_at: timestamp
  updated_at: timestamp
  locked: bool              ← true after cutoff or TM locks manually
```

---

## 3. Access Zones (Standard Set)

Customizable per show. DOS ships these defaults:

| Zone | Abbrev | Who typically has it |
|------|--------|---------------------|
| Front of House | FOH | All guests |
| Barricade/Photo Pit | PIT | Media, approved guests |
| Backstage | BS | AAA, Production, Crew |
| Stage | STG | AAA only |
| Catering | CAT | Crew, Production, Feature |
| Dressing Rooms | DR | Artist, Management, Family |
| VIP Lounge | VIP | VIP guests, Hospo |
| Hospitality Suite | HOSPO | AR Manager, Hospo Manager |

---

## 4. Party Roles

### Artist Side
| Role | Allotment | Auth | List Visibility |
|------|-----------|------|----------------|
| Artist | 4-6 personal guests | **Login** | Full — guests + crew + venue staff + bar + security |
| Manager | 2-4 | **Login** | Full — guests + crew + venue staff + bar + security |
| Tour Manager | Unlimited (approver) | **Login** | Full + admin controls |
| Agent | 1-2 | **Login** | Guest-tier only — all guest entries across all submitters, names + who submitted |
| Publicist | 2-4 media + 1 personal | **Login** | Guest-tier only — all guest entries across all submitters, names + who submitted |
| Feature Performer | 2-4 | Magic link | Own category only |
| Crew (per head) | 1 each | Magic link | Own category only |
| Family (VIP) | TM-configured | Magic link | Own category only |
| Production | TM submits on behalf | — | — |

### Venue Side
| Role | Allotment | Auth | List Visibility | Approves Artist Allotment |
|------|-----------|------|----------------|--------------------------|
| Talent Buyer | 2-4 | **Login** | All venue-side categories + guest-tier (read) | **Yes — primary** |
| Advance Contact | 2-4 | **Login** | All venue-side categories + guest-tier (read) | **Yes — if TB delegates** |
| Venue Prod Manager | 0 | **Login** | All venue-side categories + ops | **Yes — operational** |
| Promoter | 4-6 | **Login** | Their category + hospo | No |
| AR Manager | 2-4 + hospo | **Login** | Their category + hospo | No |
| Hospitality Manager | 10-20 | **Login** | Hospo category only + dietary/access fields | No |
| Box Office | — | **Login** | Final locked list — all categories, check-in | No |

Venue-side login accounts are **org-scoped**: a box office manager at O2 Academy sees every show that comes through O2 Academy. An AR manager at Live Nation UK sees every show in their territory. Multi-show calendar dashboard, not a per-show link.

---

## 5. Allotment Configuration Flow

### 5a. At Contract Stage
```
Contract signed
  → TM opens DOS Advance for this show
  → "Guest List Allotments" section appears (new advance item: vn9)
  → TM proposes category allotments (qty, walk-on qty, source: contract)
  → System creates GuestListShow, status: pending_approval
  → Approval request sent to venue approver (talent buyer, advance contact,
    or venue production manager — whoever is listed first in advance contacts
    with an approver role)
  → Venue approver reviews, counters if needed, and approves
  → Status: draft → open once approved + cutoff is set
```

### 5b. Approval Chain
Exactly one venue-side party holds the `approver` flag per show. Precedence:

```
1. Talent Buyer         (set at contract stage, linked from booking)
2. Advance Contact      (if TB explicitly delegates in advance)
3. Venue Prod Manager   (operational fallback — used day-of if TB unreachable)
```

The approver can:
- Approve allotments as proposed
- Counter individual category quantities (triggers TM notification)
- Approve with conditions (note attached, visible to TM only)

Once approved, allotments are locked. Changes require both TM and approver to confirm.

Approved allotment is then distributed to:
- **Venue staff** (AR manager, hospo manager) — via their portal link
- **Box office** — via a read-only door list view (no portal account needed, separate PIN link)

### 5b. Tour Template
Set once per tour, applied to every show. Override individual shows as needed.

```
bbno$ EU 2026 Default Template:
  Artist Guest (FOH)          6 + 2 walk-on
  Artist Family (VIP + DR)    4
  Manager (FOH + BS)          2
  Agent (FOH)                 1
  Publicist + Media (FOH + PIT) 4
  Feature Performer (FOH + BS) 4
  AAA Crew (all zones)        full roster
  Venue Promoter (all)        6
  AR Manager (HOSPO + VIP)    4
  Hospo Guests (VIP)          10
```

### 5c. Negotiated Overrides (per show)
TM opens the show's guest list config and adjusts quantities. Changes flagged as `source: advance` or `source: manual` with a note. Venue side sees their categories only.

---

## 6. Submission Workflow

```
1. Venue approver approves allotments → GuestListShow status: open
2. All parties receive magic link portal invites
3. Party opens portal → sees their approved category, qty, cutoff timer
4. Party adds names (one per row): name, +1 toggle, note
5. Party saves — visible to TM in real time
6. At cutoff, submissions lock automatically
7. TM does final review → can approve/deny individual entries, extend cutoff
8. TM finalizes list → status: locked
9. Final list distributed automatically:
     → Box office: PIN-protected read-only door list URL
     → Venue staff (AR, hospo): their category view only
     → Venue approver: full approved list PDF for records
```

### Walk-On Queue (Day Of)
- Separate queue, visible only to TM and door team
- Party requests walk-on → TM approves/denies in real time
- Walk-on pool shared across all artist-side parties; venue-side has separate pool
- Hard cap enforced; over-cap requires TM override with note

---

## 7. Check-In

### Mobile Check-In (Day of Show)
- Door team gets a PIN-locked URL (no full app login needed)
- View: list by category or search by name
- Tap name → confirm → status flips to `checked_in` + timestamp
- QR scan: each entry gets a QR code if party generates a ticket PDF from portal
- Offline-capable: IndexedDB cache, syncs when signal returns

### Check-In View Columns
Name | Category | +1 | Notes | Status | Time

### TM Real-Time Dashboard (during show)
- Live counts per category: submitted / checked in / no-show / remaining
- Walk-on queue with approve/deny
- Alert if category approaches cap

---

## 8. Tour Route Propagation

The gap every competitor misses. DOS solves it:

```
TM creates GuestListTemplate for "bbno$ EU 2026"
  → Set default allotments per category
  → Apply to all 17 EU shows in one click
  → Each show inherits template, status: draft

Per-show overrides:
  → Shows with promoter-specific changes (e.g. Paris: hospo +5) → override inline
  → Override flagged with source + note for settlement reference

Party assignments:
  → "Manager" party assigned to ALL shows by default
  → Venue-side parties assigned per show (auto-linked from advance contacts)
```

Advance integration: when TM confirms a contact in the advance checklist with role `venue` or `ar_hospo`, DOS offers to auto-create a GuestListParty for that contact at their show.

---

## 9. Advance Integration

New advance checklist item added automatically when GuestListShow is created:

```
vn9 | venue | they_provide | "Guest list allotments confirmed and categories approved."
```

Advance status mirrors GuestListShow status:
- draft → Pending
- open → In Progress
- locked → Received
- all parties submitted → Confirmed

---

## 10. Settlement Integration

Each category has an optional `comp_value` (dollar value per ticket). At settlement:

```
Comps issued:
  Artist Guest (6 used × $0)     = $0 (contractual — no charge)
  Media (3 used × $0)            = $0
  Hospo (8 used × $150 face)     = $1,200 tracked (for hospitality budget reconciliation)
  Walk-ons (2 × $85 face)        = $170 (note: per advance agreement)
```

Settlement tab in dos-tour-ops shows guest list summary per show: total comps, face value, any walk-on charges against hospo budget.

---

## 11. Access Tiers & UX

---

### Tier 1 — Full Login (Artist + Management)
**Who:** Artist, Manager, Tour Manager

**Auth:** Google OAuth or email/password. One account per person, persists across all shows on any tour they're attached to.

**Dashboard:** All upcoming shows → tap any show → full list view.

**Full list view:**
```
Guests
  Artist Guests       (12 names, 3 remaining)
  Artist Family       (4 names)
  Management          (2 names)
  Feature Performers  (6 names)
  Media               (3 names)

Crew & Production
  Tour Crew           (TM, FOH, MON, LX, VX, Merch, Bus Driver, …)
  Local Production    (call sheet names)

Venue Staff
  Promoter Staff      (6 names)
  AR Manager + Team   (4 names)
  Hospitality         (hospo manager + runners)
  Bar Staff           (venue-provided)
  Security            (head of security + named leads)
  Box Office          (manager + staff on shift)
```

**Controls:**
- Artist/Manager: add/edit/remove their own allotment entries until cutoff; request walk-on (pings TM)
- TM: full admin — approve/deny entries, manage walk-on queue, extend cutoff, export

---

### Tier 2 — Guest-Tier Login (Agent + Publicist)
**Who:** Agent, Publicist

**Auth:** Login account — same Google OAuth/email flow as Tier 1. One account, all shows across their client roster.

**Why login, not magic link:** Agents and publicists work across multiple artists simultaneously. They need to see who else is on a guest list — other reps, competing managers, industry people moving on their clients — across every show in their book, not just the one they submitted for. A per-show magic link gives them no cross-show visibility and no competitive context.

**What they see — guest-tier only (no crew, no venue ops):**
```
Guests
  Artist Guests       (names + submitted by)
  Artist Family       (names + submitted by)
  Management          (names + submitted by)
  Feature Performers  (names + submitted by)
  Media               (names + who submitted each entry)
  [Their own category with edit controls until cutoff]
```

`submitted by` is visible on each entry — agent sees if a competing manager submitted a mutual contact, publicist sees if another firm's client is being worked into the room.

**Controls:**
- Add/edit/remove their own category entries until cutoff
- View all guest-tier entries read-only (name + submitting party)
- Request walk-on for their allotment

---

### Tier 3 — Venue Login (Org-Scoped, Multi-Show)
**Who:** Talent Buyer, Advance Contact, Venue Prod Manager, Promoter, AR Manager, Hospo Manager, Box Office

**Auth:** Login account scoped to their **organization** (venue or promoter company). One account sees all shows at their org.

**Why org-scoped:** A box office manager at O2 Academy handles 200+ shows per year. An AR manager at Live Nation UK tracks 50+ shows per month across their territory. Per-show magic links create credential sprawl and kill their workflow. One login shows their full calendar.

**Dashboard — venue/promoter org view:**
```
Upcoming Shows (this week)
  May 07  O2 Victoria Warehouse — bbno$     [Open — 4 days to cutoff]
  May 09  O2 Victoria Warehouse — Tate McRae [Open — 6 days to cutoff]
  May 14  O2 Victoria Warehouse — Jungle     [Pending approval]

Past Shows
  Apr 30  O2 Victoria Warehouse — Clairo     [Closed — archive]
```

**Per-show view — scoped by role:**

| Role | Sees |
|------|------|
| Talent Buyer / Advance Contact | All venue-side categories + guest-tier (read-only) + allotment approval panel |
| Venue Prod Manager | All venue-side + ops categories + allotment approval panel |
| Promoter | Their category + hospo tier |
| AR Manager | Their category + hospo tier |
| Hospo Manager | Hospo category only — dietary, accessibility, badge fields enabled |
| Box Office | Full finalized list (all categories) — check-in tools, search, walk-on queue |

**Box office check-in view:**
- Unlocks only after TM locks the list
- Search by last name across all categories
- Tap to check in — logs timestamp + operator
- Walk-on tab: pending TM approvals appear here for execution
- Shows for the day grouped at top for venues running multiple events

---

### Tier 4 — Door Team PIN
**Who:** Named door staff, security lead — temporary workers with no ongoing account

**Auth:** 4-digit PIN, show-specific, generated by TM or Box Office manager. Expires at end of show.

**What they see:** Finalized list only. Name | Category | +1 | Access Zones | Status. No submission controls, no org context.

---

### Tier 5 — TM Admin
**Who:** Tour Manager (Davon, Olivia)

Full control — same login as Tier 1 but with admin scope across all shows on all active tours. Covered in Section 7.

---

## 12. tRPC API Surface (Platform)

```typescript
// Allotment config + approval
guestList.getTemplate(tourId)
guestList.setTemplate(tourId, categories, allotments)
guestList.applyTemplateToShows(tourId, showIds)
guestList.getShowConfig(showId)
guestList.updateShowConfig(showId, overrides)
guestList.requestApproval(showId)            // TM sends to venue approver
guestList.approveAllotments(showId, note?)   // venue approver confirms
guestList.counterAllotments(showId, counters, note) // venue approver counters
guestList.getBoxOfficeList(showId, pin)      // read-only, no auth required

// Parties
guestList.listParties(showId)
guestList.createParty(showId, partyData)
guestList.sendPortalInvite(partyId)

// Submissions
guestList.getSubmission(partyId, showId)
guestList.upsertEntry(submissionId, entry)
guestList.deleteEntry(entryId)
guestList.lockSubmission(submissionId)       // TM only

// Check-in
guestList.getDoorList(showId, categoryId?)
guestList.checkIn(entryId, operatorId)
guestList.addWalkOn(showId, entry)           // TM approval required

// Full list (artist/management login only)
guestList.getFullList(showId)                // all categories, all entries
guestList.getCategoryList(showId, category)  // magic link scope
guestList.getLockedList(showId, pin)         // PIN-only, post-lock only

// Reporting
guestList.getShowSummary(showId)             // counts by category
guestList.exportList(showId, format)         // pdf | csv
guestList.getSettlementSummary(showId)       // comp values
```

---

## 13. dos-tour-ops v7 Integration

Until the platform ships, v7 integration via new storage key:

```
dos-v7-guestlists   (shared, team_id scoped)
  {
    [showDate]: {
      categories: [...],
      allotments: { [categoryId]: { qty, walkOnQty, source } },
      parties: { [partyId]: { name, role, side, entries: [...] } },
      cutoffAt: ISO string,
      status: "draft"|"open"|"locked"|"closed"
    }
  }
```

New tab in DosApp.jsx: **Guest List** (between Advance and Show Day).

TM view per show:
- Category allotment config (edit inline)
- Party list with submitted count vs allotment
- Live check-in counts (manual toggle, no mobile sync in v7)
- Export: JSON download of door list

Phase 4 (platform): full portal + real-time + QR check-in replaces v7 guest list tab.

---

## 14. What DOS Does That No One Else Does

| Feature | MT | Lennd | FestivalPro | **DOS** |
|---------|----|----|-------------|---------|
| Tour route propagation | Manual per show | No | No | **One-click** |
| Contract-linked allotments | No | No | No | **Yes** |
| Advance checklist integration | Partial | No | No | **Native** |
| Artist/mgmt login with full list view | No | No | No | **Yes** |
| Agent/publicist guest-tier login (competitive visibility) | No | No | No | **Yes** |
| Venue org-scoped login — full yearly calendar | No | Partial | No | **Yes** |
| Box office multi-show check-in dashboard | No | No | No | **Yes** |
| Settlement comp tracking | No | No | No | **Yes** |
| Artist + venue side in one tool | Partial | No | Yes | **Yes, purpose-built** |
| Magic link portal (no account) | No | No | No | **Yes** |
| Walk-on queue with real-time TM approval | No | No | No | **Yes** |
| v7 → Platform migration path | — | — | — | **Staged** |

---

*DOS Platform | Guest List Module | v1.0 | April 21, 2026*
