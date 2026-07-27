// api/lib/auth.js — shared Supabase admin client + request auth for serverless handlers.
const { createClient } = require("@supabase/supabase-js");

function createAdminClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

// Returns { user, token, supabase } on success, { error: { status, message }, supabase } on failure.
// Caller chooses the response shape so scanner handlers can preserve their own error envelopes.
async function authenticate(req) {
  const supabase = createAdminClient();
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return { error: { status: 401, message: "Missing auth token" }, supabase };
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: { status: 401, message: "Invalid token" }, supabase };
  return { user, token, supabase };
}

module.exports = { createAdminClient, authenticate };
