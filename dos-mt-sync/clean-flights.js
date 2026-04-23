#!/usr/bin/env node
// One-off cleanup: normalize flightNo, dedup, drop garbage.
// Writes back to app_storage via service key. Supports --dry-run.
import 'dotenv/config';
import { getFlights } from './src/dos.js';

const DOS_TEAM_ID = process.env.DOS_TEAM_ID ?? 'dos-bbno-2026';
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY'); process.exit(1); }
const dryRun = process.argv.includes('--dry-run');

const normFn = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
const isJunk = fn => !fn || /^UNKNOWN$/i.test(fn);
const richness = f => {
  const n = Object.values(f).filter(v => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)).length;
  const fnPenalty = isJunk(normFn(f.flightNo)) ? -50 : 0;
  const pnrBonus = f.pnr ? 5 : 0;
  const paxBonus = (f.pax || []).length ? 3 : 0;
  return n + fnPenalty + pnrBonus + paxBonus;
};

async function writeFlights(value) {
  const body = {
    key: 'dos-v7-flights',
    team_id: DOS_TEAM_ID,
    value: JSON.stringify(value),
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_storage?key=eq.dos-v7-flights&team_id=eq.${DOS_TEAM_ID}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ value: body.value }),
  });
  if (!res.ok) throw new Error(`Supabase write ${res.status}: ${await res.text()}`);
}

(async () => {
  const raw = await getFlights();
  const arr = Object.values(raw);
  console.log(`before: ${arr.length}`);

  // Drop completely empty shells (no flightNo, no from, no to).
  const survivors = arr.filter(f => {
    const fn = normFn(f.flightNo);
    const hasRoute = (f.from || '').trim() && (f.to || '').trim();
    return !isJunk(fn) || hasRoute || (f.pax || []).length > 0;
  });
  console.log(`dropped empty shells: ${arr.length - survivors.length}`);

  // Group by normalized dedup key. Keep the richest record per key.
  const groups = new Map();
  for (const f of survivors) {
    const fn = normFn(f.flightNo);
    const key = isJunk(fn) || !f.from || !f.to || !f.depDate
      ? f.pnr || f.confirmNo || f.bookingRef || f.id
      : `${fn}__${f.from}__${f.to}__${f.depDate}`;
    const cur = groups.get(key);
    if (!cur || richness(f) > richness(cur)) {
      groups.set(key, {
        ...f,
        flightNo: f.flightNo ? normFn(f.flightNo) : f.flightNo,
        pax: (f.pax || []).map(p => String(p).replace(/\s+/g, ' ').trim()).filter(Boolean),
      });
    }
  }

  // ── Manual patches ────────────────────────────────────────────────────────
  // AC748 YUL→BOS 2026-05-01: PNR-bearing record wins but has abbreviated name.
  // Overwrite pax with the fuller name from the dropped duplicate.
  const ac748 = groups.get('AC748__YUL__BOS__2026-05-01');
  if (ac748) ac748.pax = ['Mathieu Senechal'];

  // CTTCOZ (Air Canada YVR→SNA 2026-04-06): both dupes had junk flightNo.
  // Patch with correct carrier + clear the "UNKNOWN" flightNo string.
  const cttcoz = groups.get('CTTCOZ');
  if (cttcoz) Object.assign(cttcoz, {
    flightNo: 'AC598',
    carrier: 'Air Canada',
    from: 'YVR',
    fromCity: 'Vancouver',
    to: 'SNA',
    toCity: 'Orange County',
    depDate: '2026-04-06',
    dep: '08:10',
    arrDate: '2026-04-06',
    arr: '11:15',
    cost: 488.78,
    currency: 'CAD',
    pax: ['Nicholas Foerster'],
  });

  const cleaned = [...groups.values()];
  console.log(`after dedup: ${cleaned.length} (removed ${survivors.length - cleaned.length} dupes)`);

  // Rebuild object keyed by id.
  const next = {};
  for (const f of cleaned) next[f.id] = f;

  if (dryRun) {
    console.log('\nDRY RUN — not writing.\n');

    // Empty shells dropped
    const shellsRemoved = arr.filter(f => !survivors.includes(f));
    if (shellsRemoved.length) {
      console.log(`── Dropped empty shells (${shellsRemoved.length}) ──`);
      shellsRemoved.forEach(f => console.log(`  id=${f.id}  fn=${f.flightNo || '—'}  ${f.from || '?'}→${f.to || '?'}  ${f.depDate || '?'}  pax=${(f.pax || []).length}`));
    }

    // Dupes merged — rebuild groups with all members for display
    const dupeGroups = new Map();
    for (const f of survivors) {
      const fn = normFn(f.flightNo);
      const key = isJunk(fn) || !f.from || !f.to || !f.depDate
        ? f.pnr || f.confirmNo || f.bookingRef || f.id
        : `${fn}__${f.from}__${f.to}__${f.depDate}`;
      if (!dupeGroups.has(key)) dupeGroups.set(key, []);
      dupeGroups.get(key).push(f);
    }
    const merges = [...dupeGroups.entries()].filter(([, members]) => members.length > 1);
    if (merges.length) {
      console.log(`\n── Merged dupes (${merges.length} groups, ${merges.reduce((n, [, m]) => n + m.length - 1, 0)} removed) ──`);
      for (const [key, members] of merges) {
        console.log(`\n  key: ${key}`);
        const winner = members.reduce((a, b) => richness(b) > richness(a) ? b : a);
        members.forEach(m => {
          const mark = m === winner ? 'KEEP' : 'drop';
          console.log(`    [${mark}] id=${m.id}  fn="${m.flightNo}"  richness=${richness(m)}  pax=${(m.pax || []).join('|') || '—'}  pnr=${m.pnr || '—'}`);
        });
      }
    }

    console.log(`\nSummary: ${arr.length} → ${cleaned.length} (−${arr.length - cleaned.length})`);
    return;
  }
  await writeFlights(next);
  console.log(`wrote ${cleaned.length} flights back to Supabase.`);
})().catch(e => { console.error(e.message); process.exit(1); });
