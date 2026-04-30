# METRICS — Weekly KPI Dashboard

**Cadence:** Sunday 8pm, 10 min. Update the latest row; never edit past rows.
**Tier:** LOW (manual). Data from Supabase SQL + personal recall.

---

## Core KPIs

| Week ending | Paying tours | Inbox signups | Shows run | Intel scans | Scan success % | Claude $ | Bugs shipped | Notes |
|---|---|---|---|---|---|---|---|---|
| 2026-04-26 | 0 (internal) | — | — | — | — | — | — | Baseline week. Pre-EU. |

---

## Queries to run Sunday

```sql
-- Intel scans this week
select count(*), avg(duration_ms), sum(cost_cents)/100.0 as dollars
from scan_runs
where scanner='intel' and started_at >= now() - interval '7 days';

-- Shows active this week
select count(distinct key) from app_storage
where key like 'dos-v7-shows%' and updated_at >= now() - interval '7 days';

-- Activity log volume
select module, count(*) from (
  select jsonb_array_elements(value::jsonb) as e from app_storage where key='dos-v7-actlog'
) s, lateral (select s.e->>'module' as module) m
group by module order by count desc;
```

---

## Leading indicators to watch

- **Scan success %** drops below 85% two weeks running → intel.js regression, debug.
- **Claude $** > $50/mo → re-evaluate caching, consider Haiku for summaries.
- **Bugs shipped** > 3/wk → slow down, write a test before next feature.
- **Inbox signups** flat 4 weeks → Tour Inbox hypothesis in trouble (see HYPOTHESES.md).

---

## Quarterly targets

| Quarter | Paying tours | Inbox signups | MRR | Notes |
|---|---|---|---|---|
| Q2 2026 | 0 | 0 | $0 | Internal only. EU tour ops. |
| Q3 2026 | 3 | 10 | $500 | Elements festival + first 3 paying TMs |
| Q4 2026 | 8 | 35 | $1.5K | Tour Inbox wedge proof |
| Q1 2027 | 18 | 75 | $3.5K | Platform GA candidate |

Source: FINANCIALS.md scenario A.
