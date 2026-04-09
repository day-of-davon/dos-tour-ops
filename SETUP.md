# DOS Tour Ops — Hosted Web App Setup

Estimated time: ~90 minutes end to end.

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) account (free)
- A [Vercel](https://vercel.com) account (free)
- A [Google Cloud](https://console.cloud.google.com) project (for OAuth + Gmail API)
- An [Anthropic](https://console.anthropic.com) API key

---

## Step 1 — Google Cloud Setup

This gives you OAuth credentials and Gmail API access.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project: **DOS Tour Ops**
3. **Enable APIs:**
   - APIs & Services → Library → search "Gmail API" → Enable
4. **Configure OAuth consent screen:**
   - APIs & Services → OAuth consent screen
   - User type: **External**
   - App name: `DOS Tour Ops`
   - Add scope: `https://www.googleapis.com/auth/gmail.readonly`
   - Add your email as a test user
5. **Create OAuth credentials:**
   - APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: **Web application**
   - Name: `DOS Tour Ops`
   - Authorized redirect URIs — add these (fill in your Supabase project ref):
     ```
     https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
     ```
   - Save your **Client ID** and **Client Secret**

---

## Step 2 — Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Note your **Project URL** and **Anon Key** from Settings → API
3. Note your **Service Role Key** from Settings → API (keep this secret)
4. **Run the database schema:**
   - Go to SQL Editor → paste the contents of `supabase/schema.sql` → Run
5. **Configure Google OAuth:**
   - Authentication → Providers → Google → Enable
   - Paste your Google **Client ID** and **Client Secret**
   - Additional Scopes: `https://www.googleapis.com/auth/gmail.readonly`
   - Save

---

## Step 3 — Local Development

```bash
# Clone/copy the project
cd dos-tour-ops-web

# Install dependencies
npm install

# Copy env file and fill in your values
cp .env.example .env.local

# Edit .env.local:
# VITE_SUPABASE_URL=https://your-project-ref.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key
# SUPABASE_SERVICE_KEY=your-service-role-key
# ANTHROPIC_API_KEY=sk-ant-...
# VITE_APP_URL=http://localhost:3000

# Install Vercel CLI for local API function support
npm install -g vercel

# Run with Vercel dev (supports /api/* functions locally)
vercel dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Step 4 — Deploy to Vercel

```bash
# Login to Vercel
vercel login

# Deploy (first time — follow prompts)
vercel

# Add environment variables in Vercel dashboard:
# Project → Settings → Environment Variables → add all from .env.example
# Set VITE_APP_URL to your Vercel deployment URL

# Deploy to production
vercel --prod
```

After first deploy, go to your Vercel project URL, copy it, then:

1. Add it to Google OAuth authorized redirect URIs:
   ```
   https://your-app.vercel.app
   ```
2. Update `VITE_APP_URL` in Vercel env vars to your production URL

---

## Step 5 — Add to Home Screen (iOS / macOS)

**iOS:**
- Open your Vercel URL in Safari
- Share → Add to Home Screen
- Opens as a standalone app via universal links

**macOS:**
- Open your Vercel URL in Safari
- File → Add to Dock
- Or drag the URL to your Desktop as a `.webloc` bookmark

---

## Architecture Notes

### Storage
Data is stored in Supabase Postgres (`app_storage` table), keyed by `user_id` + `key`.
Row-level security ensures users only see their own data.

The storage adapter (`src/lib/storage.js`) is a drop-in replacement for `window.storage`
from the Claude artifact — same interface, same keys (`dos-tour-ops-v5`, `dos-tour-ops-v5-snap`).

### API Key Security
The Anthropic API key lives exclusively in Vercel environment variables.
The browser never sees it. All Anthropic calls go through `/api/intel.js`.

### Gmail Access
- Google OAuth is scoped to `gmail.readonly` — read-only, no send/delete access
- The Google access token lives in the Supabase session, never in your database
- Tokens expire in ~1 hour. If Intel refresh fails with a token error, sign out and sign back in.
- In production you'd implement server-side token refresh using `provider_refresh_token`

### Multi-user / Team
Since data is scoped by `user_id`, adding team members is automatic — each person
signs in with their own Google account and gets isolated storage. If you want shared
data, add a `team_id` column to `app_storage` and update the RLS policy.

---

## Environment Variables Reference

| Variable | Where | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Client + Server | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Client | Supabase anon/public key |
| `SUPABASE_SERVICE_KEY` | Server only | Supabase service role key (never expose) |
| `ANTHROPIC_API_KEY` | Server only | Anthropic API key (never expose) |
| `VITE_APP_URL` | Client | Your deployed app URL (for OAuth redirect) |

---

## Migrating Existing Data from the Claude Artifact

Your data is stored in Claude's `window.storage`. To migrate:

1. Open the Claude artifact
2. Settings → Copy State to Clipboard
3. Open your hosted app
4. Settings → Import → paste JSON → Import State

Done. All shows, crew, advances, budget, intel history carry over.
