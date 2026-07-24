import { DOC_TYPE_META } from "./lib/files.js";
import { LEDGER_EDITABLE } from "./lib/finance.js";
import { HOTEL_STATUS_META, ROOM_STATUS_META } from "./lib/lodging.js";
import { FLEET_EXCEPTION_STATUS_KEY, FLEET_EXCEPTION_STATUSES, useFleetExceptionStatus, collectFleetExceptions } from "./lib/fleet.js";
import { MANIFEST_SEED, PROD_DEPTS, SEV_STYLES, POS_STYLES, VENUE_GRID, DESIGN_RIG, parseClearance, parseStageW, parseStageD, checkRigVsVenue } from "./lib/production.js";
import { STATUS_STYLE, statusStyle, FOCUS_CARRIERS, resKey, computeLayoverMins, fmtMins, getJourneyType, getLegLabel, groupByReservation, JOURNEY_BADGE, matchPaxToCrew } from "./lib/flights-view.js";
import { ScheduleTab } from "./components/schedule/ScheduleTab.jsx";
import { ROSTab } from "./components/schedule/ROSTab.jsx";
import { TransTab } from "./components/transport/TransTab.jsx";
import { DayScheduleView } from "./components/schedule/DayScheduleView.jsx";
import { TravelDayView } from "./components/transport/TravelDayView.jsx";
import { ProdTab } from "./components/production/ProdTab.jsx";
import { FlightsSection } from "./components/flights/FlightsSection.jsx";
import { FlightsListView } from "./components/flights/FlightsListView.jsx";
import { FlightDayStrip } from "./components/flights/FlightDayStrip.jsx";
import { AdvTab } from "./components/advance/AdvTab.jsx";
import { VenueBrief } from "./components/lodging/VenueBrief.jsx";
import { TourCalendar } from "./components/schedule/TourCalendar.jsx";
import { TopBar } from "./components/chrome/TopBar.jsx";
import { SegmentDrawer } from "./components/flights/SegmentDrawer.jsx";
import { ReservationGroup } from "./components/flights/ReservationGroup.jsx";
import { LodgingTab } from "./components/lodging/LodgingTab.jsx";
import { IntelPanel } from "./components/intel/IntelPanel.jsx";
import { GuestListTab } from "./components/guestlist/GuestListTab.jsx";
import { FlightCard } from "./components/flights/FlightCard.jsx";
import { FinTab } from "./components/finance/FinTab.jsx";
import { Dash } from "./components/dash/Dash.jsx";
import { CrossTab } from "./components/cross/CrossTab.jsx";
import { DailyDriveSessionsView } from "./components/transport/DailyDriveSessionsView.jsx";
import { CrewTab } from "./components/crew/CrewTab.jsx";
import { AllShowsDriveSessionsView } from "./components/transport/AllShowsDriveSessionsView.jsx";
import { AccessTab } from "./components/access/AccessTab.jsx";
import { VBSection } from "./components/lodging/VBSection.jsx";
import { VBRow } from "./components/lodging/VBRow.jsx";
import { UserMenu } from "./components/chrome/UserMenu.jsx";
import { ThemeToggle } from "./components/shared/ThemeToggle.jsx";
import { StatusBtn } from "./components/shared/StatusBtn.jsx";
import { SplitPartyTabs } from "./components/chrome/SplitPartyTabs.jsx";
import { SignOut } from "./components/shared/SignOut.jsx";
import { ShowPickerSheet } from "./components/chrome/ShowPickerSheet.jsx";
import { ReservationHeader } from "./components/flights/ReservationHeader.jsx";
import { PaxEditor } from "./components/flights/PaxEditor.jsx";
import { PH } from "./components/shared/PH.jsx";
import { NotesPanel } from "./components/notes/NotesPanel.jsx";
import { NavSidebar } from "./components/chrome/NavSidebar.jsx";
import { LodgingAllShows } from "./components/lodging/LodgingAllShows.jsx";
import { LifecyclePills } from "./components/crew/LifecyclePills.jsx";
import { IntelSection } from "./components/intel/IntelSection.jsx";
import { ImmigrationPanel } from "./components/production/ImmigrationPanel.jsx";
import { HotelFormModal } from "./components/lodging/HotelFormModal.jsx";
import { HotelCard } from "./components/lodging/HotelCard.jsx";
import { GuestListAllShows } from "./components/guestlist/GuestListAllShows.jsx";
import { GroupNotesTab } from "./components/notes/GroupNotesTab.jsx";
import { GLMetric } from "./components/guestlist/GLMetric.jsx";
import { FleetExceptionsView } from "./components/transport/FleetExceptionsView.jsx";
import { FinLedger } from "./components/finance/FinLedger.jsx";
import { FinEventsPanel } from "./components/finance/FinEventsPanel.jsx";
import { FileUploadModal } from "./components/chrome/FileUploadModal.jsx";
import { ExportModal } from "./components/chrome/ExportModal.jsx";
import { EventSwitcher } from "./components/chrome/EventSwitcher.jsx";
import { DriveSessionEditor } from "./components/transport/DriveSessionEditor.jsx";
import { DriveFlagChips } from "./components/transport/DriveFlagChips.jsx";
import { DateDrawer } from "./components/chrome/DateDrawer.jsx";
import { DashSingle } from "./components/dash/DashSingle.jsx";
import { CrewAllShows } from "./components/crew/CrewAllShows.jsx";
import { ContextBar } from "./components/chrome/ContextBar.jsx";
import { ConnectionPill } from "./components/shared/ConnectionPill.jsx";
import { CommentsReview } from "./components/comments/CommentsReview.jsx";
import { CommentPanel } from "./components/comments/CommentPanel.jsx";
import { CmdP } from "./components/chrome/CmdP.jsx";
import { BusDriveSessionTable } from "./components/transport/BusDriveSessionTable.jsx";
import { AnchorTimes } from "./components/schedule/AnchorTimes.jsx";
import { useMobile } from "./hooks/useMobile.jsx";
import { tokens, showIdFor, gmailUrl, STOP, textSimilar, deduplicateIntel, matchScore, confOf, suggestStatusFromThread, FIELD_KEYS, parseAllTimes, parseTimeStr, fmtMin, fmtAudit, DRIVE_FLAG_STYLE, computeDriveFlags } from "./lib/intel.js";
import { ALL_SHOWS, DEFAULT_ROS, RRX_ROS, CUSTOM_ROS_MAP, SPLIT_DAYS, resolvePartyCrew, parseDriveSessions, buildDraftSessions, DRIVE_KIND_STYLE } from "./lib/ros-data.js";
import { CLIENTS, CM, isClientOwner, ROLES, TABS, COMMENT_TARGETS, COMMENT_CATEGORIES, COMMENT_STATUSES, ADMIN_EMAIL, SESSION_ID, PERM_ROLES, PERM_SCHEMA, DEFAULT_PERMS, DEFAULT_CREW, AB, UI, DEPTS, DM, AT, SC, SC_CYCLE, SC_ORDER, IMM_TYPES, IMM_STATUS, PRE_STAGES, POST_STAGES, FIN_EVENT_TYPES, FIN_EVENT_STATUS, MN, describeScanError } from "./lib/domain-constants.js";
import { GL_DEFAULT_CATEGORIES, GL_STATUS, GL_PARTY_ROLES, GL_DEFAULT_SHOW, glNewId, GL_BUILTIN_TEMPLATE_ID, glBuiltinTemplate, glInitFromTemplate, glBuildTemplate, GL_ACTIVITY_CAP, glAppendActivity, glApplyTemplate } from "./lib/guestlist.js";
import { sG, sS, sGP, sSP } from "./lib/store-json.js";
import { crewLifecycleState, crewLifecycleSlots } from "./lib/lifecycle.js";
import { SEG_META, segType, segMeta, AIRPORT_BUFFERS, airportBufferMin, buildDayTimeline, lodgingModeFor } from "./lib/segments.js";
import { BUS_DATA, BUS_DATA_MAP, FLEET } from "./lib/tour-data.js";
import { flightItinKey, flightDedupKey, normFlightNo, isJunkFlightNo, flightRichness, cleanFlightsObj, FLIGHT_ENRICH_FIELDS, enrichFlight, findFlightMatch, tagFlightRoles, CITY_AIRPORTS, AIRPORT_TO_CITIES, cityKey, matchShowByAirport, findItineraryLegs, legGapMinutes, validateConnections, findReturnLeg, flightToLeg } from "./lib/flights.js";
import { icsEsc, icsDate, icsAddDay, buildICS, downloadICS } from "./lib/ics.js";
import { hhmmToMin, toM, fmt, pM, dU, fD, fW, fFull, fmt24, fmtDur, subtractMinutes, daysBetween } from "./lib/time.js";
import { Ctx } from "./context/DosContext.jsx";
import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { useAuth } from "./components/AuthGate.jsx";
import { track, EVENTS } from "./lib/analytics";
import { Button, Pill } from "./components/ui.jsx";
import { supabase } from "./lib/supabase";
import { T } from "./styles/tokens";
import { logAudit, setAuditIdentity } from "./lib/audit";
import {
  SK, PK,
  HOTEL_DEFAULT_CHECKIN, HOTEL_DEFAULT_CHECKOUT, HOTEL_TODOS_DEFAULT,
  TEAM, ROLE_LABEL, GUEST_ME, resolveMe, TEAM_MEMBERS, TM_EMAILS,
} from "./lib/constants";

// DOS TOUR OPS v7.0 — Day of Show, LLC
// Client-first · All dept advance lanes · Custom + editable items · Full settlement
// Group same-day flight legs by itinerary (confirmNo / bookingRef / pax signature) and tag
// each with role: final leg of a multi-leg chain = "arr", all prior legs = "dep". Single-leg
// groups stay "dep". Overnight arrivals (arrs) are always "arr".
// Normalize + deduplicate flights object in-place (same logic as dos-mt-sync/clean-flights.js).
// Returns a new object; does not mutate input.
// Extract a human-readable message from a scan-api error body.
// Server returns {error, anthropic:{type,message}, detail} JSON on 502; fall back to raw text.
// Merge fresh scan data into an existing flight, filling empty fields and unioning pax.
// Preserves user-set status/confirmedAt and non-empty suggestedCrewIds.
// Locate an existing record that matches a freshly scanned flight. Matches by tid first,
// then by flightNo among the tid's siblings, falling back to a null-flightNo sibling.
// Airport groups for tour show cities. One city → one-or-more IATA codes covering
// realistic crew routing (primary + common alternates). Extend as routes warrant.
Object.entries(CITY_AIRPORTS).forEach(([city,codes])=>{
  codes.forEach(c=>{(AIRPORT_TO_CITIES[c]=AIRPORT_TO_CITIES[c]||[]).push(city);});
});
// Match a flight endpoint (iata+date+city) to a tour show via geographic + chronological proximity.
// direction="inbound": show must occur on/after arrival (0..+7d). direction="outbound": show must
// occur on/before departure (-7..0d). Returns closest by date among geographic candidates, or null.
// A single flight can (and frequently does) match BOTH an outbound show (origin side) and an
// inbound show (destination side); callers run this twice, once per side.
// Assemble all legs (pending + confirmed) that share the same itinerary key as `f`, sorted chronologically.
// ── Journey sequencing helpers ───────────────────────────────────────────
// Compute gap in minutes between prior leg's arr and next leg's dep.
// Annotate legs with connection warnings. Returns [{leg, layover, warning}].
// warning ∈ {null, "tight-connection" (<60m same-airport), "missed-connection" (<0),
//            "long-layover" (>6h at interchange)}
// Find the return-half leg for a round-trip. Prefers explicit returnOfId, then
// journeyRef grouping, then reverse-route + same-pax heuristic.
// Build a chronological timeline of all travel events touching `date`. daySegs
// is the caller-scoped list of segments (already filtered by party). lodging is
// the separate lodging store; check-ins/outs on `date` become timeline entries.
// Each entry: {kind, seg, label, start, end, from, to, gapBefore, warning}.
// start/end are HH:MM strings; gapBefore is minutes since previous entry's end.
// ── Segment model (unified travel store) ───────────────────────────────────
// The `flights` store widens into a generic segments store: each record has a `type`
// ∈ {air, ground, bus, rail, sea, hotel}. Legacy records (no type) are implicitly "air".
// Ground/bus/etc. segments share the air shape with different fields populated:
//   air:    flightNo, carrier, from/to (IATA), fromCity/toCity, dep/arr, pax
//   ground: mode (uber|drive|taxi|lyft|rideshare|friend), provider, from/to (labels or
//           addresses), fromCity/toCity, dep/arr, pax, distance, duration
//   bus:    carrier, from/to, dep/arr, pax, route
//   rail:   carrier, trainNo, from/to, dep/arr, pax
//   hotel:  hotelName, from (address), checkIn/checkOut dates, pax
// Airport check-in buffers in minutes before scheduled departure. Split by
// with-checked-bag vs carry-on-only. Override per segment via seg.airportBuffer.
// Subtract `mins` from "HH:MM" and return "HH:MM" (wraps into negative = previous day warning separately).
// ── Lodging-mode inference ────────────────────────────────────────────────
// Bus dates: crew sleep on the Pieter Smit nightliner; hotel rooms are not needed
// (artist may take one off-day; tracked separately). Any date in BUS_DATA_MAP with
// a show or travel entry is treated as "bus". Everything else (Red Rocks, NA summer,
// post-EU one-offs) is "hotel" — requires room + airport/hotel/venue ground chain.
// Classify a crew member's role on a given show date based on their attending
// history: bus-mid (middle of the bus run — on bus, no segments expected),
// bus-join (first bus day, needs inbound air + ground to bus),
// bus-leave (last bus day, needs ground to airport + outbound air),
// bus-solo (attending only one bus day — effectively treat like one-off bus),
// fly-one-off (standalone fly-in/fly-out show with hotel).
// Given a lifecycle state + the data, return an ordered list of lifecycle slots for
// rendering. Each slot: {key, icon, label, state: "ok"|"missing"|"na"|"unknown"}.
// "ok" = segment present; "missing" = expected but not found; "na" = not applicable
// (e.g. hotel slot on a bus-mid day); "unknown" = segment is not tracked as a
// distinct record (hotel stays without a check-in record).
// Serialize a flight record into the compact leg shape used in showCrew.
// locked:true = status only, question immutable | locked:false/undefined = editable
// Immigration entity — country-scoped, spans multiple shows.
// Lifecycle: not_started → in_progress → submitted → received → approved (or rejected).
// Financial events — distinct timelines per event. Settlement lands same-night,
// wire can arrive T+45, withholding triggers T+30. Modeling as independent events
// avoids status collisions on a single show-level record.
// iCalendar export: build a VCALENDAR with all-day VEVENTs for each tour day.
// Touring fleet — referenced by parking advances, ferry/tunnel fare class,
// and EU toll category. Update when job IDs or bus length land.
// BUS_DATA keyed by ISO date for fast lookup (Day 1 = 2026-05-02)
// Parse a bus-day note string into a structured drive-session table.
// Handles common patterns: S1/S2/S3 sessions, EC561 breaks, ferry/Le Shuttle
// crossings, RP rest periods, ETA arrival, and prefatory notes (MD/DD).
// Build a draft of the drive-session table from a calculated route result.
// Splits driving time at EC561 boundaries (45min break after every 4.5h
// driving) and includes a final ETA row. Distances are pro-rated by time.
// Color theme per row kind
// Split days: touring party divides across simultaneous events
// ── Intel deduplication ──────────────────────────────────────────────────────
// Runs after every scan/import. Normalizes and fuzzy-matches todos, followUps,
// and threads so repeated scans don't accumulate near-identical entries.
// Suggest advance status from thread subject+snippet. Returns {status, reason} or null.
// Operational flags computed from a bus-day entry. Pure derivation from
// existing fields (entry.flag, entry.note, entry.drive, entry.show) — no data
// model change. Promote to first-class fields on busEdits[iso] later if a
// flag becomes a mutation point.
// Tabular drive-session presentation. Used in both the ROS bus-row expansion
// and the Logistics travel-day Bus Schedule context card. Optionally accepts
// a pre-built `sessions` prop (e.g., a calculated draft) overriding the
// parser; in that case the entry only needs route/km/drive/dep/arr.

export default function App(){
  const auth=useAuth();
  const me=useMemo(()=>resolveMe(auth?.user?.email),[auth?.user?.email]);
  useEffect(()=>{setAuditIdentity({role:me.role,userKey:me.id});},[me.role,me.id]);
  const[tab,setTab]=useState("advance");
  const[role,setRole]=useState("viewer");
  const[aC,setAC]=useState("bbn");
  const[shows,setShows]=useState(null);
  const[ros,setRos]=useState({});
  const[advances,setAdvances]=useState({});
  const[finance,setFinance]=useState({});
  const[sel,setSel]=useState(ALL_SHOWS[0].date);
  const[cmd,setCmd]=useState(false);
  const[loaded,setLoaded]=useState(false);
  const[ss,setSs]=useState("");
  const[notesPriv,setNotesPriv]=useState({});
  const[checkPriv,setCheckPriv]=useState({});
  const[intel,setIntel]=useState({});
  const[labelIntel,setLabelIntel]=useState(null);
  const[refreshing,setRefreshing]=useState(null);
  const[crew,setCrew]=useState(DEFAULT_CREW);
  const[showCrew,setShowCrew]=useState({});
  const[production,setProduction]=useState({});
  const[tabOrder,setTabOrder]=useState(null);
  const[flights,setFlights]=useState({});
  const[lodging,setLodging]=useState({});
  const[guestlists,setGuestlists]=useState({});
  const[glTemplates,setGlTemplates]=useState({});
  const[immigration,setImmigration]=useState({});
  const[refreshMsg,setRefreshMsg]=useState("");
  const[selEventId,setSelEventId]=useState(null);
  // Reset sub-event selection whenever the selected day changes
  const prevSel=useRef(sel);
  useEffect(()=>{if(prevSel.current!==sel){setSelEventId(null);prevSel.current=sel;}},[sel]);
  const[exp,setExp]=useState(false);
  const[uploadOpen,setUploadOpen]=useState(false);
  const[undoToast,setUndoToast]=useState(null);
  const[dateMenu,setDateMenu]=useState(false);
  const[showOffDays,setShowOffDays]=useState(true);
  const[sidebarOpen,setSidebarOpen]=useState(true);
  const[transView,setTransView]=useState("travel");
  const[allShows,setAllShowsState]=useState(false);
  const setAllShows=useCallback(v=>setAllShowsState(typeof v==="function"?v:!!v),[]);
  // Per-date active split-party id. Absent entries fall back to the first party.
  const[splitParty,setSplitPartyState]=useState({});
  const setSplitParty=useCallback((date,partyId)=>setSplitPartyState(p=>({...p,[date]:partyId})),[]);
  const effectiveSplitDays=useMemo(()=>{
    const out={};
    Object.entries(SPLIT_DAYS).forEach(([date,split])=>{
      out[date]={...split,parties:split.parties.map(p=>{const resolved=resolvePartyCrew(date,p.id,showCrew,crew);return resolved?{...p,crew:resolved}:p;})};
    });
    return out;
  },[showCrew,crew]);
  const currentSplit=effectiveSplitDays[sel]||null;
  const activeSplitPartyId=currentSplit?(splitParty[sel]||currentSplit.parties[0].id):null;
  const activeSplitParty=currentSplit?currentSplit.parties.find(p=>p.id===activeSplitPartyId):null;
  const[tourStart,setTourStart]=useState("2026-04-01");
  const[tourEnd,setTourEnd]=useState("2026-06-30");
  const[lastFlightScanAt,setLastFlightScanAt]=useState(null);
  const[perms,setPerms]=useState(DEFAULT_PERMS);
  const uPerms=useCallback((permId,roleId,val)=>setPerms(p=>({...p,[permId]:{...p[permId],[roleId]:val}})),[]);
  const[userTypes,setUserTypes]=useState([]);
  const[userAssignments,setUserAssignments]=useState({});
  const addUserType=useCallback((label)=>{
    const trimmed=(label||"").trim();if(!trimmed)return null;
    const id=`u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,5)}`;
    setUserTypes(p=>[...p,{id,label:trimmed}]);
    setPerms(p=>{const n={...p};Object.keys(n).forEach(k=>{n[k]={...n[k],[id]:true};});return n;});
    return id;
  },[]);
  const renameUserType=useCallback((id,label)=>{
    const trimmed=(label||"").trim();if(!trimmed)return;
    setUserTypes(p=>p.map(t=>t.id===id?{...t,label:trimmed}:t));
  },[]);
  const removeUserType=useCallback((id)=>{
    setUserTypes(p=>p.filter(t=>t.id!==id));
    setPerms(p=>{const n={};Object.entries(p).forEach(([k,v])=>{const{[id]:_,...rest}=v;n[k]=rest;});return n;});
    setUserAssignments(p=>{const n={};Object.entries(p).forEach(([k,v])=>{if(v!==id)n[k]=v;});return n;});
  },[]);
  const setUserAssignment=useCallback((email,roleId)=>{
    const e=(email||"").trim().toLowerCase();if(!e)return;
    setUserAssignments(p=>({...p,[e]:roleId}));
  },[]);
  const removeUserAssignment=useCallback((email)=>{
    const e=(email||"").trim().toLowerCase();if(!e)return;
    setUserAssignments(p=>{const{[e]:_,...rest}=p;return rest;});
  },[]);
  const[commentMode,setCommentMode]=useState(false);
  const[showPickerOpen,setShowPickerOpen]=useState(false);
  const[busEdits,setBusEdits]=useState({});
  const uBusEdit=useCallback((iso,fields)=>setBusEdits(p=>{if(fields===null){const n={...p};delete n[iso];return n;}return{...p,[iso]:{...(p[iso]||{}),...fields}};}),[]);
  const[groupNotes,setGroupNotes]=useState({});
  const uGroupNote=useCallback((id,note)=>setGroupNotes(p=>note===null?(({[id]:_,...r})=>r)(p):{...p,[id]:note}),[]);
  const[actLog,setActLog]=useState([]);
  const addActLog=useCallback((event)=>setActLog(p=>{const next=[...p,{...event,ts:new Date().toISOString(),session:SESSION_ID}];return next.length>2000?next.slice(-2000):next;}),[]);
  const mobile=useMobile();
  const st=useRef(null);const stp=useRef(null);

  useEffect(()=>{(async()=>{
    const[s,r,a,f,se,cr,pr,fl,lo,gl,glt,im,pe,be,ut,gn]=await Promise.all([sG(SK.SHOWS),sG(SK.ROS),sG(SK.ADVANCES),sG(SK.FINANCE),sG(SK.SETTINGS),sG(SK.CREW),sG(SK.PRODUCTION),sG(SK.FLIGHTS),sG(SK.LODGING),sG(SK.GUESTLISTS),sG(SK.GL_TEMPLATES),sG(SK.IMMIGRATION),sG(SK.PERMISSIONS),sG(SK.BUS_EDITS),sG(SK.USER_TYPES),sG(SK.GROUP_NOTES)]);
    const init=ALL_SHOWS.reduce((acc,sh)=>{acc[sh.date]={...sh,doorsConfirmed:false,curfewConfirmed:false,busArriveConfirmed:false,crewCallConfirmed:false,venueAccessConfirmed:false,mgTimeConfirmed:false,etaSource:"schedule",lastModified:Date.now()};return acc;},{});
    const merged={...init};if(s)Object.keys(s).forEach(k=>{merged[k]=merged[k]?{...merged[k],...s[k]}:{...s[k]};});
    setShows(merged);setRos(r||{});setAdvances(a||{});setFinance(f||{});
    if(se?.role)setRole(se.role);if(se?.tab&&se.tab!=="dashboard")setTab(se.tab);if(se?.sel)setSel(se.sel);if(se?.aC)setAC(se.aC);
    if(Array.isArray(se?.tabOrder))setTabOrder(se.tabOrder);
    if(se?.showOffDays!==undefined)setShowOffDays(se.showOffDays);
    if(se?.sidebarOpen!==undefined)setSidebarOpen(se.sidebarOpen);
    if(se?.allShows!==undefined)setAllShowsState(se.allShows);
    if(se?.tourStart)setTourStart(se.tourStart);if(se?.tourEnd)setTourEnd(se.tourEnd);
    if(se?.lastFlightScanAt)setLastFlightScanAt(se.lastFlightScanAt);
    if(cr?.crew)setCrew(cr.crew);if(cr?.showCrew)setShowCrew(cr.showCrew);
    setProduction(pr||{});setFlights(fl||{});setLodging(lo||{});setGuestlists(gl||{});setGlTemplates(glt||{});setImmigration(im||{});if(be)setBusEdits(be);if(pe)setPerms(p=>({...DEFAULT_PERMS,...pe,...Object.fromEntries(Object.entries(DEFAULT_PERMS).map(([k,v])=>([k,{...v,...(pe[k]||{})}])))}));
    if(ut?.userTypes)setUserTypes(ut.userTypes);
    if(ut?.assignments)setUserAssignments(ut.assignments);
    if(gn)setGroupNotes(gn);
    const myEmail=(auth?.user?.email||"").toLowerCase();
    const assignedRole=ut?.assignments?.[myEmail];
    if(assignedRole)setRole(assignedRole);
    else if(me.id==="guest"&&!TM_EMAILS.has(myEmail))setRole("viewer");
    const[np,cp,it,al]=await Promise.all([sGP(PK.NOTES_PRIV),sGP(PK.CHECKLIST_PRIV),sGP(PK.INTEL),sGP(PK.ACTLOG)]);
    setNotesPriv(np||{});setCheckPriv(cp||{});setIntel(it||{});if(Array.isArray(al))setActLog(al);
    setLoaded(true);
  })()},[]);

  useEffect(()=>{if(!loaded)return;if(stp.current)clearTimeout(stp.current);stp.current=setTimeout(()=>{sSP(PK.NOTES_PRIV,notesPriv);sSP(PK.CHECKLIST_PRIV,checkPriv);sSP(PK.INTEL,intel);sSP(PK.ACTLOG,actLog);},600);},[notesPriv,checkPriv,intel,actLog,loaded]);
  const uNotesPriv=useCallback((d,arr)=>setNotesPriv(p=>({...p,[d]:arr})),[]);
  const uCheckPriv=useCallback((d,arr)=>setCheckPriv(p=>({...p,[d]:arr})),[]);

  useEffect(()=>{if(!undoToast)return;const t=setTimeout(()=>setUndoToast(null),30000);return()=>clearTimeout(t);},[undoToast]);
  const pushUndo=useCallback((label,undo)=>setUndoToast({label,undo,ts:Date.now()}),[]);

  useEffect(()=>{
    const tabMap={a:"advance",f:"finance",s:"ros",t:"transport",c:"crew",g:"guestlist",d:"dash"};
    const handler=e=>{
      const tgt=e.target.tagName;
      if(tgt==="INPUT"||tgt==="TEXTAREA"||e.metaKey||e.ctrlKey||e.altKey)return;
      if(tabMap[e.key]){setTab(tabMap[e.key]);return;}
      if(e.key==="ArrowLeft"||e.key==="ArrowRight"){
        setSel(prev=>{
          const list=Object.values(shows||{}).sort((a,b)=>a.date.localeCompare(b.date));
          const idx=list.findIndex(s=>s.date===prev);
          if(idx<0)return prev;
          const ni=idx+(e.key==="ArrowRight"?1:-1);
          return(ni>=0&&ni<list.length)?list[ni].date:prev;
        });
      }
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[shows,setTab,setSel]);

  useEffect(()=>{
    if(!loaded)return;
    const confirmed=Object.values(flights||{}).filter(f=>f&&f.status==="confirmed"&&f.suggestedShowDate&&f.suggestedRole&&Array.isArray(f.suggestedCrewIds)&&f.suggestedCrewIds.length>0);
    if(!confirmed.length)return;
    setShowCrew(p=>{
      let next=p;
      for(const f of confirmed){
        const dir=f.suggestedRole;
        const baseDate=f.suggestedShowDate;
        const dateKey=f.partyId&&SPLIT_DAYS[baseDate]?`${baseDate}#${f.partyId}`:baseDate;
        const leg={id:`leg_${f.id}`,flight:f.flightNo||"",carrier:f.carrier||"",from:f.from,fromCity:f.fromCity||f.from,to:f.to,toCity:f.toCity||f.to,depart:f.dep,arrive:f.arr,conf:f.confirmNo||f.bookingRef||"",status:"confirmed",flightId:f.id,autoPopulated:true};
        const confKey=dir==="inbound"?"inboundConfirmed":"outboundConfirmed";
        const dateField=dir==="inbound"?"inboundDate":"outboundDate";
        const timeField=dir==="inbound"?"inboundTime":"outboundTime";
        const timeVal=dir==="inbound"?f.arr:f.dep;
        const dateVal=dir==="inbound"?(f.arrDate||baseDate):f.depDate;
        for(const crewId of f.suggestedCrewIds){
          const cur=(next[dateKey]||{})[crewId]||{};
          if(cur.attending===false)continue;
          const existing=(cur[dir]||[]);
          if(existing.some(l=>l.flightId===f.id))continue;
          const modeKey=dir==="inbound"?"inboundMode":"outboundMode";
          next={...next,[dateKey]:{...next[dateKey],[crewId]:{...cur,attending:true,[modeKey]:cur[modeKey]||"fly",[dir]:[...existing,leg],[confKey]:true,[dateField]:dateVal,[timeField]:timeVal||""}}};
        }
      }
      return next;
    });
  },[flights,loaded]);

  const refreshIntel=useCallback(async(show,force=false)=>{
    if(refreshing)return;
    const sid=showIdFor(show);
    const t0=Date.now();
    addActLog({module:"intel",action:"intel.scan.start",target:{type:"show",id:sid,label:show.venue},payload:{trigger:force?"manual":"background"},context:{date:show.date,showId:sid,eventKey:sid}});
    setRefreshing(sid);setRefreshMsg(`Scanning Gmail for ${show.venue}…`);
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){setRefreshMsg("No active session");return;}
      const googleToken=session.provider_token;
      if(!googleToken){setRefreshMsg("Gmail token missing — sign out and back in");return;}
      const ac1=new AbortController();const t1=setTimeout(()=>ac1.abort(),110000);
      let resp;try{resp=await fetch("/api/intel",{method:"POST",signal:ac1.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({show,googleToken,forceRefresh:force,userEmail:session.user?.email})});}finally{clearTimeout(t1);}
      if(!resp.ok){const err=await resp.json().catch(()=>({}));const msg=err.error==="gmail_token_expired"?"gmail_token_expired":`http_${resp.status}`;addActLog({module:"intel",action:"intel.scan.error",target:{type:"show",id:sid,label:show.venue},payload:{status:resp.status,message:msg},context:{date:show.date,showId:sid,eventKey:sid}});setRefreshMsg(err.error==="gmail_token_expired"?"Gmail token expired — re-sign in":`Error: ${resp.status}`);return;}
      const data=await resp.json();const ni=data.intel;
      if(!ni||!ni.threads){
        const hint=data.debug?.stopReason==="max_tokens"?" (response truncated — too many threads)":data.debug?.rawText?` — raw: ${data.debug.rawText.slice(0,120)}`:"";
        addActLog({module:"intel",action:"intel.scan.error",target:{type:"show",id:sid,label:show.venue},payload:{status:0,message:"no_structured_intel"},context:{date:show.date,showId:sid,eventKey:sid}});
        setRefreshMsg(`No structured intel returned${hint}`);
        console.error("[intel] debug:",data.debug);
        return;
      }
      // H-004 signal: scan count per user per week. Counts/enums only — no venue, no content.
      track(EVENTS.INTEL_SCAN,{trigger:force?"manual":"background",mode:"single",thread_count:(ni.threads||[]).length});
      setIntel(p=>{
        const existing=p[sid]||{};
        const seenT=new Set();
        const threads=[...(ni.threads||[]),...(existing.threads||[])].filter(t=>{if(seenT.has(t.tid))return false;seenT.add(t.tid);return true;});
        const seenE=new Set();
        const contacts=[...(ni.showContacts||[]),...(existing.showContacts||[])].filter(c=>{const k=(c.email||c.name||"").toLowerCase();if(seenE.has(k))return false;seenE.add(k);return true;});
        const newTodos=(ni.followUps||[]).map(f=>({id:`t${Date.now()}_${Math.random().toString(36).slice(2,7)}`,text:f.action,owner:f.owner,priority:f.priority,deadline:f.deadline,threadTid:f.tid||null,done:false,ts:Date.now()}));
        const newTidByText=new Map(newTodos.filter(t=>t.threadTid).map(t=>[t.text,t.threadTid]));
        const merged=(existing.todos||[]).map(t=>(!t.threadTid&&newTidByText.has(t.text))?{...t,threadTid:newTidByText.get(t.text)}:t);
        const mergedTexts=new Set(merged.map(t=>t.text));
        const todos=[...merged,...newTodos.filter(t=>!mergedTexts.has(t.text))];
        const prevFuTexts=new Set((existing.followUps||[]).map(f=>f.action));
        const newFuTexts=new Set((ni.followUps||[]).map(f=>f.action));
        const ts=new Date().toISOString();
        const scanEntries=[
          ...(ni.followUps||[]).filter(f=>!prevFuTexts.has(f.action)).map(f=>({ts,type:"scan",section:"followup",showId:sid,action:"added",label:f.action,from:"scan"})),
          ...(existing.followUps||[]).filter(f=>!newFuTexts.has(f.action)).map(f=>({ts,type:"scan",section:"followup",showId:sid,action:"removed",label:f.action,from:"scan"})),
        ];
        const changelog=[...(p.__changelog||[]).slice(-Math.max(1,499-scanEntries.length)),...scanEntries];
        // Merge follow-ups by action text — preserve done/ignored marks across scans.
        // Reopen only when the source thread has new activity AND content has actually
        // changed (subject diverged, or latest snippet differs from snapshot). Threads
        // can carry many items; a "thanks!" reply on the same thread shouldn't reopen
        // an unrelated dismissed action — we require substantive content change.
        const newFuByAction=new Map((ni.followUps||[]).map(f=>[f.action,f]));
        const threadFor=tid=>(ni.threads||[]).find(x=>x.tid===tid||x.id===tid)||null;
        const computeReopenReason=(snap,t)=>{
          if(!snap?.markedAt||!t)return null;
          if(!t.date||!snap.markedThreadDate)return null;
          if(new Date(t.date)<=new Date(snap.markedThreadDate))return null; // no new activity
          if(snap.markedSubject&&t.subject&&snap.markedSubject!==t.subject)return "subject changed";
          if(snap.markedSnippet&&t.snippet&&snap.markedSnippet!==t.snippet)return "new reply";
          return null; // thread date moved but visible content unchanged → likely benign
        };
        const mergedFu=(existing.followUps||[]).map(f=>{
          const fresh=newFuByAction.get(f.action);
          if(!fresh)return f; // dismissed item that no longer surfaces — keep state as-is
          const merged={...fresh,done:f.done||false,ignored:f.ignored||false,markedAt:f.markedAt||null,markedThreadDate:f.markedThreadDate||null,markedSnippet:f.markedSnippet||null,markedSubject:f.markedSubject||null,reopened:false,reopenReason:null};
          if(f.done||f.ignored){
            const reason=computeReopenReason(f,threadFor(merged.tid));
            if(reason){merged.reopened=true;merged.reopenReason=reason;}
          }
          return merged;
        });
        const mergedFuActions=new Set(mergedFu.map(f=>f.action));
        const finalFu=[...mergedFu,...(ni.followUps||[]).filter(f=>!mergedFuActions.has(f.action))];
        // Same content-change protocol for todos backed by a Gmail thread.
        const finalTodos=todos.map(t=>{
          if(!(t.done||t.ignored)||!t.markedAt||!t.threadTid)return{...t,reopened:t.reopened||false,reopenReason:t.reopenReason||null};
          const reason=computeReopenReason(t,threadFor(t.threadTid));
          return reason?{...t,reopened:true,reopenReason:reason}:{...t,reopened:false,reopenReason:null};
        });
        const merged2=deduplicateIntel({threads,followUps:finalFu,showContacts:contacts,schedule:ni.schedule||existing.schedule||[],todos:finalTodos,matches:existing.matches||[],dismissedFlags:existing.dismissedFlags||[],arStatus:existing.arStatus||{},lastRefreshed:new Date().toISOString(),isShared:data.isShared||false,sharedByOthers:data.sharedByOthers||[],_partial:!!ni._partial});
        return{...p,__changelog:changelog,[sid]:merged2};
      });
      addActLog({module:"intel",action:"intel.scan.complete",target:{type:"show",id:sid,label:show.venue},payload:{threads:(ni.threads||[]).length,todos:(ni.followUps||[]).length,followUps:(ni.followUps||[]).length,actionRequired:0,durationMs:Date.now()-t0},context:{date:show.date,showId:sid,eventKey:sid}});
      setRefreshMsg(`${show.venue}: ${data.gmailThreadsFound||0} threads`);
      setTimeout(()=>setRefreshMsg(""),3500);
    }catch(e){addActLog({module:"intel",action:"intel.scan.error",target:{type:"show",id:sid,label:show.venue},payload:{status:0,message:e.message},context:{date:show.date,showId:sid,eventKey:sid}});setRefreshMsg(`Refresh failed: ${e.message}`);}
    finally{setRefreshing(null);}
  },[refreshing,addActLog]);

  const toggleIntelShare=useCallback(async(show,share)=>{
    const sid=showIdFor(show);
    const{data:{session}}=await supabase.auth.getSession();
    if(!session)return;
    const ac2=new AbortController();const t2=setTimeout(()=>ac2.abort(),30000);
    try{await fetch("/api/intel",{method:"POST",signal:ac2.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:"toggleShare",show,isShared:share})});}finally{clearTimeout(t2);}
    setIntel(p=>({...p,[sid]:{...(p[sid]||{}),isShared:share}}));
  },[]);

  const refreshLabelIntel=useCallback(async(force=false)=>{
    const t0l=Date.now();
    addActLog({module:"intel",action:"intel.scan.start",target:{type:"label",id:"bulk",label:"label scan"},payload:{trigger:force?"manual":"background"},context:{date:null,showId:null,eventKey:null}});
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session?.provider_token)return;
      const showsArr=Object.values(shows||{}).filter(s=>s.clientId===aC);
      const authHeaders={"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`};
      const ac3=new AbortController();const t3=setTimeout(()=>ac3.abort(),110000);
      let resp;try{resp=await fetch("/api/intel",{method:"POST",signal:ac3.signal,headers:authHeaders,body:JSON.stringify({action:"bulkFetch",shows:showsArr,googleToken:session.provider_token,forceRefresh:force,userEmail:session.user?.email})});}finally{clearTimeout(t3);}
      if(!resp.ok)return;
      const data=await resp.json();
      if(data.classifyDebug)console.log("[intel.classify] debug:",data.classifyDebug);
      setLabelIntel(prev=>{
        const prevAr=prev?.actionRequired||[];
        const prevIds=new Set(prevAr.map(i=>i.id));
        const newAr=data.actionRequired||[];
        const newIds=new Set(newAr.map(i=>i.id));
        const ts=new Date().toISOString();
        const scanEntries=[
          ...newAr.filter(i=>!prevIds.has(i.id)).map(i=>({ts,type:"scan",section:"ar",showId:i.showId||null,action:"added",label:i.subject,from:"scan"})),
          ...prevAr.filter(i=>!newIds.has(i.id)).map(i=>({ts,type:"scan",section:"ar",showId:i.showId||null,action:"removed",label:i.subject,from:"scan"})),
        ];
        if(scanEntries.length){
          setIntel(p=>({...p,__changelog:[...(p.__changelog||[]).slice(-Math.max(1,499-scanEntries.length)),...scanEntries]}));
        }
        return data;
      });
      if(data.byShow){
        setIntel(prev=>{
          const next={...prev};
          for(const[sid,tids]of Object.entries(data.byShow)){
            const existing=next[sid]||{};
            const seenTids=new Set((existing.threads||[]).map(t=>t.tid||t.id));
            const allItems=[...(data.settlements||[]),...(data.crewFlights||[]),...(data.advanceItems||[]),...(data.actionRequired||[])];
            const newStubs=tids.filter(tid=>!seenTids.has(tid)).map(tid=>{
              const found=allItems.find(t=>t.id===tid);
              return found?{tid:found.id,subject:found.subject,from:found.from,date:found.date,snippet:found.snippet,fromLabelScan:true,intent:"MISC"}:{tid,fromLabelScan:true,subject:"",from:"",intent:"MISC"};
            });
            if(newStubs.length)next[sid]=deduplicateIntel({...existing,threads:[...(existing.threads||[]),...newStubs]});
          }
          return next;
        });
      }
      addActLog({module:"intel",action:"intel.scan.complete",target:{type:"label",id:"bulk",label:"label scan"},payload:{actionRequired:(data.actionRequired||[]).length,durationMs:Date.now()-t0l},context:{date:null,showId:null,eventKey:null}});
    }catch(e){addActLog({module:"intel",action:"intel.scan.error",target:{type:"label",id:"bulk",label:"label scan"},payload:{status:0,message:e.message},context:{date:null,showId:null,eventKey:null}});console.error("[labelScan]",e.message);}
  },[shows,aC,addActLog]);

  const addLog=useCallback((entry)=>{
    setIntel(p=>({...p,__changelog:[...(p.__changelog||[]).slice(-499),{ts:new Date().toISOString(),...entry}]}));
  },[setIntel]);

  const save=useCallback(()=>{
    if(!loaded)return;if(st.current)clearTimeout(st.current);
    st.current=setTimeout(async()=>{setSs("saving");await Promise.all([sS(SK.SHOWS,shows),sS(SK.ROS,ros),sS(SK.ADVANCES,advances),sS(SK.FINANCE,finance),sS(SK.SETTINGS,{role,tab,sel,aC,tabOrder,showOffDays,sidebarOpen,tourStart,tourEnd,lastFlightScanAt,allShows}),sS(SK.CREW,{crew,showCrew}),sS(SK.PRODUCTION,production),sS(SK.FLIGHTS,flights),sS(SK.LODGING,lodging),sS(SK.GUESTLISTS,guestlists),sS(SK.GL_TEMPLATES,glTemplates),sS(SK.IMMIGRATION,immigration),sS(SK.PERMISSIONS,perms),sS(SK.BUS_EDITS,busEdits),sS(SK.USER_TYPES,{userTypes,assignments:userAssignments}),sS(SK.GROUP_NOTES,groupNotes)]);setSs("saved");setTimeout(()=>setSs(""),1500);},600);
  },[loaded,shows,ros,advances,finance,role,tab,sel,aC,tabOrder,crew,showCrew,production,flights,lodging,guestlists,glTemplates,immigration,showOffDays,sidebarOpen,tourStart,tourEnd,lastFlightScanAt,perms,allShows,busEdits,userTypes,userAssignments,groupNotes]);
  useEffect(()=>{save();},[shows,ros,advances,finance,role,tab,sel,aC,crew,showCrew,production,tabOrder,flights,lodging,guestlists,glTemplates,immigration,showOffDays,sidebarOpen,tourStart,tourEnd,perms,allShows,busEdits,userTypes,userAssignments,groupNotes]);
  useEffect(()=>{const h=e=>{if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setCmd(v=>!v);}if(e.key==="Escape")setCmd(false);};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[]);
  const labelScanFired=useRef(false);
  useEffect(()=>{if(loaded&&!labelScanFired.current){labelScanFired.current=true;refreshLabelIntel();}},[loaded]);// eslint-disable-line

  const flightScanFired=useRef(false);
  useEffect(()=>{
    if(!loaded||flightScanFired.current)return;
    flightScanFired.current=true;
    (async()=>{
      try{
        // Skip scan if last scan was within 55 minutes (watermark guard)
        if(lastFlightScanAt){
          const age=(Date.now()-new Date(lastFlightScanAt).getTime())/60000;
          if(age<55){console.log(`[bg-flights] skipping — last scan ${age.toFixed(1)}m ago`);return;}
        }
        const{data:{session}}=await supabase.auth.getSession();
        if(!session?.provider_token)return;
        const showsArr=Object.values(shows||{}).map(s=>({id:s.id||s.date,date:s.date,venue:s.venue,city:s.city,type:s.type}));
        // Watermark: scan only since last scan (minus 2h overlap) to skip old emails
        const sweepFrom=lastFlightScanAt
          ?Math.floor((new Date(lastFlightScanAt).getTime()-2*60*60*1000)/1000)
          :undefined;
        const resp=await fetch("/api/flights",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({googleToken:session.provider_token,tourStart,tourEnd,focus:FOCUS_CARRIERS,shows:showsArr,...(sweepFrom?{sweepFrom}:{})})});
        if(!resp.ok)return;
        const data=await resp.json();
        // Record watermark regardless of whether new flights arrived
        if(data.scannedAt)setLastFlightScanAt(data.scannedAt);
        if(!data.flights?.length)return;
        setFlights(cur=>{
          const next={...cur};
          let added=0,enriched=0;
          data.flights.forEach(f=>{
            const match=findFlightMatch(next,f);
            if(match){
              const merged=enrichFlight(match,f);
              if(JSON.stringify(merged)!==JSON.stringify(match)){next[match.id]=merged;enriched++;}
            }else{
              next[f.id]={...f,status:"pending",suggestedCrewIds:matchPaxToCrew(f.pax,crew)};
              added++;
            }
          });
          return(added||enriched)?next:cur;
        });
      }catch(e){console.warn("[bg-flights]",e.message);}
    })();
  },[loaded]);// eslint-disable-line

  // One-click scan-all: runs intel + flights + lodging across every show, tour-wide,
  // and distributes results into their stores. Reuses the same merge helpers the tabs use.
  const[scanAllState,setScanAllState]=useState({running:false,msg:""});
  const scanAll=useCallback(async()=>{
    const{data:{session}}=await supabase.auth.getSession();
    const googleToken=session?.provider_token;
    if(!googleToken){setScanAllState({running:false,msg:"Gmail access not available — re-login with Google."});return;}
    const headers={"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`};
    const showsArr=Object.values(shows||{}).map(s=>({id:s.id||s.date,date:s.date,venue:s.venue,city:s.city,type:s.type}));
    const errs=[];let addedFlights=0,addedHotels=0;
    setScanAllState({running:true,msg:"1/3 Scanning email intel…"});
    try{await refreshLabelIntel(true);}catch(e){errs.push("intel: "+e.message);}
    setScanAllState({running:true,msg:"2/3 Scanning flights…"});
    try{
      const resp=await fetch("/api/flights",{method:"POST",headers,body:JSON.stringify({googleToken,tourStart,tourEnd,focus:FOCUS_CARRIERS,shows:showsArr})});
      if(resp.status===402)throw new Error("Gmail session expired — re-login.");
      if(!resp.ok)throw new Error("HTTP "+resp.status);
      const data=await resp.json();
      if(data.error)throw new Error(data.error);
      if(data.scannedAt)setLastFlightScanAt(data.scannedAt);
      const newF=data.flights||[];
      addedFlights=newF.filter(f=>!findFlightMatch(flights||{},f)).length;
      if(newF.length)setFlights(cur=>{const next={...cur};newF.forEach(f=>{const m=findFlightMatch(next,f);if(m){const merged=enrichFlight(m,f);if(JSON.stringify(merged)!==JSON.stringify(m))next[m.id]=merged;}else{next[f.id]={...f,status:"pending",suggestedCrewIds:matchPaxToCrew(f.pax,crew)};}});return next;});
    }catch(e){errs.push("flights: "+e.message);}
    setScanAllState({running:true,msg:"3/3 Scanning lodging…"});
    try{
      const resp=await fetch("/api/lodging-scan",{method:"POST",headers,body:JSON.stringify({googleToken,tourStart,tourEnd,sweepFrom:null})});
      if(resp.status===402)throw new Error("Gmail session expired — re-login.");
      if(!resp.ok)throw new Error("HTTP "+resp.status);
      const data=await resp.json();
      if(data.error)throw new Error(data.error);
      const existingKeys=new Set(Object.values(lodging).map(h=>`${h.name}__${h.checkIn}`));
      const novel=(data.lodgings||[]).filter(h=>!lodging[h.id]&&!existingKeys.has(`${h.name}__${h.checkIn}`));
      novel.forEach(h=>uLodging(h.id,{...h,status:"pending",rooms:h.rooms||[],todos:HOTEL_TODOS_DEFAULT.map(t=>({text:t,done:false}))}));
      addedHotels=novel.length;
    }catch(e){errs.push("lodging: "+e.message);}
    setScanAllState({running:false,msg:`Scan-all done · +${addedFlights} flights · +${addedHotels} hotels${errs.length?` · ${errs.length} error(s): ${errs.join("; ")}`:" · intel refreshed"}`});
  },[shows,crew,flights,lodging,tourStart,tourEnd,setFlights,setLastFlightScanAt,refreshLabelIntel]);// uLodging/setFlights are stable; uLodging omitted from deps to avoid TDZ (declared below)

  const uImmigration=useCallback((id,data)=>setImmigration(p=>{if(data===null){const n={...p};delete n[id];return n;}return{...p,[id]:{...(p[id]||{}),...data}};}),[]);
  const uShow=useCallback((d,u)=>setShows(p=>({...p,[d]:{...p[d],...u,lastModified:Date.now()}})),[]);
  const uRos=useCallback((d,b)=>setRos(p=>{const n={...p};if(b)n[d]=b;else delete n[d];return n;}),[]);
  const uAdv=useCallback((d,u)=>setAdvances(p=>({...p,[d]:{...(p[d]||{}),...u}})),[]);
  const uFin=useCallback((d,u)=>setFinance(p=>({...p,[d]:{...(p[d]||{}),...(typeof u==="function"?u(p[d]||{}):u)}})),[]);
  const uProd=useCallback((d,u)=>setProduction(p=>({...p,[d]:{...(p[d]||{}),...u}})),[]);
  const uFlight=useCallback((id,seg)=>setFlights(p=>{if(!seg){const n={...p};delete n[id];return n;}return{...p,[id]:seg};}),[]);
  const uLodging=useCallback((id,data)=>setLodging(p=>{if(!data){const n={...p};delete n[id];return n;}return{...p,[id]:data};}),[]);
  const uGuestlist=useCallback((date,updater)=>setGuestlists(p=>{
    const cur=p[date]||GL_DEFAULT_SHOW();
    const next=typeof updater==="function"?updater(cur):{...cur,...updater};
    if(next===null){const n={...p};delete n[date];return n;}
    return{...p,[date]:next};
  }),[]);
  const gRos=useCallback(d=>{if(ros[d])return ros[d];if(CUSTOM_ROS_MAP[d])return CUSTOM_ROS_MAP[d]();const sh=shows?.[d];if(sh?.type==="off"||sh?.type==="travel")return [];return DEFAULT_ROS();},[ros,shows]);
  const sorted=useMemo(()=>shows?Object.values(shows).sort((a,b)=>a.date.localeCompare(b.date)):[], [shows]);
  const next=useMemo(()=>{const t=new Date().toISOString().slice(0,10);return sorted.find(s=>s.date>=t)||sorted[0];},[sorted]);
  const cShows=useMemo(()=>sorted.filter(s=>s.clientId===aC),[sorted,aC]);

  // Tour days: real shows + synthesized travel/off/split days for Apr 16–May 31 window.
  // Keyed by ISO date. Real shows win; synthetic fill for bus moves + off days.
  const tourDays=useMemo(()=>{
    const m={};
    (sorted||[]).forEach(s=>{
      m[s.date]={date:s.date,type:s.type||"show",show:s,bus:BUS_DATA_MAP[s.date]||null,split:effectiveSplitDays[s.date]||null,synthetic:false,city:s.city,venue:s.venue,clientId:s.clientId};
    });
    if(!sorted.length)return m;
    const start=new Date(sorted[0].date+'T12:00:00');
    const end=new Date(sorted[sorted.length-1].date+'T12:00:00');
    for(let d=new Date(start.getTime());d<=end;d.setDate(d.getDate()+1)){
      const iso=d.toISOString().slice(0,10);
      const bus=BUS_DATA_MAP[iso]||null;
      const split=effectiveSplitDays[iso]||null;
      if(m[iso]){
        // enrich existing real show with bus/split context
        m[iso]={...m[iso],bus:m[iso].bus||bus,split:m[iso].split||split};
        continue;
      }
      if(split){m[iso]={date:iso,type:"split",split,bus,synthetic:true,city:split.parties.map(p=>p.location).join(" / "),venue:"Split Day",clientId:"bbn"};}
      else if(bus&&!bus.show){m[iso]={date:iso,type:"travel",bus,synthetic:true,city:bus.route,venue:"Travel Day",clientId:"bbn"};}
      else if(bus&&bus.show){m[iso]={date:iso,type:"show",bus,synthetic:true,city:bus.route,venue:bus.venue||"Show",clientId:"bbn"};}
      else{m[iso]={date:iso,type:"off",synthetic:true,city:"—",venue:"Off Day",clientId:"bbn"};}
    }
    return m;
  },[sorted,effectiveSplitDays]);
  const tourDaysSorted=useMemo(()=>Object.values(tourDays).sort((a,b)=>a.date.localeCompare(b.date)),[tourDays]);

  // Ordered tabs: apply saved tabOrder, append any tabs not in saved order (handles new tabs added in code)
  const orderedTabs=useMemo(()=>{
    if(!Array.isArray(tabOrder)||!tabOrder.length)return TABS;
    const byId=TABS.reduce((a,t)=>{a[t.id]=t;return a;},{});
    const seen=new Set();
    const out=[];
    for(const id of tabOrder){if(byId[id]&&!seen.has(id)){out.push(byId[id]);seen.add(id);}}
    for(const t of TABS){if(!seen.has(t.id))out.push(t);}
    return out;
  },[tabOrder]);
  const reorderTabs=useCallback((fromId,toId)=>{
    if(fromId===toId)return;
    const ids=orderedTabs.map(t=>t.id);
    const fi=ids.indexOf(fromId),ti=ids.indexOf(toId);
    if(fi<0||ti<0)return;
    const next=[...ids];const[moved]=next.splice(fi,1);next.splice(ti,0,moved);
    setTabOrder(next);
  },[orderedTabs]);

  // eventKey: sub-events keyed by their own ID (spans dates/festivals);
  // split-day parties keyed by `${date}#${partyId}`; otherwise by date.
  const eventKey=useMemo(()=>{
    if(selEventId)return selEventId;
    if(currentSplit&&activeSplitPartyId)return `${sel}#${activeSplitPartyId}`;
    return sel;
  },[selEventId,sel,currentSplit,activeSplitPartyId]);
  const ctxValue=useMemo(()=>{
    const isViewer=role==="viewer";
    const noop=()=>{};
    const g=fn=>isViewer?noop:fn;
    return{shows,uShow:g(uShow),ros,uRos:g(uRos),gRos,advances,uAdv:g(uAdv),finance,uFin:g(uFin),sel,setSel,eventKey,role,setRole,tab,setTab,sorted,cShows,next,setCmd,aC,setAC,notesPriv,uNotesPriv:g(uNotesPriv),checkPriv,uCheckPriv:g(uCheckPriv),mobile,setExp,intel,setIntel:g(setIntel),addLog,refreshIntel,toggleIntelShare:g(toggleIntelShare),refreshing,refreshMsg,labelIntel,refreshLabelIntel,pushUndo,undoToast,setUndoToast,crew,setCrew:g(setCrew),showCrew,setShowCrew:g(setShowCrew),dateMenu,setDateMenu,production,uProd:g(uProd),tourDays,tourDaysSorted,orderedTabs,reorderTabs:g(reorderTabs),selEventId,setSelEventId,flights,uFlight:g(uFlight),setFlights:g(setFlights),uploadOpen,setUploadOpen:g(setUploadOpen),lodging,uLodging:g(uLodging),guestlists,uGuestlist:g(uGuestlist),glTemplates,setGlTemplates:g(setGlTemplates),showOffDays,setShowOffDays,sidebarOpen,setSidebarOpen,tourStart,tourEnd,setTourStart:g(setTourStart),setTourEnd:g(setTourEnd),splitParty,setSplitParty:g(setSplitParty),currentSplit,activeSplitPartyId,activeSplitParty,effectiveSplitDays,immigration,uImmigration:g(uImmigration),me,transView,setTransView,perms,uPerms:g(uPerms),actLog,addActLog,commentMode,setCommentMode,showPickerOpen,setShowPickerOpen,allShows,setAllShows,busEdits,uBusEdit:g(uBusEdit),isViewer,userTypes,addUserType,renameUserType,removeUserType,userAssignments,setUserAssignment,removeUserAssignment,groupNotes,uGroupNote:g(uGroupNote),scanAll,scanAllState};
  },[shows,ros,advances,finance,sel,eventKey,role,tab,aC,notesPriv,checkPriv,mobile,intel,labelIntel,refreshing,refreshMsg,sorted,cShows,next,crew,showCrew,production,tourDays,tourDaysSorted,orderedTabs,selEventId,flights,uploadOpen,lodging,guestlists,glTemplates,showOffDays,sidebarOpen,undoToast,dateMenu,tourStart,tourEnd,uShow,uRos,gRos,uAdv,uFin,uNotesPriv,uCheckPriv,addLog,refreshIntel,toggleIntelShare,pushUndo,reorderTabs,uFlight,uLodging,uGuestlist,uProd,refreshLabelIntel,splitParty,setSplitParty,currentSplit,activeSplitPartyId,activeSplitParty,effectiveSplitDays,immigration,uImmigration,me,transView,perms,actLog,addActLog,commentMode,setCommentMode,showPickerOpen,setShowPickerOpen,allShows,setAllShows,busEdits,uBusEdit,userTypes,addUserType,renameUserType,removeUserType,userAssignments,setUserAssignment,removeUserAssignment,groupNotes,uGroupNote,scanAll,scanAllState]);// eslint-disable-line

  if(!loaded||!shows)return(<div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',system-ui"}}><div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:800,color:T.text,letterSpacing:"-0.03em"}}>DOS</div><div style={{fontSize:10,color:T.textDim,marginTop:3,fontFamily:MN}}>v7.0 loading...</div></div></div>);

  return(
    <Ctx.Provider value={ctxValue}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body,#root{width:100%;max-width:100vw;overflow-x:hidden}.br,.rh{min-width:0;transition:background 0.13s ease}.br>div,.rh>div{min-width:0;overflow:hidden;text-overflow:ellipsis}body{background:var(--bg)}img,svg,video{max-width:100%;height:auto}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--accent);border-radius:4px}::-webkit-scrollbar-thumb:hover{background:var(--accent)}@keyframes fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}.fi{animation:fi .18s ease forwards}@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}.br:hover{background:var(--card-2)!important}.rh:hover{background:var(--card-2)!important}button{transition:opacity 0.12s ease,background 0.12s ease,box-shadow 0.12s ease}input:focus,select:focus,textarea:focus{outline:none!important;box-shadow:0 0 0 2px rgba(109,40,217,0.45)!important;border-color:var(--accent)!important}details summary::-webkit-details-marker{display:none}::selection{background:rgba(91,33,182,0.35);color:var(--text)}.viewer-mode input,.viewer-mode textarea,.viewer-mode select{pointer-events:none!important;background:var(--card-2)!important;color:var(--text-dim)!important;cursor:not-allowed!important}.viewer-mode input[type="checkbox"],.viewer-mode input[type="radio"]{opacity:0.5}.viewer-mode [draggable]{user-select:none}.viewer-mode [contenteditable]{pointer-events:none!important;user-select:text}`}</style>
      <div className={role==="viewer"?"viewer-mode":""} style={{fontFamily:"'Outfit',system-ui",background:"var(--bg)",color:T.text,height:"100vh",width:"100%",maxWidth:"100vw",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {role==="viewer"&&<div style={{background:"var(--warn-bg)",borderBottom:"1px solid var(--warn-fg)",color:T.warnFg,padding:"4px 16px",fontSize:10,fontWeight:700,letterSpacing:"0.06em",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <span>👁 VIEWER MODE — read-only</span>
          <span style={{fontSize:9,fontWeight:500,color:T.textDim,letterSpacing:0}}>Edits are disabled. Switch to TM/TD or Internal in the role pill to edit.</span>
        </div>}
        <TopBar ss={ss}/>
        <div style={{flex:1,display:"flex",flexDirection:"row",minWidth:0,minHeight:0,width:"100%",overflow:"visible",position:"relative"}}>
          <NavSidebar/>
          <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,minHeight:0,overflow:"hidden"}}>
            {tab!=="dash"&&tab!=="cross"&&<SplitPartyTabs/>}
            {tab!=="dash"&&tab!=="cross"&&<EventSwitcher show={shows[sel]} sel={sel}/>}
            {tab==="dash"&&<Dash/>}{tab==="cross"&&<CrossTab/>}{tab==="advance"&&<AdvTab/>}{tab==="guestlist"&&<GuestListTab/>}{tab==="ros"&&<ScheduleTab/>}{tab==="transport"&&<TransTab/>}{tab==="finance"&&<FinTab/>}{tab==="crew"&&<CrewTab/>}{tab==="lodging"&&<LodgingTab/>}{tab==="production"&&<ProdTab/>}{tab==="notes"&&<GroupNotesTab/>}{tab==="access"&&<AccessTab/>}
          </div>
        </div>
        {cmd&&<CmdP/>}
        {exp&&<ExportModal onClose={()=>setExp(false)}/>}
        {dateMenu&&<DateDrawer onClose={()=>setDateMenu(false)}/>}
        {uploadOpen&&<FileUploadModal onClose={()=>setUploadOpen(false)}/>}
        {commentMode&&<CommentPanel/>}
        {showPickerOpen&&<ShowPickerSheet/>}
        {undoToast&&<div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:"var(--border)",color:"#fff",borderRadius:10,padding:"8px 14px",display:"flex",alignItems:"center",gap:10,fontSize:11,boxShadow:"0 8px 24px rgba(0,0,0,.2)",zIndex:90}}>
          <span>{undoToast.label}</span>
          <button onClick={()=>{undoToast.undo();setUndoToast(null);}} style={{background:"var(--accent)",border:"none",borderRadius:6,color:"#fff",fontSize:10,padding:"3px 10px",cursor:"pointer",fontWeight:700}}>Undo</button>
          <button onClick={()=>setUndoToast(null)} style={{background:"none",border:"none",color:T.textMute,fontSize:13,cursor:"pointer"}}>×</button>
        </div>}
      </div>
    </Ctx.Provider>
  );
}

// Inline pax editor — used in SegmentDrawer and FlightCard editable mode.
// ── NAV SIDEBAR ──────────────────────────────────────────────────────────────
// Router: dispatches to ROSTab for show days, DayScheduleView for off/travel/split days.
// Separating into sibling components keeps React hook order stable when switching day types.
// Inline editor for a drive-session array. Manages local row state; calls
// onSave(rows) on confirm, onCancel to discard, onReset to clear the override.
// Per-date aggregated view of all travel segments (flights + ground transfers + bus + rail + hotel check-ins).
// Master Tour-style: chronological list on the left, editor drawer on the right. The currently-selected show
// date (sel) drives what's displayed; header shows a prev/next stepper and jumps to the Travel Dates menu.
// Editor drawer for one segment. Fields adapt to type (air/ground/bus/rail/hotel).
// For ground transfers going TO a known airport, the pickup-time suggestion uses the
// matched flight's scheduled dep minus the airport buffer.
// Per-day Drive Sessions view (Logistics → Drive Sessions when a date is selected).
// Focused subset of TravelDayView: just the drive day's flag chips + session
// table + inline editor. Use when running the day with the bus driver.
// Tour-wide Drive Sessions view (Logistics → Drive Sessions in All Shows mode).
// Lists every drive day in chronological order with flag chips + session table.
// Filter bar narrows to flagged / long / ferry / show-day arrival days.
// Compact lifecycle pill row for a single crew member on a specific date.
// Adapts to bus dates (simpler chain, bus as lodging) vs fly dates/one-offs (full
// airport ↔ hotel ↔ venue chain with hotel as lodging). Clicking any pill jumps to
// the Transport → Travel Day view for that date; the user can then complete the
// gap using the +Ground / +Flight / +Hotel creators.
// ── Production Intelligence Engine (PIE) ────────────────────────────────────

// Equipment manifest seeded from bbno$ EU Production Binder
// Neg Earth 26-1273 | Sonalyst 26-0097 | Design Spec v1.0.0
// Venue Grid 4.21 — seeded from bbno$ EU Production Binder
// Tour rig specification — extracted from BBNO$26_EUTOUR_v1.0.0_031526.vwx + PDF
// Symbol Key (Sht-1), Elevation (Sht-2), Section (Sht-3), Staging (Sht-6)
// Designer: Mike Sheck | Drawn: 3/17-3/18/26 | © L7 Productions, LLC
// Parse ceiling clearance from venue text fields
// ── LODGING TAB ─────────────────────────────────────────────────────────────
