// Interactions within an event's detail panel (center pane).

// Click a sub-tab within the event detail (OVERVIEW, PROMOTER, VENUE, etc.)
export async function clickEventTab(page, tabName) {
  await page.locator(`text=${tabName}`).first().click();
  await page.waitForTimeout(300);
}

// ── Promoter ─────────────────────────────────────────────────────────────────

// Returns true if promoter is already set (panel has content beyond "No Company Selected").
export async function promoterIsSet(page) {
  const text = await page.locator('text=No Company Selected').count();
  return text === 0;
}

// Opens the Add Promoter dialog and fills just the name field, then selects.
// MT uses Google Places autocomplete — we type the name and pick the first suggestion
// or fall back to typing the name directly and clicking SELECT.
export async function setPromoter(page, name, dryRun) {
  if (dryRun) return;

  const addBtn = page.locator('text=ADD PROMOTER').first();
  await addBtn.click();
  await page.waitForTimeout(400);

  const input = page.locator('input[placeholder*="typing"]').first();
  await input.fill(name);
  await page.waitForTimeout(800);

  // Try first autocomplete suggestion
  const suggestion = page.locator('[class*="suggestion"], [class*="dropdown"] li').first();
  const hasSuggestion = await suggestion.count().then(n => n > 0);

  if (hasSuggestion) {
    await suggestion.click();
  } else {
    // No Google suggestion — just hit SELECT with what we typed
    await page.locator('button:has-text("SELECT")').click();
  }
  await page.waitForTimeout(400);
}

// ── Key Contacts ──────────────────────────────────────────────────────────────

// Returns the names already present in Key Contacts (to avoid duplication).
export async function existingContactNames(page) {
  const section = page.locator('text=KEY CONTACTS').first();
  const container = section.locator('xpath=following-sibling::*[1]').or(section.locator('..'));
  const texts = await container.allInnerTexts().catch(() => ['']);
  const all = texts.join('\n');
  return all;
}

// Clicks the "+" button near the KEY CONTACTS header to open the add-contact form,
// fills the fields, and saves.
export async function addKeyContact(page, contact, dryRun) {
  if (dryRun) return;

  // Find the + button adjacent to KEY CONTACTS
  const header = page.locator('text=KEY CONTACTS');
  const addBtn = header.locator('xpath=following::button[1]')
    .or(page.locator('button:has-text("+")').first());

  await addBtn.click();
  await page.waitForTimeout(400);

  // Fill contact fields (field order: name, role/title, phone, email)
  const inputs = page.locator('input[type="text"], input:not([type])');
  const fields = await inputs.all();

  const fieldMap = {
    name: contact.name || '',
    role: contact.role || '',
    phone: contact.phone || '',
    email: contact.email || '',
  };

  // Try labelled inputs first
  for (const [label, value] of Object.entries(fieldMap)) {
    const labeled = page.locator(`input[placeholder*="${label}" i], label:has-text("${label}") + input`).first();
    const exists = await labeled.count();
    if (exists && value) await labeled.fill(value);
  }

  // Save (look for Save / Done / Add / OK button in the dialog)
  const saveBtn = page.locator('button:has-text("Save"), button:has-text("Done"), button:has-text("Add"), button:has-text("OK")').first();
  if (await saveBtn.count()) await saveBtn.click();
  await page.waitForTimeout(400);
}
