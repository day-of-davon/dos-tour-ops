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
    return{shows,uShow:g(uShow),ros,uRos:g(uRos),gRos,advances,uAdv:g(uAdv),finance,uFin:g(uFin),sel,setSel,eventKey,role,setRole,tab,setTab,sorted,cShows,next,setCmd,aC,setAC,notesPriv,uNotesPriv:g(uNotesPriv),checkPriv,uCheckPriv:g(uCheckPriv),mobile,setExp,intel,setIntel:g(setIntel),addLog,refreshIntel,toggleIntelShare:g(toggleIntelShare),refreshing,refreshMsg,labelIntel,refreshLabelIntel,pushUndo,undoToast,setUndoToast,crew,setCrew:g(setCrew),showCrew,setShowCrew:g(setShowCrew),dateMenu,setDateMenu,production,uProd:g(uProd),tourDays,tourDaysSorted,orderedTabs,reorderTabs:g(reorderTabs),selEventId,setSelEventId,flights,uFlight:g(uFlight),setFlights:g(setFlights),uploadOpen,setUploadOpen:g(setUploadOpen),lodging,uLodging:g(uLodging),guestlists,uGuestlist:g(uGuestlist),glTemplates,setGlTemplates:g(setGlTemplates),showOffDays,setShowOffDays,sidebarOpen,setSidebarOpen,tourStart,tourEnd,setTourStart:g(setTourStart),setTourEnd:g(setTourEnd),splitParty,setSplitParty:g(setSplitParty),currentSplit,activeSplitPartyId,activeSplitParty,effectiveSplitDays,immigration,uImmigration:g(uImmigration),me,transView,setTransView,perms,uPerms:g(uPerms),actLog,addActLog,commentMode,setCommentMode,showPickerOpen,setShowPickerOpen,allShows,setAllShows,busEdits,uBusEdit:g(uBusEdit),isViewer,userTypes,addUserType,renameUserType,removeUserType,userAssignments,setUserAssignment,removeUserAssignment,groupNotes,uGroupNote:g(uGroupNote)};
  },[shows,ros,advances,finance,sel,eventKey,role,tab,aC,notesPriv,checkPriv,mobile,intel,labelIntel,refreshing,refreshMsg,sorted,cShows,next,crew,showCrew,production,tourDays,tourDaysSorted,orderedTabs,selEventId,flights,uploadOpen,lodging,guestlists,glTemplates,showOffDays,sidebarOpen,undoToast,dateMenu,tourStart,tourEnd,uShow,uRos,gRos,uAdv,uFin,uNotesPriv,uCheckPriv,addLog,refreshIntel,toggleIntelShare,pushUndo,reorderTabs,uFlight,uLodging,uGuestlist,uProd,refreshLabelIntel,splitParty,setSplitParty,currentSplit,activeSplitPartyId,activeSplitParty,effectiveSplitDays,immigration,uImmigration,me,transView,perms,actLog,addActLog,commentMode,setCommentMode,showPickerOpen,setShowPickerOpen,allShows,setAllShows,busEdits,uBusEdit,userTypes,addUserType,renameUserType,removeUserType,userAssignments,setUserAssignment,removeUserAssignment,groupNotes,uGroupNote]);// eslint-disable-line

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
            {tab!=="dash"&&<SplitPartyTabs/>}
            {tab!=="dash"&&<EventSwitcher show={shows[sel]} sel={sel}/>}
            {tab==="dash"&&<Dash/>}{tab==="advance"&&<AdvTab/>}{tab==="guestlist"&&<GuestListTab/>}{tab==="ros"&&<ScheduleTab/>}{tab==="transport"&&<TransTab/>}{tab==="finance"&&<FinTab/>}{tab==="crew"&&<CrewTab/>}{tab==="lodging"&&<LodgingTab/>}{tab==="production"&&<ProdTab/>}{tab==="notes"&&<GroupNotesTab/>}{tab==="access"&&<AccessTab/>}
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

const STATUS_STYLE={
  Landed:{bg:"var(--success-bg)",c:"var(--success-fg)",label:"Landed"},
  Departed:{bg:"var(--info-bg)",c:"var(--info-fg)",label:"Departed"},
  Scheduled:{bg:"var(--card-2)",c:"var(--text-2)",label:"Scheduled"},
  Cancelled:{bg:"var(--danger-bg)",c:"var(--danger-fg)",label:"Cancelled"},
  Delayed:{bg:"var(--warn-bg)",c:"var(--warn-fg)",label:"Delayed"},
  Unknown:{bg:"var(--card-2)",c:"var(--text-mute)",label:"—"},
};
export function statusStyle(s){return STATUS_STYLE[s]||STATUS_STYLE.Unknown;}

export const FOCUS_CARRIERS=["delta","american","united","air canada"];
const resKey=f=>(f.pnr||f.bookingRef||f.confirmNo||f.tid||`solo_${f.id}`).toString().trim().toUpperCase();

export function computeLayoverMins(prev,next){
  if(!prev?.arr||!next?.dep)return null;
  const d1=new Date(`${prev.arrDate||prev.depDate||"2000-01-01"}T${prev.arr}`);
  const d2=new Date(`${next.depDate||"2000-01-01"}T${next.dep}`);
  if(isNaN(d1)||isNaN(d2))return null;
  const diff=Math.round((d2-d1)/60000);
  return diff>0&&diff<1440?diff:null;
}
export function fmtMins(m){if(!m)return"";return`${Math.floor(m/60)}h${String(m%60).padStart(2,"0")}m`;}
function getJourneyType(segs){
  if(segs.length===1)return"ONE_WAY";
  const last=segs[segs.length-1],first=segs[0];
  if(segs.length===2&&(last.returnOfId||(last.to&&last.to===first.from)))return"ROUND_TRIP";
  return"MULTI_LEG";
}
export function getLegLabel(segs,i,jType){
  if(segs.length<2)return null;
  if(jType==="ROUND_TRIP")return i===0?"OUTBOUND":"RETURN";
  return`LEG ${i+1} / ${segs.length}`;
}

export const groupByReservation=list=>{
  const m=new Map();
  list.forEach(f=>{const k=resKey(f);if(!m.has(k))m.set(k,[]);m.get(k).push(f);});
  const groups=[...m.entries()].map(([k,segs])=>{
    const sorted=[...segs].sort((a,b)=>(a.depDate||"").localeCompare(b.depDate||"")||(a.dep||"").localeCompare(b.dep||""));
    const paxUnion=[...new Set(sorted.flatMap(s=>s.pax||[]))];
    const costs=sorted.filter(s=>typeof s.cost==="number");
    const totalCost=costs.length?costs.reduce((a,b)=>a+b.cost,0):null;
    const currency=costs[0]?.currency||"";
    const carriers=[...new Set(sorted.map(s=>s.carrier).filter(Boolean))];
    const pnrSeg=sorted.find(s=>s.pnr)||sorted.find(s=>s.bookingRef||s.confirmNo);
    const pnr=pnrSeg?.pnr||pnrSeg?.bookingRef||pnrSeg?.confirmNo||"";
    const ticketNo=sorted.find(s=>s.ticketNo)?.ticketNo||"";
    const tid=sorted.find(s=>s.tid)?.tid||null;
    const isSolo=k.startsWith("SOLO_");
    const journeyType=getJourneyType(sorted);
    const routeChain=[...new Set([sorted[0]?.from,...sorted.map(s=>s.to)])].filter(Boolean).join("→");
    return{key:k,segs:sorted,paxUnion,totalCost,currency,carriers,pnr,ticketNo,firstDate:sorted[0]?.depDate||"",tid,isSolo,journeyType,routeChain};
  });
  return groups.sort((a,b)=>a.firstDate.localeCompare(b.firstDate));
};

export const JOURNEY_BADGE={
  ONE_WAY:{label:"ONE-WAY",bg:"var(--card-2)",c:"var(--text-dim)"},
  ROUND_TRIP:{label:"ROUND TRIP",bg:"var(--info-bg)",c:"var(--info-fg,var(--link))"},
  MULTI_LEG:{label:"MULTI-LEG",bg:"var(--accent-pill-bg)",c:"var(--accent)"},
};

export function matchPaxToCrew(paxNames,crewList){
  const ids=new Set();
  // Precompute normalized crew tokens once.
  const roster=(crewList||[]).filter(c=>c.name&&c.name!=="TBD").map(c=>{
    const cn=c.name.toLowerCase().replace(/\s*\(.*?\)\s*/g,"").trim();
    return{id:c.id,cn,ct:cn.split(/\s+/)};
  });
  for(const pax of(paxNames||[])){
    const pn=pax.toLowerCase().trim();
    const pt=pn.split(/\s+/);
    for(const{id,cn,ct}of roster){
      const overlap=pt.filter(t=>t.length>2&&ct.includes(t)).length;
      // Prefix match on first names handles Alex/Alexander, Dan/Daniel, etc.
      const firstPrefix=pt[0]&&ct[0]&&(pt[0].startsWith(ct[0])||ct[0].startsWith(pt[0]))&&Math.min(pt[0].length,ct[0].length)>=3;
      const lastMatch=pt.length>1&&ct.length>1&&pt[pt.length-1]===ct[ct.length-1];
      if(overlap>=2||pn===cn||(firstPrefix&&lastMatch))ids.add(id);
    }
  }
  return[...ids];
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
export const FLEET_EXCEPTION_STATUS_KEY="dos-fleet-exception-status";
export const FLEET_EXCEPTION_STATUSES=[
  ["open","Open","var(--danger-fg)","var(--danger-bg)"],
  ["in-progress","In Progress","var(--warn-fg)","var(--warn-bg)"],
  ["resolved","Resolved","var(--success-fg)","var(--success-bg)"],
  ["blocked","Blocked","var(--text-mute)","var(--card-2)"],
];

export function useFleetExceptionStatus(){
  const[overrides,setOverrides]=useState(()=>{
    try{return JSON.parse(localStorage.getItem(FLEET_EXCEPTION_STATUS_KEY)||"{}");}
    catch{return{};}
  });
  const set=(id,status)=>setOverrides(prev=>{
    const next={...prev,[id]:status};
    try{localStorage.setItem(FLEET_EXCEPTION_STATUS_KEY,JSON.stringify(next));}catch{}
    return next;
  });
  return[overrides,set];
}

export function collectFleetExceptions(){
  const out=[];
  Object.entries(BUS_DATA_MAP).forEach(([iso,d])=>{
    if(d.fleetException)out.push({id:`crossing_${iso}`,iso,kind:"crossing",label:d.route,date:d.date,dow:d.dow,...d.fleetException});
  });
  Object.entries(VENUE_GRID).forEach(([iso,v])=>{
    if(v.fleetException)out.push({id:`venue_${iso}`,iso,kind:"venue",label:`${v.venue} · ${v.city}`,date:iso,dow:null,...v.fleetException});
  });
  return out.sort((a,b)=>a.iso.localeCompare(b.iso));
}

export const LEDGER_EDITABLE={
  confirmedFlight:new Set(["date","amount","currency","ref","bookedDate","paidDate"]),
  event:new Set(["date","desc","amount","currency","status","ref","bookedDate","paidDate"]),
  payout:new Set(["payee","amount","currency","status","ref","bookedDate","paidDate"]),
  ledgerEntry:new Set(["date","desc","payee","amount","currency","ref","bookedDate","paidDate"]),
  flightExpense:new Set(["desc","amount","currency","ref","bookedDate","paidDate"]),
  legacySettlement:new Set(["amount","ref"]),
};
export const DOC_TYPE_META={
  RECEIPT:{label:"Receipt",bg:"var(--warn-bg)",c:"var(--warn-fg)",icon:"🧾"},
  INVOICE:{label:"Invoice",bg:"var(--warn-bg)",c:"var(--warn-fg)",icon:"📋"},
  FLIGHT_CONFIRMATION:{label:"Flight Confirmation",bg:"var(--info-bg)",c:"var(--link)",icon:"✈"},
  TRAVEL_ITINERARY:{label:"Travel Itinerary",bg:"var(--info-bg)",c:"var(--link)",icon:"🗺"},
  SHOW_CONTRACT:{label:"Show Contract",bg:"var(--success-bg)",c:"var(--success-fg)",icon:"📄"},
  VENUE_TECH_PACK:{label:"Venue Tech Pack",bg:"var(--accent-pill-bg)",c:"var(--accent)",icon:"🔧"},
  EXPENSE_REPORT:{label:"Expense Report",bg:"var(--warn-bg)",c:"var(--warn-fg)",icon:"📊"},
  UNKNOWN:{label:"Unknown",bg:"var(--card-2)",c:"var(--text-dim)",icon:"?"},
};
// Compact lifecycle pill row for a single crew member on a specific date.
// Adapts to bus dates (simpler chain, bus as lodging) vs fly dates/one-offs (full
// airport ↔ hotel ↔ venue chain with hotel as lodging). Clicking any pill jumps to
// the Transport → Travel Day view for that date; the user can then complete the
// gap using the +Ground / +Flight / +Hotel creators.
// ── Production Intelligence Engine (PIE) ────────────────────────────────────

// Equipment manifest seeded from bbno$ EU Production Binder
// Neg Earth 26-1273 | Sonalyst 26-0097 | Design Spec v1.0.0
export const MANIFEST_SEED=[
  // LIGHTING
  {id:"s1",department:"LIGHTING",item_name:"Ayrton Diablo S (550W Profile)",model_ref:"Ayrton Diablo S",qty:8,weight_kg:21.8,power_w:550,ip_rating:"IP20",rig_position:"fly",is_package:false,notes:"DESIGN SPEC. Neg Earth quoted Perseo-S instead. IP20. Profile/beam/effects hybrid.",vendor_name:"Design Spec v1.0.0",vendor_quote_ref:"v1.0.0",source_type:"design_spec",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:true,discrepancy_type:"FIXTURE MISMATCH",flag_severity:"HIGH",flag_note:"Neg Earth quoted Perseo-S instead — confirm with Sheck before PO",included:true},
  {id:"s2",department:"LIGHTING",item_name:"Ayrton Perseo-S (Neg Earth actual)",model_ref:"Ayrton Perseo-S",qty:8,weight_kg:26,power_w:520,ip_rating:"IP65",rig_position:"fly",is_package:false,notes:"QUOTED substitute for Diablo. Beam fixture, different category. Requires Sheck sign-off.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:true,discrepancy_type:"FIXTURE MISMATCH",flag_severity:"HIGH",flag_note:"NOT per design spec — confirm with Sheck",included:true},
  {id:"s3",department:"LIGHTING",item_name:"GLP JDC2 IP (Hybrid LED Strobe)",model_ref:"GLP JDC2 IP",qty:16,weight_kg:24,power_w:1500,ip_rating:"IP65",rig_position:"fly",is_package:false,notes:"DigiFX + NDI. 180° tilt. Dedicated circuit per unit.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s4",department:"LIGHTING",item_name:"ACME Pixel Line IP (STROBE 3 IP, RGBW)",model_ref:"ACME Pixel Line IP",qty:12,weight_kg:4.5,power_w:420,ip_rating:"IP66",rig_position:"fly",is_package:false,notes:"672 RGB + 112 CW LEDs, 32 sections. Smart Glass Technology.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s5",department:"LIGHTING",item_name:"Look Solutions Unique 2.1 Hazer (DMX)",model_ref:"Look Solutions Unique 2.1",qty:2,weight_kg:14,power_w:500,ip_rating:null,rig_position:"ground",is_package:false,notes:"DMX-controlled touring hazer.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s6",department:"LIGHTING",item_name:"ProFan DMX Effect Fan",model_ref:null,qty:2,weight_kg:7,power_w:150,ip_rating:null,rig_position:"ground",is_package:false,notes:"DMX fan. Used with hazer.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s7",department:"LIGHTING",item_name:"10' HUD Black Box Truss Section",model_ref:null,qty:6,weight_kg:9,power_w:null,ip_rating:null,rig_position:"fly",is_package:false,notes:"Neg Earth spec. Design calls Tyler Truss GT 10' — confirm compatibility.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:true,discrepancy_type:"TRUSS MISMATCH",flag_severity:"MEDIUM",flag_note:"Truss brand ≠ design spec (Tyler GT) — confirm coupler compatibility",included:true},
  // VIDEO
  {id:"s8",department:"VIDEO",item_name:"ROE Carbon CB5 5.76mm LED Panel (T4v Frame)",model_ref:"ROE Carbon CB5",qty:48,weight_kg:13.9,power_w:400,ip_rating:"IP65",rig_position:"fly",is_package:false,notes:"600×1200mm. Brompton-mapped. IP65. Design: 'ROE MC-5H T4v Frame' — confirm same panel.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:true,discrepancy_type:"MODEL DESIGNATION",flag_severity:"MEDIUM",flag_note:"Panel model designation mismatch vs. drawing — confirm ROE CB5 = MC-5H T4v",included:true},
  {id:"s9",department:"VIDEO",item_name:"Brompton S4 LED Processor",model_ref:"Brompton S4",qty:2,weight_kg:5,power_w:250,ip_rating:null,rig_position:"fly",is_package:false,notes:"Main + backup. Required for ROE CB5 operation.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s10",department:"VIDEO",item_name:"ROE Air Frame Double Hanging Bar 1.2m",model_ref:null,qty:6,weight_kg:6,power_w:null,ip_rating:null,rig_position:"fly",is_package:false,notes:"Panel suspension system for LED wall.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s11",department:"VIDEO",item_name:"LITEC Supertruss 30.5cm 1m Section (Black)",model_ref:null,qty:1,weight_kg:4,power_w:null,ip_rating:null,rig_position:"fly",is_package:false,notes:"Video truss structure.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s12",department:"VIDEO",item_name:"LITEC Supertruss 30.5cm 3m Section (Black)",model_ref:null,qty:2,weight_kg:12,power_w:null,ip_rating:null,rig_position:"fly",is_package:false,notes:"Video truss structure.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s13",department:"VIDEO",item_name:"500kg Chain Hoist 3ph (LITEC Exe-Rise D8+, 25m)",model_ref:null,qty:2,weight_kg:32,power_w:750,ip_rating:null,rig_position:"fly",is_package:false,notes:"4m/min. 2 hoists = 1,000kg rated vs ~800kg wall+truss load.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:true,discrepancy_type:"HOIST COUNT",flag_severity:"CRITICAL",flag_note:"Hoist count may be insufficient — verify rigging load calc with Neg Earth",included:true},
  {id:"s14",department:"VIDEO",item_name:"Motor Control Points + Rigging Points",model_ref:null,qty:4,weight_kg:null,power_w:null,ip_rating:null,rig_position:"fly",is_package:false,notes:"Per Neg Earth scope. Venue rigging approval required at each stop.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s15",department:"VIDEO",item_name:"Power, Data, Fiber & Ancillaries (Video)",model_ref:null,qty:1,weight_kg:30,power_w:null,ip_rating:null,rig_position:"fly",is_package:true,notes:"Signal path; panel distribution. Loom not separately itemised.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  // AUDIO (tour carry)
  {id:"s16",department:"AUDIO",item_name:"PK Sound T10 Robotic Line Array",model_ref:"PK Sound T10",qty:6,weight_kg:47.6,power_w:3000,ip_rating:"IP42",rig_position:"touring_carry",is_package:false,notes:"Dual 10\" bandpass LF + 2x 6.5\" CMI mid + HF planar waveguide. Robotic 60-120°. Auto-Array. 3 per side, flown.",vendor_name:"Tour carry",vendor_quote_ref:null,source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:false,flag_note:"Qty confirmed — 3 per side",included:true},
  {id:"s17",department:"AUDIO",item_name:"PK Sound T218 Intelligent Subwoofer",model_ref:"PK Sound T218",qty:12,weight_kg:104,power_w:4000,ip_rating:"IP42",rig_position:"ground",is_package:false,notes:"Dual 18\" front-loaded bass reflex. 25-100 Hz. Onboard Class D amp + DSP. Ground stacked only.",vendor_name:"Tour carry",vendor_quote_ref:null,source_type:"quote",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:false,flag_note:"Qty confirmed — ground stacked, not in fly weight",included:true},
  // LASERS
  {id:"s18",department:"LASERS",item_name:"Kvant LD33 Spectrum RGBY (Design Spec)",model_ref:"Kvant LD33",qty:8,weight_kg:37,power_w:900,ip_rating:"IP54",rig_position:"ground",is_package:false,notes:"FB4-MAX. Saturn9 30kpps. Incl. flight case. Sonalyst £65,750 pkg (no model confirmed). Neg Earth excludes lasers.",vendor_name:"Design Spec v1.0.0",vendor_quote_ref:"v1.0.0",source_type:"design_spec",spec_source:"fixture_specs",visible_venue:true,has_discrepancy:true,discrepancy_type:"VENDOR UNCONFIRMED",flag_severity:"CRITICAL",flag_note:"VENDOR UNCONFIRMED — Sonalyst pkg (£65,750) or Photon7. Must confirm before May 4.",included:true},
  // POWER & DISTRO
  {id:"s19",department:"POWER_DISTRO",item_name:"50mm Powerlock Cable 15m",model_ref:null,qty:2,weight_kg:8,power_w:null,ip_rating:null,rig_position:"ground",is_package:false,notes:"Main power distribution feed.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s20",department:"POWER_DISTRO",item_name:"36 Way Hot Power Rack (MFO-36)",model_ref:null,qty:1,weight_kg:22,power_w:null,ip_rating:null,rig_position:"ground",is_package:false,notes:"1× P/L in, 1× out, 6× Soca. Hot-patch capable.",vendor_name:"Neg Earth",vendor_quote_ref:"26-1273",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  // STAGING
  {id:"s21",department:"STAGING",item_name:"Riser / Stage Package (Sonalyst)",model_ref:null,qty:1,weight_kg:null,power_w:null,ip_rating:null,rig_position:"ground",is_package:true,notes:"Sht-6: 20'×13'9\" main + 6' side exts = 32' total width. Astroturf. Multi-level. Shifted 2ft US (Rev B).",vendor_name:"Sonalyst",vendor_quote_ref:"26-0097",source_type:"quote",spec_source:"quote",visible_venue:true,has_discrepancy:false,included:true},
  {id:"s22",department:"SFX",item_name:"SFX Addition (Rev B, 3/12/26)",model_ref:null,qty:null,weight_kg:null,power_w:null,ip_rating:null,rig_position:"TBD",is_package:false,notes:"Rev B notes 'Added SFX' — type unspecified. Pyro? CO2? Confirm with Sheck/Dan.",vendor_name:"TBD",vendor_quote_ref:null,source_type:"design_spec",spec_source:"quote",visible_venue:false,has_discrepancy:true,discrepancy_type:"SFX UNSPECIFIED",flag_severity:"CRITICAL",flag_note:"SFX TYPE + VENDOR UNCONFIRMED — clarify with Sheck/Dan before advance",included:true},
];

export const PROD_DEPTS=["ALL","LIGHTING","VIDEO","AUDIO","LASERS","POWER_DISTRO","STAGING","SFX","TRANSPORT","OTHER"];
export const SEV_STYLES={CRITICAL:{bg:"var(--danger-bg)",c:"var(--danger-fg)",b:"var(--danger-bg)"},HIGH:{bg:"var(--warn-bg)",c:"var(--warn-fg)",b:"var(--warn-bg)"},MEDIUM:{bg:"var(--warn-bg)",c:"var(--warn-fg)",b:"var(--warn-bg)"},LOW:{bg:"var(--success-bg)",c:"var(--success-fg)",b:"var(--success-bg)"}};
export const POS_STYLES={fly:{bg:"var(--accent-pill-bg)",c:"var(--accent)"},ground:{bg:"var(--success-bg)",c:"var(--success-fg)"},tower:{bg:"var(--warn-bg)",c:"var(--warn-fg)"},touring_carry:{bg:"var(--info-bg)",c:"var(--link)"},TBD:{bg:"var(--card-2)",c:"var(--text-dim)"}};

// Venue Grid 4.21 — seeded from bbno$ EU Production Binder
export const VENUE_GRID={
  "2026-05-04":{venue:"National Stadium",city:"Dublin, Ireland",capacity:2000,address:"145 S Circular Rd, Merchants Quay, Dublin D08 HY40",advanceContact:"Brian Fluskey",advanceEmail:"brianfluskey@gmail.com",techContact:"MWS Ltd — murt@mws.ie | Irish Rigging Services (stage/roof)",loadDock:"TBC — advance with Brian",loadIn:"TBC — advance with Brian. Brian to send venue info shortly per Apr 11 reply.",stageDims:"TBC via advance",rigging:"Yes — Irish Rigging Services",riggingNotes:"Advance with venue — no rigging spec in LX doc",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor (main + backup). Flown or ground-stack. Max ground-stack: 7.2m × 5m.",lxNotes:"Back Truss: 6x Quantum Profile, 6x MAC Aura, 6x 2-cell moles. Front: 6x MAC Aura, 6x 2-cell moles. Console: Avolites Arena. 2x Unique2 Hazers",audioNotes:"PA: D&B V Series 6/side mains + 6 out, D&B Y10P fills, 10x D&B V-SUB, D&B D80 amps. FOH: Midas Pro2. MON: Midas Pro2. 8-way Shure PSM1000 IEM. Provider: MWS Ltd (murt@mws.ie)",soundLimit:null,venuePower:"TBC — advance with venue",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"Advance SFX requirements with MWS Ltd / venue.",flags:"Show 1 of 2",busPower:"TBC — advance with venue (MWS/Brian Fluskey)"},
  "2026-05-05":{venue:"National Stadium",city:"Dublin, Ireland",capacity:2000,address:"145 S Circular Rd, Merchants Quay, Dublin D08 HY40",advanceContact:"Brian Fluskey",advanceEmail:"brianfluskey@gmail.com",techContact:"MWS Ltd — murt@mws.ie | Irish Rigging Services (stage/roof)",loadDock:"TBC — advance with Brian",loadIn:"NO load-out after show 1. Bus overnights. Load-out after show 2.",stageDims:"TBC via advance",rigging:"Yes — Irish Rigging Services",riggingNotes:"Advance with venue — no rigging spec in LX doc",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor (main + backup). Flown or ground-stack. Max ground-stack: 7.2m × 5m.",lxNotes:"Back Truss: 6x Quantum Profile, 6x MAC Aura, 6x 2-cell moles. Front: 6x MAC Aura, 6x 2-cell moles. Console: Avolites Arena. 2x Unique2 Hazers",audioNotes:"PA: D&B V Series 6/side mains + 6 out, D&B Y10P fills, 10x D&B V-SUB, D&B D80 amps. FOH: Midas Pro2. MON: Midas Pro2. Provider: MWS Ltd (murt@mws.ie)",soundLimit:null,venuePower:"TBC — advance with venue",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"Advance SFX requirements with MWS Ltd / venue.",flags:"Show 2 of 2 — fee cross-collat",busPower:"TBC — advance with venue (MWS/Brian Fluskey)"},
  "2026-05-07":{venue:"O2 Victoria Warehouse",city:"Manchester, UK",capacity:3500,address:"Trafford Park, Stretford, Manchester M17 1AB",advanceContact:"Tyrone",advanceEmail:"tyrone84@gmail.com",techContact:"Emlyn Spiers (Tech & Prod Mgr) — emlyn.spiers@gmail.com | 07591788868. GM: Russell Taylor-Toal — russell@o2victoriawarehouse.co.uk",loadDock:"Trafford Wharf Road yard. 3x 45ft trucks. Flat push ~10m. Man Utd home = 2 buses only; trucks tip & go.",loadIn:"Flat push from yard to stage, forked up. House crew: Manchester Stage & Crew (5hr call). Riggers: Knight Rigging Services.",stageDims:"28ft (8.5m) D max · 52ft (15.8m) W max · 4'6\" (1.37m) H. No wings — monitors on floor. Trim H 7m from stage.",rigging:"Yes — house I-beam grid (fixed). 9t total, 800kg max point load, 1.5t/beam. Cherry picker (venue supplies). No spreaders.",riggingNotes:"Fixed grid positions only. Cherry picker required from venue.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Flown or ground-stack. Max ground-stack: 7.2m × 5m.",lxNotes:"House rig: 28x Martin MAC Aura XB Wash, 26x Ayrton Diablo Profile, 12x GLP JDC1 Strobe, 6x Elation Cuepix Blinder WW2, 6x Chauvet E-260W Profile. Console: Avolites Arena. Hazer: 2x Hazebase Base Pro + 2x DMX Fan. 4x trusses: Drape/Back/Mid/Front (all 15m OV40).",audioNotes:"Main: 12x L-Acoustics K1 + 6x K2 + 16x KS28 subs + 4x KARA II centre + 8x KARA II rear + 4x ARCS II sidefills + 2x KS28 sidefill subs. FOH: DiGiCo SD12 D2. MON: DiGiCo SD12 D2. Multi run 50m around room.",soundLimit:"LAeq,T 105 dB + LCeq,T 112 dB. Pre-23:00: 15-min averages. Post-23:00/DJ: 5-min averages. F1 Acoustics on-site.",venuePower:"USR (LX/VX): 300A 3ph Powerlock + 125A + 63A + 32A 3ph. No separate audio power — advance with Emlyn. No mains distro/cabling on site.",co2:null,flames:"NO — PROHIBITED",pyro:"Permitted — full RA/MS + product data sheets required 2+ weeks advance. Closed stage possible.",confetti:"Permitted — bio-degradable, non-flammable only. £150 cleaning charge. Aim away from LX rig.",sfxNotes:"All SFX advance 2+ weeks min. Lasers: permitted, no crowd scanning (directly or diffracted), full RA/MS 2 weeks prior. Foam/handheld flares: NOT permitted. Smoke/haze: permission required day-of.",flags:"Show 1/3. Shore power not listed — advance with Emlyn. Truck parking: up to 5x 45ft trucks (Man Utd dependent).",busPower:"Parking: 2 buses. Shore power not listed in venue pack — advance with Emlyn. Truck parking: up to 5x 45ft trucks (Man Utd dependent).",fleetException:{reason:"Pack assumes 2 buses + 'trucks tip & go' on Man Utd home day. Trailer (2.85m) footprint not acknowledged; 2nd truck slot not confirmed.",action:"Re-advance with Tyrone (tyrone84@gmail.com): bus+trailer ≈20m combo + 2x 45ft trucks. Confirm overnight slot count and trailer placement.",status:"open"}},
  "2026-05-08":{venue:"O2 Victoria Warehouse",city:"Manchester, UK",capacity:3500,address:"Trafford Park, Stretford, Manchester M17 1AB",advanceContact:"Tyrone",advanceEmail:"tyrone84@gmail.com",techContact:"Emlyn Spiers (Tech & Prod Mgr) — emlyn.spiers@gmail.com | 07591788868",loadDock:"Trafford Wharf Road yard. 3x 45ft trucks. Flat push ~10m.",loadIn:"Flat push. House crew: Manchester Stage & Crew (5hr call). Riggers: Knight Rigging Services.",stageDims:"28ft (8.5m) D max · 52ft (15.8m) W max · 4'6\" (1.37m) H. Trim H 7m from stage.",rigging:"Yes — house I-beam grid (fixed). 9t total, 800kg max point load.",riggingNotes:"Fixed grid positions only. Cherry picker required from venue.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"House rig: 28x Martin MAC Aura XB Wash, 26x Ayrton Diablo Profile, 12x GLP JDC1 Strobe. Console: Avolites Arena. 4x trusses Drape/Back/Mid/Front.",audioNotes:"Main: 12x L-Acoustics K1 + 6x K2 + 16x KS28 subs. FOH: DiGiCo SD12 D2. MON: DiGiCo SD12 D2.",soundLimit:"LAeq,T 105 dB + LCeq,T 112 dB. F1 Acoustics on-site noise monitoring.",venuePower:"USR (LX/VX): 300A 3ph Powerlock + 125A + 63A + 32A 3ph. No mains distro/cabling on site.",co2:null,flames:"NO — PROHIBITED",pyro:"Permitted — full RA/MS + product data sheets 2+ weeks advance.",confetti:"Permitted — bio-degradable only. £150 cleaning charge.",sfxNotes:"All SFX advance 2+ weeks. Lasers: no crowd scanning. Foam/handheld flares: NOT permitted.",flags:"Show 2/3",busPower:"Parking: 2 buses. Shore power not listed — advance with Emlyn.",fleetException:{reason:"Continuation of May 7 — combo + 2nd truck not yet confirmed by Tyrone.",action:"Resolve via May 7 re-advance.",status:"open"}},
  "2026-05-10":{venue:"O2 Academy Glasgow",city:"Glasgow, UK",capacity:2354,address:"121 Eglinton St, Glasgow G5 9NT",advanceContact:"Barry McKenna",advanceEmail:"barry.mckenna@dfconcerts.co.uk",techContact:"Rob Watson (Technical Mgr) — rob@o2academyglasgow.co.uk. GM: Chris Johnston — chrisjohnston@o2academyglasgow.co.uk",loadDock:"Bedford St — flat push. Door: 1.95m×2.10m, ramp 910mm to stage.",loadIn:"Min 6 crew per truck. Min 4 hands to tip (tight access). Book crew via rob@o2academyglasgow.co.uk",stageDims:"10.4m W × 8.06m D × 1.5m H × 7.15m clearance",rigging:"Yes — house rigging. Advance with Rob Watson.",riggingNotes:"Section 89 application needed for risers >2ft (14 days prior). 2x8'×4' + 1x8'×2' steel deck available.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"In-house LX per contract (FEU). No followspots or comms in-house — rental via Rob. 2-4 follow spot positions in balcony booths.",audioNotes:"In-house PA per contract (FEU). Advance specs with Rob Watson.",soundLimit:null,venuePower:"Shore: 4x 16A/1 Ceeform (above stage door). All 110V max for portable. 3-phase via Powerlock/CEE-form.",co2:"TBC — advance with venue",flames:"NO — not normally allowed (vertical exclusion 6m min)",pyro:"Permitted with 28-day advance notice. Full RA/MS + MSDS. Radial exclusion zones apply.",confetti:"Permitted — paper/biodegradable only. No metallic. £500 post-show cleanup. Full RA/MS + MSDS 28 days prior.",sfxNotes:"SFX/Lasers: See APPENDIX 1 in venue H&S pack. Must be advanced.",flags:"⚠ Advance contact is Barry McKenna — NOT Charmaine Hardman. Show 1/2.",busPower:"Shore power: 4x 16A/1 Ceeform above/right of stage door. Bus lot: Kilbarchan Street (private area rear of venue)."},
  "2026-05-11":{venue:"O2 Academy Glasgow",city:"Glasgow, UK",capacity:2354,address:"121 Eglinton St, Glasgow G5 9NT",advanceContact:"Barry McKenna",advanceEmail:"barry.mckenna@dfconcerts.co.uk",techContact:"Rob Watson (Technical Mgr) — rob@o2academyglasgow.co.uk",loadDock:"Bedford St — flat push. Door: 1.95m×2.10m.",loadIn:"Min 6 crew per truck. Min 4 hands to tip. Book crew via Rob.",stageDims:"10.4m W × 8.06m D × 1.5m H × 7.15m clearance",rigging:"Yes — house rigging. Advance with Rob Watson.",riggingNotes:"Section 89 application for risers >2ft (14 days prior).",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"In-house LX per contract (FEU). Rental followspots/comms via Rob. 2-4 follow spot positions.",audioNotes:"In-house PA per contract (FEU). Advance specs with Rob Watson.",soundLimit:null,venuePower:"Shore: 4x 16A/1 Ceeform above stage door. 3-phase via Powerlock/CEE-form.",co2:"TBC",flames:"NO",pyro:"Permitted — 28-day advance notice. Full RA/MS + MSDS.",confetti:"Permitted — paper/biodegradable only. £500 post-show cleanup.",sfxNotes:"SFX/Lasers: APPENDIX 1 in venue H&S pack.",flags:"⚠ Advance contact is Barry McKenna — NOT Charmaine Hardman. Show 2/2 — no separate fee.",busPower:"Shore: 4x 16A/1 Ceeform above/right stage door. Bus lot: Kilbarchan Street."},
  "2026-05-13":{venue:"O2 Academy Brixton",city:"London, UK",capacity:4851,address:"211 Stockwell Rd, Brixton, London SW9 9SL",advanceContact:"Tyrone | production@o2academybrixton.co.uk",advanceEmail:"tyrone84@gmail.com",techContact:"Advance to production@o2academybrixton.co.uk. Contact GM/Tech for SFX, laser, rigging, filming requests.",loadDock:"Stockwell Park Walk (rear). 2x trucks + 2x buses. What3Words: mixed.packet.length. ONE-WAY — enter via Stockwell Rd or from Stockwell tube.",loadIn:"Flat push ~10m to stage (upstage centre). Load-in: 10:00 AM. Load-out: within 1.5hrs after show. No vehicle movement 30min pre-doors to venue-clear.",stageDims:"15.70m D (51'6\") × 10.1m W (33'2\"). Proscenium arch: 17m (55'9\"). Stage H: 1.2m (3'11\"). No thrust. 40ft backdrop/banner truss available.",rigging:"Yes — advance all rigging plots for approval. Follow spots reduce saleable capacity.",riggingNotes:"No dedicated in-house riggers. Advance rigging plots for approval.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"Front/Mid/Back trusses (all 40ft pre-rig). Front: 8x MAC Aura PXL + 8x MAC Ultra + 4x Chauvet Strike Array. Mid: 8x MAC Aura PXL + 6x MAC Ultra + 4x Strike Array + 4x GLP JDC1. Back: 8x MAC Aura PXL + 8x MAC Ultra + 4x GLP JDC1. Console: MA3 Light + Avolites Tiger Touch. Hazer: 2x Cirro MK3. De-rig of house PA/LX: £3,200 — 1 month notice.",audioNotes:"Mains: 16x L-Acoustics K1 (8/side) + 8x K1SB + 6x K2 downs. Subs: 16x KS28. Front fill: 4x A10 Focus. Under-balcony: 10x A10i Wide. FOH: DiGiCo Quantum 225 (HMA fibre + Waves). MON: DiGiCo Quantum 225. FOH pos: FIXED 19m from DSE, 3.56m D × 6m W × 0.6m high.",soundLimit:null,venuePower:"SR (LX): 300A 3ph PowerLock + 2x32A + 1x63A 3ph + 4x16A + 1x32A + 1x63A single. SL (audio): 125A Ceeform 3ph + 2x63A + 2x32A 3ph + 1x63A + 1x32A + 4x16A single. NOTE: No mains distro or cabling on site.",co2:"Not specifically permitted — advance with venue/Lambeth Council",flames:"Not specifically permitted",pyro:"Permitted — Lambeth Council approval req'd via venue. 1 month advance. Full product info + RAMS + certification + proof of operator competence.",confetti:"Permitted — £200+VAT cleaning. Paper/biodegradable only, no metallic.",sfxNotes:"⚠ LASER DOCS OUTSTANDING — Tyrone chasing Apr 16. Sheck promised EOD Apr 16 PT. Lambeth Council approval req'd 1 month before May 13 — deadline may have passed. Foam/handheld flares: NOT permitted.",flags:"⚠⚠ LASER DOCS CRITICAL — Lambeth deadline may be passed. ESCALATE. Confirm with Cody + Sheck docs sent. Parking dispensation covers load dock only — confirm overnight scope with Tyrone.",busPower:"2x 16A single-phase Ceeform + 2x 32A 3-phase Ceeform. 2 trucks + 2 buses on Stockwell Park Walk."},
  "2026-05-15":{venue:"Halle 622",city:"Zurich, Switzerland",capacity:3614,address:"Binzmühlestrasse 85, Zurich 8050",advanceContact:"Roger Fisch (Production)",advanceEmail:"roger.fisch@maag-moments.ch",techContact:"Julia Kinas — julia.kinas@maag-moments.ch | +41 44 444 26 98. Roger Fisch — roger.fisch@maag-moments.ch | +41 79 622 65 65.",loadDock:"Binzmühlestrasse 85 — flat push 30m to stage, 2 trucks at a time. Bus parking: max 6. Shore: 1x63A→2xCEE32A, 3xCEE32A→3xCEE16A",loadIn:"Load in via big empty hall next to concert hall, no stairs. Forklift avail (max 1500kg, extra charge).",stageDims:"10-14m W × 8-10m D × 1.40m H. Bütec 2m×1m elements. Clearance: 11m floor→pre-rigg, 12.5m floor→ceiling, 10m→ventilation SR.",rigging:"Pre-rigg installed (ST + XD spreaders). 3 beams (middle + ±6m). ALL points must be defined + checked by Winkler in advance. NOT included in rent.",riggingNotes:"Rigging via Winkler Livecom. Advance all points. Max floor load 3500kg/m2. Stage: 5kN/500kg per m2.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"In-house: 2x Projector PT-DZ21K2 (20K lumen) + motorized screen 8×6.5m. NOTE: Touring LED wall will replace.",lxNotes:"LX NOT incl in rent. 55x Ares LED Wash, 20x Sharpy, 20x Solaspot 1500, 13x Sparx10, 9x RoXX Cluster B2 Blinder. Under balc: 48x Par30, 20x Ares XS. FOH: RoadHog 4 + MA3. 2x follow spot positions (rent from Winkler).",audioNotes:"PA NOT incl in rent. D&B V-Line 8x Vi8/side. 12x D&B J-SUB (upgradeable to 16). Delay: D&B Y-Line 8x Yi8/side. Nearfill: 4x D&B Q10. Amps: 22x D&B D12. FOH: Yamaha CL5 + Rio 32-24. 4x Shure UHF-R wireless. DJ: Pioneer CDJ2000/3000, DJM-900NX2.",soundLimit:"100 dBA avg/1hr max in public area. 125 dBA peak. Measured at FOH.",venuePower:"230/400V 50Hz. Stage: 2xCEE125 + PowerLock 400A (or 2x200PL) + CEE63 distro (USR). Mid-hall: CEE125 + CEE63 (SR wall, FOH power). Under balc: CEE63. Balcony: CEE32 (follow spots).",co2:"TBC — check with local fire police",flames:"TBC — check with local fire police",pyro:"Must be approved by local fire police — send specs in advance.",confetti:"Not mentioned — advance with venue",sfxNotes:"Pyro/Laser: Must be approved by local fire police — send specs in advance. Haze: Unique2 available (extra cost). No smoking anywhere. No gas cooking.",flags:"Merch: CHF 250 flat fee in entrance foyer. FOH: ~22m from DSE, 6x3m area. No drive-up to stage. Forklift max 1500kg. LX and audio NOT in venue rent — full touring package required.",busPower:"Shore: 1x 63A (→2x32A Ceeform) + 3x32A (→3x16A). 230/400V. Max 6 buses/trucks on site."},
  "2026-05-16":{venue:"Palladium",city:"Cologne, Germany",capacity:4000,address:"Schanzenstraße 40, 51063 Köln",advanceContact:"Oliver Zimmermann (LN DE Production)",advanceEmail:"oliver.zimmermann@livenation-production.de",techContact:"Oliver Zimmermann — oliver.zimmermann@livenation-production.de",loadDock:"Rear of Palladium at ground level. Parking confirmed both vehicles 2 nights (May 16-18). Shore power 32A 3ph CONFIRMED.",loadIn:"Local crew 8:00 AM; tour joins 11:00 AM, complete ~3:00 PM. NO load-out (show 1 of 2). Bus overnights.",stageDims:"TBC — no venue docs on file. Advance with Oli.",rigging:null,riggingNotes:"No separate venue docs — advance with Oli (oliver.zimmermann@livenation-production.de).",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"In-house LX (FEU, max €12,500). Advance spec with Oli. IEM G10 (470-542 MHz) + mic A band (470-636 MHz) OK for Germany — no RF permits needed.",audioNotes:"In-house PA (FEU). Advance spec with Oli.",soundLimit:null,venuePower:"TBC — advance with Oli",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"Lasers: local LSO REQUIRED at artist expense — Day 1 (May 16): €1,600. Day 2 (May 17): €1,200. LSO arranged via Oli. Need: laser company name+address, touring LSO name + documents.",flags:"No separate venue docs on file. Show 1/3. LX cap €12,500. Hospo budget: €5,400 total (both shows). Loaders double as hands (4h min, 6h call). Security meeting 3:30 PM. No work permits for touring staff. WHT applicable — sheet from Oli pending. Guest: 30/show on balcony SR VIP.",busPower:"Shore power 32A 3-phase CONFIRMED. Rear parking confirmed both vehicles 2 nights (May 16-18)."},
  "2026-05-17":{venue:"E-Werk (contract: Palladium)",city:"Cologne, Germany",capacity:4000,address:"Schanzenstraße 40, 51063 Köln",advanceContact:"Oliver Zimmermann (LN DE Production)",advanceEmail:"oliver.zimmermann@livenation-production.de",techContact:"Gerhard Hammer (Technical Dir) — gerhard.hammer@koeln-event.de | David Steinhorn — david.steinhorn@koeln-event.de | GM: Wilhelm Wirtz — +49 221-9679-0",loadDock:"Rear of hall, ground level, direct trailer access. Both gates 3.98m W × 4m H. Backstage parking area behind venue.",loadIn:"Deliveries at rear, ground level. Hard-wearing steel-fibre concrete flooring. Crane available (endposition on floor plan).",stageDims:"Mobile NIVOflex stage: standard 13m W × 10m D × 1.5m H (+ extensions). Ceiling: 11m, clearance 10.2m mid-hall, 8m from stage floor. Load gate: 3.98m W × 4m H. Side hall: 7.25m ceiling, 6m clearance.",rigging:null,riggingNotes:"Advance with Gerhard Hammer / Oli Zimmermann.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"In-house LX (FEU, max €12,500). Advance spec with Oli.",audioNotes:"In-house PA (FEU). Advance spec with Oli.",soundLimit:null,venuePower:"STV 1-1 (sound): 125A + 63A + 32A + 16A CEE. STV 1-2 (lights): 2x125A + 2x63A + 2x32A + 2x16A. STV 1-4 (lights): 2x125A + 4x63A + 4x32A + 4x16A + 12x Schuko. STV 2-5 (coach/shore): 63A + 2x32A + 3x16A + 6x Schuko. Max total: 250A.",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"Lasers: local LSO REQUIRED at artist expense — Day 2 (May 17): €1,200. LSO arranged via Oli.",flags:"Hospo budget: €5,400 total both shows. Guest: 30/show + VIP balcony SR. No parking permits needed. Shore: 32A 3-phase confirmed. Loaders double as hands (6h min call). Show 2/3.",busPower:"STV 2-5: 63A + 2x32A CEE (backstage parking). STV 2-1: 1x32A CEE (secondary). Coach/shore cross-strut clearance to check on-site."},
  "2026-05-19":{venue:"AFAS Live",city:"Amsterdam, Netherlands",capacity:6000,address:"ArenA Boulevard 590, Amsterdam 1101",advanceContact:"John Cameron (MOJO advance)",advanceEmail:"j.cameron@mojo.nl",techContact:"AFAS Live / MOJO Concerts. RF coordinator: Kees Heegstra (Camel & Co) — rf-coordination@camel-co.nl | +31 6 52490951. Frequencies required 4 weeks before show.",loadDock:"TBC — advance with venue/MOJO. NOTE: No truck ramps (double ramp NOT allowed). Forklift available.",loadIn:"Forklift available. NO truck ramps allowed. All rigging via staircase to catwalk. House riggers mandatory.",stageDims:"Stage Dex modular (Prolyte), adjustable H 10cm–2m. Standard: 18m W × 12m D (or 10m D). H: 1.80m standing / 1.60m seated. Stage must be min 1m from rear wall.",rigging:"Yes — Frontline Rigging Consultants (in-house, mandatory). House riggers must be present. Rigging plot due 3 weeks before show.",riggingNotes:"Beam: flat trussed I-beam. Floor to beam: 17.50m / 21.00m. Beam-to-beam: 7.80m. SWL: 468 kg/m lower / 535 kg/m upper beam.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"TBC — advance with MOJO/venue.",audioNotes:"TBC — advance with MOJO/venue.",soundLimit:null,venuePower:"SR (L1/LX): 400A Powerlock + 3x125A + 2x63A + 4x32A, max 630A/phase. SC (K14/VX): 400A PL + 3x125A + 2x63A + 4x32A, max 630A/phase. SL (K1/audio): 200A PL + 2x125A + 2x63A + 3x32A, max 250A/phase. All audio amps MUST connect to K1 (SL).",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"RF/wireless: ALL frequencies (IEM, RF, mics, intercoms, pyro, DECT, WiFi) must be filed with Camel & Co 4 weeks before show. Dutch Telecom Agency inspects on site — illegal freqs = show stop + fine. LED walls must comply with EU EMC Directive 2014/30/EC.",flags:"⚠ RF filing with Camel & Co MANDATORY 4 weeks before show. Rigging plot mandatory 3 weeks prior to Frontline. Backstage WiFi: AFAS Live Production / Amsterdam!. Fixed internet via UTP patch.",busPower:"Shore power: TBC — advance with MOJO.",fleetException:{reason:"No truck ramps allowed; forklift only. 2x 45ft truck unload sequencing not noted in pack. Combo length not on parking advance.",action:"Re-advance with John Cameron (j.cameron@mojo.nl): 2-truck unload order + bus+trailer parking confirmation.",status:"open"}},
  "2026-05-20":{venue:"Le Bataclan",city:"Paris, France",capacity:1694,address:"50 Blvd Voltaire, Paris 75011",advanceContact:"Cyril",advanceEmail:"c.legauffey@gmail.com",techContact:"Cyril (c.legauffey@gmail.com) | Damien Chamard Boudet (LN FR promoter) — damien.chamardboudet@livenation.fr",loadDock:"50 Boulevard Voltaire (main entrance). Flat push 40m (131ft), 3 steps down to pit then venue ramp to stage. Bus zone: 23m on Bd Voltaire 50-52 (1x32A). Cycle path: 54-56 Bd Voltaire (1x16A, last resort).",loadIn:"From main entrance. No crash barriers in-house (Mojo available on demand). Upstage 1m line = emergency exit — NO storage.",stageDims:"17.85m W × 7.37m D (avg) × 1.06m H × 11m opening.",rigging:"Yes — stage truss + house truss (from light plots). House truss only — fixed positions.",riggingNotes:"See plan de feu PDF for exact positions and circuits. House truss fixed only.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"House truss (fixed): 10x MAC Aura, 5x MAC Viper Profile, 6x PC 2KW, 4x PAR 64. Plan de feu on file. Stage: Diablo S, Zonda 3 FX, MAC Aura, Color Strike M, Molefay Two Light.",audioNotes:"⚠ Full audio spec not on file — advance with Cyril (c.legauffey@gmail.com). Catering: cold buffet at bar 10am-4pm for 20-25 pax.",soundLimit:null,venuePower:"⚠ Power spec not on file — advance with Cyril.",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"No gas cooking allowed. Emergency exit 1m zone upstage — no storage permitted. No barricade in-house.",flags:"⚠ Audio spec and power spec not in docs on file — pull from advance. No iron/fan/towels/tableware provided. Barricade: rental only via Mojo.",busPower:"Bus zone: 23m on Bd Voltaire 50-52 (1x32A). Cycle path 54-56 Bd Voltaire (1x16A, imperative need only). No electrical at 44-46 Bd Voltaire.",fleetException:{reason:"Bus zone 23m on Bd Voltaire 50-52 (1x32A) fits ≈20m combo, but no truck zone documented for 2x 45ft trucks. Cycle path overflow only takes 1x16A.",action:"Re-advance with Cyril (c.legauffey@gmail.com): 2-truck parking + power for trucks if shore needed.",status:"open"}},
  "2026-05-22":{venue:"Fabrique",city:"Milan, Italy",capacity:3100,address:"Via Gaudenzio Fantoli 9, Milan 20138",advanceContact:"Andrea Aurigo / Micaela Armigero (LN Italy)",advanceEmail:"andrea.aurigo@livenation.it",techContact:"andrea.aurigo@livenation.it / micaela.armigero@livenation.it",loadDock:"TBC — advance with Andrea/Micaela. Flag: tunnel clearance issue noted in tour notes.",loadIn:"TBC — advance with Andrea/Micaela.",stageDims:"TBC — no venue docs on file.",rigging:null,riggingNotes:"No venue docs on file.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"TBC — advance with LN Italy.",audioNotes:"TBC — advance with LN Italy.",soundLimit:null,venuePower:"TBC",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"TBC — advance with venue.",flags:"⚠ PRODUCTION CONTRACT ONLY — principal terms may be separate. ⚠ No venue docs on file — advance with Andrea/Micaela immediately. ⚠ Tunnel clearance issue flagged in tour notes.",busPower:"TBC"},
  "2026-05-24":{venue:"SaSaZu",city:"Prague, Czech Republic",capacity:2200,address:"Bubenské nábřeží 306/13, Prague 170 00",advanceContact:"Barbora",advanceEmail:"bara@fource.com",techContact:"Fource Productions — advance with Barbora (bara@fource.com)",loadDock:"TBC — advance with Barbora. No venue docs on file.",loadIn:"TBC — advance with Barbora.",stageDims:"TBC — no venue docs on file.",rigging:null,riggingNotes:"No venue docs on file.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"TBC — advance with Barbora.",audioNotes:"TBC — advance with Barbora.",soundLimit:null,venuePower:"TBC",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"TBC",flags:"⚠ No venue docs on file (folder contains shortcut files only). Advance with Barbora ASAP. Post-Prague: 3 flights to book TBD.",busPower:"TBC",fleetException:{reason:"No venue docs on file; combo + 2-truck arrival not advanced. Bubenské nábřeží area access for ≈20m combo unverified.",action:"Initiate full advance with Barbora (bara@fource.com): include fleet topology (bus+trailer + 2 trucks) and parking.",status:"open"}},
  "2026-05-26":{venue:"Columbiahalle",city:"Berlin, Germany",capacity:3500,address:"Columbiadamm 13-21, Berlin 10965",advanceContact:"Oliver Zimmermann (LN DE Production)",advanceEmail:"oliver.zimmermann@livenation-production.de",techContact:"Oliver Zimmermann — oliver.zimmermann@livenation-production.de",loadDock:"TBC — no venue docs on file.",loadIn:"TBC — advance with Oli.",stageDims:"TBC — no venue docs on file.",rigging:null,riggingNotes:"No venue docs on file — advance with Oli.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"In-house LX (FEU, max €12,500). Advance with Oli.",audioNotes:"In-house PA (FEU). Advance with Oli.",soundLimit:null,venuePower:"TBC — advance with Oli",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"TBC — advance with Oli. Laser LSO requirements same as Cologne — check with Oli.",flags:"⚠ No venue docs on file. Show 3/3. LX cap €12,500. Advance with Oli immediately.",busPower:"TBC"},
  "2026-05-28":{venue:"Majestic Music Club",city:"Bratislava, Slovakia",capacity:1000,address:"Karpatska 2, Bratislava 811 05",advanceContact:"Peter Lipovsky",advanceEmail:"peter.lipovsky@gmail.com",techContact:"Peter Lipovsky — peter.lipovsky@gmail.com | +421 949 609 279. Máté Horváth — mate.horvath@livenation.hu. Gabi Révész — gabi.revesz@livenation.hu (add to all threads).",loadDock:"DROP & GO ONLY. No forklift. 14 steps up to venue. Bus+truck overnight: Refinery Gallery — 48.128201, 17.180051 (bus has 32/3 power; truck no power). Check-in May 27, check-out May 29.",loadIn:"Drop & go only. 8 stagehands standard for truck unload. 10-12 hands for heavy items (GT truss). Runner: 7-seater van available all day.",stageDims:"10.5m W × 6.5m D × 1.3m H × 5.6m clearance. Wings: 2m W × 5m D. Fully carpeted, flat. Risers: 6x Nivtec 2x1m @ 40/60/80cm.",rigging:"Yes — from light plot. Ceiling 6m clearance, 4.5m to lighting trusses.",riggingNotes:"SGM Regia 2048 Live console. Ceiling 6m clearance, 4.5m to lighting trusses.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"⚠ VENUE LED ONLY — Diamond P3.9 5.5×3m + LVP 605 processor provided by Peter. Touring ROE LED NOT required (ground-stack clearance 4.5m max). Confirm VJ signal routing with Peter.",lxNotes:"Console: SGM Regia 2048 Live. Fixtures: 8x Robe 575XT, 6x Hero Wash 300FC, 10x Varytec Hero Beam 100, 4x Stairville Wild Wash 648 LED (SL+SR), 3x Wild Wash 648 (CS), 6x Varytec Hero Wash 300TW (DS), 4x Hero Wash 300FC (US), 2x LED Matrix 5x5 Blinder, 2x AFH-600 Hazer (US), 2x Botex SP-1500 Strobe.",audioNotes:"PA: 6x NEXO GEO M1210 + 1x NEXO GEO M1220/side + 6x EV PX2181 sub. FOH: Midas Legend 3000. MON: 6x ZxA5 active + 2x EV TX1811 drum/sidefills. 4x CAT5 available.",soundLimit:null,venuePower:"⚠ IN-HOUSE: 2x32/3 OR 1x63/3 (no combos). Generator will be added. Generator connection: 1x125/3 or multiple 63/3 or Powerlocks (NO CAMLOCKS). US vs EU voltage discrepancy flagged — Sheck to confirm power spec with Neg Earth. LED: 1x32/3 or 1x63/3.",co2:null,flames:null,pyro:"Lasers: 8x 30W (per Sheck). LSO docs being gathered.",confetti:null,sfxNotes:"Lasers: 8x 30W per Sheck. LSO docs in progress. VJ connection + location not yet specified — Sheck to confirm.",flags:"⚠ NO FORKLIFT — 14 stairs up. ⚠ Power discrepancy US vs EU — Sheck to confirm with Neg Earth. ⚠ No on-site parking — MUST reserve Refinery Gallery in advance. Touring LED NOT needed. Catering list requested by Peter — send immediately. Security: 2 from M&G onward, 6 total.",busPower:"⚠ No on-site parking. Bus power (32/3) available 5km/20min from venue — MUST reserve in advance. Contact Peter for reservation.",fleetException:{reason:"Drop & go only, 14 stairs, no on-site parking. Refinery Gallery overnight booked for 1 bus + 1 truck (only bus has 32/3 power). Now 1 bus+trailer + 2 trucks.",action:"Re-advance with Peter Lipovsky (peter.lipovsky@gmail.com): confirm Refinery Gallery slot count, additional truck-power options, and 2-truck drop&go sequencing for May 28.",status:"open"}},
  "2026-05-30":{venue:"Orange Warsaw Festival",city:"Warsaw, Poland",capacity:30000,address:"Sluzewiec Horse Racing Track, Pulawska 266, Warsaw",advanceContact:"Mikolaj Ziolkowski",advanceEmail:"mikolaj.ziolkowski@alterart.pl",techContact:"Mikolaj Ziolkowski / AlterArt — contact to be established via Wasserman booking",loadDock:"TBC — festival show.",loadIn:"TBC — festival show. Min 60min.",stageDims:"TBC — festival stage.",rigging:null,riggingNotes:"Festival provided.",designVer:"BBNO$26_EUTOUR_v1.0.0_031526",ledNotes:"48x ROE Carbon 5.76 (600×1200mm). 2x Brompton S4 processor. Max ground-stack: 7.2m × 5m.",lxNotes:"Festival PA&Lights provided. Advance stage specs with AlterArt.",audioNotes:"Festival PA provided. Advance specs with AlterArt.",soundLimit:null,venuePower:"TBC — festival show. Advance with Mikolaj.",co2:null,flames:null,pyro:null,confetti:null,sfxNotes:"TBC — festival show.",flags:"⚠ No venue docs on file — festival show. 5 comp tix. Advance with Mikolaj/AlterArt for stage specs and power. Last show of EU run.",busPower:"TBC — festival show."},
};

// Tour rig specification — extracted from BBNO$26_EUTOUR_v1.0.0_031526.vwx + PDF
// Symbol Key (Sht-1), Elevation (Sht-2), Section (Sht-3), Staging (Sht-6)
// Designer: Mike Sheck | Drawn: 3/17-3/18/26 | © L7 Productions, LLC
export const DESIGN_RIG={
  version:"v1.0.0",
  file:"BBNO$26_EUTOUR_v1.0.0_031526.vwx",
  drawnBy:"Mike Sheck",
  publishedAt:"2026-03-17",
  // Confirmed quantities from Symbol Key (Sht-1)
  fixtures:[
    {dept:"LIGHTING",name:"Ayrton Diablo",qty:8,power_w:550,position:"fly",source:"Sht-1 Symbol Key",binder_qty:12,delta:-4},
    {dept:"LIGHTING",name:"GLP JDC2 IP",qty:16,power_w:1500,position:"fly",source:"Sht-1 Symbol Key",binder_qty:12,delta:4},
    {dept:"LIGHTING",name:"ACME Pixel Line IP (Strobe 3 IP)",qty:12,power_w:420,position:"fly",source:"Sht-1 Symbol Key",binder_qty:48,delta:-36,note:"Binder quotes 48 — verify if additional positions exist beyond overview plan"},
    {dept:"LIGHTING",name:"Robe iForte",qty:2,power_w:800,position:"fly",source:"VWX binary",binder_qty:2,delta:0},
    {dept:"LASERS",name:"Kvant LD33 Spectrum RGBY",qty:8,power_w:33,position:"ground",source:"Sht-1 Symbol Key",binder_qty:3,delta:5},
    {dept:"VIDEO",name:"ROE MC-5H T4v Frame LED Panel",qty:48,power_w:400,position:"ground",source:"Sht-1 Symbol Key",binder_qty:60,delta:-12},
    {dept:"VIDEO",name:"ROE Black Marble BM4",qty:null,power_w:null,position:"fly",source:"VWX binary",binder_qty:null,note:"In VWX design; binder quotes ROE Carbon CB5. Different panel spec — CONFIRM"},
    {dept:"VIDEO",name:"Brompton S4 Processor",qty:2,power_w:250,position:"ground",source:"binder",binder_qty:2,delta:0},
    {dept:"VIDEO",name:"ROE Vanish S Curved Panels",qty:null,power_w:null,position:"ground",source:"VWX binary",binder_qty:0,note:"In design file — no vendor quote found"},
    {dept:"TRUSS",name:"Tyler Truss GT 10' w/ Horizontal Forks",qty:6,power_w:null,position:"fly",source:"Sht-1 Symbol Key",binder_qty:null},
    {dept:"CONTROL",name:"GrandMA3 Full",qty:1,power_w:300,position:"ground",source:"binder",binder_qty:1,delta:0},
    {dept:"CONTROL",name:"GrandMA3 Light",qty:2,power_w:300,position:"ground",source:"binder",binder_qty:2,delta:0},
    {dept:"STAGING",name:"All Access River Stage (Green Astroturf)",qty:1,power_w:null,position:"ground",source:"Sht-6",binder_qty:null,note:"Rev B 3/12: shifted 2ft US, SFX added"},
  ],
  // Dimensions confirmed from drawings
  dims:{
    rig_width_mm:7203,    // Sht-2 Elevation
    led_tower_h_mm:4913,  // Sht-3 Section
    fly_trim_mm:5840,     // Sht-3 Section (front truss fly height)
    stage_depth_mm:6494,  // Sht-3 Section
    stage_w_total_mm:9754,// Sht-6: 20' center + 6' each wing
  },
  // Minimum venue requirements derived from design
  req:{
    min_clearance_fly_m:7.0,   // fly trim 5.84m + overhead + safety = 7m minimum
    min_clearance_gs_m:5.5,    // LED towers 4.91m + safety for ground-stack
    min_stage_w_m:10.0,        // 9.75m stage + working space
    min_stage_d_m:7.0,         // 6.5m rig depth + front working space
    power_kw_est:95,           // 8×550 + 16×1500 + 48×400 + 12×420 + control + backline
    min_phase_a:200,
    laser_class:"Class 4",
    laser_count:8,
    laser_types:["Kvant LD33 RGBY"],
    requires_forklift:true,
    requires_rigging:true,
  },
  // Design vs quote discrepancies
  specDiscrepancies:[
    {severity:"CRITICAL",category:"QTY MISMATCH",finding:"GLP JDC2 IP: design=16, binder quote=12. 4 additional units not in Neg Earth quote 26-1273.",action:"Confirm qty with Neg Earth (Alex Griffiths). Update quote if 16 are required."},
    {severity:"HIGH",category:"QTY MISMATCH",finding:"Kvant LD33 RGBY: design=8, binder=3. 5 additional laser units not quoted — significant cost + compliance gap.",action:"Confirm qty with Sonalyst (quote 26-0097). LSO docs must cover all 8 units per jurisdiction."},
    {severity:"HIGH",category:"UNQUOTED FIXTURE",finding:"ROE Black Marble BM4 panels in VWX design — binder quotes ROE Carbon CB5 (different pitch/IP/weight). Spec not aligned.",action:"Confirm final panel spec with Neg Earth and Sigma-1 (Michael Heid). CB5 and BM4 are not interchangeable."},
    {severity:"HIGH",category:"UNQUOTED FIXTURE",finding:"ROE Vanish S curved panels in VWX — no vendor quote found in binder.",action:"Confirm with Neg Earth if Vanish panels are in scope. Source vendor or remove from design."},
    {severity:"MEDIUM",category:"QTY MISMATCH",finding:"Ayrton Diablo: design=8, binder=12. 4 units in binder may be over-specced — or used in additional positions not shown in overview plan.",action:"Confirm with LD (Gabe Greenwood) what the actual Diablo count is per show."},
    {severity:"MEDIUM",category:"QTY MISMATCH",finding:"ROE MC-5H: design=48 panels, binder=60. 12-panel gap — confirm final panel count with Neg Earth.",action:"Update manifest qty to match final agreed count."},
    {severity:"MEDIUM",category:"ACME VARIANT",finding:"ACME Pixel Line: design specifies 'Strobe 3 IP' variant (12 units); binder quotes generic 'Pixel Line IP' (48 units). Model variant and quantity both diverge.",action:"Confirm exact model variant and total qty with Neg Earth. Strobe 1 vs Strobe 3 affects DMX patching."},
  ],
};

// Parse ceiling clearance from venue text fields
function parseClearance(stageDims,riggingNotes,lxNotes){
  const t=`${stageDims||""} ${riggingNotes||""} ${lxNotes||""}`;
  const patterns=[
    /(\d+(?:\.\d+)?)\s*m\s+clearance/i,
    /clearance\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*m/i,
    /trim\s*[hH]\s*(\d+(?:\.\d+)?)\s*m/i,
    /(\d+(?:\.\d+)?)\s*m\s+from\s+stage/i,
    /(\d+(?:\.\d+)?)\s*m\s*(?:to\s+)?(?:pre-rigg|ceiling|trusses)/i,
    /(\d+(?:\.\d+)?)m\s*floor.{1,15}(?:ceil|rigg|beam)/i,
    /ceiling\s+(\d+(?:\.\d+)?)\s*m/i,
  ];
  for(const p of patterns){const m=t.match(p);if(m)return parseFloat(m[1]);}
  return null;
}
function parseStageW(stageDims){
  const t=stageDims||"";
  const m=t.match(/(\d+(?:\.\d+)?)\s*m\s+W/i)||t.match(/W\s+(?:max\s+)?(\d+(?:\.\d+)?)\s*m/i)||t.match(/(\d+(?:\.\d+)?)m\s+wide/i)||t.match(/(\d+(?:\.\d+)?)\s*m\s*(?:W|wide)/i);
  if(m)return parseFloat(m[1]);
  const ft=t.match(/(\d+(?:\.\d+)?)\s*ft\s+W/i)||t.match(/W\s+(?:max\s+)?(\d+(?:\.\d+)?)\s*ft/i);
  if(ft)return Math.round(parseFloat(ft[1])*0.3048*10)/10;
  return null;
}
function parseStageD(stageDims){
  const t=stageDims||"";
  const m=t.match(/(\d+(?:\.\d+)?)\s*m\s+D/i)||t.match(/D\s+(?:max\s+)?(\d+(?:\.\d+)?)\s*m/i);
  if(m)return parseFloat(m[1]);
  const ft=t.match(/(\d+(?:\.\d+)?)\s*ft\s+D/i)||t.match(/D\s+(?:max\s+)?(\d+(?:\.\d+)?)\s*ft/i);
  if(ft)return Math.round(parseFloat(ft[1])*0.3048*10)/10;
  return null;
}

export function checkRigVsVenue(vg){
  if(!vg)return[];
  const issues=[];
  const r=DESIGN_RIG.req;
  const d=DESIGN_RIG.dims;

  // 1. Ceiling clearance
  const clr=parseClearance(vg.stageDims,vg.riggingNotes,vg.lxNotes);
  if(clr!==null){
    const ledH=d.led_tower_h_mm/1000;
    const flyH=d.fly_trim_mm/1000;
    if(clr<ledH+0.3){
      issues.push({id:"rv_clr",severity:"CRITICAL",category:"CLEARANCE",
        finding:`${clr}m clearance — LED towers are ${ledH}m tall. Ground-stack will NOT fit. Touring rig cannot be deployed as designed.`,
        action:`Advance modified plot with LD (Gabe Greenwood). Confirm venue LED substitute or reduce tower height. Min ${ledH+0.3}m needed for ground-stack.`});
    } else if(clr<r.min_clearance_gs_m){
      issues.push({id:"rv_clr",severity:"HIGH",category:"CLEARANCE",
        finding:`${clr}m clearance is tight — LED towers at ${ledH}m need ${r.min_clearance_gs_m}m min for safe ground-stack deployment.`,
        action:"Advance rig trim with LD. Confirm exact measurement from stage deck to rigging. Safety margin may require reducing tower height."});
    } else if(clr<r.min_clearance_fly_m){
      issues.push({id:"rv_clr",severity:"MEDIUM",category:"CLEARANCE",
        finding:`${clr}m clearance — ground-stack OK (LED towers ${ledH}m), but fly trusses at ${flyH}m trim will be at or above venue limit. May need to reduce fly trim.`,
        action:"Advance rigging plot. Fly trim at "+flyH+"m may need to be dropped. Confirm with venue rigger and LD."});
    }
  } else if(!vg.stageDims||vg.stageDims.toLowerCase().includes("tbc")){
    issues.push({id:"rv_clr",severity:"HIGH",category:"CLEARANCE",
      finding:"Stage clearance height not on file. LED towers are 4.91m; fly trusses need 7m+ clearance.",
      action:"Advance stage dims with venue TD urgently. Minimum clearance spec: 5.5m ground-stack, 7m fly."});
  }

  // 2. Stage width
  const sw=parseStageW(vg.stageDims);
  if(sw!==null&&sw<r.min_stage_w_m){
    issues.push({id:"rv_sw",severity:sw<8?"CRITICAL":"HIGH",category:"STAGE WIDTH",
      finding:`Stage ${sw}m W — touring rig footprint is ${d.rig_width_mm/1000}m wide, full stage package is ${d.stage_w_total_mm/1000}m (wings included). Rig will exceed stage.`,
      action:"Advance modified stage plot with LD. Consider removing wing extensions. Confirm floor plan with Sigma-1 (Michael Heid)."});
  }

  // 3. Stage depth
  const sd=parseStageD(vg.stageDims);
  if(sd!==null&&sd<r.min_stage_d_m){
    issues.push({id:"rv_sd",severity:sd<6?"CRITICAL":"HIGH",category:"STAGE DEPTH",
      finding:`Stage ${sd}m D — rig requires ${r.min_stage_d_m}m min depth (LED ground stack ${d.stage_depth_mm/1000}m + front working space).`,
      action:"Advance modified plot with LD. Back wall LED may need to be moved upstage. Confirm with staging vendor (All Access)."});
  }

  // 4. Load access
  const loadTxt=`${vg.loadDock||""} ${vg.loadIn||""}`.toLowerCase();
  const stairsMatch=loadTxt.match(/(\d+)\s*step/);
  const hasStairs=stairsMatch||loadTxt.match(/\bstairs?\b/);
  const hasNoForklift=loadTxt.includes("no forklift")||loadTxt.includes("drop & go");
  if((hasStairs||hasNoForklift)&&!loadTxt.includes("forklift avail")){
    const stairCount=stairsMatch?parseInt(stairsMatch[1]):null;
    issues.push({id:"rv_load",severity:stairCount>=10?"CRITICAL":"HIGH",category:"LOAD ACCESS",
      finding:`${hasNoForklift?"No forklift. ":""}${stairCount?`${stairCount} stairs to stage. `:"Stairs to stage. "}Tyler GT Truss sections + All Access staging require forklift or crane. Total fly weight ~${r.power_kw_est}kW.`,
      action:"Arrange additional crew (min 12 hands for heavy items). Source hand-truck/ramp. Coordinate with venue contact and local production manager."});
  }

  // 5. Rigging not confirmed
  if(!vg.rigging||vg.rigging==="Festival provided"){
    issues.push({id:"rv_rig",severity:"HIGH",category:"RIGGING",
      finding:"No confirmed rigging system on file. Rig requires certified rigging for front truss at 5.84m trim.",
      action:"Advance rigging spec with venue TD. Required: certified rigger, grid or beam SWL >3t total, cherry picker or ladder access for trim."});
  } else if((vg.rigging||"").toLowerCase().includes("advance")){
    issues.push({id:"rv_rig",severity:"MEDIUM",category:"RIGGING",
      finding:"Rigging not yet advanced/confirmed. Rigging plot must be submitted to venue rigger before load-in.",
      action:"Submit rigging plot to venue rigger. Include hoist positions, trim heights, and total fly weight."});
  }

  // 6. Max point load
  const pointMatch=(vg.rigging||"").match(/(\d+)\s*kg\s*max\s*point/i)||(vg.riggingNotes||"").match(/(\d+)\s*kg\s*(?:max\s+)?point/i);
  if(pointMatch){
    const maxPt=parseInt(pointMatch[1]);
    const estMaxPt=Math.ceil((d.led_tower_h_mm/1000*48*23.5+16*23.5+8*21.8)/12); // rough est
    if(maxPt<estMaxPt){
      issues.push({id:"rv_pt",severity:"HIGH",category:"RIGGING CAPACITY",
        finding:`Venue max ${maxPt}kg/point — estimated rig needs ~${estMaxPt}kg/point. Fly weight may exceed per-point limit.`,
        action:"Provide detailed rigging plot to venue rigger. May need to spread load across more points or cut fly elements. Advance with Knight/IRS/Frontline per venue."});
    }
  }

  // 7. Lasers
  const sfxAll=`${vg.sfxNotes||""} ${vg.flags||""}`.toLowerCase();
  const laserTexts={
    blocked:sfxAll.includes("laser") && (sfxAll.includes("not permitted")||sfxAll.includes("not allowed")),
    deadlinePassed:sfxAll.includes("deadline may have passed")||sfxAll.includes("deadline")&&sfxAll.includes("passed"),
    docsOut:sfxAll.includes("laser") && (sfxAll.includes("outstanding")||sfxAll.includes("critical")||sfxAll.includes("escalate")||sfxAll.includes("docs")),
    lsoRequired:sfxAll.includes("lso required")||sfxAll.includes("lso docs"),
    approvalReq:sfxAll.includes("laser") && (sfxAll.includes("approval")||sfxAll.includes("permit")||sfxAll.includes("police")||sfxAll.includes("council")),
  };
  if(laserTexts.blocked){
    issues.push({id:"rv_las",severity:"CRITICAL",category:"LASER COMPLIANCE",
      finding:"Lasers may be restricted at this venue. Rig carries 8× Kvant LD33 RGBY (Class 4).",
      action:"Confirm laser status with venue and local authority. If prohibited, remove from day-of rig. Contact Cody Leggett (cody@photon7.com)."});
  } else if(laserTexts.deadlinePassed){
    issues.push({id:"rv_las",severity:"CRITICAL",category:"LASER COMPLIANCE",
      finding:`⚠ Laser approval deadline may have PASSED. 8× Kvant LD33 RGBY require local authority approval (Class 4).`,
      action:"ESCALATE NOW: Cody Leggett + Sheck. Confirm if approval was submitted. If deadline passed, lasers may be prohibited for this date."});
  } else if(laserTexts.docsOut||laserTexts.lsoRequired||laserTexts.approvalReq){
    issues.push({id:"rv_las",severity:"HIGH",category:"LASER COMPLIANCE",
      finding:`Laser docs/LSO/approval outstanding. 8× Kvant LD33 RGBY = Class 4 — requires advance approval per jurisdiction.`,
      action:`${laserTexts.lsoRequired?"Arrange local LSO at artist expense (per venue requirement). ":""}Submit RAMS + laser cert to venue/authority. Cody Leggett to confirm docs sent.`});
  }

  // 8. Power
  const pwrTxt=(vg.venuePower||"").toLowerCase();
  if(!pwrTxt||pwrTxt.includes("tbc")||pwrTxt.includes("not on file")){
    issues.push({id:"rv_pwr",severity:"HIGH",category:"POWER",
      finding:`Venue power spec not on file. Tour rig draws ~${r.power_kw_est}kW — requires min ${r.min_phase_a}A/phase at 400V 3-phase.`,
      action:"Request full power spec from venue TD. Minimum: 2× 125A 3-phase feeds (LX + audio separate). Confirm generator availability if venue power insufficient."});
  } else if(!pwrTxt.includes("powerlock")&&!pwrTxt.includes("125a")&&!pwrTxt.includes("200a")&&!pwrTxt.includes("400a")&&!pwrTxt.includes("63a")&&pwrTxt.length<20){
    issues.push({id:"rv_pwr",severity:"MEDIUM",category:"POWER",
      finding:"Power spec on file but may be insufficient. Confirm min 200A/phase 3-phase is available for LX+VX draw.",
      action:"Advance with venue TD."});
  }

  // 9. Venue provides LED (rig stays on truck)
  const ledTxt=(vg.ledNotes||"").toLowerCase();
  if(ledTxt.includes("venue led only")||ledTxt.includes("touring roe led not required")){
    issues.push({id:"rv_led",severity:"MEDIUM",category:"LED WALL",
      finding:"Venue provides LED wall — touring ROE/MC panels stay on truck. VJ signal routing changes.",
      action:"Confirm signal routing with venue TD and Michael Heid (Sigma-1). Brompton S4 processors may need to be removed from rack or rerouted to venue LED."});
  }

  // 10. Sound limit
  if(vg.soundLimit&&!vg.soundLimit.toLowerCase().includes("tbc")){
    issues.push({id:"rv_snd",severity:"LOW",category:"SOUND LIMIT",
      finding:`Sound limit: ${vg.soundLimit}`,
      action:"Brief Ruairi (FOH) and monitor engineer pre-show. Noise management may be on-site monitoring in real-time."});
  }

  // 11. Flames prohibited (rig doesn't have flames but flag if pyro was added — Rev B "Added SFX")
  const flamesTxt=(vg.flames||"").toLowerCase();
  if(flamesTxt.includes("no")||flamesTxt.includes("prohibited")||flamesTxt.includes("not allowed")){
    issues.push({id:"rv_sfx",severity:"LOW",category:"SFX RESTRICTION",
      finding:`Flames/fire restricted at this venue. Design Rev B added SFX — confirm no flame-based SFX in show.`,
      action:"Brief Sigma-1/show design: no flame SFX at this venue. CO2 and haze OK if separately cleared."});
  }

  return issues;
}

// ── LODGING TAB ─────────────────────────────────────────────────────────────

export const HOTEL_STATUS_META={
  pending:{label:"Pending",bg:"var(--warn-bg)",c:"var(--warn-fg)"},
  confirmed:{label:"Confirmed",bg:"var(--success-bg)",c:"var(--success-fg)"},
  checked_in:{label:"Checked In",bg:"var(--info-bg)",c:"var(--link)"},
  checked_out:{label:"Checked Out",bg:"var(--card-2)",c:"var(--text-2)"},
  cancelled:{label:"Cancelled",bg:"var(--danger-bg)",c:"var(--danger-fg)"},
};
export const ROOM_STATUS_META={
  pending:{label:"Pending",bg:"var(--warn-bg)",c:"var(--warn-fg)"},
  confirmed:{label:"Confirmed",bg:"var(--success-bg)",c:"var(--success-fg)"},
  occupied:{label:"Occupied",bg:"var(--info-bg)",c:"var(--link)"},
  released:{label:"Released",bg:"var(--card-2)",c:"var(--text-2)"},
};
