import { getFlights } from '../dos.js';
import { log } from '../log.js';
import { clickNavSection, selectDate } from '../pages/Nav.js';
import { clickEventTab } from '../pages/EventPage.js';
import { existingTravelText, addFlight, addGroundTransport } from '../pages/TravelPage.js';

// Group flights by the date they should appear in MT (depDate for air, depDate for ground).
function groupByDate(flights) {
  const map = {};
  for (const f of flights) {
    const key = f.depDate ?? f.dep?.split('T')[0];
    if (!key) continue;
    (map[key] = map[key] ?? []).push(f);
  }
  return map;
}

// Dedup key: carrier+flightNo for air, from+to+depDate for ground.
function dedupKey(f) {
  if (f.type === 'air' || f.flightNo) return `${f.carrier ?? ''}${f.flightNo ?? ''}`.toLowerCase();
  return `${f.from ?? ''}-${f.to ?? ''}-${f.depDate ?? ''}`.toLowerCase();
}

export async function syncFlights(page, { dryRun = false, date = null } = {}) {
  const raw = await getFlights();
  const all = Object.values(raw ?? {});

  if (!all.length) {
    log.warn('No flights found in DOS storage');
    return;
  }

  const byDate = groupByDate(all);
  const dates = Object.keys(byDate).sort();

  await clickNavSection(page, 'Events');

  for (const depDate of dates) {
    if (date && depDate !== date) continue;

    const segments = byDate[depDate];

    try {
      await selectDate(page, depDate);
      await clickEventTab(page, 'TRAVEL');
      const existing = await existingTravelText(page);

      for (const seg of segments) {
        const key = dedupKey(seg);
        const label = seg.flightNo
          ? `${seg.carrier ?? ''} ${seg.flightNo} (${depDate})`
          : `${seg.from ?? '?'} → ${seg.to ?? '?'} (${depDate})`;

        if (key && existing.includes(key.split('-')[0])) {
          log.skip(`${label} — already in MT`);
          continue;
        }

        if (dryRun) {
          log.dry(`Would add: ${label}`);
          continue;
        }

        if (seg.type === 'ground' || (!seg.flightNo && !seg.carrier)) {
          await addGroundTransport(page, seg, dryRun);
        } else {
          await addFlight(page, seg, dryRun);
        }
        log.ok(`Added: ${label}`);
      }
    } catch (err) {
      log.error(`${depDate} — ${err.message}`);
    }
  }
}
