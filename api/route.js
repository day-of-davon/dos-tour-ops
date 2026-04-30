// api/route.js — Address-to-address driving route calculator.
// Tries OpenRouteService (driving-hgv, free tier) when ORS_API_KEY is set,
// falls back to Google Maps Directions API when GOOGLE_MAPS_API_KEY is set,
// otherwise returns a haversine-based estimate. All providers return the
// same shape: { distance_km, duration_min, eta, summary, provider, geocoded }.

const { withTimeout } = require("./lib/utils");

const HAVERSINE = (a, b) => {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
};

const fmtHHMM = (totalMin) => {
  const t = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const m = Math.round(t % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const parseHHMM = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
};

const fmtDriveDuration = (mins) => {
  if (mins < 60) return `${mins}min`;
  const h = mins / 60;
  // Round to 0.5h precision when over an hour.
  const rounded = Math.round(h * 2) / 2;
  return rounded % 1 === 0 ? `${rounded}h` : `${rounded}h`;
};

// ── Provider: OpenRouteService ────────────────────────────────────────
// Free tier: 2000 directions/day, 1000 geocodes/day.
const orsGeocode = async (text) => {
  const url = `https://api.openrouteservice.org/geocode/search?text=${encodeURIComponent(text)}&size=1&boundary.country=GB,IE,FR,BE,NL,DE,CH,IT,CZ,PL,SK,AT,ES,PT,DK,SE,NO,FI,US,CA`;
  const r = await withTimeout(fetch(url, { headers: { Authorization: process.env.ORS_API_KEY } }), 8000);
  if (!r.ok) throw new Error(`ors_geocode_${r.status}`);
  const j = await r.json();
  const f = j.features && j.features[0];
  if (!f) throw new Error(`ors_geocode_no_match: ${text}`);
  return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: f.properties.label || text };
};
const orsRoute = async (a, b) => {
  const url = `https://api.openrouteservice.org/v2/directions/driving-hgv`;
  const r = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: { Authorization: process.env.ORS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: [[a.lng, a.lat], [b.lng, b.lat]], instructions: false }),
    }),
    15000,
  );
  if (!r.ok) throw new Error(`ors_route_${r.status}`);
  const j = await r.json();
  const route = j.routes && j.routes[0];
  if (!route) throw new Error("ors_route_no_path");
  return { distance_km: route.summary.distance / 1000, duration_min: route.summary.duration / 60 };
};

// ── Provider: Google Maps Directions API ──────────────────────────────
const googleRoute = async (originText, destText, departTimeUnix) => {
  const params = new URLSearchParams({
    origin: originText,
    destination: destText,
    mode: "driving",
    key: process.env.GOOGLE_MAPS_API_KEY,
  });
  if (departTimeUnix) params.set("departure_time", String(departTimeUnix));
  const url = `https://maps.googleapis.com/maps/api/directions/json?${params}`;
  const r = await withTimeout(fetch(url), 15000);
  if (!r.ok) throw new Error(`google_route_${r.status}`);
  const j = await r.json();
  if (j.status !== "OK") throw new Error(`google_${j.status}: ${j.error_message || ""}`);
  const route = j.routes[0];
  const leg = route.legs[0];
  return {
    distance_km: leg.distance.value / 1000,
    duration_min: (leg.duration_in_traffic?.value || leg.duration.value) / 60,
    geocoded: { origin: leg.start_address, destination: leg.end_address },
  };
};

// ── Estimate fallback (no provider configured) ────────────────────────
const estimateRoute = (origin, destination) => ({
  distance_km: null,
  duration_min: null,
  eta: null,
  summary: `${origin} → ${destination}`,
  provider: "estimate",
  geocoded: null,
  error: "no_routing_provider_configured",
});

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const { origin, destination, departureTime, departureDate } = req.body || {};
  if (!origin || !destination) {
    res.status(400).json({ error: "origin_and_destination_required" });
    return;
  }
  const provider = process.env.ORS_API_KEY ? "ors" : process.env.GOOGLE_MAPS_API_KEY ? "google" : "estimate";

  try {
    let result;
    if (provider === "ors") {
      const [a, b] = await Promise.all([orsGeocode(origin), orsGeocode(destination)]);
      const r = await orsRoute(a, b);
      result = {
        distance_km: r.distance_km,
        duration_min: r.duration_min,
        provider: "ors",
        geocoded: { origin: a.label, destination: b.label, originLatLng: [a.lat, a.lng], destinationLatLng: [b.lat, b.lng] },
        summary: `${a.label} → ${b.label}`,
      };
    } else if (provider === "google") {
      let depUnix = null;
      if (departureDate && departureTime) {
        const d = new Date(`${departureDate}T${departureTime}:00Z`);
        if (!isNaN(d)) depUnix = Math.floor(d.getTime() / 1000);
      }
      const r = await googleRoute(origin, destination, depUnix);
      result = {
        distance_km: r.distance_km,
        duration_min: r.duration_min,
        provider: "google",
        geocoded: r.geocoded,
        summary: `${r.geocoded?.origin || origin} → ${r.geocoded?.destination || destination}`,
      };
    } else {
      result = estimateRoute(origin, destination);
    }

    // ETA = departure + duration when both known
    const dep = parseHHMM(departureTime);
    if (dep != null && result.duration_min != null) {
      const arrMin = Math.round(dep + result.duration_min);
      result.eta = fmtHHMM(arrMin);
      result.eta_raw_min = arrMin;
    }
    if (result.distance_km != null) result.distance_km = Math.round(result.distance_km);
    if (result.duration_min != null) {
      result.duration_min = Math.round(result.duration_min);
      result.drive_label = fmtDriveDuration(result.duration_min);
    }

    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || "route_failed", provider });
  }
};
