import { clickNavSection, selectDate } from '../pages/Nav.js';
import { existingTravelText, addFlight, addGroundTransport } from '../pages/TravelPage.js';
import { airSegments, groundSegments, matchShowForFlight } from '../map.js';
import { log } from '../log.js';

export async function syncTravel(page, showsObj, flightsObj, { dryRun = false, filterDate = null } = {}) {
  log.section('Travel');

  await clickNavSection(page, 'Travel');

  // ── Flights ───────────────────────────────────────────────────────────────
  const flights = airSegments(flightsObj)
    .filter(f => !filterDate || f.depDate === filterDate);

  if (!flights.length) {
    log.warn('No air segments in dos-v7-flights');
  }

  for (const flight of flights) {
    const label = `${flight.depDate} — ${flight.flightNo || '?'} ${flight.from}→${flight.to}`;

    try {
      const show = matchShowForFlight(flight, showsObj);
      const dateKey = flight.depDate;

      await selectDate(page, dateKey);
      await page.waitForTimeout(400);

      const existing = await existingTravelText(page);
      const flightId = (flight.flightNo || '').toLowerCase();

      if (flightId && existing.includes(flightId)) {
        log.skip(`${label} — already in MT`);
        continue;
      }

      log.info(`${label} — adding flight (pax: ${(flight.pax || []).join(', ') || 'none'})`);

      if (dryRun) {
        log.dry(`Would add flight: ${JSON.stringify(flight)}`);
      } else {
        await addFlight(page, flight, dryRun);
        log.ok(`${label} — added`);
      }
    } catch (err) {
      log.error(`${label} — ${err.message}`);
    }
  }

  // ── Ground ────────────────────────────────────────────────────────────────
  const ground = groundSegments(flightsObj)
    .filter(s => !filterDate || s.depDate === filterDate);

  for (const segment of ground) {
    const label = `${segment.depDate} — Ground: ${segment.from}→${segment.to}`;

    try {
      await selectDate(page, segment.depDate);
      await page.waitForTimeout(400);

      const existing = await existingTravelText(page);
      const dedupeKey = `${segment.from} ${segment.to}`.toLowerCase();

      if (existing.includes(segment.from?.toLowerCase()) && existing.includes(segment.to?.toLowerCase())) {
        log.skip(`${label} — already in MT`);
        continue;
      }

      log.info(`${label} — adding ground segment`);

      if (dryRun) {
        log.dry(`Would add ground: ${JSON.stringify(segment)}`);
      } else {
        await addGroundTransport(page, segment, dryRun);
        log.ok(`${label} — added`);
      }
    } catch (err) {
      log.error(`${label} — ${err.message}`);
    }
  }
}
