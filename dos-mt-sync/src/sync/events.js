import { clickNavSection, selectDate, waitForEvent } from '../pages/Nav.js';
import {
  clickEventTab,
  promoterIsSet,
  setPromoter,
  existingContactNames,
  addKeyContact,
} from '../pages/EventPage.js';
import { showsToSync, promoterName, showContacts } from '../map.js';
import { log } from '../log.js';

export async function syncEvents(page, showsObj, { dryRun = false, filterDate = null } = {}) {
  log.section('Events + Contacts');

  const shows = showsToSync(showsObj).filter(s => !filterDate || s.date === filterDate);

  if (!shows.length) {
    log.warn('No shows to sync');
    return;
  }

  await clickNavSection(page, 'Events');

  for (const show of shows) {
    const label = `${show.date} — ${show.venue}, ${show.city}`;

    try {
      await selectDate(page, show.date);
      await waitForEvent(page, show.venue);

      // ── Promoter ──────────────────────────────────────────────────────────
      await clickEventTab(page, 'PROMOTER');
      await page.waitForTimeout(300);

      const pName = promoterName(show);
      if (pName) {
        const already = await promoterIsSet(page);
        if (already) {
          log.skip(`${label} — promoter already set`);
        } else {
          log.info(`${label} — setting promoter: ${pName}`);
          if (dryRun) { log.dry(`Would set promoter: ${pName}`); }
          else { await setPromoter(page, pName, dryRun); log.ok(`${label} — promoter set`); }
        }
      }

      // ── Key Contacts ─────────────────────────────────────────────────────
      await clickEventTab(page, 'OVERVIEW');
      await page.waitForTimeout(300);

      const contacts = showContacts(show);
      if (!contacts.length) {
        log.skip(`${label} — no advance contacts`);
        continue;
      }

      const existing = await existingContactNames(page);

      for (const contact of contacts) {
        if (existing.toLowerCase().includes(contact.name.toLowerCase())) {
          log.skip(`${label} — contact already exists: ${contact.name}`);
          continue;
        }
        log.info(`${label} — adding contact: ${contact.name} (${contact.role})`);
        if (dryRun) {
          log.dry(`Would add: ${JSON.stringify(contact)}`);
        } else {
          await addKeyContact(page, contact, dryRun);
          log.ok(`${label} — added ${contact.name}`);
        }
      }
    } catch (err) {
      log.error(`${label} — ${err.message}`);
    }
  }
}
