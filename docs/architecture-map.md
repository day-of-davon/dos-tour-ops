# DOS Tour Ops v7 — Structural Map

```mermaid
graph TB
  classDef user fill:#001E3C,stroke:#14B8A6,color:#fff
  classDef shared fill:#0A2E22,stroke:#6EE7B7,color:#6EE7B7
  classDef private fill:#2B1C05,stroke:#FCD34D,color:#FCD34D
  classDef tab fill:#002B4E,stroke:#4FA3E3,color:#fff
  classDef api fill:#3A0909,stroke:#F87171,color:#F87171
  classDef entity fill:#003366,stroke:#14B8A6,color:#fff

  %% ── Users / Roles ──
  U1[Davon — CEO / TM]:::user
  U2[Olivia — Transport Coord]:::user
  R1[role: tm]:::user
  R2[role: production]:::user
  R3[role: hospitality]:::user
  R4[role: transport]:::user
  U1 --- R1 & R2
  U2 --- R4

  %% ── Auth ──
  AUTH[AuthGate — Supabase + Google OAuth]:::api
  U1 --> AUTH
  U2 --> AUTH

  %% ── Storage layer ──
  AUTH --> STORE[window.storage shim]
  STORE --> SHARED[team_id = dos-bbno-eu-2026]:::shared
  STORE --> PRIV[user_id scoped]:::private

  %% Shared keys
  SHARED --> S1[dos-v7-shows]:::shared
  SHARED --> S2[dos-v7-ros]:::shared
  SHARED --> S3[dos-v7-advances]:::shared
  SHARED --> S4[dos-v7-finance]:::shared
  SHARED --> S5[dos-v7-settings]:::shared
  SHARED --> S6[dos-v7-crew]:::shared
  SHARED --> S7[dos-v7-production]:::shared
  SHARED --> S8[dos-v7-flights]:::shared
  SHARED --> S9[dos-v7-lodging]:::shared
  SHARED --> S10[dos-v7-guestlists]:::shared
  SHARED --> S11[dos-v7-guestlist-templates]:::shared

  %% Private keys
  PRIV --> P1[dos-v7-notes-private]:::private
  PRIV --> P2[dos-v7-checklist-private]:::private
  PRIV --> P3[dos-v7-intel]:::private
```

## App Shell

```mermaid
graph LR
  classDef chrome fill:#001E3C,stroke:#14B8A6,color:#fff
  classDef tab fill:#002B4E,stroke:#4FA3E3,color:#fff
  classDef sub fill:#0A2E22,stroke:#6EE7B7,color:#6EE7B7

  APP[DosApp] --> TB[TopBar]:::chrome
  APP --> NAV[NavSidebar]:::chrome
  APP --> SPT[SplitPartyTabs]:::chrome
  APP --> CONTENT[Tab Content]
  APP --> CMD[CmdPalette]:::chrome
  APP --> EXP[ExportModal]:::chrome
  APP --> UPL[UploadModal]:::chrome
  APP --> DD[DateDrawer]:::chrome

  TB --> THEME[Theme Toggle]
  TB --> CLIENT[Client Picker: bbno / Wakaan / Beyond / Elements]
  TB --> ROLE[Role Switch: TM / PROD / HOSPO / TRANSPORT]

  NAV --> FLAGS[Flags: Immigration / Insurance]
  NAV --> DATES[Date Rows: show / travel / off / split]
  DATES -.split day.-> SPT
```

## Feature Tabs + Sub-Tabs

```mermaid
graph TB
  classDef tab fill:#002B4E,stroke:#4FA3E3,color:#fff
  classDef sub fill:#0A2A28,stroke:#14B8A6,color:#14B8A6
  classDef split fill:#2B1C05,stroke:#FCD34D,color:#FCD34D

  ROOT[8 Feature Tabs]:::tab

  ROOT --> T1[Production ▤]:::tab
  T1 --> T1a[Docs upload]:::sub
  T1 --> T1b[Parsed entities]:::sub
  T1 --> T1c[PDF viewer]:::sub

  ROOT --> T2[Schedule ▦ · ROS]:::tab
  T2 --> T2a[Anchors: doors / crew-call / curfew]:::sub
  T2 --> T2b[Block timeline]:::sub
  T2 --> T2c[Per-show overrides]:::sub

  ROOT --> T3[Advance ◎]:::tab
  T3 --> T3a[Standard checklist]:::sub
  T3 --> T3b[Custom items shared / private]:::sub
  T3 --> T3c[Status: pending→in-progress→confirmed + 9 states]:::sub
  T3 --> T3d[Contacts + notes]:::sub
  T3 --> T3e[Gmail intel panel]:::sub

  ROOT --> T4[Logistics ◈ · Transport]:::tab
  T4 --> T4a[EU Bus schedule — Pieter Smit]:::sub
  T4 --> T4b[Festival dispatch]:::sub
  T4 --> T4c[Flights list + scanner]:::sub

  ROOT --> T5[Crew ◇]:::tab
  T5 --> T5a[Artist side]:::sub
  T5 --> T5b[Venue side]:::sub

  ROOT --> T6[Finance ◐]:::tab
  T6 --> T6a[Settlement status]:::sub
  T6 --> T6b[Wire tracking]:::sub
  T6 --> T6c[Payout log]:::sub

  ROOT --> T7[Guest List ◉]:::tab
  T7 --> T7a[Templates]:::sub
  T7 --> T7b[Per-show lists]:::sub
  T7 --> T7c[Categories: aaa_crew / artist / vip]:::sub

  ROOT --> T8[Lodging ⌂]:::tab
  T8 --> T8a[Per-show rooms]:::sub
  T8 --> T8b[Email scanner]:::sub

  %% Split-day overlay
  SPLIT{{On split day}}:::split
  SPLIT -.applies to all tabs.-> ROOT
  SPLIT --> SPa[Party A — Worcester Show]:::split
  SPLIT --> SPb[Party B — EU Programming]:::split
```

## Entity Model

```mermaid
erDiagram
  CLIENT ||--o{ SHOW : has
  SHOW ||--o| ROS : has
  SHOW ||--o{ ADVANCE_ITEM : has
  SHOW ||--o{ FLIGHT : has
  SHOW ||--o{ LODGING : has
  SHOW ||--o{ GUESTLIST_ENTRY : has
  SHOW ||--o{ CREW_ASSIGNMENT : has
  SHOW ||--o| FINANCE : has
  SHOW ||--o{ PRODUCTION_DOC : has
  TOUR_DAY ||--o| SHOW : optional
  TOUR_DAY ||--o{ SPLIT_PARTY : optional
  SPLIT_PARTY }o--o{ CREW_MEMBER : assigns

  CLIENT {
    string id
    string name
    string type
  }
  SHOW {
    date date PK
    string clientId
    string city
    string venue
    string country
    enum type "show | travel | off | split"
  }
  SPLIT_PARTY {
    string id
    string label
    string location
    string event
    string color
    array crew
  }
  ADVANCE_ITEM {
    string id
    enum status "pending | sent | received | in_progress | respond | follow_up | escalate | confirmed | na"
    bool private
    string owner
  }
  FLIGHT {
    string pnr
    date depDate
    date arrDate
    array pax
    float cost
  }
```

## API Handlers

```mermaid
graph LR
  classDef api fill:#3A0909,stroke:#F87171,color:#F87171
  classDef ext fill:#0A1F3D,stroke:#93C5FD,color:#93C5FD

  APP[DosApp] --> F[/api/flights]:::api
  APP --> I[/api/intel]:::api
  APP --> L[/api/lodging-scan]:::api
  APP --> PP[/api/parse-pdf]:::api
  APP --> PD[/api/parse-doc]:::api
  APP --> PR[/api/production]:::api

  F --> GM[Gmail API]:::ext
  I --> GM
  L --> GM

  F --> CL[Anthropic Claude + prompt cache]:::ext
  I --> CL
  L --> CL
  PP --> CL
  PD --> CL
  PR --> CL
```

## Role → Tab Access (defaults)

| Role       | Primary Tabs                              |
|------------|-------------------------------------------|
| TM         | Advance, Schedule, Finance, Guest List    |
| PROD       | Production, Schedule, Advance             |
| HOSPO      | Lodging, Guest List, Crew                 |
| TRANSPORT  | Logistics, Crew, Schedule                 |

## Day Types in Nav

| Type     | Color token        | Sub-tabs?          |
|----------|--------------------|--------------------|
| `show`   | success-bg/fg      | no                 |
| `travel` | info-bg / link     | no                 |
| `off`    | card-2 / text-mute | no                 |
| `split`  | warn-bg/fg         | **yes — per party**|
