import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from "react";
import { supabase } from "./lib/supabase";
import { save, load, loadSnap, saveSnap } from "./lib/storage";
import Login from "./components/Login";

// ─── Mobile hook ──────────────────────────────────────────────────────────────
const useMobile = (bp = 640) => {
  const [mob, setMob] = useState(() => typeof window !== "undefined" ? window.innerWidth < bp : false);
  useEffect(() => {
    const h = () => setMob(window.innerWidth < bp);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [bp]);
  return mob;
};

// ─── Snapshot helpers ────────────────────────────────────────────────────────
const buildSnap = (st) => ({
  ts:       new Date().toISOString(),
  shows:    (st.shows || []).map(s => ({ id: s.id, date: s.date, venue: s.venue, city: s.city })),
  advances: Object.fromEntries(Object.entries(st.advances || {}).map(([sid, adv]) => [sid, Object.values(adv).filter(Boolean).length])),
  showCrew: Object.fromEntries(Object.entries(st.showCrew || {}).map(([sid, c])   => [sid, Object.values(c).filter(x => x.attending).length])),
  budgets:  Object.fromEntries(Object.entries(st.budgets  || {}).map(([sid, b])   => [sid, { itemCount: (b.items || []).length, settlement: b.settlement || 0 }])),
  mc:       Object.fromEntries(Object.entries(st.missionControl || {}).map(([sid, mc]) => [sid, { threadCount: (mc.threads || []).length, followUpCount: (mc.followUps || []).length, lastRefreshed: mc.lastRefreshed || null }])),
});

const diffSnap = (snap, st) => {
  const items = [];
  const showMap = Object.fromEntries((st.shows || []).map(s => [s.id, s.venue]));
  const snapShowIds = new Set((snap.shows || []).map(s => s.id));

  (st.shows || []).forEach(s => {
    if (!snapShowIds.has(s.id))
      items.push({ type: "show_added", label: s.venue, detail: s.city + " · " + new Date(s.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) });
  });
  Object.entries(st.advances || {}).forEach(([sid, adv]) => {
    const delta = Object.values(adv).filter(Boolean).length - (snap.advances?.[sid] ?? 0);
    if (delta > 0) items.push({ type: "advance_completed", label: showMap[sid] || sid, detail: `+${delta} item${delta > 1 ? "s" : ""}` });
  });
  Object.entries(st.showCrew || {}).forEach(([sid, crew]) => {
    const now = Object.values(crew).filter(c => c.attending).length, was = snap.showCrew?.[sid] ?? 0;
    if (now !== was) items.push({ type: "crew_changed", label: showMap[sid] || sid, detail: `${was} → ${now} attending` });
  });
  Object.entries(st.budgets || {}).forEach(([sid, b]) => {
    const nowCount = (b.items || []).length, wasCount = snap.budgets?.[sid]?.itemCount ?? 0;
    if (nowCount > wasCount) items.push({ type: "budget_added", label: showMap[sid] || sid, detail: `+${nowCount - wasCount} expense${nowCount - wasCount > 1 ? "s" : ""}` });
    const nowSett = b.settlement || 0, wasSett = snap.budgets?.[sid]?.settlement ?? 0;
    if (nowSett !== wasSett && nowSett > 0) items.push({ type: "settlement_updated", label: showMap[sid] || sid, detail: `$${wasSett.toLocaleString()} → $${nowSett.toLocaleString()}` });
  });
  Object.entries(st.missionControl || {}).forEach(([sid, mc]) => {
    const wasRef = snap.mc?.[sid]?.lastRefreshed, nowRef = mc.lastRefreshed;
    if (nowRef && nowRef !== wasRef) {
      const td = (mc.threads || []).length - (snap.mc?.[sid]?.threadCount ?? 0);
      const fd = (mc.followUps || []).length - (snap.mc?.[sid]?.followUpCount ?? 0);
      items.push({ type: "intel_refreshed", label: showMap[sid] || sid, detail: [td > 0 && `+${td} thread${td > 1 ? "s" : ""}`, fd > 0 && `+${fd} follow-up${fd > 1 ? "s" : ""}`].filter(Boolean).join(", ") || "refreshed" });
    }
  });

  const tc = {};
  items.forEach(d => { tc[d.type] = (tc[d.type] || 0) + 1; });
  const parts = [
    tc.show_added         && `${tc.show_added} show${tc.show_added > 1 ? "s" : ""} added`,
    tc.advance_completed  && `advance updated on ${tc.advance_completed} show${tc.advance_completed > 1 ? "s" : ""}`,
    tc.crew_changed       && `crew changed on ${tc.crew_changed} show${tc.crew_changed > 1 ? "s" : ""}`,
    tc.budget_added       && `budget updated on ${tc.budget_added} show${tc.budget_added > 1 ? "s" : ""}`,
    tc.settlement_updated && `${tc.settlement_updated} settlement${tc.settlement_updated > 1 ? "s" : ""} updated`,
    tc.intel_refreshed    && `intel refreshed on ${tc.intel_refreshed} show${tc.intel_refreshed > 1 ? "s" : ""}`,
  ].filter(Boolean);

  return { ts: new Date().toISOString(), snapTs: snap.ts || null, summary: parts.length ? parts.join(", ") : "No changes since last session", changed: parts.length > 0, items };
};

// ─── Seed data ───────────────────────────────────────────────────────────────
const DEFAULT_SHOWS = [
  { id: "rr-0416",  date: "2026-04-16", venue: "Red Rocks",              city: "Morrison, CO",      artist: "bbno$", status: "ADVANCING" },
  { id: "wpi-0501", date: "2026-05-01", venue: "WPI",                    city: "Worcester, MA",     artist: "bbno$", status: "ADVANCING" },
  { id: "eu-0504",  date: "2026-05-04", venue: "National Stadium",        city: "Dublin, IE",        artist: "bbno$", status: "EU" },
  { id: "eu-0505",  date: "2026-05-05", venue: "National Stadium",        city: "Dublin, IE",        artist: "bbno$", status: "EU" },
  { id: "eu-0507",  date: "2026-05-07", venue: "O2 Victoria Warehouse",  city: "Manchester, UK",    artist: "bbno$", status: "EU" },
  { id: "eu-0508",  date: "2026-05-08", venue: "O2 Victoria Warehouse",  city: "Manchester, UK",    artist: "bbno$", status: "EU" },
  { id: "eu-0510",  date: "2026-05-10", venue: "O2 Academy Glasgow",     city: "Glasgow, UK",       artist: "bbno$", status: "EU" },
  { id: "eu-0511",  date: "2026-05-11", venue: "O2 Academy Glasgow",     city: "Glasgow, UK",       artist: "bbno$", status: "EU" },
  { id: "eu-0513",  date: "2026-05-13", venue: "O2 Academy Brixton",     city: "London, UK",        artist: "bbno$", status: "EU" },
  { id: "eu-0515",  date: "2026-05-15", venue: "Halle 622",              city: "Zurich, CH",        artist: "bbno$", status: "EU" },
  { id: "eu-0516",  date: "2026-05-16", venue: "E-Werk",                 city: "Cologne, DE",       artist: "bbno$", status: "EU" },
  { id: "eu-0517",  date: "2026-05-17", venue: "Palladium",              city: "Cologne, DE",       artist: "bbno$", status: "EU" },
  { id: "eu-0519",  date: "2026-05-19", venue: "AFAS Live",              city: "Amsterdam, NL",     artist: "bbno$", status: "EU" },
  { id: "bat-0520", date: "2026-05-20", venue: "Le Bataclan",            city: "Paris, FR",         artist: "bbno$", status: "EU-IMMIGRATION" },
  { id: "eu-0522",  date: "2026-05-22", venue: "Fabrique",               city: "Milan, IT",         artist: "bbno$", status: "EU" },
  { id: "eu-0524",  date: "2026-05-24", venue: "SaSaZu",                 city: "Prague, CZ",        artist: "bbno$", status: "EU" },
  { id: "eu-0526",  date: "2026-05-26", venue: "Columbiahalle",          city: "Berlin, DE",        artist: "bbno$", status: "EU" },
  { id: "eu-0528",  date: "2026-05-28", venue: "Majestic Music Club",    city: "Bratislava, SK",    artist: "bbno$", status: "EU" },
  { id: "eu-0530",  date: "2026-05-30", venue: "Orange Warsaw Festival", city: "Warsaw, PL",        artist: "bbno$", status: "EU" },
  { id: "chm-0626", date: "2026-06-26", venue: "Chambord Live",          city: "Chambord, FR",      artist: "bbno$", status: "EU-IMMIGRATION" },
  { id: "trn-0628", date: "2026-06-28", venue: "Le Transbordeur",        city: "Villeurbanne, FR",  artist: "bbno$", status: "EU-IMMIGRATION" },
  { id: "cel-0701", date: "2026-07-01", venue: "Celebration Square",     city: "Mississauga, ON",   artist: "bbno$", status: "CONFIRMED" },
  { id: "moh-0711", date: "2026-07-11", venue: "Mohegan Sun Arena",      city: "Uncasville, CT",    artist: "bbno$", status: "CONFIRMED" },
  { id: "ott-0712", date: "2026-07-12", venue: "Ottawa Bluesfest",       city: "Ottawa, ON",        artist: "bbno$", status: "LEGAL" },
];

const DEFAULT_CREW = [
  { id: "ag",  name: "Alex Gumuchian",       role: "Headliner (bbno$)",         email: "alexgumuchian@gmail.com" },
  { id: "jb",  name: "Julien Bruce",          role: "Support (Jungle Bobby)",    email: "" },
  { id: "mse", name: "Mat Senechal",          role: "Bassist/Keys",              email: "" },
  { id: "tip", name: "Taylor Madrigal (Tip)", role: "DJ",                        email: "" },
  { id: "ac",  name: "Andrew Campbell",       role: "DJ (Bishu)",                email: "" },
  { id: "dj",  name: "Davon Johnson",         role: "TM/TD",                     email: "d.johnson@dayofshow.net" },
  { id: "ms",  name: "Mike Sheck",            role: "PM (Advance)",              email: "mikesheck@l7touring.com" },
  { id: "dn",  name: "Dan Nudelman",          role: "PM (On-site)",              email: "dan@noodle.management" },
  { id: "tc",  name: "TBD",                   role: "Tour Coordinator",          email: "" },
  { id: "rm",  name: "Ruairi Matthews",       role: "FOH Audio",                 email: "ruairim@magentasound.ca" },
  { id: "nf",  name: "Nick Foerster",         role: "Monitor Engineer",          email: "" },
  { id: "sa",  name: "Saad A.",               role: "Audio/BNE",                 email: "" },
  { id: "gg",  name: "Gabe Greenwood",        role: "LD",                        email: "" },
  { id: "lt1", name: "TBD",                   role: "LED Tech 1",                email: "" },
  { id: "lt2", name: "TBD",                   role: "LED Tech 2",                email: "" },
  { id: "cl",  name: "Cody Leggett",          role: "Lasers/LSO",                email: "cody@photon7.com" },
  { id: "mh",  name: "Michael Heid",          role: "Visual/Set Design (Sigma-1)",email: "bbno-visual@sigma-1.com" },
  { id: "go",  name: "Grace Offerdahl",       role: "Merch (Tour Seller)",       email: "graceofferdahl@gmail.com" },
  { id: "nm",  name: "Nathan McCoy",          role: "Merch Dir (A3)",            email: "nathan@a3merch.com" },
  { id: "mp",  name: "Megan Putnam",          role: "Hospo/GL",                  email: "mputnam5@yahoo.com" },
  { id: "od",  name: "O'Len Davis",           role: "Content & Media",           email: "" },
  { id: "gb",  name: "Guillaume Bessette",    role: "Bus Driver (Prod.G)",       email: "" },
  { id: "td",  name: "TBD",                   role: "Truck Driver",              email: "" },
];

const ADVANCE_ITEMS = [
  "Venue contact confirmed","Tech advance sent","Tech advance returned","Production advance complete",
  "Catering/rider sent","Catering confirmed","Hospitality advance","Guest list open",
  "Merch advance sent","Merch load-in confirmed","Settlement info sent","W9/tax forms received",
  "Wire info confirmed","Run of show drafted","Run of show approved","Meet & greet confirmed",
  "Security advance","Parking/load-in confirmed","Hotel confirmed","Ground transport confirmed",
];

const mkState = () => ({
  shows: DEFAULT_SHOWS, crew: DEFAULT_CREW,
  showCrew: {}, advances: {}, notes: {}, contacts: {}, budgets: {},
  missionControl: {}, sessionHistory: [], lastSaved: null,
});

const MC_SEED = {
  "rr-0416": {
    threads: [
      { id:"t1", tid:"19d1bb83f39923b9", subject:"Advance Thread || bbno$ w/ Oliver Tree || Red Rocks 4.16.26", from:"Sasha Minkov",          intent:"ADVANCE",    status:"DRAFT READY",       date:"Apr 8" },
      { id:"t2", tid:"19d63c871cbd6953", subject:"Catering Advance || bbno$ || 4.16.26 Red Rocks",              from:"Blue Note Catering",     intent:"ADVANCE",    status:"DRAFT READY",       date:"Apr 8" },
      { id:"t3", tid:"19d56363682f0fea", subject:"BNP Audio/Video/Lighting",                                     from:"Dan Nudelman > Ryan Knutson", intent:"PRODUCTION",status:"AUDIO SPECS SENT",date:"Apr 8" },
      { id:"t4", tid:"19d4991d532e4c6c", subject:"GTE = PK Sound at RR (A&H S5000)",                            from:"Alex Zentz",             intent:"PRODUCTION", status:"AWAITING DECISION", date:"Apr 7" },
      { id:"t5", tid:"19d3b96b8316ac91", subject:"Advance @ Red Rocks | Labor Call + Estimate",                  from:"Sasha Minkov",          intent:"ADVANCE",    status:"LABOR RECEIVED",    date:"Apr 7" },
      { id:"t6", tid:"19d30b2add48abdf", subject:"BNP Internal Drawing // RRX April 16",                         from:"James Watt",            intent:"PRODUCTION", status:"DRAWING SENT",      date:"Apr 7" },
      { id:"t7", tid:"19d4b1cca0e9b707", subject:"Advancing for Denver (Oliver Tree / YNG)",                     from:"Harry Young",           intent:"ADVANCE",    status:"VIDEO SPECS PENDING",date:"Apr 8"},
      { id:"t8", tid:"19ce8a7e57df012f", subject:"Kaarija Red Rocks Advancement",                                from:"Santeri Koppelo",       intent:"ADVANCE",    status:"LOOPED IN SASHA",   date:"Apr 4" },
    ],
    flights: [], schedule: [
      { time:"TBD", item:"Bus arrives Morrison, CO" }, { time:"TBD", item:"Previz at BNP (Apr 14-15)" },
      { time:"TBD", item:"Load-in" }, { time:"TBD", item:"Soundcheck" }, { time:"TBD", item:"Doors" },
      { time:"TBD", item:"Support: Oliver Tree / YNG" }, { time:"TBD", item:"bbno$ set" }, { time:"TBD", item:"Curfew" },
    ],
    followUps: [
      { action:"Lock audio vendor: GTE/A&H S5000 vs BNP d&b. Dan must decide.",    owner:"DAN",   priority:"CRITICAL", deadline:"Apr 9"  },
      { action:"Send catering advance to Blue Note (draft ready)",                   owner:"DAVON", priority:"HIGH",     deadline:"Apr 9"  },
      { action:"Send advance thread reply to Sasha (draft ready)",                   owner:"DAVON", priority:"HIGH",     deadline:"Apr 9"  },
      { action:"Confirm BNP internal drawing (James Watt)",                          owner:"SHECK", priority:"HIGH",     deadline:"Apr 10" },
      { action:"Confirm Oliver Tree video specs (loop vs controlled)",                owner:"SHECK", priority:"HIGH",     deadline:"Apr 10" },
      { action:"BNP previz space Apr 14-15. Confirm with Ryan.",                     owner:"SHECK", priority:"MEDIUM",   deadline:"Apr 12" },
      { action:"Kaarija advance; Santeri looped with Sasha. Monitor.",               owner:"DAVON", priority:"LOW",      deadline:"Apr 12" },
    ],
    showContacts: [
      { name:"Sasha Minkov",       role:"AEG PM",           email:"sminkov@aegpresents.com",              phone:"720-937-4485" },
      { name:"Ryan Knutson",       role:"BNP Audio/Video/LX",email:"ryan@brownnote.com" },
      { name:"James Watt",         role:"BNP Staging",       email:"james@brownnote.com" },
      { name:"Alex Zentz",         role:"GTE/PK Sound",      email:"alex@greaterthanentertainment.com" },
      { name:"Blue Note (Irene Jr.)",role:"Catering",        email:"bluenotecatering@gmail.com" },
      { name:"Harry Young",        role:"Oliver Tree Mgmt",  email:"harry@damnbestmgmt.com" },
      { name:"Santeri Koppelo",    role:"Warner FI (Kaarija)",email:"santeri.koppelo@warnermusic.com" },
    ],
  },
  "wpi-0501": {
    threads: [
      { id:"t1", tid:"19d023f35c114a18", subject:"TECH ADVANCE: bbno$ | WPI | 5.1.26",             from:"Chris Hernandez",  intent:"ADVANCE", status:"RIDER CONFIRMED", date:"Apr 8" },
      { id:"t2", tid:"19d023c14da0be20", subject:"TECH ADVANCE: bbno$ | WPI | 4.25.26 (old date)", from:"Daniel Saldarini", intent:"ADVANCE", status:"DRAFT READY",     date:"Apr 8" },
      { id:"t3", tid:"19d6f3e23cd7d08c", subject:"GENERAL/HOSPO ADVANCE: bbno$ @ WPI | 5.1.26",   from:"Tori Pacheco",     intent:"ADVANCE", status:"DRAFT READY",     date:"Apr 8" },
    ],
    flights: [], schedule: [],
    followUps: [
      { action:"Send hospo advance reply to Tori. Correct date to May 1.", owner:"DAVON", priority:"HIGH",   deadline:"Apr 10" },
      { action:"Send tech advance reply to Daniel. Loop Sheck.",            owner:"DAVON", priority:"HIGH",   deadline:"Apr 10" },
      { action:"Confirm production scope. CWA says no prod expenses.",      owner:"SHECK", priority:"MEDIUM", deadline:"Apr 14" },
    ],
    showContacts: [
      { name:"Daniel Saldarini", role:"Pretty Polly Tech",  email:"dan@prettypolly.com" },
      { name:"Tori Pacheco",     role:"Pretty Polly Hospo", email:"tori@prettypolly.com" },
      { name:"Chris Hernandez",  role:"Audio Spectrum",     email:"chris@audiospectrum.com" },
      { name:"Paul Gallegos",    role:"Pretty Polly",       email:"paul@prettypolly.com" },
    ],
  },
  "bat-0520": {
    threads: [{ id:"t1", tid:"19d6898b1a667c4f", subject:"French Immigration - BBNO$ - Paris, Chambord, Villeurbanne", from:"Tony Yacowar", intent:"LEGAL", status:"FORMS OUTSTANDING", date:"Apr 7" }],
    flights:[], schedule:[],
    followUps: [
      { action:"Complete French immigration listing + gather passport copies", owner:"DAVON", priority:"CRITICAL", deadline:"Apr 15" },
      { action:"Confirm Tony has started social security forms",               owner:"DAVON", priority:"CRITICAL", deadline:"Apr 12" },
      { action:"EU bus decision (MM Band Services / Iain). 22 days waiting.",  owner:"DAVON", priority:"HIGH",     deadline:"Apr 12" },
    ],
    showContacts: [
      { name:"Tony Yacowar",        role:"CPA/DMCL",              email:"tyacowar@dmcl.ca" },
      { name:"Damien Chamard Boudet",role:"Live Nation FR (Promoter)",email:"damien.chamardboudet@livenation.fr" },
    ],
  },
  "eu-0504": {
    threads:[], flights:[], schedule:[],
    followUps: [
      { action:"Book crew flights to Dublin. 24 days out, 9 of 12 unbooked.", owner:"DAVON", priority:"CRITICAL", deadline:"Apr 15" },
      { action:"Confirm Neg Earth prep days at LH3 before Dublin opener",      owner:"SHECK", priority:"HIGH",     deadline:"Apr 18" },
      { action:"Confirm EU insurance. $0 budgeted, $0 quoted.",                owner:"DAVON", priority:"CRITICAL", deadline:"Apr 12" },
    ],
    showContacts: [{ name:"Zach Desmond", role:"MCD Productions (Promoter)", email:"zach.desmond@mcd.ie" }],
  },
  "eu-0507": { threads:[], flights:[], schedule:[], followUps:[], showContacts:[{ name:"Kiarn Eslami", role:"Live Nation UK (Promoter)", email:"kiarn.eslami@livenation.co.uk" }] },
  "eu-0510": { threads:[], flights:[], schedule:[], followUps:[], showContacts:[{ name:"Craig Johnston", role:"DF Concerts (Promoter)", email:"craig.johnston@dfconcerts.co.uk" }, { name:"Charmaine Hardman", role:"DF Concerts (Prod)", email:"charmaine.hardman@dfconcerts.co.uk" }] },
  "eu-0513": {
    threads: [{ id:"t1", tid:"19abdde80028d6d8", subject:"Welcome our new TM Davon Johnson / bbno$", from:"Freya Whitfield", intent:"ADMIN", status:"FORM OUTSTANDING", date:"Apr 7" }],
    flights:[], schedule:[],
    followUps: [{ action:"Complete + return Freya Whitfield UK form", owner:"DAVON", priority:"HIGH", deadline:"Apr 12" }],
    showContacts: [{ name:"Kiarn Eslami", role:"Live Nation UK (Promoter)", email:"kiarn.eslami@livenation.co.uk" }, { name:"Freya Whitfield", role:"Wasserman UK", email:"freya.whitfield@teamwass.com" }, { name:"Mike Malak", role:"Wasserman UK Agent", email:"mike.malak@teamwass.com" }],
  },
  "eu-0515": { threads:[], flights:[], schedule:[], followUps:[], showContacts:[{ name:"Stefan Wyss", role:"Gadget (Promoter)", email:"stefan.wyss@gadget.ch" }, { name:"Roger Fisch", role:"Maag Moments (Prod)", email:"roger.fisch@maag-moments.ch" }] },
  "eu-0516": { threads:[], flights:[], schedule:[], followUps:[], showContacts:[{ name:"Julian Gupta", role:"Live Nation DE (Promoter)", email:"julian.gupta@livenation.de" }, { name:"Oliver Zimmermann", role:"LN DE (Prod)", email:"oliver.zimmermann@livenation-production.de" }] },
  "eu-0519": { threads:[], flights:[], schedule:[], followUps:[], showContacts:[{ name:"Maarten van Vugt", role:"MOJO (Promoter)", email:"m.van.vugt@mojo.nl" }, { name:"J. Cameron", role:"MOJO (Prod)", email:"j.cameron@mojo.nl" }] },
  "eu-0522": { threads:[], flights:[], schedule:[], followUps:[], showContacts:[{ name:"Aldo Bassi", role:"Live Nation IT (Promoter)", email:"aldo.bassi@livenation.it" }, { name:"Andrea Aurigo", role:"LN IT (Prod)", email:"andrea.aurigo@livenation.it" }] },
  "eu-0524": { threads:[], flights:[], schedule:[], followUps:[], showContacts:[{ name:"Anthony Jouet", role:"Fource (Promoter)", email:"anthony@fource.com" }, { name:"Bara", role:"Fource (Prod)", email:"bara@fource.com" }] },
  "eu-0526": { threads:[], flights:[], schedule:[], followUps:[], showContacts:[{ name:"Julian Gupta", role:"Live Nation DE (Promoter)", email:"julian.gupta@livenation.de" }] },
  "eu-0528": { threads:[], flights:[], schedule:[], followUps:[], showContacts:[{ name:"Laszlo Borsos", role:"Live Nation HU", email:"mate.horvath@livenation.hu" }, { name:"Peter Lipovsky", role:"Local Prod", email:"peter.lipovsky@gmail.com" }] },
  "eu-0530": { threads:[], flights:[], schedule:[], followUps:[], showContacts:[{ name:"Mikolaj Ziolkowski", role:"AlterArt (Promoter)", email:"mikolaj.ziolkowski@alterart.pl" }] },
  "cel-0701": {
    threads: [{ id:"t1", tid:"19d6861c2e9de244", subject:"Quick Question - bbno$ - Mississauga Celebration Square", from:"Joseph Mooney", intent:"PRODUCTION", status:"RIDER QUESTION", date:"Apr 7" }],
    flights:[], schedule:[],
    followUps: [{ action:"Clarify which rider is current (festival spec vs full). Sam flagged.", owner:"DAVON", priority:"MEDIUM", deadline:"Apr 14" }],
    showContacts: [{ name:"Joseph Mooney", role:"Wasserman/The Team", email:"joseph.mooney@the.team" }, { name:"Maya Partha", role:"Booking", email:"maya.partha@the.team" }],
  },
};

// ─── Utilities ───────────────────────────────────────────────────────────────
const daysUntil = (d) => Math.ceil((new Date(d + "T00:00:00") - new Date()) / 86400000);
const fmt       = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const uid       = ()  => Math.random().toString(36).slice(2, 8);
const urgColor  = (days) => days <= 7 ? "#f87171" : days <= 21 ? "#fbbf24" : days <= 42 ? "#fb923c" : "#4ade80";
const gmailUrl  = (tid) => `https://mail.google.com/mail/u/0/#all/${tid}`;

// ─── Shared constants ────────────────────────────────────────────────────────
const C = {
  bg: "#0a0a0f", card: "#12121a", cardHover: "#1a1a25", border: "#1e1e2e",
  accent: "#c9f", accentGlow: "rgba(204,153,255,0.08)",
  green: "#4ade80", yellow: "#fbbf24", red: "#f87171", orange: "#fb923c",
  text: "#e4e4ef", textDim: "#8888a0", textMuted: "#55556a",
};
const INTENT_COLORS = { ADVANCE:"#60a5fa", PRODUCTION:"#c084fc", LEGAL:"#f87171", SETTLEMENT:"#4ade80", LOGISTICS:"#fbbf24", MEDIA:"#f472b6", GUEST_LIST:"#34d399", ADMIN:"#94a3b8", CATERING:"#fb923c", FINANCE:"#4ade80" };
const PRIO_COLORS   = { CRITICAL: C.red, HIGH: C.yellow, MEDIUM: C.accent, LOW: C.textDim };
const STALE_FLAGS   = ["AWAITING","OUTSTANDING","PENDING","OVERDUE","DRAFT READY"];

// ─── Change-type config (used in multiple components) ─────────────────────────
const DIFF_CFG = {
  thread_new:         { color:"#60a5fa", icon:"+", label:"New thread" },
  thread_status:      { color:"#fbbf24", icon:"~", label:"Status changed" },
  followup_new:       { color:"#fb923c", icon:"+", label:"New follow-up" },
  followup_escalated: { color:"#f87171", icon:"!", label:"Escalated" },
  contact_new:        { color:"#4ade80", icon:"+", label:"New contact" },
  schedule_updated:   { color:"#c9f",   icon:"~", label:"Schedule" },
};
const SESS_CFG = {
  show_added:         { color:"#4ade80", icon:"+", label:"Show added" },
  advance_completed:  { color:"#60a5fa", icon:"✓", label:"Advance" },
  crew_changed:       { color:"#c9f",   icon:"~", label:"Crew" },
  budget_added:       { color:"#fb923c", icon:"+", label:"Budget" },
  settlement_updated: { color:"#4ade80", icon:"$", label:"Settlement" },
  intel_refreshed:    { color:"#c084fc", icon:"↺", label:"Intel" },
};

// ─── Styles factory ──────────────────────────────────────────────────────────
const makeStyles = (mob) => ({
  root:    { background: C.bg, color: C.text, minHeight:"100vh", fontFamily:"'Segoe UI', system-ui, sans-serif", fontSize:13, position:"relative" },
  nav:     { display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, background:C.card, position:"sticky", top:0, zIndex:100, overflowX:"auto", WebkitOverflowScrolling:"touch", alignItems:"center" },
  navBtn:  (active) => ({ padding: mob?"10px 12px":"12px 20px", cursor:"pointer", border:"none", background: active?C.bg:"transparent", color: active?C.accent:C.textDim, fontWeight: active?700:400, fontSize: mob?10:12, letterSpacing:1, textTransform:"uppercase", borderBottom: active?`2px solid ${C.accent}`:"2px solid transparent", transition:"all 0.15s", whiteSpace:"nowrap", flexShrink:0 }),
  badge:   (color) => ({ display:"inline-block", padding:"2px 8px", borderRadius:3, fontSize:10, fontWeight:700, background: color+"22", color, letterSpacing:0.5 }),
  card:    { background:C.card, border:`1px solid ${C.border}`, borderRadius:6, padding:16, marginBottom:10 },
  input:   { background:"#1a1a28", border:`1px solid ${C.border}`, color:C.text, padding:"6px 10px", borderRadius:4, fontSize:12, width:"100%", outline:"none" },
  btn:     (accent) => ({ padding:"6px 14px", border:`1px solid ${accent||C.border}`, borderRadius:4, cursor:"pointer", background: accent?accent+"18":"transparent", color: accent||C.textDim, fontSize:11, fontWeight:600 }),
  toast:   { position:"fixed", bottom:20, right:20, background:C.card, border:`1px solid ${C.accent}`, color:C.accent, padding:"10px 18px", borderRadius:6, fontSize:12, fontWeight:600, zIndex:999, boxShadow:`0 0 20px ${C.accentGlow}` },
  secHdr:  { fontSize:11, color:C.textDim, letterSpacing:1, textTransform:"uppercase", marginBottom:10, display:"flex", alignItems:"center", justifyContent:"space-between" },
});

// Stable hover handlers (module-level, not recreated per render)
const hoverOn  = (e) => { e.currentTarget.style.background = C.cardHover; };
const hoverOff = (e) => { e.currentTarget.style.background = "transparent"; };
const rowHover = { onMouseEnter: hoverOn, onMouseLeave: hoverOff };

// ─── Context ─────────────────────────────────────────────────────────────────
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// Fix #1: RefreshHistoryEntry — proper component with its own state (was useState in .map())
const RefreshHistoryEntry = ({ entry, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  const { S } = useApp();
  const ts = new Date(entry.ts);
  const tsStr = ts.toLocaleDateString("en-US", { month:"short", day:"numeric" }) + " " + ts.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" });
  return (
    <div style={{ borderBottom:`1px solid ${C.border}08`, padding:"8px 0" }}>
      <div onClick={() => setOpen(o => !o)} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", userSelect:"none" }}>
        <span style={{ fontSize:10, color:C.textMuted, fontFamily:"monospace", whiteSpace:"nowrap" }}>{tsStr}</span>
        <span style={S.badge(entry.changed ? C.green : C.textMuted)}>{entry.changed ? "CHANGES" : "NO CHANGE"}</span>
        <span style={{ fontSize:11, color: entry.changed ? C.text : C.textDim, flex:1 }}>{entry.summary}</span>
        <span style={{ fontSize:10, color:C.textMuted }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ marginTop:6, paddingLeft:8 }}>
          {entry.items?.length > 0 ? entry.items.map((item, i) => {
            const cfg = DIFF_CFG[item.type] || { color:C.textDim, icon:"·", label:item.type };
            return (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"16px 110px 1fr", gap:6, padding:"2px 0", alignItems:"start" }}>
                <span style={{ fontSize:10, color:cfg.color, fontWeight:700 }}>{cfg.icon}</span>
                <span style={{ fontSize:9, color:cfg.color, textTransform:"uppercase", letterSpacing:0.5, paddingTop:1 }}>{cfg.label}</span>
                <div>
                  <span style={{ fontSize:11, color:C.text }}>{item.label}</span>
                  {item.detail && <span style={{ fontSize:10, color:C.textDim }}> · {item.detail}</span>}
                </div>
              </div>
            );
          }) : <div style={{ fontSize:11, color:C.textMuted }}>No itemized changes recorded.</div>}
        </div>
      )}
    </div>
  );
};

// Fix #2: SessionHistoryPanel — proper component with its own state (was useState in IIFE)
const SessionHistoryPanel = () => {
  const [open, setOpen] = useState(false);
  const { state, S, mob, goToShow } = useApp();
  const sessionHistory = state.sessionHistory || [];
  if (!sessionHistory.length) return null;

  const latest = sessionHistory[0];
  const latestTs  = new Date(latest.ts);
  const latestStr = latestTs.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" }) + " " + latestTs.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" });
  const prevStr   = latest.snapTs ? new Date(latest.snapTs).toLocaleDateString("en-US", { month:"short", day:"numeric" }) + " " + new Date(latest.snapTs).toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" }) : "first session";

  const typeCounts = {};
  (latest.items || []).forEach(item => { typeCounts[item.type] = (typeCounts[item.type] || 0) + 1; });

  return (
    <div style={{ ...S.card, marginBottom:20, borderColor: latest.changed ? C.accent+"55" : C.border }}>
      <div onClick={() => setOpen(o => !o)} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", userSelect:"none" }}>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
            <span style={{ fontSize:11, color:C.textDim, letterSpacing:1, textTransform:"uppercase" }}>Session History</span>
            <span style={S.badge(latest.changed ? C.accent : C.textMuted)}>{latest.changed ? "CHANGES" : "NO CHANGE"}</span>
            <span style={{ fontSize:10, color:C.textMuted }}>{sessionHistory.length} session{sessionHistory.length > 1 ? "s" : ""} logged</span>
          </div>
          <div style={{ fontSize:12, color: latest.changed ? C.text : C.textDim }}>{latest.summary}</div>
          <div style={{ fontSize:10, color:C.textMuted, marginTop:2 }}>{latestStr} · compared to {prevStr}</div>
        </div>
        {latest.changed && latest.items?.length > 0 && (
          <div style={{ display:"flex", gap:4, flexWrap:"wrap", justifyContent:"flex-end", maxWidth:160 }}>
            {Object.entries(typeCounts).map(([type, count]) => {
              const cfg = SESS_CFG[type] || { color:C.textDim, icon:"·" };
              return <span key={type} style={{ ...S.badge(cfg.color), fontSize:9 }}>{cfg.icon}{count}</span>;
            })}
          </div>
        )}
        <span style={{ color:C.textDim, fontSize:11, flexShrink:0 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ marginTop:12, borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
          {latest.items?.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:C.textMuted, letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>This session</div>
              {latest.items.map((item, i) => {
                const cfg = SESS_CFG[item.type] || { color:C.textDim, icon:"·", label:item.type };
                return (
                  <div key={i} style={{ display:"grid", gridTemplateColumns:"16px 120px 1fr", gap:6, padding:"2px 0", alignItems:"start" }}>
                    <span style={{ fontSize:11, color:cfg.color, fontWeight:700 }}>{cfg.icon}</span>
                    <span style={{ fontSize:9, color:cfg.color, textTransform:"uppercase", letterSpacing:0.5, paddingTop:2 }}>{cfg.label}</span>
                    <div>
                      <span style={{ fontSize:11, color:C.text }}>{item.label}</span>
                      {item.detail && <span style={{ fontSize:10, color:C.textDim }}> · {item.detail}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {sessionHistory.length > 1 && (
            <div>
              <div style={{ fontSize:10, color:C.textMuted, letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>Prior sessions</div>
              {sessionHistory.slice(1).map((entry, ei) => {
                const ts = new Date(entry.ts);
                const tsStr = ts.toLocaleDateString("en-US", { month:"short", day:"numeric" }) + " " + ts.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" });
                return (
                  <div key={ei} style={{ display:"grid", gridTemplateColumns:"130px 1fr auto", gap:8, padding:"4px 0", borderBottom: ei < sessionHistory.length - 2 ? `1px solid ${C.border}08` : "none", alignItems:"center" }}>
                    <span style={{ fontSize:10, color:C.textMuted, fontFamily:"monospace" }}>{tsStr}</span>
                    <span style={{ fontSize:11, color: entry.changed ? C.textDim : C.textMuted }}>{entry.summary}</span>
                    <span style={S.badge(entry.changed ? C.accent : C.textMuted)}>{entry.changed ? "CHANGES" : "SAME"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Mission Control ──────────────────────────────────────────────────────────
const MissionControl = () => {
  const { state, S, mob, activeShow, advPctMap, crewCountMap, refreshing, refreshIntel, refreshLog, logOpen, setLogOpen, setSelectedShow, setTab } = useApp();
  const s = activeShow;
  const days   = daysUntil(s.date);
  const pct    = advPctMap[s.id] ?? 0;
  const crew   = crewCountMap[s.id] ?? 0;
  const adv    = state.advances[s.id] || {};
  const contacts = state.contacts[s.id] || [];
  const notes  = state.notes[s.id] || "";
  const sc     = state.showCrew[s.id] || {};
  const budget = state.budgets?.[s.id] || { items:[], settlement:0 };
  const totalExp = budget.items.reduce((a, i) => a + (i.amount||0), 0);
  const net    = budget.settlement - totalExp;
  const mc     = state.missionControl?.[s.id] || { threads:[], flights:[], schedule:[], followUps:[], showContacts:[], refreshHistory:[] };
  const attendingCrew = state.crew.filter(c => sc[c.id]?.attending);

  return (
    <div style={{ padding:20, maxWidth:1060, margin:"0 auto" }}>
      {/* Nav row */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <button onClick={() => setSelectedShow(null)} style={{ ...S.btn(), fontSize:11 }}>← All Shows</button>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {mc.lastRefreshed && <span style={{ fontSize:9, color:C.textMuted }}>Updated {new Date(mc.lastRefreshed).toLocaleString()}</span>}
          <button onClick={() => refreshIntel(s)} disabled={!!refreshing} style={{ ...S.btn(refreshing ? C.textDim : C.green), fontSize:11, opacity:refreshing?0.5:1 }}>
            {refreshing ? "Scanning..." : "Refresh Intel"}
          </button>
        </div>
      </div>

      {/* Scanning indicator */}
      {refreshing === s.id && (
        <div style={{ ...S.card, padding:10, marginBottom:10, borderColor:C.green+"44", display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:C.green, animation:"pulse 1s infinite" }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:C.green, fontWeight:600 }}>Scanning Gmail via MCP...</div>
            <div style={{ fontSize:10, color:C.textDim }}>Searching threads for {s.venue}, classifying intent, generating follow-ups</div>
          </div>
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
        </div>
      )}

      {/* Output log */}
      {refreshLog && refreshLog.showId === s.id && (
        <div style={{ ...S.card, padding:0, marginBottom:10, borderColor: refreshLog.steps.some(x=>x.status==="error") ? C.red+"55" : C.green+"33", overflow:"hidden" }}>
          <div onClick={() => setLogOpen(o => !o)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", cursor:"pointer", background:C.bg+"88" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:10, color:C.textDim, letterSpacing:1, textTransform:"uppercase" }}>Intel Output</span>
              <span style={{ fontSize:9, color:C.textMuted }}>{refreshLog.ts} · {refreshLog.showName}</span>
              {refreshLog.steps.length > 0 && (
                <span style={S.badge(refreshLog.steps.some(x=>x.status==="error") ? C.red : refreshLog.steps.some(x=>x.status==="warn") ? C.yellow : C.green)}>
                  {refreshLog.steps.some(x=>x.status==="error") ? "PARSE ERROR" : refreshLog.steps.some(x=>x.status==="warn") ? "WARN" : "OK"}
                </span>
              )}
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {refreshLog.raw && (
                <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(refreshLog.raw); }} style={{ ...S.btn(C.accent), fontSize:9, padding:"2px 8px" }}>Copy Raw</button>
              )}
              <span style={{ color:C.textDim, fontSize:11 }}>{logOpen ? "▲" : "▼"}</span>
            </div>
          </div>
          {logOpen && (
            <div style={{ padding:"8px 12px 12px", borderTop:`1px solid ${C.border}` }}>
              {refreshLog.steps.map((step, i) => {
                const sc2 = step.status === "ok" ? C.green : step.status === "error" ? C.red : step.status === "warn" ? C.yellow : C.textDim;
                return (
                  <div key={i} style={{ display:"grid", gridTemplateColumns:"16px 160px 1fr", gap:6, padding:"3px 0", alignItems:"start" }}>
                    <span style={{ fontSize:10, color:sc2, fontWeight:700, lineHeight:"16px" }}>{step.status==="ok"?"✓":step.status==="error"?"✗":step.status==="warn"?"!":"·"}</span>
                    <span style={{ fontSize:10, color:C.textDim, fontFamily:"monospace" }}>{step.label}</span>
                    <span style={{ fontSize:10, color: step.status==="error"?C.red:step.status==="warn"?C.yellow:C.text, fontFamily:"monospace", wordBreak:"break-all" }}>{step.detail}</span>
                  </div>
                );
              })}
              {refreshing === s.id && <div style={{ fontSize:10, color:C.textDim, marginTop:6, fontStyle:"italic" }}>Live — updating as steps complete...</div>}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div style={{ ...S.card, display:"flex", flexDirection:mob?"column":"row", justifyContent:"space-between", alignItems:mob?"flex-start":"center", borderColor:urgColor(days)+"44", borderWidth:2, gap:mob?10:0 }}>
        <div>
          <div style={{ fontSize:10, color:C.accent, letterSpacing:2, textTransform:"uppercase", marginBottom:4 }}>MISSION CONTROL</div>
          <div style={{ fontSize:mob?18:22, fontWeight:700 }}>{s.venue}</div>
          <div style={{ color:C.textDim, fontSize:13 }}>{s.city} | {s.artist}</div>
          <div style={{ color:C.textDim, fontSize:12, marginTop:4 }}>{new Date(s.date+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</div>
        </div>
        <div style={{ textAlign:mob?"left":"right", display:"flex", alignItems:"center", gap:10 }}>
          <div>
            <div style={{ fontSize:mob?28:42, fontWeight:800, color:urgColor(days), lineHeight:1 }}>{days}</div>
            <div style={{ fontSize:11, color:C.textDim }}>days out</div>
          </div>
          <span style={S.badge(days<=7?C.red:days<=21?C.yellow:C.green)}>{s.status}</span>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display:"grid", gridTemplateColumns:mob?"repeat(3,1fr)":"repeat(5,1fr)", gap:8, marginTop:10 }}>
        {[
          { label:"ADVANCE",   value:`${pct}%`,                                     color:pct>70?C.green:pct>40?C.yellow:C.red,                           action:()=>setTab("advance") },
          { label:"CREW",      value:`${crew}`,                                     color:crew>0?C.accent:C.textMuted,                                     action:()=>setTab("crew") },
          { label:"THREADS",   value:mc.threads.length,                             color:mc.threads.length>0?"#60a5fa":C.textMuted },
          { label:"FOLLOW-UPS",value:mc.followUps.length,                           color:mc.followUps.some(f=>f.priority==="CRITICAL")?C.red:C.yellow },
          { label:"NET",       value:budget.settlement?`$${net.toLocaleString()}`:"TBD", color:net>=0?C.green:C.red,                                     action:()=>setTab("budget") },
        ].map((stat, i) => (
          <div key={i} onClick={stat.action} style={{ ...S.card, textAlign:"center", cursor:stat.action?"pointer":"default", padding:10 }}>
            <div style={{ fontSize:9, color:C.textDim, letterSpacing:1, marginBottom:3 }}>{stat.label}</div>
            <div style={{ fontSize:18, fontWeight:700, color:stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Follow-ups */}
      {mc.followUps.length > 0 && (
        <div style={{ ...S.card, marginTop:12, borderColor:C.red+"33" }}>
          <div style={S.secHdr}><span>Follow-ups / Next Steps</span></div>
          {mc.followUps.map((f, i) => (
            <div key={i} style={{ display:"grid", gridTemplateColumns:mob?"60px 1fr":"70px 1fr 70px 70px", gap:mob?4:8, padding:"6px 0", borderBottom:i<mc.followUps.length-1?`1px solid ${C.border}`:"none", alignItems:mob?"start":"center" }}>
              <span style={{ ...S.badge(PRIO_COLORS[f.priority]||C.textDim), textAlign:"center" }}>{f.priority}</span>
              <div>
                <span style={{ fontSize:12, color:C.text }}>{f.action}</span>
                {mob && <div style={{ fontSize:10, marginTop:2 }}><span style={{ color:C.accent, fontWeight:600 }}>{f.owner}</span> <span style={{ color:C.textDim }}>{f.deadline}</span></div>}
              </div>
              {!mob && <span style={{ fontSize:10, color:C.accent, fontWeight:600 }}>{f.owner}</span>}
              {!mob && <span style={{ fontSize:10, color:C.textDim }}>{f.deadline}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Threads */}
      {mc.threads.length > 0 && (
        <div style={{ ...S.card, marginTop:12 }}>
          <div style={S.secHdr}><span>Email Threads ({mc.threads.length})</span></div>
          {mc.threads.map((t, i) => (
            <a key={i} href={gmailUrl(t.tid)} target="_blank" rel="noopener noreferrer"
              style={{ display:"grid", gridTemplateColumns:mob?"60px 1fr":"70px 1fr 120px 90px", gap:mob?4:8, padding:"7px 4px", borderBottom:`1px solid ${C.border}08`, textDecoration:"none", borderRadius:4, transition:"background 0.1s" }}
              onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
              <span style={{ ...S.badge(INTENT_COLORS[t.intent]||C.textDim), textAlign:"center", fontSize:9 }}>{t.intent}</span>
              <div>
                <div style={{ fontSize:12, color:C.text, fontWeight:500 }}>{t.subject}</div>
                <div style={{ fontSize:10, color:C.textDim }}>{t.from} | {t.date}</div>
                {mob && <div style={{ fontSize:10, color:t.status?.includes("DRAFT")?C.green:t.status?.includes("AWAITING")||t.status?.includes("OUTSTANDING")||t.status?.includes("PENDING")?C.yellow:C.textDim, fontWeight:600, marginTop:2 }}>{t.status}</div>}
              </div>
              {!mob && <span style={{ fontSize:10, color:t.status?.includes("DRAFT")?C.green:t.status?.includes("AWAITING")||t.status?.includes("OUTSTANDING")||t.status?.includes("PENDING")?C.yellow:C.textDim, fontWeight:600 }}>{t.status}</span>}
              {!mob && <span style={{ fontSize:10, color:C.accent }}>Open ↗</span>}
            </a>
          ))}
        </div>
      )}

      {/* Schedule */}
      {mc.schedule.length > 0 && (
        <div style={{ ...S.card, marginTop:12 }}>
          <div style={S.secHdr}><span>Day of Show Schedule</span></div>
          {mc.schedule.map((item, i) => (
            <div key={i} style={{ display:"grid", gridTemplateColumns:"80px 1fr", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}08` }}>
              <span style={{ fontSize:12, color:C.accent, fontWeight:600, fontFamily:"monospace" }}>{item.time}</span>
              <span style={{ fontSize:12, color:C.text }}>{item.item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Flights */}
      <div style={{ ...S.card, marginTop:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={S.secHdr}><span>Flights / Travel</span></div>
          <button onClick={() => setTab("crew")} style={{ ...S.btn(C.accent), fontSize:10 }}>Manage in Crew →</button>
        </div>
        {mc.flights.length === 0 && attendingCrew.length === 0 && <div style={{ fontSize:12, color:C.textMuted }}>No travel data. Assign crew first.</div>}
        {attendingCrew.map(c => {
          const cd = sc[c.id] || {};
          if (cd.travelMode === "bus") return <div key={c.id} style={{ display:"grid", gridTemplateColumns:mob?"100px 1fr":"140px 1fr", gap:8, padding:"4px 0", fontSize:11 }}><span style={{ fontWeight:600 }}>{c.name}</span><span style={{ color:C.textMuted }}>Bus</span></div>;
          const inLegs = cd.inbound||[], outLegs = cd.outbound||[];
          return (
            <div key={c.id} style={{ padding:"4px 0", borderBottom:`1px solid ${C.border}08` }}>
              <div style={{ display:"grid", gridTemplateColumns:mob?"100px 1fr":"140px 1fr 1fr", gap:8, fontSize:11 }}>
                <span style={{ fontWeight:600 }}>{c.name}</span>
                <span>{inLegs.length > 0 ? inLegs.map(l=>`${l.flight||"TBD"} ${l.from}>${l.to}`).join(", ") : <span style={{ color:C.red }}>No inbound</span>}</span>
                <span>{outLegs.length > 0 ? outLegs.map(l=>`${l.flight||"TBD"} ${l.from}>${l.to}`).join(", ") : <span style={{ color:C.red }}>No outbound</span>}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Contacts */}
      <div style={{ ...S.card, marginTop:12 }}>
        <div style={S.secHdr}><span>Show Contacts</span></div>
        {(mc.showContacts||[]).map((c, i) => (
          <div key={i} style={{ display:"grid", gridTemplateColumns:mob?"1fr":"160px 140px 1fr", gap:8, padding:"4px 0", fontSize:12, borderBottom:`1px solid ${C.border}08` }}>
            <span style={{ fontWeight:600 }}>{c.name}</span>
            <span style={{ color:C.textDim }}>{c.role}</span>
            <span style={{ color:C.accent }}>{c.email}{c.phone?` | ${c.phone}`:""}</span>
          </div>
        ))}
        {contacts.length > 0 && (
          <>
            <div style={{ fontSize:10, color:C.textMuted, marginTop:8, marginBottom:4 }}>+ From Advance Tab:</div>
            {contacts.map(c => (
              <div key={c.id} style={{ display:"grid", gridTemplateColumns:mob?"1fr":"160px 140px 1fr", gap:8, padding:"4px 0", fontSize:12 }}>
                <span style={{ fontWeight:600 }}>{c.name}</span><span style={{ color:C.textDim }}>{c.role}</span><span style={{ color:C.accent }}>{c.email}{c.phone?` | ${c.phone}`:""}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Advance checklist */}
      <div style={{ ...S.card, marginTop:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={S.secHdr}><span>Advance Checklist ({pct}%)</span></div>
          <button onClick={() => setTab("advance")} style={{ ...S.btn(C.accent), fontSize:10 }}>Edit →</button>
        </div>
        <div style={{ height:6, background:C.border, borderRadius:3, marginBottom:8 }}>
          <div style={{ height:6, borderRadius:3, width:`${pct}%`, background:pct>70?C.green:pct>40?C.yellow:C.red, transition:"width 0.3s" }} />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:mob?"1fr":"1fr 1fr", gap:2 }}>
          {ADVANCE_ITEMS.map((item, idx) => (
            <div key={idx} style={{ fontSize:11, color:adv[idx]?C.green:C.textMuted, padding:"2px 0" }}>{adv[idx]?"✓":"○"} {item}</div>
          ))}
        </div>
      </div>

      {/* Crew roster */}
      <div style={{ ...S.card, marginTop:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={S.secHdr}><span>Crew ({crew})</span></div>
          <button onClick={() => setTab("crew")} style={{ ...S.btn(C.accent), fontSize:10 }}>Manage →</button>
        </div>
        {attendingCrew.length === 0 && <div style={{ fontSize:12, color:C.textMuted }}>No crew assigned</div>}
        <div style={{ display:"grid", gridTemplateColumns:mob?"1fr 1fr":"1fr 1fr 1fr", gap:4 }}>
          {attendingCrew.map(c => {
            const cd = sc[c.id] || {};
            return (
              <div key={c.id} style={{ fontSize:11, padding:"4px 6px", borderRadius:3, background:C.bg }}>
                <span style={{ fontWeight:600, color:C.text }}>{c.name}</span>
                <span style={{ ...S.badge(cd.travelMode==="fly"?C.yellow:C.green), marginLeft:4, fontSize:9 }}>{cd.travelMode}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Budget */}
      {(budget.settlement > 0 || budget.items.length > 0) && (
        <div style={{ ...S.card, marginTop:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={S.secHdr}><span>Budget</span></div>
            <button onClick={() => setTab("budget")} style={{ ...S.btn(C.accent), fontSize:10 }}>Edit →</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:mob?"1fr":"1fr 1fr 1fr", gap:8, fontSize:12 }}>
            <div><span style={{ color:C.textDim }}>Settlement:</span> <span style={{ color:C.green, fontWeight:600 }}>${budget.settlement.toLocaleString()}</span></div>
            <div><span style={{ color:C.textDim }}>Expenses:</span> <span style={{ color:C.red, fontWeight:600 }}>${totalExp.toLocaleString()}</span></div>
            <div><span style={{ color:C.textDim }}>Net:</span> <span style={{ color:net>=0?C.green:C.red, fontWeight:600 }}>${net.toLocaleString()}</span></div>
          </div>
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div style={{ ...S.card, marginTop:12 }}>
          <div style={S.secHdr}><span>Notes</span></div>
          <div style={{ fontSize:12, color:C.text, whiteSpace:"pre-wrap" }}>{notes}</div>
        </div>
      )}

      {/* Refresh History */}
      {(mc.refreshHistory||[]).length > 0 && (
        <div style={{ ...S.card, marginTop:12 }}>
          <div style={S.secHdr}>
            <span>Refresh History</span>
            <span style={{ fontSize:10, color:C.textMuted }}>{mc.refreshHistory.length} run{mc.refreshHistory.length>1?"s":""}</span>
          </div>
          {mc.refreshHistory.map((entry, ei) => (
            <RefreshHistoryEntry key={ei} entry={entry} defaultOpen={ei === 0} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── All Shows Overview ───────────────────────────────────────────────────────
const AllShowsView = () => {
  const { state, S, mob, shows, advPctMap, crewCountMap, refreshing, refreshIntel, goToShow, selectedShow, lastSaved } = useApp();

  const upcoming = useMemo(() => shows.filter(s => daysUntil(s.date) >= 0).slice(0, 24), [shows]);
  const nextShow = upcoming[0];
  const avgAdv   = useMemo(() => {
    if (!upcoming.length) return 0;
    return Math.round(upcoming.reduce((a, s) => a + (advPctMap[s.id]??0), 0) / upcoming.length);
  }, [upcoming, advPctMap]);

  // Aggregated data for 4 sections
  const top5Actions = useMemo(() => {
    const prioOrder = { CRITICAL:0, HIGH:1, MEDIUM:2, LOW:3 };
    const all = [];
    shows.forEach(s => { (state.missionControl?.[s.id]?.followUps||[]).forEach(f => all.push({ ...f, showName:s.venue, showId:s.id, showDays:daysUntil(s.date) })); });
    return all.sort((a,b) => (prioOrder[a.priority]??4)-(prioOrder[b.priority]??4) || a.showDays-b.showDays).slice(0,5);
  }, [shows, state.missionControl]);

  const staleThreads = useMemo(() => {
    const out = [];
    shows.forEach(s => { (state.missionControl?.[s.id]?.threads||[]).forEach(t => { if (STALE_FLAGS.some(k=>t.status?.toUpperCase().includes(k))) out.push({...t,showName:s.venue,showId:s.id}); }); });
    return out;
  }, [shows, state.missionControl]);

  const flightList = useMemo(() => {
    const out = [];
    shows.filter(s => { const d=daysUntil(s.date); return d>=-1 && d<=45; }).forEach(s => {
      const sc = state.showCrew[s.id]||{};
      state.crew.forEach(c => {
        const cd = sc[c.id];
        if (!cd?.attending || cd.travelMode!=="fly") return;
        (cd.inbound||[]).forEach(l => { if (l.flight||l.from||l.to) out.push({...l,crewName:c.name,showName:s.venue,showDate:s.date,showId:s.id,dir:"IN"}); });
        (cd.outbound||[]).forEach(l => { if (l.flight||l.from||l.to) out.push({...l,crewName:c.name,showName:s.venue,showDate:s.date,showId:s.id,dir:"OUT"}); });
      });
    });
    return out;
  }, [shows, state.showCrew, state.crew]);

  const { allThreads } = useMemo(() => {
    const all = [];
    shows.forEach(s => { (state.missionControl?.[s.id]?.threads||[]).forEach(t => all.push({...t,showName:s.venue,showId:s.id})); });
    return { allThreads: all };
  }, [shows, state.missionControl]);

  const recentChanges = useMemo(() => {
    return shows.map(s => {
      const history = state.missionControl?.[s.id]?.refreshHistory||[];
      if (!history.length || !history[0].changed) return null;
      return { showName:s.venue, showId:s.id, showDate:s.date, last:history[0], count:history.length };
    }).filter(Boolean).sort((a,b) => new Date(b.last.ts)-new Date(a.last.ts)).slice(0,8);
  }, [shows, state.missionControl]);

  return (
    <div style={{ padding:20, maxWidth:1000, margin:"0 auto" }}>
      {/* Session History */}
      <SessionHistoryPanel />

      {/* Header stats */}
      <div style={{ display:"grid", gridTemplateColumns:mob?"repeat(2,1fr)":"repeat(4,1fr)", gap:12, marginBottom:24 }}>
        {[
          { label:"NEXT SHOW",  value:nextShow?`${nextShow.venue}, ${fmt(nextShow.date)}`:"None", sub:nextShow?`${daysUntil(nextShow.date)} days`:"", color:nextShow?urgColor(daysUntil(nextShow.date)):C.textDim },
          { label:"UPCOMING",   value:upcoming.length,   sub:"shows tracked", color:C.accent },
          { label:"AVG ADVANCE",value:`${avgAdv}%`,      sub:"completion",    color:avgAdv>70?C.green:avgAdv>40?C.yellow:C.red },
          { label:"CREW",       value:state.crew.length, sub:"rostered",      color:C.accent },
        ].map((s,i) => (
          <div key={i} style={{ ...S.card, textAlign:"center" }}>
            <div style={{ fontSize:10, color:C.textDim, letterSpacing:1, marginBottom:6 }}>{s.label}</div>
            <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:10, color:C.textDim, marginTop:2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Show list */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontSize:11, color:C.textDim, letterSpacing:1, textTransform:"uppercase" }}>Shows</div>
        <button onClick={async () => { const near=upcoming.filter(s=>daysUntil(s.date)<=30).slice(0,5); for (const sh of near) await refreshIntel(sh); }} disabled={!!refreshing} style={{ ...S.btn(refreshing?C.textDim:C.green), fontSize:10, opacity:refreshing?0.5:1 }}>
          {refreshing?"Scanning...":`Refresh Next ${upcoming.filter(s=>daysUntil(s.date)<=30).length} Shows`}
        </button>
      </div>
      <div style={{ maxHeight:350, overflowY:"auto", overflowX:"hidden", marginBottom:0 }}>
      {upcoming.map(s => {
        const days=daysUntil(s.date), pct=advPctMap[s.id]??0, crew=crewCountMap[s.id]??0;
        return (
          <div key={s.id} onClick={()=>goToShow(s.id)} style={{ ...S.card, cursor:"pointer", display:"grid", gridTemplateColumns:mob?"60px 1fr 50px":"80px 1fr 100px 80px 60px", alignItems:"center", gap:mob?8:12, borderColor:selectedShow===s.id?C.accent:C.border }} {...rowHover}>
            <div>
              <div style={{ fontWeight:700, fontSize:mob?12:14 }}>{fmt(s.date)}</div>
              <div style={{ fontSize:10, color:urgColor(days), fontWeight:700 }}>{days}d</div>
            </div>
            <div>
              <div style={{ fontWeight:600, fontSize:mob?12:13 }}>{s.venue}</div>
              <div style={{ fontSize:11, color:C.textDim }}>{s.city}</div>
              {mob && <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:4 }}>
                <div style={{ height:3, flex:1, background:C.border, borderRadius:2 }}><div style={{ height:3, borderRadius:2, width:`${pct}%`, background:pct>70?C.green:pct>40?C.yellow:C.red }} /></div>
                <span style={{ fontSize:9, color:C.textDim }}>{pct}%</span><span style={{ fontSize:9, color:C.textDim }}>{crew}crew</span>
              </div>}
            </div>
            {!mob && <div><div style={{ height:4, background:C.border, borderRadius:2 }}><div style={{ height:4, borderRadius:2, width:`${pct}%`, background:pct>70?C.green:pct>40?C.yellow:C.red, transition:"width 0.3s" }} /></div><div style={{ fontSize:10, color:C.textDim, marginTop:3 }}>{pct}% advanced</div></div>}
            {!mob && <div style={{ textAlign:"center" }}><div style={{ fontSize:16, fontWeight:700 }}>{crew}</div><div style={{ fontSize:10, color:C.textDim }}>crew</div></div>}
            <span style={S.badge(days<=7?C.red:days<=21?C.yellow:C.green)}>{mob?s.status.slice(0,4):s.status}</span>
          </div>
        );
      })}
      </div>

      {/* Section 1: Top 5 Action Items */}
      {top5Actions.length > 0 && (
        <div style={{ ...S.card, marginTop:20, borderColor:C.red+"44" }}>
          <div style={S.secHdr}><span>Top 5 Action Items</span><span style={{ fontSize:10, color:C.textMuted }}>{top5Actions.length > 4 ? `+${(state.missionControl ? Object.values(state.missionControl).reduce((a,mc)=>a+(mc.followUps||[]).length,0) : 0) - 5} more` : ""}</span></div>
          <div style={{ maxHeight:260, overflowY:"auto", overflowX:"hidden" }}>
          {top5Actions.map((f,i) => (
            <div key={i} onClick={()=>goToShow(f.showId)} style={{ display:"grid", gridTemplateColumns:mob?"60px 1fr":"70px 1fr 110px 70px 70px", gap:8, padding:"8px 4px", borderBottom:i<top5Actions.length-1?`1px solid ${C.border}`:"none", cursor:"pointer", alignItems:"center", borderRadius:4, transition:"background 0.1s" }} {...rowHover}>
              <span style={{ ...S.badge(PRIO_COLORS[f.priority]||C.textDim), textAlign:"center" }}>{f.priority}</span>
              <div>
                <div style={{ fontSize:12, color:C.text }}>{f.action}</div>
                {mob && <div style={{ fontSize:10, color:C.textDim, marginTop:2 }}>{f.showName} | <span style={{ color:C.accent, fontWeight:600 }}>{f.owner}</span> | {f.deadline}</div>}
              </div>
              {!mob && <span style={{ fontSize:10, color:C.textDim }}>{f.showName}</span>}
              {!mob && <span style={{ fontSize:10, color:C.accent, fontWeight:600 }}>{f.owner}</span>}
              {!mob && <span style={{ fontSize:10, color:C.textDim }}>{f.deadline}</span>}
            </div>
          ))}
          </div>
        </div>
      )}

      {/* Section 2: Stale / Needs Follow-up */}
      {staleThreads.length > 0 && (
        <div style={{ ...S.card, marginTop:12, borderColor:C.yellow+"44" }}>
          <div style={S.secHdr}><span>Stale / Needs Follow-up</span><span style={{ fontSize:10, color:C.textMuted }}>{staleThreads.length} threads waiting</span></div>
          <div style={{ maxHeight:260, overflowY:"auto", overflowX:"hidden" }}>
          {staleThreads.map((t,i) => (
            <a key={i} href={gmailUrl(t.tid)} target="_blank" rel="noopener noreferrer" style={{ display:"grid", gridTemplateColumns:mob?"55px 1fr":"70px 1fr 120px 130px", gap:8, padding:"7px 4px", borderBottom:i<staleThreads.length-1?`1px solid ${C.border}08`:"none", textDecoration:"none", borderRadius:4, transition:"background 0.1s", alignItems:"center" }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
              <span style={{ ...S.badge(INTENT_COLORS[t.intent]||C.textDim), textAlign:"center", fontSize:9 }}>{t.intent}</span>
              <div><div style={{ fontSize:12, color:C.text, fontWeight:500 }}>{t.subject}</div><div style={{ fontSize:10, color:C.textDim }}>{t.from} | {t.date}</div></div>
              {!mob && <span style={{ fontSize:10, color:C.textDim }}>{t.showName}</span>}
              {!mob && <span style={{ fontSize:10, color:C.yellow, fontWeight:600 }}>{t.status}</span>}
            </a>
          ))}
          </div>
        </div>
      )}

      {/* Section 3: Upcoming Flights */}
      {flightList.length > 0 && (
        <div style={{ ...S.card, marginTop:12 }}>
          <div style={S.secHdr}><span>Upcoming Flights</span><span style={{ fontSize:10, color:C.textMuted }}>{flightList.length} legs booked</span></div>
          {!mob && <div style={{ display:"grid", gridTemplateColumns:"130px 1fr 60px 80px 110px 80px", gap:6, padding:"0 4px 6px", fontSize:10, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, borderBottom:`1px solid ${C.border}` }}>
            <div>Crew</div><div>Show</div><div>Dir</div><div>Flight</div><div>Route</div><div>Status</div>
          </div>}
          <div style={{ maxHeight:240, overflowY:"auto", overflowX:"hidden" }}>
          {flightList.map((l,i) => (
            <div key={i} onClick={()=>goToShow(l.showId)} style={{ display:"grid", gridTemplateColumns:mob?"1fr 1fr":"130px 1fr 60px 80px 110px 80px", gap:6, padding:"7px 4px", borderBottom:i<flightList.length-1?`1px solid ${C.border}08`:"none", cursor:"pointer", fontSize:12, alignItems:"center", borderRadius:4, transition:"background 0.1s" }} {...rowHover}>
              <span style={{ fontWeight:600 }}>{l.crewName}</span>
              <span style={{ color:C.textDim, fontSize:11 }}>{l.showName} <span style={{ color:C.textMuted }}>({fmt(l.showDate)})</span></span>
              <span style={{ ...S.badge(l.dir==="IN"?"#34d399":C.yellow), textAlign:"center" }}>{l.dir}</span>
              <span style={{ fontFamily:"monospace", color:C.accent, fontSize:11 }}>{l.flight||"TBD"}</span>
              <span style={{ color:C.textDim, fontSize:11 }}>{l.from&&l.to?`${l.from} → ${l.to}`:l.from||l.to||"—"}</span>
              <span style={S.badge(l.status==="confirmed"?C.green:l.status==="cancelled"?C.red:C.yellow)}>{l.status||"pending"}</span>
            </div>
          ))}
          </div>
        </div>
      )}

      {/* Section 4: Recent Gmail Threads */}
      {allThreads.length > 0 && (
        <div style={{ ...S.card, marginTop:12 }}>
          <div style={S.secHdr}><span>Recent Gmail Threads</span><span style={{ fontSize:10, color:C.textMuted }}>{allThreads.length} total</span></div>
          <div style={{ maxHeight:260, overflowY:"auto", overflowX:"hidden" }}>
          {allThreads.map((t,i) => (
            <a key={i} href={gmailUrl(t.tid)} target="_blank" rel="noopener noreferrer" style={{ display:"grid", gridTemplateColumns:mob?"55px 1fr":"70px 1fr 120px 120px", gap:8, padding:"6px 4px", borderBottom:i<allThreads.length-1?`1px solid ${C.border}08`:"none", textDecoration:"none", borderRadius:4, transition:"background 0.1s", alignItems:"center" }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
              <span style={{ ...S.badge(INTENT_COLORS[t.intent]||C.textDim), textAlign:"center", fontSize:9 }}>{t.intent}</span>
              <div><div style={{ fontSize:12, color:C.text, fontWeight:500 }}>{t.subject}</div><div style={{ fontSize:10, color:C.textDim }}>{t.from} | {t.date}</div>{mob&&<div style={{ fontSize:10, color:C.textDim, marginTop:2 }}>{t.showName}</div>}</div>
              {!mob && <span style={{ fontSize:10, color:C.textDim }}>{t.showName}</span>}
              {!mob && <span style={{ fontSize:10, color:t.status?.includes("DRAFT")?C.green:t.status?.includes("PENDING")||t.status?.includes("AWAITING")||t.status?.includes("OUTSTANDING")?C.yellow:C.textDim, fontWeight:600 }}>{t.status}</span>}
            </a>
          ))}
          </div>
        </div>
      )}

      {/* Section 5: Recent Changes */}
      {recentChanges.length > 0 && (
        <div style={{ ...S.card, marginTop:12 }}>
          <div style={S.secHdr}><span>Recent Changes</span><span style={{ fontSize:10, color:C.textMuted }}>{recentChanges.length} show{recentChanges.length>1?"s":""} with changes</span></div>
          <div style={{ maxHeight:260, overflowY:"auto", overflowX:"hidden" }}>
          {recentChanges.map((r,ri) => {
            const ts = new Date(r.last.ts);
            const tsStr = ts.toLocaleDateString("en-US",{month:"short",day:"numeric"}) + " " + ts.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
            const typeCounts = {};
            (r.last.items||[]).forEach(item => { typeCounts[item.type]=(typeCounts[item.type]||0)+1; });
            return (
              <div key={ri} onClick={()=>goToShow(r.showId)} style={{ padding:"8px 4px", borderBottom:ri<recentChanges.length-1?`1px solid ${C.border}`:"none", cursor:"pointer", borderRadius:4, transition:"background 0.1s" }} {...rowHover}>
                <div style={{ display:"grid", gridTemplateColumns:mob?"1fr":"130px 1fr auto", gap:8, alignItems:"center" }}>
                  <div><div style={{ fontWeight:600, fontSize:12 }}>{r.showName}</div><div style={{ fontSize:10, color:C.textMuted }}>{tsStr}</div></div>
                  <div style={{ fontSize:11, color:C.textDim }}>{r.last.summary}</div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap", justifyContent:mob?"flex-start":"flex-end" }}>
                    {Object.entries(typeCounts).map(([type,count]) => { const cfg=DIFF_CFG[type]||{color:C.textDim,icon:"·"}; return <span key={type} style={{ ...S.badge(cfg.color), fontSize:9 }}>{cfg.icon}{count}</span>; })}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* Add show */}
      <AddShowForm />
      <div style={{ marginTop:20, fontSize:10, color:C.textMuted, textAlign:"center" }}>
        Last saved: {lastSaved ? new Date(lastSaved).toLocaleString() : "Never"} | Data persists across sessions
      </div>
    </div>
  );
};

// Fix #2: Dashboard is now a lightweight router — module level, no remount
const Dashboard = () => {
  const { activeShow } = useApp();
  return activeShow ? <MissionControl /> : <AllShowsView />;
};

// ─── Add Show Form (replace existing AddShowForm in App.jsx) ──────────────────
const AddShowForm = () => {
  const [open, setOpen]         = useState(false);
  const [f, setF]               = useState({ date:"", venue:"", city:"", artist:"bbno$", status:"TBD" });
  const [parsing, setParsing]   = useState(false);
  const [parsed, setParsed]     = useState(null); // { contacts, dealTerms, documentType }
  const [parseErr, setParseErr] = useState(null);
  const fileRef                 = useRef(null);
  const { S, mob, update, showToast, session } = useApp();

  const handlePDF = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParsed(null);
    setParseErr(null);

    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });

      const { data: { session: s } } = await supabase.auth.getSession();
      const resp = await fetch("/api/parse-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${s.access_token}`,
        },
        body: JSON.stringify({ pdfBase64: base64, filename: file.name }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const p = data.parsed;

      // Auto-fill show fields from parsed data
      setF(prev => ({
        ...prev,
        date:   p.show?.date   || prev.date,
        venue:  p.show?.venue  || prev.venue,
        city:   p.show?.city   || prev.city,
        artist: p.show?.artist || prev.artist,
      }));

      setParsed({ contacts: p.contacts || [], dealTerms: p.dealTerms || {}, documentType: p.documentType || "OTHER" });
      showToast(`Parsed: ${p.documentType || "document"}`);
    } catch (err) {
      setParseErr(err.message);
      showToast(`Parse failed: ${err.message}`);
    }
    setParsing(false);
    e.target.value = "";
  };

  const submit = () => {
    if (!f.date || !f.venue) return;
    const newShow = { ...f, id: uid() };
    update(s => {
      s.shows.push(newShow);
      // Seed contacts into missionControl if parsed
      if (parsed?.contacts?.length) {
        if (!s.missionControl) s.missionControl = {};
        if (!s.missionControl[newShow.id]) s.missionControl[newShow.id] = { threads:[], flights:[], schedule:[], followUps:[], showContacts:[], refreshHistory:[] };
        const existing = new Set(s.missionControl[newShow.id].showContacts.map(c => c.email || c.name));
        parsed.contacts.forEach(c => {
          const key = c.email || c.name;
          if (key && !existing.has(key)) {
            s.missionControl[newShow.id].showContacts.push({ name: c.name, role: c.role || c.company || "", email: c.email || "", phone: c.phone || "" });
            existing.add(key);
          }
        });
      }
      return s;
    });
    showToast("Show added");
    setF({ date:"", venue:"", city:"", artist:"bbno$", status:"TBD" });
    setParsed(null);
    setParseErr(null);
    setOpen(false);
  };

  if (!open) return (
    <div style={{ textAlign:"center", marginTop:12 }}>
      <button style={S.btn(C.accent)} onClick={() => setOpen(true)}>+ Add Show</button>
    </div>
  );

  const hasDeal = parsed?.dealTerms && Object.values(parsed.dealTerms).some(v => v && v !== "null");

  return (
    <div style={{ ...S.card, marginTop:12, borderColor: parsed ? C.accent+"55" : C.border }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={{ fontSize:11, color:C.textDim, letterSpacing:1, textTransform:"uppercase" }}>
          Add Show {parsed && <span style={S.badge(C.accent)}>{parsed.documentType}</span>}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <input ref={fileRef} type="file" accept="application/pdf" onChange={handlePDF} style={{ display:"none" }} />
          <button onClick={() => fileRef.current?.click()} disabled={parsing} style={{ ...S.btn(parsing ? C.textDim : C.yellow), fontSize:10, opacity:parsing?0.5:1 }}>
            {parsing ? "Parsing..." : "Import PDF"}
          </button>
          <button onClick={() => { setOpen(false); setParsed(null); setParseErr(null); }} style={{ ...S.btn(), fontSize:10 }}>Cancel</button>
        </div>
      </div>

      {/* Parse error */}
      {parseErr && (
        <div style={{ fontSize:11, color:C.red, marginBottom:10, padding:"6px 8px", background:C.red+"11", borderRadius:4 }}>
          Parse error: {parseErr}
        </div>
      )}

      {/* Form fields */}
      <div style={{ display:"grid", gridTemplateColumns:mob?"1fr 1fr":"1fr 1fr 1fr 1fr auto", gap:8, alignItems:"end", marginBottom:12 }}>
        {[["date","Date","date"],["venue","Venue","text"],["city","City","text"],["artist","Artist","text"]].map(([k,l,t]) => (
          <div key={k}>
            <div style={{ fontSize:10, color:C.textDim, marginBottom:3 }}>{l}</div>
            <input type={t} value={f[k]} onChange={e=>setF({...f,[k]:e.target.value})} style={{ ...S.input, borderColor: parsed?.show?.[k] ? C.accent+"88" : C.border }} />
          </div>
        ))}
        <button onClick={submit} disabled={!f.date || !f.venue} style={{ ...S.btn(C.green), opacity:(!f.date||!f.venue)?0.4:1 }}>Save</button>
      </div>

      {/* Parsed contacts */}
      {parsed?.contacts?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:10, color:C.textDim, letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>
            Contacts ({parsed.contacts.length}) — will be imported to Mission Control
          </div>
          <div style={{ display:"grid", gridTemplateColumns:mob?"1fr":"1fr 1fr", gap:4 }}>
            {parsed.contacts.map((c, i) => (
              <div key={i} style={{ fontSize:11, padding:"5px 8px", background:C.bg, borderRadius:3, border:`1px solid ${C.border}` }}>
                <span style={{ fontWeight:600, color:C.text }}>{c.name}</span>
                {c.role && <span style={{ color:C.textDim }}> · {c.role}</span>}
                {c.company && <span style={{ color:C.textMuted }}> · {c.company}</span>}
                {c.email && <div style={{ fontSize:10, color:C.accent, marginTop:1 }}>{c.email}</div>}
                {c.phone && <div style={{ fontSize:10, color:C.textDim }}>{c.phone}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deal terms */}
      {hasDeal && (
        <div>
          <div style={{ fontSize:10, color:C.textDim, letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>Deal Terms</div>
          <div style={{ display:"grid", gridTemplateColumns:mob?"1fr 1fr":"repeat(3,1fr)", gap:6 }}>
            {Object.entries(parsed.dealTerms).filter(([k, v]) => v && v !== "null" && k !== "notes").map(([k, v]) => (
              <div key={k} style={{ fontSize:11, padding:"5px 8px", background:C.bg, borderRadius:3, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:9, color:C.textDim, textTransform:"uppercase", letterSpacing:0.5, marginBottom:2 }}>{k}</div>
                <div style={{ color:C.text }}>{v}</div>
              </div>
            ))}
          </div>
          {parsed.dealTerms.notes && (
            <div style={{ fontSize:11, color:C.textDim, marginTop:8, padding:"6px 8px", background:C.bg, borderRadius:3 }}>
              <span style={{ color:C.textMuted, fontSize:10, textTransform:"uppercase" }}>Notes: </span>{parsed.dealTerms.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


// ─── Advance Tab ──────────────────────────────────────────────────────────────
const Advance = () => {
  const { state, S, mob, shows, advPctMap, selectedShow, update } = useApp();
  const show = useMemo(() => shows.find(s=>s.id===selectedShow) || shows.find(s=>daysUntil(s.date)>=0), [shows, selectedShow]);
  if (!show) return <div style={{ padding:20, color:C.textDim }}>No upcoming shows</div>;
  const adv      = state.advances[show.id] || {};
  const contacts = state.contacts[show.id] || [];
  const notes    = state.notes[show.id] || "";
  const pct      = advPctMap[show.id] ?? 0;
  const days     = daysUntil(show.date);

  const toggleItem = useCallback((idx) => {
    update(s => { if (!s.advances[show.id]) s.advances[show.id]={}; s.advances[show.id][idx]=!s.advances[show.id][idx]; return s; });
  }, [update, show.id]);

  const addContact    = () => { update(s => { if (!s.contacts[show.id]) s.contacts[show.id]=[]; s.contacts[show.id].push({id:uid(),name:"",role:"",email:"",phone:""}); return s; }); };
  const updateContact = (cid,field,val) => { update(s => { const c=s.contacts[show.id]?.find(x=>x.id===cid); if(c) c[field]=val; return s; }); };
  const removeContact = (cid) => { update(s => { s.contacts[show.id]=(s.contacts[show.id]||[]).filter(x=>x.id!==cid); return s; }); };
  const updateNote    = useCallback((val) => { update(s => { s.notes[show.id]=val; return s; }); }, [update, show.id]);

  return (
    <div style={{ padding:20, maxWidth:900, margin:"0 auto" }}>
      <div style={{ ...S.card, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div><div style={{ fontSize:18, fontWeight:700 }}>{show.venue}</div><div style={{ color:C.textDim }}>{show.city} | {fmt(show.date)}</div></div>
        <div style={{ textAlign:"right" }}><div style={{ fontSize:28, fontWeight:700, color:urgColor(days) }}>{days}d</div><span style={S.badge(pct>70?C.green:pct>40?C.yellow:C.red)}>{pct}% complete</span></div>
      </div>
      <div style={S.card}>
        <div style={{ fontSize:11, color:C.textDim, letterSpacing:1, marginBottom:10, textTransform:"uppercase" }}>Advance Checklist</div>
        <div style={{ display:"grid", gridTemplateColumns:mob?"1fr":"1fr 1fr", gap:4 }}>
          {ADVANCE_ITEMS.map((item,idx) => (
            <div key={idx} onClick={()=>toggleItem(idx)} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 8px", borderRadius:4, cursor:"pointer", background:adv[idx]?C.green+"10":"transparent", transition:"background 0.15s" }}>
              <div style={{ width:16, height:16, borderRadius:3, border:`2px solid ${adv[idx]?C.green:C.border}`, background:adv[idx]?C.green:"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:C.bg, fontWeight:700, flexShrink:0, transition:"all 0.15s" }}>{adv[idx]?"✓":""}</div>
              <span style={{ color:adv[idx]?C.green:C.text, fontSize:12, textDecoration:adv[idx]?"line-through":"none", opacity:adv[idx]?0.7:1 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={S.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={{ fontSize:11, color:C.textDim, letterSpacing:1, textTransform:"uppercase" }}>Venue Contacts</div>
          <button onClick={addContact} style={S.btn(C.accent)}>+ Contact</button>
        </div>
        {contacts.map(c => (
          <div key={c.id} style={{ display:"grid", gridTemplateColumns:mob?"1fr 1fr":"1fr 1fr 1fr 1fr 30px", gap:6, marginBottom:6 }}>
            {["name","role","email","phone"].map(field => (<input key={field} placeholder={field} value={c[field]} onChange={e=>updateContact(c.id,field,e.target.value)} style={S.input} />))}
            <button onClick={()=>removeContact(c.id)} style={{ ...S.btn(C.red), padding:"4px 6px" }}>×</button>
          </div>
        ))}
      </div>
      <div style={S.card}>
        <div style={{ fontSize:11, color:C.textDim, letterSpacing:1, marginBottom:8, textTransform:"uppercase" }}>Show Notes</div>
        <textarea value={notes} onChange={e=>updateNote(e.target.value)} placeholder="Add notes for this show..." style={{ ...S.input, minHeight:80, resize:"vertical", fontFamily:"inherit" }} />
      </div>
    </div>
  );
};

// ─── Crew Tab ─────────────────────────────────────────────────────────────────
const Crew = () => {
  const { state, S, mob, shows, selectedShow, update, crewPanel, setCrewPanel } = useApp();
  const show = useMemo(() => shows.find(s=>s.id===selectedShow) || shows.find(s=>daysUntil(s.date)>=0), [shows, selectedShow]);
  if (!show) return <div style={{ padding:20, color:C.textDim }}>No upcoming shows</div>;
  const sc = state.showCrew[show.id] || {};

  const toggleAttending = (crewId) => { update(s => { if(!s.showCrew[show.id]) s.showCrew[show.id]={}; if(!s.showCrew[show.id][crewId]) s.showCrew[show.id][crewId]={attending:false,travelMode:"bus",inbound:[],outbound:[]}; s.showCrew[show.id][crewId].attending=!s.showCrew[show.id][crewId].attending; return s; }); };
  const setTravelMode   = (crewId, mode) => { update(s => { if(!s.showCrew[show.id]) s.showCrew[show.id]={}; if(!s.showCrew[show.id][crewId]) s.showCrew[show.id][crewId]={attending:true,travelMode:mode,inbound:[],outbound:[]}; s.showCrew[show.id][crewId].travelMode=mode; return s; }); };
  const addLeg          = (crewId, dir) => { update(s => { if(!s.showCrew[show.id]?.[crewId]) return s; s.showCrew[show.id][crewId][dir].push({id:uid(),flight:"",from:"",to:"",depart:"",arrive:"",conf:"",status:"pending"}); return s; }); setCrewPanel({showId:show.id,crewId}); };
  const updateLeg       = (crewId, dir, legId, field, val) => { update(s => { const leg=s.showCrew[show.id]?.[crewId]?.[dir]?.find(l=>l.id===legId); if(leg) leg[field]=val; return s; }); };
  const removeLeg       = (crewId, dir, legId) => { update(s => { if(s.showCrew[show.id]?.[crewId]?.[dir]) s.showCrew[show.id][crewId][dir]=s.showCrew[show.id][crewId][dir].filter(l=>l.id!==legId); return s; }); };
  const addCrewMember   = () => { update(s => { s.crew.push({id:uid(),name:"",role:"",email:""}); return s; }); };
  const updateCrewField = (crewId, field, val) => { update(s => { const c=s.crew.find(x=>x.id===crewId); if(c) c[field]=val; return s; }); };

  const panelData = crewPanel ? state.showCrew[crewPanel.showId]?.[crewPanel.crewId] : null;
  const panelCrew = crewPanel ? state.crew.find(c=>c.id===crewPanel.crewId) : null;

  const LegRow = ({ leg, crewId, dir }) => (
    <div style={{ display:"grid", gridTemplateColumns:mob?"1fr 1fr":"1fr 1fr 1fr 1fr 1fr 80px 30px", gap:4, marginBottom:4 }}>
      {[["flight","Flight#"],["from","From"],["to","To"],["depart","Depart"],["arrive","Arrive"]].map(([k,p]) => (
        <input key={k} placeholder={p} value={leg[k]} onChange={e=>updateLeg(crewId,dir,leg.id,k,e.target.value)} style={{ ...S.input, fontSize:11 }} />
      ))}
      <select value={leg.status} onChange={e=>updateLeg(crewId,dir,leg.id,"status",e.target.value)} style={{ ...S.input, fontSize:11 }}>
        <option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option>
      </select>
      <button onClick={()=>removeLeg(crewId,dir,leg.id)} style={{ ...S.btn(C.red), padding:"2px 6px", fontSize:11 }}>×</button>
    </div>
  );

  return (
    <div style={{ padding:20, maxWidth:1000, margin:"0 auto" }}>
      <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>{show.venue} Crew Roster</div>
      <div style={S.card}>
        <div style={{ display:"grid", gridTemplateColumns:mob?"30px 1fr 70px":"30px 1fr 80px 80px 80px 80px", gap:8, padding:"0 0 8px", borderBottom:`1px solid ${C.border}`, fontSize:10, color:C.textDim, textTransform:"uppercase", letterSpacing:1 }}>
          <div/><div>Name / Role</div><div>Travel</div>{!mob&&<><div>Inbound</div><div>Outbound</div><div/></>}
        </div>
        {state.crew.map(c => {
          const cd = sc[c.id] || {attending:false,travelMode:"bus",inbound:[],outbound:[]};
          const inOk=cd.inbound.some(l=>l.status==="confirmed"), outOk=cd.outbound.some(l=>l.status==="confirmed");
          return (
            <div key={c.id} style={{ display:"grid", gridTemplateColumns:mob?"30px 1fr 70px":"30px 1fr 80px 80px 80px 80px", gap:8, padding:"8px 0", borderBottom:`1px solid ${C.border}08`, alignItems:"center" }}>
              <div onClick={()=>toggleAttending(c.id)} style={{ width:20, height:20, borderRadius:3, border:`2px solid ${cd.attending?C.green:C.border}`, background:cd.attending?C.green:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:C.bg, fontWeight:700 }}>{cd.attending?"✓":""}</div>
              <div><div style={{ fontWeight:600, fontSize:13 }}>{c.name||<span style={{ color:C.textMuted }}>New member</span>}</div><div style={{ fontSize:11, color:C.textDim }}>{c.role}</div></div>
              <div>{cd.attending&&<select value={cd.travelMode} onChange={e=>setTravelMode(c.id,e.target.value)} style={{ ...S.input, fontSize:11, padding:"3px 4px" }}><option value="bus">Bus</option><option value="fly">Fly</option><option value="local">Local</option><option value="vendor">Vendor</option></select>}</div>
              {!mob&&<div>{cd.attending&&cd.travelMode==="fly"&&<span style={S.badge(inOk?C.green:C.yellow)}>{inOk?"✓ OK":`${cd.inbound.length} leg${cd.inbound.length!==1?"s":""}`}</span>}{cd.attending&&cd.travelMode==="bus"&&<span style={{ fontSize:10, color:C.textMuted }}>Bus</span>}</div>}
              {!mob&&<div>{cd.attending&&cd.travelMode==="fly"&&<span style={S.badge(outOk?C.green:C.yellow)}>{outOk?"✓ OK":`${cd.outbound.length} leg${cd.outbound.length!==1?"s":""}`}</span>}{cd.attending&&cd.travelMode==="bus"&&<span style={{ fontSize:10, color:C.textMuted }}>Bus</span>}</div>}
              {!mob&&<div>{cd.attending&&cd.travelMode==="fly"&&<button onClick={()=>setCrewPanel({showId:show.id,crewId:c.id})} style={{ ...S.btn(C.accent), fontSize:10, padding:"3px 8px" }}>✈ Travel</button>}</div>}
            </div>
          );
        })}
        <div style={{ marginTop:10 }}><button onClick={addCrewMember} style={S.btn(C.accent)}>+ Add Crew Member</button></div>
      </div>
      {crewPanel && panelData && panelCrew && (
        <div style={{ ...S.card, borderColor:C.accent, marginTop:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:14, fontWeight:700 }}>✈ {panelCrew.name} Travel</div>
            <button onClick={()=>setCrewPanel(null)} style={S.btn()}>Close</button>
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:C.textDim, letterSpacing:1, marginBottom:6, textTransform:"uppercase" }}>Inbound</div>
            {panelData.inbound.map(l=><LegRow key={l.id} leg={l} crewId={crewPanel.crewId} dir="inbound"/>)}
            <button onClick={()=>addLeg(crewPanel.crewId,"inbound")} style={{ ...S.btn(C.green), fontSize:10 }}>+ Inbound Leg</button>
          </div>
          <div>
            <div style={{ fontSize:11, color:C.textDim, letterSpacing:1, marginBottom:6, textTransform:"uppercase" }}>Outbound</div>
            {panelData.outbound.map(l=><LegRow key={l.id} leg={l} crewId={crewPanel.crewId} dir="outbound"/>)}
            <button onClick={()=>addLeg(crewPanel.crewId,"outbound")} style={{ ...S.btn(C.green), fontSize:10 }}>+ Outbound Leg</button>
          </div>
        </div>
      )}
      <div style={{ ...S.card, marginTop:12 }}>
        <div style={{ fontSize:11, color:C.textDim, letterSpacing:1, marginBottom:10, textTransform:"uppercase" }}>Edit Crew Details</div>
        {state.crew.map(c => (
          <div key={c.id} style={{ display:"grid", gridTemplateColumns:mob?"1fr 1fr":"1fr 1fr 1fr 30px", gap:6, marginBottom:4 }}>
            <input placeholder="Name"  value={c.name}  onChange={e=>updateCrewField(c.id,"name",e.target.value)}  style={S.input}/>
            <input placeholder="Role"  value={c.role}  onChange={e=>updateCrewField(c.id,"role",e.target.value)}  style={S.input}/>
            <input placeholder="Email" value={c.email} onChange={e=>updateCrewField(c.id,"email",e.target.value)} style={S.input}/>
            <button onClick={()=>update(s=>{s.crew=s.crew.filter(x=>x.id!==c.id);return s;})} style={{ ...S.btn(C.red), padding:"3px 6px" }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Budget Tab ───────────────────────────────────────────────────────────────
const Budget = () => {
  const { state, S, mob, shows, selectedShow, update } = useApp();
  const show = useMemo(() => shows.find(s=>s.id===selectedShow) || shows.find(s=>daysUntil(s.date)>=0), [shows, selectedShow]);
  if (!show) return <div style={{ padding:20, color:C.textDim }}>No upcoming shows</div>;
  const budget   = state.budgets?.[show.id] || { items:[], settlement:0 };
  const totalExp = budget.items.reduce((a,i)=>a+(i.amount||0),0);
  const net      = budget.settlement - totalExp;

  const addExpense    = () => { update(s=>{if(!s.budgets) s.budgets={};if(!s.budgets[show.id]) s.budgets[show.id]={items:[],settlement:0};s.budgets[show.id].items.push({id:uid(),category:"",description:"",amount:0,status:"pending"});return s;}); };
  const updateExpense = (eid,field,val) => { update(s=>{const item=s.budgets?.[show.id]?.items?.find(x=>x.id===eid);if(item) item[field]=field==="amount"?parseFloat(val)||0:val;return s;}); };
  const removeExpense = (eid) => { update(s=>{if(s.budgets?.[show.id]) s.budgets[show.id].items=s.budgets[show.id].items.filter(x=>x.id!==eid);return s;}); };
  const updateSettlement = (val) => { update(s=>{if(!s.budgets) s.budgets={};if(!s.budgets[show.id]) s.budgets[show.id]={items:[],settlement:0};s.budgets[show.id].settlement=parseFloat(val)||0;return s;}); };

  return (
    <div style={{ padding:20, maxWidth:900, margin:"0 auto" }}>
      <div style={{ display:"grid", gridTemplateColumns:mob?"1fr":"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
        <div style={S.card}><div style={{ fontSize:10, color:C.textDim, letterSpacing:1 }}>SETTLEMENT</div><input type="number" value={budget.settlement||""} onChange={e=>updateSettlement(e.target.value)} placeholder="0.00" style={{ ...S.input, fontSize:18, fontWeight:700, marginTop:4 }}/></div>
        <div style={{ ...S.card, textAlign:"center" }}><div style={{ fontSize:10, color:C.textDim, letterSpacing:1 }}>EXPENSES</div><div style={{ fontSize:22, fontWeight:700, color:C.red, marginTop:4 }}>${totalExp.toLocaleString()}</div></div>
        <div style={{ ...S.card, textAlign:"center" }}><div style={{ fontSize:10, color:C.textDim, letterSpacing:1 }}>NET</div><div style={{ fontSize:22, fontWeight:700, color:net>=0?C.green:C.red, marginTop:4 }}>${net.toLocaleString()}</div></div>
      </div>
      <div style={S.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={{ fontSize:11, color:C.textDim, letterSpacing:1, textTransform:"uppercase" }}>Expenses</div>
          <button onClick={addExpense} style={S.btn(C.accent)}>+ Expense</button>
        </div>
        {budget.items.map(item => (
          <div key={item.id} style={{ display:"grid", gridTemplateColumns:mob?"1fr 1fr":"120px 1fr 100px 90px 30px", gap:4, marginBottom:4 }}>
            <select value={item.category} onChange={e=>updateExpense(item.id,"category",e.target.value)} style={{ ...S.input, fontSize:11 }}>
              <option value="">Select</option>
              {["Audio","Lighting","Video","Lasers","Staging","Catering","Hotel","Ground","Flights","Merch","Bus/Truck","Crew","Misc"].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <input placeholder="Description" value={item.description} onChange={e=>updateExpense(item.id,"description",e.target.value)} style={S.input}/>
            <input type="number" placeholder="0.00" value={item.amount||""} onChange={e=>updateExpense(item.id,"amount",e.target.value)} style={S.input}/>
            <select value={item.status} onChange={e=>updateExpense(item.id,"status",e.target.value)} style={{ ...S.input, fontSize:11 }}>
              <option value="pending">Pending</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="invoiced">Invoiced</option>
            </select>
            <button onClick={()=>removeExpense(item.id)} style={{ ...S.btn(C.red), padding:"3px 6px" }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Settings Tab ─────────────────────────────────────────────────────────────
const Settings = () => {
  const { state, S, mob, showToast, refreshing, refreshIntel, shows, lastSaved, resetAll, dirty, update, session } = useApp();
  return (
    <div style={{ padding:20, maxWidth:600, margin:"0 auto" }}>
      <div style={S.card}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Data Management</div>
        <div style={{ fontSize:12, color:C.textDim, marginBottom:8 }}>Last saved: {lastSaved ? new Date(lastSaved).toLocaleString() : "Never"}</div>
        <div style={{ fontSize:12, color:C.textDim, marginBottom:16 }}>Shows: {state.shows.length} | Crew: {state.crew.length}</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button onClick={async()=>{dirty.current=true;const s={...state,lastSaved:new Date().toISOString()};await save(s);await saveSnap(buildSnap(s));showToast("Saved");}} style={S.btn(C.green)}>Force Save</button>
          <button onClick={resetAll} style={S.btn(C.red)}>Reset All Data</button>
        </div>
      </div>
      <div style={{ ...S.card, marginTop:12 }}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>Gmail Intel (MCP)</div>
        <div style={{ fontSize:12, color:C.textDim, marginBottom:12 }}>Refresh Intel scans Gmail via Claude API + MCP. Each refresh 10-20s. Results persist across sessions.</div>
        <button disabled={!!refreshing} onClick={async()=>{
          const upcoming=[...shows].filter(s=>{const d=daysUntil(s.date);return d>=0&&d<=30;});
          if(!upcoming.length){showToast("No shows within 30 days");return;}
          showToast(`Refreshing ${upcoming.length} shows...`);
          for(const s of upcoming){await refreshIntel(s);await new Promise(r=>setTimeout(r,2000));}
          showToast("All shows refreshed");
        }} style={{ ...S.btn(refreshing?C.textDim:C.green), opacity:refreshing?0.5:1 }}>
          {refreshing?"Scanning...":"Refresh All Shows (<30 days)"}
        </button>
      </div>
      <div style={{ ...S.card, marginTop:12 }}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>Account</div>
        <div style={{ fontSize:12, color:C.textDim, marginBottom:12 }}>
          Signed in as <span style={{ color:C.accent }}>{session?.user?.email}</span>.<br />
          Data is tied to this Google account and syncs across all devices automatically.
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); }} style={S.btn(C.red)}>Sign Out</button>
      </div>
      <div style={{ ...S.card, marginTop:12 }}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>Export</div>
        <div style={{ fontSize:12, color:C.textDim, marginBottom:12 }}>Copy current state as JSON for backup.</div>
        <button onClick={()=>{navigator.clipboard.writeText(JSON.stringify(state,null,2));showToast("Copied to clipboard");}} style={S.btn(C.accent)}>Copy State to Clipboard</button>
      </div>
      <div style={{ ...S.card, marginTop:12 }}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>Import</div>
        <textarea id="import-area" placeholder="Paste JSON here..." style={{ ...S.input, minHeight:80, marginBottom:8 }}/>
        <button onClick={()=>{try{const val=document.getElementById("import-area").value;const parsed=JSON.parse(val);if(parsed.shows&&parsed.crew){update(()=>parsed);showToast("Imported");}else showToast("Invalid format");}catch{showToast("Invalid JSON");}}} style={S.btn(C.green)}>Import State</button>
      </div>
    </div>
  );
};

// ─── Nav + ShowDropdown ───────────────────────────────────────────────────────
const TABS = [
  { id:"dashboard", label:"Dashboard" },
  { id:"advance",   label:"Advance" },
  { id:"crew",      label:"Crew & Travel" },
  { id:"budget",    label:"Budget" },
  { id:"settings",  label:"Settings" },
];

const ShowDropdown = () => {
  const { shows, selectedShow, setSelectedShow, setTab, mob, S } = useApp();
  const upcoming = useMemo(() => shows.filter(s=>daysUntil(s.date)>=-1), [shows]);
  return (
    <select value={selectedShow||""} onChange={e=>{const id=e.target.value||null;setSelectedShow(id);setTab("dashboard");}}
      style={{ background:"#1a1a28", border:`1px solid ${selectedShow?C.accent:C.border}`, color:selectedShow?C.accent:C.textDim, padding:"5px 8px", borderRadius:4, fontSize:11, fontWeight:600, cursor:"pointer", outline:"none", maxWidth:mob?"none":220, marginLeft:mob?0:"auto", marginRight:12, ...(mob?{flex:1,minWidth:0}:{}) }}>
      <option value="">All Shows</option>
      {upcoming.map(s=>{const d=daysUntil(s.date);return <option key={s.id} value={s.id}>{fmt(s.date)} {s.venue} ({d}d)</option>;})}
    </select>
  );
};

const Nav = () => {
  const { tab, setTab, S } = useApp();
  return (
    <nav style={S.nav}>
      <div style={{ padding:"10px 16px", fontWeight:800, fontSize:14, color:C.accent, letterSpacing:2, flexShrink:0 }}>DOS</div>
      {TABS.map(t => <button key={t.id} onClick={()=>setTab(t.id)} style={S.navBtn(tab===t.id)}>{t.label}</button>)}
      <ShowDropdown />
    </nav>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main App — state, effects, memos, context provider
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [state,       setState]      = useState(null);
  const [loading,     setLoading]    = useState(true);
  const [session,     setSession]    = useState(null);  // Supabase session
  const [authLoading, setAuthLoading] = useState(true); // waiting for initial auth check
  const [tab,         setTab]        = useState("dashboard");
  const [selectedShow,setSelectedShow] = useState(null);
  const [crewPanel,   setCrewPanel]  = useState(null);
  const [toast,       setToast]      = useState(null);
  const [lastSaved,   setLastSaved]  = useState(null); // Fix #5: separated from state
  const [refreshing,  setRefreshing] = useState(null);
  const [refreshLog,  setRefreshLog] = useState(null);
  const [logOpen,     setLogOpen]    = useState(false);
  const dirty = useRef(false);
  const mob   = useMobile();

  // Fix #3: styles memoized — only rebuild when mobile breakpoint changes
  const S = useMemo(() => makeStyles(mob), [mob]);

  // Fix #4: derived data memoized — only recompute when their specific slices change
  const shows = useMemo(
    () => [...(state?.shows||[])].sort((a,b) => a.date.localeCompare(b.date)),
    [state?.shows]
  );

  const advPctMap = useMemo(() => {
    const map = {};
    (state?.shows||[]).forEach(s => {
      const adv = (state?.advances||{})[s.id]||{};
      map[s.id] = Math.round((Object.values(adv).filter(Boolean).length / ADVANCE_ITEMS.length) * 100);
    });
    return map;
  }, [state?.advances, state?.shows]);

  const crewCountMap = useMemo(() => {
    const map = {};
    (state?.shows||[]).forEach(s => {
      const sc = (state?.showCrew||{})[s.id]||{};
      map[s.id] = Object.values(sc).filter(c=>c.attending).length;
    });
    return map;
  }, [state?.showCrew, state?.shows]);

  const activeShow = useMemo(
    () => selectedShow ? shows.find(s=>s.id===selectedShow) : null,
    [selectedShow, shows]
  );

  // ── Auth: listen for session changes ──────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Mount: load state + diff snapshot
  useEffect(() => {
    (async () => {
      const [saved, snap] = await Promise.all([load(), loadSnap()]);
      if (saved) {
        const sIds = new Set(saved.shows.map(s=>s.id));
        const cIds = new Set(saved.crew.map(c=>c.id));
        DEFAULT_SHOWS.forEach(s => { if(!sIds.has(s.id)) saved.shows.push(s); });
        DEFAULT_CREW.forEach(c  => { if(!cIds.has(c.id)) saved.crew.push(c); });
        if (!saved.missionControl) saved.missionControl = {};
        Object.entries(MC_SEED).forEach(([sid,mc]) => { if(!saved.missionControl[sid]) saved.missionControl[sid]=mc; });
        if (!saved.sessionHistory) saved.sessionHistory = [];

        const firstEntry = { ts:new Date().toISOString(), snapTs:null, summary:"First session — baseline recorded", changed:false, items:[] };
        saved.sessionHistory = snap
          ? [diffSnap(snap, saved), ...saved.sessionHistory].slice(0, 20)
          : [firstEntry, ...saved.sessionHistory].slice(0, 20);

        setLastSaved(saved.lastSaved || null);
        setState(saved);
      } else {
        const fresh = mkState();
        fresh.missionControl  = { ...MC_SEED };
        fresh.sessionHistory  = [{ ts:new Date().toISOString(), snapTs:null, summary:"First session — baseline recorded", changed:false, items:[] }];
        setLastSaved(null);
        setState(fresh);
      }
      await saveSnap(buildSnap(saved || mkState()));
      setLoading(false);
    })();
  }, []);

  // Fix #5: auto-save no longer calls setState — uses setLastSaved separately
  // This prevents the save effect from re-triggering itself
  useEffect(() => {
    if (!state || !dirty.current) return;
    const t = setTimeout(async () => {
      dirty.current = false;
      const ts = new Date().toISOString();
      const toSave = { ...state, lastSaved: ts };
      await save(toSave);
      await saveSnap(buildSnap(toSave));
      setLastSaved(ts);
    }, 800);
    return () => clearTimeout(t);
  }, [state]);

  // Fix #4: update uses proper one-level-deep copies to prevent mutation bleed
  const update = useCallback((fn) => {
    setState(prev => {
      const copy = {
        ...prev,
        shows:          [...(prev.shows||[])],
        crew:           [...(prev.crew||[])],
        advances:       { ...(prev.advances||{}) },
        showCrew:       { ...(prev.showCrew||{}) },
        budgets:        { ...(prev.budgets||{}) },
        notes:          { ...(prev.notes||{}) },
        contacts:       { ...(prev.contacts||{}) },
        missionControl: { ...(prev.missionControl||{}) },
      };
      const next = fn(copy);
      dirty.current = true;
      return next;
    });
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const goToShow = useCallback((showId) => {
    setSelectedShow(showId);
    setTab("dashboard");
  }, []);

  const resetAll = useCallback(async () => {
    if (!confirm("Reset all data? This cannot be undone.")) return;
    const fresh = mkState();
    await save(fresh);
    await saveSnap(buildSnap(fresh));
    setState(fresh);
    setLastSaved(null);
    showToast("All data reset");
  }, [showToast]);

  // Fix #6: refreshIntel as useCallback — stable reference, no stale closure on state
  // changeEntry is declared outside update() and set inside it (synchronous updater call)
  const refreshIntel = useCallback(async (show) => {
    if (refreshing) return;
    setRefreshing(show.id);
    showToast(`Scanning Gmail for ${show.venue}...`);

    const log = { showId:show.id, showName:show.venue, ts:new Date().toLocaleTimeString(), steps:[], raw:"" };
    const addStep = (label, status, detail="") => {
      log.steps = [...log.steps, { label, status, detail }];
      setRefreshLog({ ...log });
    };
    setRefreshLog({ ...log });
    setLogOpen(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { addStep("Auth","error","No active session"); setRefreshing(null); return; }

      const googleToken = session.provider_token;
      if (!googleToken) {
        addStep("Google token","error","Gmail token missing — sign out and sign back in");
        showToast("Re-sign in to refresh Gmail access");
        setRefreshing(null);
        return;
      }

      addStep("Auth","ok",`Signed in as ${session.user.email}`);
      addStep("API request","pending","POST /api/intel · Gmail + Anthropic");

      const resp = await fetch("/api/intel", {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${session.access_token}` },
        body: JSON.stringify({ show, googleToken }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        if (err.error === "gmail_token_expired") {
          addStep("Google token","error","Gmail token expired — sign out and sign back in");
          showToast("Gmail token expired — re-sign in");
        } else {
          addStep("API request","error",`HTTP ${resp.status}: ${err.error||resp.statusText}`);
          showToast(`API error: ${resp.status}`);
        }
        setRefreshing(null);
        return;
      }

      addStep("API request","ok",`HTTP ${resp.status}`);
      const data = await resp.json();
      addStep("Gmail search","ok",`${data.gmailThreadsFound||0} threads found`);

      log.raw = JSON.stringify(data.raw || data, null, 2);
      setRefreshLog({ ...log });

      const intel = data.intel;

      if (intel && intel.threads) {
        addStep("Structured data","ok",`${intel.threads.length} threads · ${intel.followUps?.length||0} follow-ups · ${intel.showContacts?.length||0} contacts`);

        let changeEntry = null;

        update(s => {
          const snap2 = { advances:{...(s.advances||{})}, showCrew:{...(s.showCrew||{})}, budgets:{...(s.budgets||{})}, notes:{...(s.notes||{})}, contacts:{...(s.contacts||{})} };
          const mc = { ...(s.missionControl||{}) };
          const existing = mc[show.id] || {};

          const seenTids = new Set();
          const dedupedThreads = [...(intel.threads||[]), ...(existing.threads||[])].filter(t => { if(seenTids.has(t.tid)) return false; seenTids.add(t.tid); return true; });
          const seenEmails = new Set();
          const dedupedContacts = [...(intel.showContacts||[]), ...(existing.showContacts||[])].filter(c => { const k=(c.email||c.name||"").toLowerCase(); if(seenEmails.has(k)) return false; seenEmails.add(k); return true; });
          const newFollowUps = intel.followUps || existing.followUps || [];
          const newSchedule  = (intel.schedule?.length>0) ? intel.schedule : (existing.schedule||[]);

          const diffItems = [];
          const existingTids = new Set((existing.threads||[]).map(t=>t.tid));
          dedupedThreads.forEach(t => { if(!existingTids.has(t.tid)) diffItems.push({type:"thread_new",label:(t.subject||"").slice(0,60),detail:`${t.intent||"?"} · ${t.from||"?"}`}); });
          (existing.threads||[]).forEach(old => { const upd=dedupedThreads.find(t=>t.tid===old.tid); if(upd&&upd.status!==old.status) diffItems.push({type:"thread_status",label:(old.subject||"").slice(0,50),detail:`${old.status} → ${upd.status}`}); });
          const existingActions = new Set((existing.followUps||[]).map(f=>f.action));
          newFollowUps.forEach(f => { if(!existingActions.has(f.action)) diffItems.push({type:"followup_new",label:(f.action||"?").slice(0,60),detail:`${f.priority} · ${f.owner}`}); });
          const prioOrd = {CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};
          (existing.followUps||[]).forEach(old => { const upd=newFollowUps.find(f=>f.action===old.action); if(upd&&(prioOrd[upd.priority]??4)<(prioOrd[old.priority]??4)) diffItems.push({type:"followup_escalated",label:(old.action||"?").slice(0,50),detail:`${old.priority} → ${upd.priority}`}); });
          const existingCKeys = new Set((existing.showContacts||[]).map(c=>(c.email||c.name||"").toLowerCase()));
          dedupedContacts.forEach(c => { const k=(c.email||c.name||"").toLowerCase(); if(!existingCKeys.has(k)) diffItems.push({type:"contact_new",label:c.name||"?",detail:c.role||""}); });
          if(newSchedule.length>(existing.schedule||[]).length) diffItems.push({type:"schedule_updated",label:"Schedule",detail:`${(existing.schedule||[]).length} → ${newSchedule.length} items`});

          const tc2 = {};
          diffItems.forEach(d => { tc2[d.type]=(tc2[d.type]||0)+1; });
          const parts = [
            tc2.thread_new&&`${tc2.thread_new} new thread${tc2.thread_new>1?"s":""}`,
            tc2.thread_status&&`${tc2.thread_status} status change${tc2.thread_status>1?"s":""}`,
            tc2.followup_new&&`${tc2.followup_new} new follow-up${tc2.followup_new>1?"s":""}`,
            tc2.followup_escalated&&`${tc2.followup_escalated} escalated`,
            tc2.contact_new&&`${tc2.contact_new} new contact${tc2.contact_new>1?"s":""}`,
            tc2.schedule_updated&&"schedule updated",
          ].filter(Boolean);

          changeEntry = { ts:new Date().toISOString(), summary:parts.length?parts.join(", "):"No changes detected", changed:parts.length>0, items:diffItems };
          const refreshHistory = [changeEntry, ...(existing.refreshHistory||[])].slice(0, 10);

          mc[show.id] = { threads:dedupedThreads, followUps:newFollowUps, showContacts:dedupedContacts, schedule:newSchedule, flights:existing.flights||[], lastRefreshed:new Date().toISOString(), refreshHistory };
          return { ...s, missionControl:mc, ...snap2 };
        });

        addStep("Merged to storage","ok","preserved: advances, showCrew, budgets, notes, contacts");
        addStep("Changes detected", changeEntry?.changed?"ok":"warn", changeEntry?.summary||"");
        showToast(`${show.venue}: ${changeEntry?.summary||"done"}`);
      } else {
        addStep("Structured data","error","intel null or missing threads — not saved");
        showToast("Intel received but could not parse structured data.");
      }
    } catch (err) {
      addStep("Fatal error","error",err.message);
      console.error("Refresh failed:", err);
      showToast(`Refresh failed: ${err.message}`);
    }
    setRefreshing(null);
  }, [refreshing, update, showToast]);


  // Context value — all consumers get stable refs for callbacks
  const ctx = useMemo(() => ({
    state, update, shows, activeShow,
    selectedShow, setSelectedShow,
    tab, setTab,
    mob, S,
    advPctMap, crewCountMap,
    refreshing, refreshIntel,
    refreshLog, logOpen, setLogOpen,
    crewPanel, setCrewPanel,
    showToast, goToShow,
    lastSaved, resetAll, dirty, session,
  }), [
    state, update, shows, activeShow,
    selectedShow, tab, mob, S,
    advPctMap, crewCountMap,
    refreshing, refreshIntel,
    refreshLog, logOpen,
    crewPanel,
    showToast, goToShow,
    lastSaved, resetAll,
  ]);

  // Auth gate
  if (authLoading) return (
    <div style={{ background:"#0a0a0f", height:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#8888a0", fontSize:13 }}>Loading...</div>
    </div>
  );
  if (!session) return <Login />;

  if (loading || !state) return (
    <div style={{ background:C.bg, color:C.text, height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"monospace" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:28, fontWeight:700, letterSpacing:2 }}>DOS</div>
        <div style={{ color:C.textDim, marginTop:8 }}>Loading session...</div>
      </div>
    </div>
  );

  return (
    <AppCtx.Provider value={ctx}>
      <div style={S.root}>
        <Nav />
        {tab === "dashboard" && <Dashboard />}
        {tab === "advance"   && <Advance />}
        {tab === "crew"      && <Crew />}
        {tab === "budget"    && <Budget />}
        {tab === "settings"  && <Settings />}
        {toast && <div style={S.toast}>{toast}</div>}
      </div>
    </AppCtx.Provider>
  );
}
