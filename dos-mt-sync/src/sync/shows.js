import { getShows } from '../dos.js';
import { log } from '../log.js';
import { clickNavSection, selectDate, waitForEvent } from '../pages/Nav.js';
import {
  clickEventTab,
  promoterIsSet,
  setPromoter,
  existingContactNames,
  addKeyContact,
} from '../pages/EventPage.js';

// Shows from Supabase may be an array or a date-keyed object.
function normShows(raw) {
  if (Array.isArray(raw)) return raw;
  return Object.values(raw);
}

export async function syncShows(page, { dryRun = false, date = null } = {}) {
  const raw = await getShows();
  // Filter to entries with a venue (travel days and off days have no venue)
  let shows = normShows(raw).filter(s => s?.date && s?.venue);

  if (!shows.length) {
    log.warn('No shows found in DOS storage');
    return;
  }

  if (date) shows = shows.filter(s => s.date === date);

  // Sort chronologically
  shows.sort((a, b) => a.date.localeCompare(b.date));

  await clickNavSection(page, 'Events');

  for (const show of shows) {
    const label = `${show.date} ${show.venue}, ${show.city}`;

    try {
      await selectDate(page, show.date);
      await waitForEvent(page, show.venue);

      // ── Promoter ──────────────────────────────────────────────────────────
      if (show.promoter) {
        await clickEventTab(page, 'PROMOTER');
        const alreadySet = await promoterIsSet(page);
        if (alreadySet) {
          log.skip(`${label} — promoter already set`);
        } else {
          if (dryRun) {
            log.dry(`${label} — would set promoter: ${show.promoter}`);
          } else {
            await setPromoter(page, show.promoter, dryRun);
            log.ok(`${label} — promoter set: ${show.promoter}`);
          }
        }
      }

      // ── Key contacts ──────────────────────────────────────────────────────
      const contacts = show.advance ?? [];
      if (contacts.length) {
        await clickEventTab(page, 'OVERVIEW');
        const existing = await existingContactNames(page);

        for (const contact of contacts) {
          if (!contact.name) continue;
          if (existing.toLowerCase().includes(contact.name.toLowerCase())) {
            log.skip(`${label} — contact exists: ${contact.name}`);
            continue;
          }
          if (dryRun) {
            log.dry(`${label} — would add contact: ${contact.name} (${contact.role})`);
          } else {
            await addKeyContact(page, contact, dryRun);
            log.ok(`${label} — contact added: ${contact.name}`);
          }
        }
      }
    } catch (err) {
      log.error(`${label} — ${err.message}`);
    }
  }
}
