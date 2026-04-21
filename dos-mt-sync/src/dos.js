import 'dotenv/config';

const DOS_TEAM_ID = process.env.DOS_TEAM_ID ?? 'dos-bbno-eu-2026';

async function fetchKey(key, teamId = DOS_TEAM_ID) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  }
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
  const params = new URLSearchParams({
    key: `eq.${key}`,
    team_id: `eq.${teamId}`,
    select: 'value',
    limit: '1',
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_storage?${params}`, { headers });
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  if (!rows.length) return null;
  try { return JSON.parse(rows[0].value); } catch { return rows[0].value; }
}

// Shows keyed by date string YYYY-MM-DD, each with city, venue, country, promoter, advance[]
export async function getShows() {
  const data = await fetchKey('dos-v7-shows');
  if (!data) return {};
  // value may be the object directly or a JSON string nested one more level
  return typeof data === 'string' ? JSON.parse(data) : data;
}

// Flights keyed by id, each with type, flightNo, carrier, from, to, fromCity, toCity,
// dep, arr, depDate, arrDate, pax[], confirmNo, bookingRef
export async function getFlights() {
  const data = await fetchKey('dos-v7-flights');
  if (!data) return {};
  return typeof data === 'string' ? JSON.parse(data) : data;
}
