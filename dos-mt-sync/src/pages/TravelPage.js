// Interactions within the Travel tab for a selected date.

// Returns all text content of existing travel items (used for dedup).
export async function existingTravelText(page) {
  if (!page) return '';
  const items = page.locator('[class*="travel"], [class*="item"]');
  const texts = await items.allInnerTexts().catch(() => []);
  return texts.join('\n').toLowerCase();
}

// Opens ADD -> DAY TRAVEL dropdown.
async function openAddMenu(page) {
  await page.locator('button:has-text("ADD")').last().click();
  await page.waitForTimeout(300);
}

// ── Flight entry ──────────────────────────────────────────────────────────────

/*
  flight shape (from dos-v7-flights):
  {
    type: 'air',
    flightNo: 'DL1731',
    carrier: 'Delta',
    from: 'DEN',       // IATA departure
    to: 'SEA',         // IATA arrival
    fromCity: 'Denver',
    toCity: 'Seattle',
    dep: '2026-04-17T06:52:00',   // ISO local
    arr: '2026-04-17T09:03:00',
    depDate: '2026-04-17',
    arrDate: '2026-04-17',
    pax: ['Olen', 'Nick'],
    confirmNo: 'ABC123',
  }
*/
export async function addFlight(page, flight, dryRun) {
  if (dryRun) return;

  await openAddMenu(page);

  // Click DAY TRAVEL
  await page.locator('text=DAY TRAVEL').click();
  await page.waitForTimeout(300);

  // Click AIR tab in the travel form
  await page.locator('button:has-text("AIR"), text=AIR').first().click();
  await page.waitForTimeout(300);

  // Set party (pax names as comma-separated string)
  if (flight.pax?.length) {
    const partyField = page.locator('input[placeholder*="Party" i]').first();
    if (await partyField.count()) await partyField.fill(flight.pax.join(', '));
  }

  // Click ADD FLIGHT
  await page.locator('text=ADD FLIGHT').click();
  await page.waitForTimeout(400);

  // Flight type: leave as Commercial (default)
  // Airline
  if (flight.carrier) {
    const airlineField = page.locator('input[placeholder*="Airline" i]').first();
    if (await airlineField.count()) await airlineField.fill(flight.carrier);
  }

  // Flight number
  if (flight.flightNo) {
    const flightNoField = page.locator('input[placeholder*="Flight Number" i]').first();
    if (await flightNoField.count()) await flightNoField.fill(flight.flightNo);
  }

  // Expand "Manually Edit Flight"
  const manualToggle = page.locator('text=Manually Edit Flight');
  if (await manualToggle.count()) await manualToggle.click();
  await page.waitForTimeout(300);

  // Departure airport
  if (flight.from) {
    const depAirport = page.locator('input[placeholder*="Departure Airport" i]').first();
    if (await depAirport.count()) await depAirport.fill(flight.from);
  }

  // Arrival airport
  if (flight.to) {
    const arrAirport = page.locator('input[placeholder*="Arrival Airport" i]').first();
    if (await arrAirport.count()) await arrAirport.fill(flight.to);
  }

  // Departure date
  if (flight.depDate) {
    const depDate = page.locator('input[placeholder*="Departure Date" i], [data-testid*="dep-date"]').first();
    if (await depDate.count()) {
      await depDate.fill(formatDateForMT(flight.depDate));
    } else {
      // MT uses a date picker — clear + type
      const datePicker = page.locator('input[value*="2026"]').first();
      if (await datePicker.count()) {
        await datePicker.triple_click();
        await datePicker.fill(formatDateForMT(flight.depDate));
      }
    }
  }

  // Departure time
  if (flight.dep) {
    const depTime = page.locator('input[placeholder*="Departure Time" i]').first();
    if (await depTime.count()) await depTime.fill(formatTimeForMT(flight.dep));
  }

  // Arrival date
  if (flight.arrDate) {
    const arrDatePickers = page.locator('input[value*="2026"]').all();
    const pickers = await arrDatePickers;
    if (pickers.length >= 2) {
      await pickers[1].triple_click();
      await pickers[1].fill(formatDateForMT(flight.arrDate));
    }
  }

  // Arrival time
  if (flight.arr) {
    const arrTime = page.locator('input[placeholder*="Arrival Time" i]').first();
    if (await arrTime.count()) await arrTime.fill(formatTimeForMT(flight.arr));
  }

  // Click DONE
  await page.locator('button:has-text("DONE")').click();
  await page.waitForTimeout(500);
}

// ── Ground transport entry ────────────────────────────────────────────────────

/*
  ground shape from dos-v7-flights or derived from show bus times:
  {
    type: 'ground',
    from: 'Glasgow',
    to: 'London',
    dep: '2026-05-12T08:00:00',
    arr: '2026-05-12T18:00:00',
    depDate: '2026-05-12',
    pax: ['Artist Party', 'Crew'],
    detail: 'Nightliner — Pieter Smit',
  }
*/
export async function addGroundTransport(page, segment, dryRun) {
  if (dryRun) return;

  await openAddMenu(page);
  await page.locator('text=DAY TRAVEL').click();
  await page.waitForTimeout(300);

  // GROUND is the default tab — confirm it's selected
  await page.locator('button:has-text("GROUND"), text=GROUND').first().click();
  await page.waitForTimeout(300);

  // Party
  if (segment.pax?.length) {
    const partyField = page.locator('input[placeholder*="Party" i]').first();
    if (await partyField.count()) await partyField.fill(segment.pax.join(', '));
  }

  // Origin
  if (segment.from) {
    const originField = page.locator('input[placeholder*="Origin" i]').first();
    if (await originField.count()) await originField.fill(segment.from);
  }

  // Departure time
  if (segment.dep) {
    const depTime = page.locator('input[placeholder*="Departure" i][type*="time"], input[placeholder*="8:00" i]').first();
    if (await depTime.count()) await depTime.fill(formatTimeForMT(segment.dep));
  }

  // Destination
  if (segment.to) {
    const destField = page.locator('input[placeholder*="Destination" i]').first();
    if (await destField.count()) await destField.fill(segment.to);
  }

  // Arrival time
  if (segment.arr) {
    const arrTime = page.locator('input[placeholder*="Arrival" i][type*="time"], input[placeholder*="9:00" i]').first();
    if (await arrTime.count()) await arrTime.fill(formatTimeForMT(segment.arr));
  }

  // Detail note
  if (segment.detail) {
    const detailField = page.locator('input[placeholder*="Detail" i], textarea[placeholder*="Detail" i]').first();
    if (await detailField.count()) await detailField.fill(segment.detail);
  }

  // Save (travel entries auto-save on blur — just click elsewhere or press Escape)
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// "2026-05-04" → "05/04/2026"
function formatDateForMT(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${m}/${d}/${y}`;
}

// "2026-05-04T08:30:00" → "8:30 AM"
function formatTimeForMT(isoOrTime) {
  const timePart = isoOrTime.includes('T') ? isoOrTime.split('T')[1] : isoOrTime;
  let [h, min] = timePart.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${String(min).padStart(2, '0')} ${ampm}`;
}
