// api/lib/tourContext.js — shared tour context for all scanners (flights, intel, lodging)
// Single source of truth for crew roster, vendors, owner routing. Imported by
// scanner sysPrompts for disambiguation + by post-parse normalizers (crewId mapping).

const TOUR_CONTEXT = {
  artist: "bbno$",
  tour: "Internet Explorer Tour",
  tm: "Davon Johnson (d.johnson@dayofshow.net)",
  crew: [
    { id: "davon",   first: "Davon",    last: "Johnson",    role: "TM/TD",                      email: "d.johnson@dayofshow.net" },
    { id: "sheck",   first: "Mike",     last: "Sheck",      role: "PM Advance",                 email: "mikesheck@l7touring.com" },
    { id: "dan",     first: "Dan",      last: "Nudelman",   role: "PM On-site",                 email: "dan@noodle.management" },
    { id: "sam",     first: "Sam",      last: "Alavi",      role: "Artist Relations",           email: "sam@rightclick.gg" },
    { id: "adler",   first: "Matt",     last: "Adler",      role: "Wasserman agent",            email: "madler@the.team" },
    { id: "ruairi",  first: "Ruairi",   last: "Matthews",   role: "FOH Audio",                  email: "ruairim@magentasound.ca" },
    { id: "alex",    first: "Alex",     last: "Gumuchian",  role: "Headliner (bbno$)",          email: null },
    { id: "julien",  first: "Julien",   last: "Bruce",      role: "Jungle Bobby",               email: null },
    { id: "mat",     first: "Mat",      last: "Senechal",   role: "bass/keys",                  email: null },
    { id: "taylor",  first: "Taylor",   last: "Madrigal",   role: "DJ Tip",                     email: null },
    { id: "andrew",  first: "Andrew",   last: "Campbell",   role: "Bishu DJ",                   email: null },
    { id: "nick",    first: "Nick",     last: "Foerster",   role: "monitors",                   email: null },
    { id: "saad",    first: "Saad",     last: "A.",         role: "audio/BNE",                  email: null },
    { id: "gabe",    first: "Gabe",     last: "Greenwood",  role: "LD",                         email: null },
    { id: "cody",    first: "Cody",     last: "Leggett",    role: "lasers",                     email: null },
    { id: "heid",    first: "Michael",  last: "Heid",       role: "visual/set",                 email: null },
    { id: "grace",   first: "Grace",    last: "Offerdahl",  role: "Merch",                      email: null },
    { id: "nathan",  first: "Nathan",   last: "McCoy",      role: "merch dir",                  email: null },
    { id: "megan",   first: "Megan",    last: "Putnam",     role: "Hospo/GL",                   email: null },
    { id: "olen",    first: "O'Len",    last: "Davis",      role: "content",                    email: null },
    { id: "guillaume", first: "Guillaume", last: "Bessette", role: "bus driver",                email: null },
    { id: "olivia",  first: "Olivia",   last: "Mims",       role: "Transport Coordinator",      email: null },
    { id: "tony",    first: "Tony",     last: "Yacowar",    role: "CPA",                        email: "tyacowar@dmcl.ca" },
  ],
  vendors: [
    "Pieter Smit — EU nightliner bus (nightliner@pietersmit.com, contact: Toby Jansen)",
    "Fly By Nite — EU truck/freight (job 56714, contact: Fiona Nolan)",
    "Neg Earth — LX/VX production (contact: Alex Griffiths)",
    "TSL Lighting — LX quote J38723 (contact: Gemma Jaques)",
    "BNP — local production vendor (Red Rocks)",
  ],
  ownerMap:
    "DAVON=Davon Johnson, SHECK=Mike Sheck (advance/promoter comms), DAN=Dan Nudelman (on-site/production), " +
    "MANAGEMENT=Sam Alavi/Matt Adler/Wasserman, VENDOR=external vendors, CREW=tour crew members, ACCOUNTANT=Tony Yacowar",
};

function crewDisplayList() {
  return TOUR_CONTEXT.crew.map(c => {
    const em = c.email ? ` (${c.email})` : "";
    return `${c.first} ${c.last} — ${c.role}${em}`;
  });
}

function buildTourContextBlock() {
  return `Tour: ${TOUR_CONTEXT.tour} by ${TOUR_CONTEXT.artist}.
TM: ${TOUR_CONTEXT.tm}.
Crew: ${crewDisplayList().join("; ")}.
Vendors: ${TOUR_CONTEXT.vendors.join("; ")}.
Owner routing: ${TOUR_CONTEXT.ownerMap}.`;
}

module.exports = { TOUR_CONTEXT, buildTourContextBlock, crewDisplayList };
