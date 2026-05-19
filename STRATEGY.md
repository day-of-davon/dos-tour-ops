# STRATEGY — Decision Frameworks

**Rule:** this file holds frameworks, not answers. Questions with decision trees. Used when a decision lands in your lap.

---

## Pricing model (source of truth)

### Touring (per month)

| Tier | Price | Modules |
|---|---|---|
| Starter (Free) | $0 | ROS, Calendar, 3 shows |
| Pro | $99/mo | All ops + DOS Advance |
| Pro + Benchmark | $199/mo | Pro + DOS Benchmark |
| Market | $499/mo | All + Global + Market Intel |
| Enterprise | Negotiated | All + API + white-label |

### Tour Inbox (standalone wedge)

$49/mo. Gmail intel + comms drafts + crew flight dedup. No ops.

### Festivals (per event)

| Scale | Drivers | Artists | Price |
|---|---|---|---|
| Boutique | 1–3 | 1–15 | $1,000 |
| Regional | 4–8 | 15–40 | $2,500 |
| Mid-Major | 9–15 | 40–80 | $5,000 |
| Major | 15–25 | 80–150 | $10,000 |
| Enterprise | 25+ | 150+ | $15,000+ |

---

## Decision frameworks

### "Should I take this festival gig?"

```
Is it Aug 2026? → Elements only. All others: pass.
Is revenue ≥ $5K? 
  Yes → proceed to scope check.
  No  → pass unless strategic (named account logo for GTM).
Does it require a feature not built? 
  Delivery < 4 weeks → build if it fits roadmap.
  Delivery > 4 weeks → pass or charge consulting-fee premium (2x).
Fit pricing tier?
  Yes → price at tier. No custom discounts.
  No  → re-tier or walk.
Before Platform GA?
  Must be deliverable on v7 + manual ops. Log as v7 scope debt in ROADMAP.md.
```

### "Should I kill this feature?"

```
Is it a hypothesis in HYPOTHESES.md?
  Yes → check kill date. If past, kill or pivot.
Has leading indicator been missed 2 weeks running?
  Yes → kill or pivot.
Is a paying customer using it?
  Yes → keep until migration path exists.
Does it block a roadmap phase?
  Yes → rescope. No → kill.
```

### "Should I raise money?"

```
Tour Inbox > 50 paying subs?
  No  → bootstrap. Do not raise.
  Yes → proceed.
Platform GA within 90 days?
  Yes → consider bridge raise ($250K–500K).
  No  → defer raise.
Named acquirer signal?
  Yes → strategic conversation, not seed.
```

### "Should I pivot off v7?"

```
Is any tab < 5% weekly usage (me + Olivia)?
  Yes → freeze tab. Do not extend.
Platform parity > 70%?
  Yes → migrate power users. Freeze v7 new features.
Customer asking for v7 access?
  Never. Platform only.
```

### "Should I accept a pro-bono / equity-only gig?"

```
Is it a named tour (headliner > 10K cap)?
  Yes → case study candidate. Accept if logo-usable.
  No  → pass.
Time cost > 20 hrs/mo?
  Yes → pass unless strategic partner.
```

### "Build vs buy?"

```
Is it touring-domain specific?
  Yes → build.
  No  → buy (Supabase, Vercel, Claude, Stripe, Maps).
Does a mature OSS option exist?
  Yes → use it (VROOM, postgrest).
  No  → build minimum viable.
```

---

## GTM — Tour Inbox wedge plan

**Thesis:** Gmail intel + comms is the only product with no direct competitor. Lead with it.

**Target:** 35 paid subs ($49/mo) by end of Q3 2026.

**Channels (ranked):**
1. Warm TM network — Sam Alavi, Mike Sheck, Dan Nudelman, Matt Adler. Ask for 3 intros each.
2. Demo video: "30 emails → 5 drafts in 90 seconds." Private Loom first, public after 10 subs.
3. Touring ops forums (Production Futures, AMP community, TPi mag, Pollstar panels).
4. Paid = off for now. Organic until cost/CAC signal.

**What NOT to do:**
- Do not sell the full Platform before it's GA.
- Do not take custom-feature deals at wedge price.
- Do not discount below $49.

---

## Competitive windows

| Window | Closes | What to ship before |
|---|---|---|
| AI-first touring ops | ~18 months before Master Tour copies | Tour Inbox GA + 50 subs |
| Offline mode required | Every international tour | IndexedDB read-mirror before May 4 |
| Festival vertical open | Elements → Q3 2027 | 3 festival wins to prove VRP dispatch |

---

## Anti-patterns (from CLAUDE.md §13, retained)

- Don't explain basics (SaaS, RLS, tRPC, VRP, festival workflows).
- Don't interrupt build mode with strategy, or vice versa.
- Don't build platform features before Josh's schema audit.
- Don't suggest infrastructure beyond current Revenue Gate.
- Don't pad. End on substance.
- Don't use em dashes.
