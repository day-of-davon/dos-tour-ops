// Sidebar navigation and date-panel selection helpers.
// All functions no-op silently when page is null (dry-run mode).

export async function clickNavSection(page, section) {
  if (!page) return;
  await page.getByRole('button', { name: section, exact: false })
    .or(page.locator(`text="${section}"`).first())
    .click();
  await page.waitForTimeout(400);
}

// Select a show by date (YYYY-MM-DD) in the right-side date panel.
// MT displays dates like "05/04" with venue below; we match on month/day.
export async function selectDate(page, dateStr) {
  if (!page) return;
  const [, mm, dd] = dateStr.split('-');
  const label = `${mm}/${dd}`;

  // The date panel items contain the date label + venue name
  const item = page.locator(`[class*="date"], [class*="event"], [class*="item"]`)
    .filter({ hasText: label })
    .first();

  // Fallback: any element containing the date label
  const fallback = page.locator(`text=${label}`).first();

  try {
    await item.click({ timeout: 3_000 });
  } catch {
    await fallback.click({ timeout: 3_000 });
  }
  await page.waitForTimeout(500);
}

// Wait for the center panel to show content for the given venue.
export async function waitForEvent(page, venue) {
  if (!page) return;
  await page.waitForSelector(`text=${venue}`, { timeout: 5_000 }).catch(() => {});
}
