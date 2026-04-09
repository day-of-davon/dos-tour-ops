{\rtf1\ansi\ansicpg1252\cocoartf2868
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fnil\fcharset0 Menlo-Regular;\f1\froman\fcharset0 Times-Roman;}
{\colortbl;\red255\green255\blue255;\red0\green0\blue0;\red0\green0\blue0;}
{\*\expandedcolortbl;;\csgray\c0;\cssrgb\c0\c0\c0;}
\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx560\tx1120\tx1680\tx2240\tx2800\tx3360\tx3920\tx4480\tx5040\tx5600\tx6160\tx6720\pardirnatural\partightenfactor0

\f0\fs22 \cf2 \CocoaLigature0 // api/intel.js \'97 Vercel serverless function\
// Holds the Anthropic API key server-side. Never exposed to the browser.\
// Flow: verify Supabase JWT \uc0\u8594  search Gmail with user's Google token \u8594  classify with Anthropic \u8594  return JSON\
\
const \{ createClient \} = require("@supabase/supabase-js");\
\
// \uc0\u9472 \u9472  Gmail helpers \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
async function gmailSearch(googleToken, query, maxResults = 20) \{\
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/threads");\
  url.searchParams.set("q", query);\
  url.searchParams.set("maxResults", maxResults);\
  const r = await fetch(url, \{\
    headers: \{ Authorization: `Bearer $\{googleToken\}` \},\
  \});\
  if (!r.ok) \{\
    const err = await r.text();\
    throw new Error(`Gmail search failed ($\{r.status\}): $\{err\}`);\
  \}\
  const data = await r.json();\
  return (data.threads || []).map((t) => t.id);\
\}\
\
async function gmailGetThread(googleToken, threadId) \{\
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/$\{threadId\}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;\
  const r = await fetch(url, \{\
    headers: \{ Authorization: `Bearer $\{googleToken\}` \},\
  \});\
  if (!r.ok) return null;\
  return r.json();\
\}\
\
function extractHeaders(thread) \{\
  const lastMsg = thread.messages?.[thread.messages.length - 1];\
  const headers = lastMsg?.payload?.headers || [];\
  const get = (name) =>\
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";\
  return \{\
    id:           thread.id,\
    subject:      get("Subject"),\
    from:         get("From").replace(/<.*?>/, "").trim(),\
    date:         get("Date"),\
    messageCount: thread.messages?.length || 1,\
  \};\
\}\
\
// \uc0\u9472 \u9472  Main handler \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
module.exports = async function handler(req, res) \{\
  // CORS for local dev\
  res.setHeader("Access-Control-Allow-Origin", "*");\
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");\
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");\
  if (req.method === "OPTIONS") return res.status(200).end();\
  if (req.method !== "POST") return res.status(405).json(\{ error: "Method not allowed" \});\
\
  // \uc0\u9472 \u9472  1. Verify Supabase JWT \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
  const token = req.headers.authorization?.replace("Bearer ", "");\
  if (!token) return res.status(401).json(\{ error: "Missing auth token" \});\
\
  const supabase = createClient(\
    process.env.VITE_SUPABASE_URL,\
    process.env.SUPABASE_SERVICE_KEY\
  );\
  const \{ data: \{ user \}, error: authError \} = await supabase.auth.getUser(token);\
  if (authError || !user) return res.status(401).json(\{ error: "Invalid token" \});\
\
  // \uc0\u9472 \u9472  2. Parse request \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
  const \{ show, googleToken \} = req.body || \{\};\
  if (!show || !googleToken) \{\
    return res.status(400).json(\{ error: "Missing show or googleToken" \});\
  \}\
\
  // \uc0\u9472 \u9472  3. Search Gmail \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
  const queries = [\
    `"$\{show.venue\}" newer_than:90d`,\
    `"bbno$" "$\{show.city\}" newer_than:90d`,\
    `"bbno$" "$\{show.venue\}" newer_than:90d`,\
  ];\
\
  const seenIds = new Set();\
  for (const q of queries) \{\
    try \{\
      const ids = await gmailSearch(googleToken, q, 15);\
      ids.forEach((id) => seenIds.add(id));\
    \} catch (e) \{\
      console.error("Gmail search error:", e.message);\
      // Return auth error so client can re-prompt\
      if (e.message.includes("401")) \{\
        return res.status(402).json(\{ error: "gmail_token_expired" \});\
      \}\
    \}\
  \}\
\
  // \uc0\u9472 \u9472  4. Fetch thread details (parallel, cap at 20) \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
  const ids = [...seenIds].slice(0, 20);\
  const threads = (\
    await Promise.all(ids.map((id) => gmailGetThread(googleToken, id)))\
  )\
    .filter(Boolean)\
    .map(extractHeaders);\
\
  // \uc0\u9472 \u9472  5. Classify with Anthropic \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
  const sysPrompt = `You are an email intelligence parser for concert touring operations. You work for Davon Johnson, Tour Manager at Day of Show, LLC.\
\
IMPORTANT: Return ONLY a single valid JSON object. No markdown, no backticks, no preamble.\
\
Intent categories: ADVANCE, PRODUCTION, SETTLEMENT, LOGISTICS, LEGAL, FINANCE, MERCH, MEDIA, GUEST_LIST, ADMIN, CATERING\
Owner codes: DAVON, SHECK, DAN, MANAGEMENT, VENDOR, CREW, ACCOUNTANT\
Priority: CRITICAL (show <10d), HIGH (<48h), MEDIUM, LOW\
Status phrases: AWAITING RESPONSE, DRAFT READY, CONFIRMED, NEEDS DECISION, PENDING VENDOR, SENT, OVERDUE, RESOLVED`;\
\
  const userPrompt = `Here are Gmail threads for show: $\{show.venue\} in $\{show.city\} on $\{show.date\} (artist: $\{show.artist\}).\
\
Thread data:\
$\{JSON.stringify(threads, null, 2)\}\
\
For each thread, classify intent, current status, and sender name.\
Generate follow-up action items with owner, priority, and deadline.\
Extract key contacts (name, role, email).\
Suggest day-of-show schedule items if any timing info found.\
\
Return this exact JSON:\
\{\
  "threads": [\{"id":"t1","tid":"<thread_id>","subject":"<subject>","from":"<sender_name>","intent":"<INTENT>","status":"<STATUS>","date":"<Mon DD>"\}],\
  "followUps": [\{"action":"<action>","owner":"<OWNER>","priority":"<PRIORITY>","deadline":"<Mon DD>"\}],\
  "showContacts": [\{"name":"<n>","role":"<role>","email":"<email>"\}],\
  "schedule": [\{"time":"<HH:MM or TBD>","item":"<item>"\}],\
  "lastRefreshed": "$\{new Date().toISOString()\}"\
\}`;\
\
  const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", \{\
    method: "POST",\
    headers: \{\
      "Content-Type":    "application/json",\
      "x-api-key":       process.env.ANTHROPIC_API_KEY,\
      "anthropic-version": "2023-06-01",\
    \},\
    body: JSON.stringify(\{\
      model:      "
\f1\fs24 \cf0 \expnd0\expndtw0\kerning0
\CocoaLigature1 \outl0\strokewidth0 \strokec3 claude-sonnet-4-6
\f0\fs22 \cf2 \kerning1\expnd0\expndtw0 \CocoaLigature0 \outl0\strokewidth0 ",\
      max_tokens: 4000,\
      system:     sysPrompt,\
      messages:   [\{ role: "user", content: userPrompt \}],\
    \}),\
  \});\
\
  if (!anthropicResp.ok) \{\
    const err = await anthropicResp.text();\
    return res.status(502).json(\{ error: `Anthropic error: $\{anthropicResp.status\}`, detail: err \});\
  \}\
\
  const anthropicData = await anthropicResp.json();\
\
  // \uc0\u9472 \u9472  6. Parse and return \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
  // Also return raw thread count for logging\
  const textContent = (anthropicData.content || [])\
    .filter((b) => b.type === "text")\
    .map((b) => b.text)\
    .join("\\n");\
\
  let intel = null;\
  try \{\
    intel = JSON.parse(textContent.replace(/```json\\s*/g, "").replace(/```\\s*/g, "").trim());\
  \} catch \{\
    const m = textContent.match(/\\\{[\\s\\S]*"threads"[\\s\\S]*\\\}/);\
    if (m) \{ try \{ intel = JSON.parse(m[0]); \} catch \{\} \}\
  \}\
\
  return res.json(\{\
    intel,\
    gmailThreadsFound: threads.length,\
    raw: anthropicData, // included for the output log panel\
  \});\
\};\
}