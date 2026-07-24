import { T } from "../styles/tokens";
import { fmt24, fmtDur, toM } from "./time";

export const ALL_SHOWS=[
  {date:"2026-04-16",clientId:"bbn",city:"Morrison",venue:"Red Rocks Amphitheatre",country:"US",region:"na",promoter:"AEG / Sasha Minkov",advance:[{name:"Sasha Minkov",email:"sminkov@aegpresents.com",role:"Promoter",dept:"venue"}],doors:toM(17,30),curfew:toM(23,30),busArrive:toM(7),crewCall:toM(8),venueAccess:toM(7),mgTime:toM(16,30),notes:"Hard curfew 11:30p. BNP vendor. w/ Oliver Tree.",customRos:true},
  {date:"2026-05-01",clientId:"bbn",city:"Worcester",venue:"WPI",country:"US",region:"na",promoter:"Pretty Polly / Tori Pacheco",advance:[{name:"Dan Saldarini",email:"dan@prettypolly.com",role:"Promoter",dept:"venue"},{name:"Tori Pacheco",email:"tori@prettypolly.com",role:"Hospo",dept:"ar_hospo"}],doors:toM(19),curfew:toM(23),crewCall:toM(10),venueAccess:toM(9),mgTime:toM(16,30),notes:"Advance past due.",busSkip:true},
  {date:"2026-05-04",clientId:"bbn",city:"Dublin",venue:"National Stadium",country:"IE",region:"eu",promoter:"MCD / Zach Desmond",advance:[{name:"Brian Fluskey",email:"brianfluskey@gmail.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"Show 1/2."},
  {date:"2026-05-05",clientId:"bbn",city:"Dublin",venue:"National Stadium",country:"IE",region:"eu",promoter:"MCD / Zach Desmond",advance:[{name:"Brian Fluskey",email:"brianfluskey@gmail.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"Show 2/2."},
  {date:"2026-05-07",clientId:"bbn",city:"Manchester",venue:"O2 Victoria Warehouse",country:"GB",region:"eu",promoter:"LN UK / Kiarn Eslami",advance:[{name:"Tyrone",email:"tyrone84@gmail.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"Show 1/2."},
  {date:"2026-05-08",clientId:"bbn",city:"Manchester",venue:"O2 Victoria Warehouse",country:"GB",region:"eu",promoter:"LN UK",advance:[{name:"Tyrone",email:"tyrone84@gmail.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"Show 2/2."},
  {date:"2026-05-10",clientId:"bbn",city:"Glasgow",venue:"O2 Academy",country:"GB",region:"eu",promoter:"DF Concerts",advance:[{name:"Charmaine Hardman",email:"charmaine.hardman@dfconcerts.co.uk",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"Show 1/2."},
  {date:"2026-05-11",clientId:"bbn",city:"Glasgow",venue:"O2 Academy",country:"GB",region:"eu",promoter:"DF Concerts",advance:[{name:"Charmaine Hardman",email:"charmaine.hardman@dfconcerts.co.uk",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"Show 2/2."},
  {date:"2026-05-13",clientId:"bbn",city:"London",venue:"O2 Brixton Academy",country:"GB",region:"eu",promoter:"LN UK",advance:[{name:"Tyrone",email:"tyrone84@gmail.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"10h drive from Glasgow May 12."},
  {date:"2026-05-15",clientId:"bbn",city:"Zurich",venue:"Halle 622",country:"CH",region:"eu",promoter:"Gadget / Stefan Wyss",advance:[{name:"Sarah Blum",email:"sarah.blum@gadget.ch",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9,30),crewCall:toM(10,30),venueAccess:toM(9,30),mgTime:toM(16,30)},
  {date:"2026-05-16",clientId:"bbn",city:"Cologne",venue:"Palladium",country:"DE",region:"eu",promoter:"LN DE",advance:[{name:"Oli Zimmermann",email:"oliver.zimmermann@livenation-production.de",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(11),crewCall:toM(11,30),venueAccess:toM(8),mgTime:toM(16,30),notes:"Bus 11:00a. Local crew 08:00a."},
  {date:"2026-05-17",clientId:"bbn",city:"Cologne",venue:"Palladium",country:"DE",region:"eu",promoter:"LN DE",advance:[{name:"Oli Zimmermann",email:"oliver.zimmermann@livenation-production.de",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-05-19",clientId:"bbn",city:"Amsterdam",venue:"AFAS Live",country:"NL",region:"eu",promoter:"MOJO",advance:[{name:"John Cameron",email:"j.cameron@mojo.nl",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-05-20",clientId:"bbn",city:"Paris",venue:"Le Bataclan",country:"FR",region:"eu",promoter:"LN FR",advance:[{name:"Cyril Legauffey",email:"c.legauffey@gmail.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(11),crewCall:toM(11,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"⚠ Immigration forms outstanding."},
  {date:"2026-05-22",clientId:"bbn",city:"Milan",venue:"Fabrique",country:"IT",region:"eu",promoter:"LN IT",advance:[{name:"Andrea Aurigo",email:"andrea.aurigo@livenation.it",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9,30),crewCall:toM(10,30),venueAccess:toM(9,30),mgTime:toM(16,30)},
  {date:"2026-05-24",clientId:"bbn",city:"Prague",venue:"SaSaZu",country:"CZ",region:"eu",promoter:"Fource",advance:[{name:"Barbora Rehorova",email:"bara@fource.com",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-05-26",clientId:"bbn",city:"Berlin",venue:"Columbiahalle",country:"DE",region:"eu",promoter:"LN DE",advance:[{name:"Oli Zimmermann",email:"oliver.zimmermann@livenation-production.de",role:"Production",dept:"production"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-05-28",clientId:"bbn",city:"Bratislava",venue:"Majestic Music Club",country:"SK",region:"eu",promoter:"LN HU",advance:[{name:"Peter Lipovsky",email:"peter.lipovsky@gmail.com",role:"Production",dept:"venue"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-05-30",clientId:"bbn",city:"Warsaw",venue:"Orange Festival",country:"PL",region:"eu",promoter:"AlterArt",advance:[],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30)},
  {date:"2026-06-12",clientId:"bbn",city:"Manchester",venue:"Bonnaroo Music & Arts Festival",country:"US",region:"festival",promoter:"C3 Presents LLC",advance:[{name:"Tyler Crain",email:"tcrain@c3presents.com",role:"Production",dept:"production"},{name:"Bryan Benson",email:"bryanbenson@livenation.com",role:"Promoter",dept:"venue"}],doors:toM(14),curfew:toM(23),crewCall:toM(10),venueAccess:toM(9),mgTime:toM(17),notes:"3rd on Which Stage. Flat $50k. Festival catering + reasonable rider. 20 weekend comps. Merch soft 70%/hard 90%, festival sells."},
  {date:"2026-06-26",clientId:"bbn",city:"Chambord",venue:"Chambord Live Festival",country:"FR",region:"eu-post",promoter:"LN SAS / Damien Chamard Boudet",advance:[{name:"Damien Chamard Boudet",email:"damien.chamardboudet@livenation.fr",role:"Promoter",dept:"venue"}],doors:toM(17),curfew:toM(23),busArrive:toM(11),crewCall:toM(12),venueAccess:toM(11),mgTime:toM(16),notes:"€25k combined (MM/161091 €7.5k fee + MM/161168-P €17.5k production). Festival cap 30,000. Set 20:30. ⚠ Immigration forms outstanding."},
  {date:"2026-06-28",clientId:"bbn",city:"Villeurbanne",venue:"Le Transbordeur",country:"FR",region:"eu-post",promoter:"LN SAS / Damien Chamard Boudet",advance:[{name:"Damien Chamard Boudet",email:"damien.chamardboudet@livenation.fr",role:"Promoter",dept:"venue"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"€17.5k combined (MM/161094 €5.25k fee + MM/162189-P €12.25k production) vs 80%. Cap 2,000. End of Jun 24–28 micro-sprint. ⚠ Immigration forms outstanding."},
  {date:"2026-07-01",clientId:"bbn",city:"Mississauga",venue:"Celebration Square",country:"CA",region:"summer",promoter:"City of Mississauga / Jennifer Perrault",advance:[{name:"Jennifer Perrault",email:"jennifer.perrault@mississauga.ca",role:"Promoter",dept:"venue"}],doors:toM(17),curfew:toM(23),busArrive:toM(10),crewCall:toM(11),venueAccess:toM(10),mgTime:toM(15,30),notes:"CAD $125k flat. Canada Day, free outdoor public show. + $2,500 backline + $175/pers meal buyout. ⚠ CRA Reg 105 waiver deadline Jun 1."},
  {date:"2026-07-11",clientId:"bbn",city:"Uncasville",venue:"Mohegan Sun Arena",country:"US",region:"summer",promoter:"Live Nation",advance:[],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10),venueAccess:toM(9),mgTime:toM(16,30),notes:"$150k flat. Cap 4,975. + 15 hotel rooms onsite + luxury ground BDL/PVD + catering. Cash/cashier check night of show."},
  {date:"2026-07-12",clientId:"bbn",city:"Ottawa",venue:"Ottawa Bluesfest",country:"CA",region:"summer",promoter:"Ottawa Bluesfest",advance:[],doors:toM(17),curfew:toM(23),busArrive:toM(11),crewCall:toM(12),venueAccess:toM(11),mgTime:toM(15,30),notes:"$85k flat. Close 2nd stage. Cap 40,000. + luxury ground (airport/venue/hotel), catering, backline. ⚠ CRA Reg 105 waiver deadline Jun 12."},
  {date:"2026-10-22",clientId:"wkn",city:"Ozark",venue:"Mulberry Mountain",country:"US",region:"festival",promoter:"Wakaan",advance:[{name:"Chloe",email:"chloe@wakaan.com",role:"AR Manager",dept:"ar_hospo"},{name:"Waylon",email:"waylon@wakaan.com",role:"Director",dept:"venue"}],doors:toM(12),curfew:toM(2),busArrive:toM(10),crewCall:toM(9),venueAccess:toM(9),mgTime:toM(18),notes:"Multi-day. Olivia managing transport."},
  {date:"2026-08-07",clientId:"elm",city:"Long Pond",venue:"Lake Harmony",country:"US",region:"festival",promoter:"Elements Music & Arts",advance:[{name:"Brett Herman",email:"brett@elementsfest.us",role:"Director",dept:"venue"}],doors:toM(12),curfew:toM(3),busArrive:toM(10),crewCall:toM(10),venueAccess:toM(10),mgTime:toM(17),notes:"⚠ 2025 settlement slow. Monitor closely. ⚠⚠ DATE CONFLICT — Untold Cluj-Napoca RO same day, signed contract MM/163336 (bbno$ booked for both, only one can be honored)."},
  // ─── Added 2026-05-28 from dashboard reconcile (bbno-eu-2026-dashboard.vercel.app) ───
  {date:"2026-06-05",clientId:"bbn",city:"Toronto",venue:"RBC Amphitheatre",country:"CA",region:"summer",promoter:"LN Canada / Stephen Riff",advance:[{name:"Stephen Riff",email:"stephenriff@livenation.com",role:"Promoter",dept:"venue"},{name:"Denise Ross",email:"deniseross@livenation.com",role:"Venue",dept:"venue"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"100% Headline. CAD $131k vs 85%. Cap 15,752. Support: The Living Tombstone ($35k bumps to $40k if >10k paid). ⚠ CRA Reg 105 waiver deadline May 6 (PASSED — at-risk for 15% WHT)."},
  {date:"2026-06-24",clientId:"bbn",city:"Lisbon",venue:"LAV",country:"PT",region:"eu-post",promoter:"Everything Is New / Alvaro Covoes",advance:[{name:"Alvaro Covoes",email:"alvarocovoes@everythingisnew.pt",role:"Promoter",dept:"venue"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"€15k vs 80% NBOR. Cap 1,200. Start of Jun 24–28 4-show micro-sprint (4 countries, 5 days)."},
  {date:"2026-06-25",clientId:"bbn",city:"Barcelona",venue:"Razzmatazz Room 1",country:"ES",region:"eu-post",promoter:"Primavera Sound / Pablo Soler",advance:[{name:"Pablo Soler Soler",email:"ivone.lesan@primaverasound.com",role:"Promoter",dept:"venue"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"€14k vs 85%. Cap 1,200."},
  {date:"2026-07-10",clientId:"bbn",city:"Quebec City",venue:"FEQ — Loto-Québec Stage",country:"CA",region:"summer",promoter:"FEQ / Louis Bellavance",advance:[{name:"Louis Bellavance",email:"lbellavance@bleufeu.com",role:"Promoter",dept:"venue"},{name:"Alain Gagnon",email:"agagnon@bleufeu.com",role:"Production",dept:"production"}],doors:toM(17),curfew:toM(23,30),busArrive:toM(11),crewCall:toM(12),venueAccess:toM(11),mgTime:toM(15,30),notes:"$100k flat. Close Loto-Québec Stage. 5:00PM doors, 9:15PM bbno$ 90-min set, 11:30PM curfew. ⚠ CRA Reg 105 waiver deadline Jun 10."},
  {date:"2026-07-23",clientId:"bbn",city:"Edmonton",venue:"K Days",country:"CA",region:"summer",promoter:"Explore Edmonton Corp",advance:[],doors:toM(18),curfew:toM(23),busArrive:toM(10),crewCall:toM(11),venueAccess:toM(10),mgTime:toM(16),notes:"$120k flat festival headline. Close main stage. Cap 5,000. Support: Jungle Bobby. ⚠ CRA Reg 105 waiver deadline Jun 23. + hotel, ground, backline."},
  {date:"2026-07-31",clientId:"bbn",city:"Chicago",venue:"House of Blues",country:"US",region:"summer",promoter:"Live Nation",advance:[],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"$20k + 85% vs expenses. Cap 1,300. Tight-margin headline night before Lolla — treat as marketing play, not profit center."},
  {date:"2026-08-01",clientId:"bbn",city:"Chicago",venue:"Lollapalooza",country:"US",region:"festival",promoter:"C3 Presents",advance:[],doors:toM(11),curfew:toM(22),busArrive:toM(9),crewCall:toM(11),venueAccess:toM(10),mgTime:toM(14),notes:"$50k flat. 4 of 5 on Tito's (North 2nd) Stage. 5:45–6:45PM (1 × 60min). Two-night Chicago hold with HoB."},
  {date:"2026-08-07",clientId:"bbn",city:"Cluj-Napoca",venue:"Untold Festival",country:"RO",region:"festival",promoter:"Untold Live SRL / Sebastian Ferent",advance:[{name:"Sebastian Ferent",email:"sebastian.ferent@untold.com",role:"Promoter",dept:"venue"}],doors:toM(18),curfew:toM(23),busArrive:toM(11),crewCall:toM(12),venueAccess:toM(11),mgTime:toM(16),notes:"$48k fee + $112k production = $160k combined (MM/163336 + MM/163539-P). ⚠⚠ DATE CONFLICT — Elements Long Pond PA same day. Resolve which is honored."},
  {date:"2026-08-12",clientId:"bbn",city:"Copenhagen",venue:"Vega",country:"DK",region:"eu-post",promoter:"ATL DK / Frederikke Brockdorff",advance:[{name:"Frederikke Brockdorff",email:"frederikke@allthingslive.com",role:"Promoter",dept:"venue"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"€20k vs 85%. Cap 1,550. DK: no WHT on non-resident performers."},
  {date:"2026-08-15",clientId:"bbn",city:"Budapest",venue:"Sziget Festival",country:"HU",region:"festival",promoter:"Sziget Cultural Mgmt / Virag Csiszar",advance:[{name:"Virag Csiszar",email:"csiszar.virag@sziget.hu",role:"Promoter",dept:"venue"}],doors:toM(15),curfew:toM(23),busArrive:toM(11),crewCall:toM(12),venueAccess:toM(11),mgTime:toM(16),notes:"$75k flat. Cap 95,000. Major EU festival."},
  {date:"2026-08-20",clientId:"bbn",city:"Paralimni",venue:"Nava Seaside Protaras",country:"CY",region:"festival",promoter:"Stay Live / Silvija Jurgeleviciene",advance:[{name:"Silvija Jurgeleviciene",email:"giedrius@staylive.lt",role:"Promoter",dept:"venue"}],doors:toM(20),curfew:toM(2),busArrive:toM(13),crewCall:toM(14),venueAccess:toM(13),mgTime:toM(18),notes:"€17k flat. Combo deal with Riga Aug 25. ⚠ Start of brutal Aug 20–25 4-country, 4-show, 6-day sprint. Air-only routing — no direct CY→AT flights."},
  {date:"2026-08-22",clientId:"bbn",city:"St. Pölten",venue:"Frequency Festival",country:"AT",region:"festival",promoter:"Musicnet / Richard Petz",advance:[{name:"Richard Petz",email:"richard@cuteconcerts.com",role:"Promoter",dept:"venue"}],doors:toM(15),curfew:toM(23),busArrive:toM(11),crewCall:toM(12),venueAccess:toM(11),mgTime:toM(16),notes:"$115k flat. Cap 50,000. Major AT festival."},
  {date:"2026-08-24",clientId:"bbn",city:"Vilnius",venue:"Lukiškės Prison",country:"LT",region:"festival",promoter:"Bravo Events / Vaidas Zdancevicius",advance:[{name:"Vaidas Zdancevicius",email:"giedrius@staylive.lt",role:"Promoter",dept:"venue"}],doors:toM(18),curfew:toM(23),busArrive:toM(11),crewCall:toM(12),venueAccess:toM(11),mgTime:toM(16),notes:"€8k vs 85% (€6.6k post 17% LT WHT). Separate €12k production (MM/161970-P) — confirm counterparty. Open-air ex-prison venue."},
  {date:"2026-08-25",clientId:"bbn",city:"Rīga",venue:"Palladium",country:"LV",region:"eu-post",promoter:"Stay Live / Silvija Jurgeleviciene",advance:[{name:"Silvija Jurgeleviciene",email:"giedrius@staylive.lt",role:"Promoter",dept:"venue"}],doors:toM(19),curfew:toM(23),busArrive:toM(9),crewCall:toM(10,30),venueAccess:toM(9),mgTime:toM(16,30),notes:"€15k vs 85%. Cap 1,300. End of Aug 20–25 sprint. LV WHT 23%."},
  {date:"2026-08-27",clientId:"bbn",city:"Tromsø",venue:"Rakettnatt Festival",country:"NO",region:"festival",promoter:"ATL NO / Toffen Gunnufsen",advance:[{name:"Toffen Gunnufsen",email:"toffen@allthingslive.com",role:"Promoter",dept:"venue"}],doors:toM(17),curfew:toM(1),busArrive:toM(11),crewCall:toM(12),venueAccess:toM(11),mgTime:toM(15),notes:"$85k flat. Cap 6,000. Deposit $18,062.50 received Feb 17 ✓. Start of Aug 27–30 closer (4 shows, 4 countries, 4 days). NO WHT 15%."},
  {date:"2026-08-28",clientId:"bbn",city:"Stavanger",venue:"Utopia Stavanger",country:"NO",region:"festival",promoter:"ATL NO / Toffen Gunnufsen",advance:[{name:"Toffen Gunnufsen",email:"toffen@allthingslive.com",role:"Promoter",dept:"venue"}],doors:toM(17),curfew:toM(1),busArrive:toM(11),crewCall:toM(12),venueAccess:toM(11),mgTime:toM(15),notes:"$85k flat. Cap 4,000. Deposit $18,062.50 received Feb 17 ✓. Norway domestic flight TOS→OSL→SVG Aug 28 morning."},
  {date:"2026-08-29",clientId:"bbn",city:"Munich",venue:"Superbloom Festival",country:"DE",region:"festival",promoter:"LN DE / Marko Hegner",advance:[{name:"Annika Hintz",email:"annika.hintz@goodliveartists.com",role:"Production",dept:"production"}],doors:toM(13),curfew:toM(23),busArrive:toM(10),crewCall:toM(11),venueAccess:toM(10),mgTime:toM(16),notes:"$80k flat. Cap 50,000. DE composite ~25.4% deductions (4.9% SocSec + 15% WHT + 5.5% Solidarity = $20,320)."},
  {date:"2026-08-30",clientId:"bbn",city:"London",venue:"All Points East",country:"GB",region:"festival",promoter:"AEG Presents / Oscar Tuttiett",advance:[{name:"Oscar Tuttiett",email:"oscar.tuttiett@aegpresents.co.uk",role:"Promoter",dept:"venue"}],doors:toM(13),curfew:toM(22,30),busArrive:toM(10),crewCall:toM(11),venueAccess:toM(10),mgTime:toM(16),notes:"$85k flat. Cap 40,000. UK FEU 20% still applies (or 5-10% with cert). Final show of summer leg."},
];

export const DEFAULT_ROS=()=>[
  {id:"bus_arrive",label:"BUS ARRIVES",duration:0,phase:"bus_in",type:"bus",color:"var(--info-fg)",roles:["tm_td","internal"],note:"32A 3-phase power",isAnchor:true,anchorKey:"busArrive"},
  {id:"venue_access",label:"Venue Access",duration:0,phase:"pre",type:"access",color:T.text2,roles:["tm_td","viewer"],note:"Per advance",isAnchor:true,anchorKey:"venueAccess"},
  {id:"crew_call",label:"CREW CALL",duration:0,phase:"pre",type:"crew",color:T.warnFg,roles:["tm_td","viewer"],note:"Local + tour crew",isAnchor:true,anchorKey:"crewCall"},
  {id:"loadin",label:"Load In",duration:240,phase:"pre",type:"setup",color:T.warnFg,roles:["tm_td","viewer"],note:"FOH, mons, LD, LED, lasers, merch"},
  {id:"sc_bbno",label:"SC: bbno$",duration:60,phase:"pre",type:"soundcheck",color:T.accent,roles:["tm_td","viewer"],note:"Full band check"},
  {id:"sc_jb",label:"SC: Jungle Bobby",duration:30,phase:"pre",type:"soundcheck",color:"var(--accent-soft)",roles:["tm_td","viewer"],note:"Support act"},
  {id:"security",label:"Security Meeting",duration:30,phase:"pre",type:"meeting",color:"var(--danger-fg)",roles:["tm_td"],note:"Barricade, pit, artist security"},
  {id:"mg_checkin",label:"M&G Check In",duration:30,phase:"mg",type:"mg",color:T.successFg,roles:["tm_td"],note:"Always before M&G."},
  {id:"mg",label:"Meet & Greet",duration:120,phase:"mg",type:"mg",color:T.successFg,roles:["tm_td"],note:"Fan experience",isAnchor:true,anchorKey:"mgTime"},
  {id:"doors_early",label:"Doors: Early Entry",duration:30,phase:"doors",type:"doors",color:T.successFg,roles:["tm_td"],note:"VIP / early entry"},
  {id:"doors_ga",label:"Doors: GA",duration:0,phase:"doors",type:"doors",color:T.successFg,roles:["tm_td"],note:"General admission",isAnchor:true,anchorKey:"doors"},
  {id:"bishu",label:"Bishu DJ Set",duration:15,phase:"show",type:"performance",color:T.accent,roles:["tm_td","viewer"],note:"Opening DJ"},
  {id:"jungle_bobby",label:"Jungle Bobby",duration:30,phase:"show",type:"performance",color:T.accent,roles:["tm_td","viewer"],note:"Support set"},
  {id:"changeover",label:"Changeover",duration:15,phase:"show",type:"changeover",color:T.text2,roles:["tm_td","viewer"],note:"Stage flip"},
  {id:"bbno_set",label:"bbno$ HEADLINE SET",duration:105,phase:"show",type:"headline",color:"var(--danger-fg)",roles:["tm_td","viewer"],note:"Internet Explorer Tour"},
  {id:"curfew",label:"CURFEW",duration:0,phase:"curfew",type:"curfew",color:"var(--danger-fg)",roles:["tm_td"],note:"House lights",isAnchor:true,anchorKey:"curfew"},
  {id:"crew_cb",label:"Crew Call Back",duration:0,phase:"post",type:"crew",color:T.warnFg,roles:["tm_td","viewer"],note:"30min before set ends",offsetRef:"bbno_set_end",offsetMin:-30},
  {id:"loadout",label:"Load Out",duration:120,phase:"post",type:"setup",color:T.warnFg,roles:["tm_td","viewer"],note:"Gear to truck/trailer"},
  {id:"settlement",label:"Settlement",duration:60,phase:"post",type:"business",color:T.warnFg,roles:["tm_td"],note:"30min after headline ends",offsetRef:"bbno_set_end",offsetMin:30},
  {id:"showers",label:"Showers / Wind Down",duration:45,phase:"post",type:"crew",color:T.text2,roles:["tm_td","internal"]},
  {id:"clear",label:"Clear Venue",duration:30,phase:"post",type:"bus",color:"var(--text-3)",roles:["tm_td","internal"],note:"Final walk, bus loaded"},
  {id:"bus_depart",label:"BUS DEPARTS",duration:0,phase:"post",type:"bus",color:"var(--info-fg)",roles:["tm_td","internal"],note:"Next city. Crew sleeps.",isAnchor:true,anchorKey:"busDepart"},
];

export const RRX_ROS=()=>[
  {id:"bus_arrive",label:"BUS ARRIVES",duration:0,phase:"bus_in",type:"bus",color:"var(--info-fg)",roles:["tm_td","internal"],note:"Red Rocks loading dock",isAnchor:true,anchorKey:"busArrive"},
  {id:"venue_access",label:"Venue Access",duration:0,phase:"pre",type:"access",color:T.text2,roles:["tm_td","viewer"],note:"Per AEG advance",isAnchor:true,anchorKey:"venueAccess"},
  {id:"crew_call",label:"CREW CALL",duration:0,phase:"pre",type:"crew",color:T.warnFg,roles:["tm_td","viewer"],note:"BNP + tour crew",isAnchor:true,anchorKey:"crewCall"},
  {id:"loadin",label:"Load In",duration:240,phase:"pre",type:"setup",color:T.warnFg,roles:["tm_td","viewer"],note:"BNP: audio, video, lighting"},
  {id:"programming",label:"Programming",duration:90,phase:"pre",type:"setup",color:"var(--info-fg)",roles:["tm_td","viewer"],note:"LX, VX, Laser. MA3, Depense R4."},
  {id:"sc_bbno",label:"SC: bbno$",duration:60,phase:"pre",type:"soundcheck",color:T.accent,roles:["tm_td","viewer"]},
  {id:"sc_ot",label:"SC: Oliver Tree",duration:45,phase:"pre",type:"soundcheck",color:"var(--accent-soft)",roles:["tm_td","viewer"]},
  {id:"sc_kaarijaa",label:"SC: Käärijä",duration:30,phase:"pre",type:"soundcheck",color:"var(--accent-pill-border)",roles:["tm_td","viewer"]},
  {id:"sc_yngmartyr",label:"SC: YNG Martyr",duration:25,phase:"pre",type:"soundcheck",color:T.accent,roles:["tm_td","viewer"]},
  {id:"sc_jb",label:"SC: Jungle Bobby",duration:20,phase:"pre",type:"soundcheck",color:"var(--accent-pill-border)",roles:["tm_td","viewer"]},
  {id:"security",label:"Security Meeting",duration:30,phase:"pre",type:"meeting",color:"var(--danger-fg)",roles:["tm_td"]},
  {id:"mg_checkin",label:"M&G Check In",duration:30,phase:"mg",type:"mg",color:T.successFg,roles:["tm_td"]},
  {id:"mg",label:"Meet & Greet",duration:120,phase:"mg",type:"mg",color:T.successFg,roles:["tm_td"],isAnchor:true,anchorKey:"mgTime"},
  {id:"doors_early",label:"Doors: Early Entry",duration:30,phase:"doors",type:"doors",color:T.successFg,roles:["tm_td"]},
  {id:"doors_ga",label:"Doors",duration:0,phase:"doors",type:"doors",color:T.successFg,roles:["tm_td"],isAnchor:true,anchorKey:"doors"},
  {id:"jungle_bobby_s",label:"Jungle Bobby",duration:30,phase:"show",type:"performance",color:T.accent,roles:["tm_td","viewer"]},
  {id:"co1",label:"Changeover 1",duration:5,phase:"show",type:"changeover",color:T.text2,roles:["tm_td","viewer"]},
  {id:"yng_martyr",label:"YNG Martyr",duration:40,phase:"show",type:"performance",color:T.accent,roles:["tm_td","viewer"]},
  {id:"co2",label:"Changeover 2",duration:5,phase:"show",type:"changeover",color:T.text2,roles:["tm_td","viewer"]},
  {id:"kaarijaa_set",label:"Käärijä",duration:50,phase:"show",type:"performance",color:"var(--accent-soft)",roles:["tm_td","viewer"]},
  {id:"co3",label:"Changeover 3",duration:5,phase:"show",type:"changeover",color:T.text2,roles:["tm_td","viewer"]},
  {id:"oliver_tree",label:"Oliver Tree",duration:50,phase:"show",type:"performance",color:"var(--accent-pill-border)",roles:["tm_td","viewer"]},
  {id:"co4",label:"Changeover 4",duration:10,phase:"show",type:"changeover",color:T.text2,roles:["tm_td","viewer"]},
  {id:"bbno_set",label:"bbno$ HEADLINE SET",duration:105,phase:"show",type:"headline",color:"var(--danger-fg)",roles:["tm_td","viewer"]},
  {id:"curfew",label:"CURFEW (HARD)",duration:0,phase:"curfew",type:"curfew",color:"var(--danger-fg)",roles:["tm_td"],isAnchor:true,anchorKey:"curfew"},
  {id:"crew_cb",label:"Crew Call Back",duration:0,phase:"post",type:"crew",color:T.warnFg,roles:["tm_td","viewer"],offsetRef:"bbno_set_end",offsetMin:-30},
  {id:"loadout",label:"Load Out",duration:120,phase:"post",type:"setup",color:T.warnFg,roles:["tm_td","viewer"]},
  {id:"settlement",label:"Settlement",duration:60,phase:"post",type:"business",color:T.warnFg,roles:["tm_td"],offsetRef:"bbno_set_end",offsetMin:30},
  {id:"showers",label:"Showers / Wind Down",duration:45,phase:"post",type:"crew",color:T.text2,roles:["tm_td","internal"]},
  {id:"clear",label:"Clear Venue",duration:30,phase:"post",type:"bus",color:"var(--text-3)",roles:["tm_td","internal"]},
  {id:"bus_depart",label:"BUS DEPARTS",duration:0,phase:"post",type:"bus",color:"var(--info-fg)",roles:["tm_td","internal"],isAnchor:true,anchorKey:"busDepart"},
];

export const CUSTOM_ROS_MAP={"2026-04-16":RRX_ROS};

export const parseDriveSessions=(note,stops)=>{
  const rows=[];
  if(!note)return rows;
  const sentences=String(note).split(/(?<=[.!?])\s+/).map(s=>s.replace(/\s+$/,"")).filter(Boolean);
  const grabKmDur=p=>{
    if(!p)return{km:null,dur:null,extra:null};
    const km=(p.match(/(?:~?)(\d+(?:[.,]\d+)?)\s*km/i)||[])[1];
    const hM=p.match(/(\d+(?:[.,]\d+)?)\s*h(?!\w)/i);
    const mM=p.match(/(\d+)\s*min(?!\w)/i);
    const dur=hM?`${hM[1]}h`:mM?`${mM[1]}min`:null;
    let extra=p
      .replace(/(?:~?)\d+(?:[.,]\d+)?\s*km/gi,"")
      .replace(/\d+(?:[.,]\d+)?\s*h(?!\w)/gi,"")
      .replace(/\d+\s*min(?!\w)/gi,"")
      .replace(/^[,;\s]+|[,;\s]+$/g,"")
      .replace(/\s*[,;]\s*/g,", ")
      .trim();
    return{km:km?`${km} km`:null,dur,extra:extra||null};
  };
  sentences.forEach(raw=>{
    const t=raw.replace(/\.$/,"").trim();if(!t)return;
    // S<n> session — accept "S1 08:00–12:30 CEST via E40 (4.5h, ~270km)" or "S2 13:15 CEST X→Y (~40km, 40min)"
    let m=t.match(/^S(\d+)\s+(\d{1,2}:\d{2}(?:[–\-]\d{1,2}:\d{2})?)\s*([A-Z]{2,4})?\s+(.+?)(?:\s*\(([^)]+)\))?$/);
    if(m){const[,num,time,tz,route,paren]=m;const{km,dur,extra}=grabKmDur(paren||"");rows.push({kind:"session",label:`S${num}`,time:tz?`${time} ${tz}`:time,route:route.trim(),km,dur,note:extra});return;}
    // Le Shuttle / ferry crossings
    if(/Le Shuttle|Stena Line|Eurotunnel|ferry/i.test(t)){
      const tM=t.match(/(\d{1,2}:\d{2})\s*(?:[A-Z]{2,4})?(?:\s*\/\s*(\d{1,2}:\d{2})\s*([A-Z]{2,4})?)?(?:\s*[→\-–]\s*(?:arr\s+\w+\s+)?(?:~?)(\d{1,2}:\d{2}))?/);
      const carrier=(t.match(/(Le Shuttle|Stena Line|Eurotunnel|[A-Z]\w+\s+ferry)/i)||[])[1]||"Crossing";
      const time=tM?(tM[4]?`${tM[1]}–${tM[4]}`:tM[1])+(tM[3]?` ${tM[3]}`:""):null;
      const paren=(t.match(/\(([^)]+)\)/)||[])[1]||"";
      const{km,dur,extra}=grabKmDur(paren);
      const route=t.replace(/\(([^)]+)\)/,"").replace(/(Le Shuttle|Stena Line|Eurotunnel|[A-Z]\w+\s+ferry)/i,"").replace(/(?:dep|arr)\s+/gi,"").replace(/\d{1,2}:\d{2}\s*(?:[A-Z]{2,4})?/g,"").replace(/[,;\s\/→\-–]+/g," ").trim();
      rows.push({kind:"ferry",label:carrier.toUpperCase(),time,route:route||extra||"crossing",km,dur,note:extra&&extra!==route?extra:null});
      return;
    }
    // EC561 break or generic break
    if(/EC561|break/i.test(t)){
      const dM=t.match(/(\d+m?)\s*break/i);
      const where=t.replace(/EC561\s*/i,"").replace(/\d+m?\s*break\s*/i,"").replace(/^[,;\s]+|[,;\s]+$/g,"").trim();
      rows.push({kind:"break",label:"BREAK",time:null,route:where||"Break",km:null,dur:dM?dM[1].replace(/m$/,"min"):null,note:"EC561 mandatory"});
      return;
    }
    // ETA / arrival
    const etaM=t.match(/ETA\s+~?(\d{1,2}:\d{2})\s*([A-Z]{2,4})?/);
    if(etaM){rows.push({kind:"eta",label:"ETA",time:etaM[2]?`${etaM[1]} ${etaM[2]}`:etaM[1],route:t.replace(/ETA\s+~?\d{1,2}:\d{2}\s*[A-Z]{0,4}\s*/,"").trim()||"Arrival",km:null,dur:null,note:null});return;}
    // Rest period
    const rpM=t.match(/(\d+h)\s*RP/i);
    if(rpM){rows.push({kind:"rp",label:"REST",time:null,route:t,km:null,dur:rpM[1],note:"Daily rest period"});return;}
    // Prefatory or trailing notes (MD/DD/Local crew/Soundcheck)
    if(/^(MD|DD|Local|Soundcheck|Pieter|Per advance)/i.test(t)){rows.push({kind:"note",label:"NOTE",time:null,route:t,km:null,dur:null,note:null});return;}
    // Fallback: keep the sentence
    rows.push({kind:"other",label:"·",time:null,route:t,km:null,dur:null,note:null});
  });
  // Append stops that aren't yet referenced (best-effort dedupe by name fragment)
  const stopList=stops?String(stops).split("·").map(s=>s.trim()).filter(Boolean):[];
  if(stopList.length){
    const inText=rows.map(r=>(r.route||"")+" "+(r.note||"")).join(" ").toLowerCase();
    const extras=stopList.filter(s=>!inText.includes(s.toLowerCase().split(/[\(,]/)[0].trim()));
    if(extras.length)rows.push({kind:"stops",label:"STOPS",time:null,route:extras.join(" · "),km:null,dur:null,note:null});
  }
  return rows;
};

export const buildDraftSessions=(result,form)=>{
  if(!result||result.error||result.duration_min==null)return null;
  const total=result.duration_min;
  const totalKm=result.distance_km||0;
  const depMin=(form?.depTime||"").match(/^(\d{1,2}):(\d{2})$/);
  if(!depMin)return null;
  const start=parseInt(depMin[1],10)*60+parseInt(depMin[2],10);
  const rows=[];
  let cur=start;let remaining=total;let idx=1;
  const maxSeg=270; // 4.5h
  while(remaining>0){
    const seg=Math.min(remaining,maxSeg);
    const segKm=totalKm>0?Math.round((seg/total)*totalKm):0;
    const isFirst=idx===1;
    const isLast=remaining<=maxSeg;
    const route=isFirst&&isLast?`${form.origin} → ${form.destination}`:isFirst?`${form.origin} → en route`:isLast?`en route → ${form.destination}`:"continued en route";
    rows.push({kind:"session",label:`S${idx}`,time:`${fmt24(cur)}–${fmt24(cur+seg)}`,route,km:segKm?`${segKm} km`:null,dur:fmtDur(seg),note:isFirst&&isLast?null:isFirst?"first leg":isLast?"final leg":null});
    cur+=seg;remaining-=seg;idx++;
    if(remaining>0){
      rows.push({kind:"break",label:"BREAK",time:`${fmt24(cur)}–${fmt24(cur+45)}`,route:"Service area / rest stop (TBD)",km:null,dur:"45min",note:"EC561 mandatory"});
      cur+=45;
    }
  }
  rows.push({kind:"eta",label:"ETA",time:fmt24(cur),route:form.destination,km:null,dur:null,note:result.eta&&result.eta!==fmt24(cur)?`Calculated ETA ${result.eta}`:null});
  if(total>540){rows.unshift({kind:"note",label:"NOTE",time:null,route:`Total drive ${fmtDur(total)} exceeds EC561 9h daily limit — DD or split required`,km:null,dur:null,note:"REGULATORY"});}
  return rows;
};

export const DRIVE_KIND_STYLE={
  session:{c:"var(--info-fg)",bg:"var(--info-bg)",label:"DRIVE"},
  break:{c:"var(--warn-fg)",bg:"var(--warn-bg)",label:"BREAK"},
  ferry:{c:"var(--accent)",bg:"var(--accent-pill-bg)",label:"FERRY"},
  eta:{c:"var(--success-fg)",bg:"var(--success-bg)",label:"ETA"},
  rp:{c:"var(--text-2)",bg:"var(--card-2)",label:"REST"},
  note:{c:"var(--text-mute)",bg:"var(--card-2)",label:"NOTE"},
  stops:{c:"var(--info-fg)",bg:"var(--info-bg)",label:"STOPS"},
  other:{c:"var(--text-dim)",bg:"var(--card)",label:"·"},
};

export const SPLIT_DAYS={
  "2026-05-01":{
    parties:[
      {id:"worcester",label:"Worcester Show",location:"Worcester, MA",event:"WPI — Pretty Polly",type:"show",color:T.successFg,bg:"var(--success-bg)",crew:["ag","jb","mse","tip","ac","rm"],note:"Performing crew. Advance past due."},
      {id:"eu_prog",label:"EU Programming",location:"En Route / Europe",event:"Pre-tour advance + logistics",type:"travel",color:T.link,bg:"var(--info-bg)",crew:["dj","ms","dn"],note:"TM + PM advance work ahead of Dublin Day 1."}
    ]
  }
};

export const resolvePartyCrew=(date,partyId,showCrew,allCrew)=>{
  const sc=showCrew[`${date}#${partyId}`]||{};
  const hasData=Object.values(sc).some(c=>c.attending!==undefined);
  if(!hasData)return null;
  return allCrew.filter(c=>sc[c.id]?.attending===true).map(c=>c.id);
};
