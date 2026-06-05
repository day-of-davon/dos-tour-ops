import { T } from "../styles/tokens";

export const GL_DEFAULT_CATEGORIES=[
  {id:"artist_guest",name:"Artist Guest",side:"artist",zones:["FOH"],qty:6,walkOnQty:2},
  {id:"artist_family",name:"Artist Family",side:"artist",zones:["VIP","DR"],qty:4,walkOnQty:0},
  {id:"manager",name:"Manager",side:"artist",zones:["FOH","BS"],qty:2,walkOnQty:0},
  {id:"agent",name:"Agent",side:"artist",zones:["FOH"],qty:1,walkOnQty:0},
  {id:"media",name:"Publicist + Media",side:"artist",zones:["FOH","PIT"],qty:4,walkOnQty:0},
  {id:"feature",name:"Feature Performer",side:"artist",zones:["FOH","BS"],qty:4,walkOnQty:0},
  {id:"aaa_crew",name:"AAA Crew",side:"artist",zones:["FOH","BS","STG","CAT","DR","VIP","HOSPO","PIT"],qty:99,walkOnQty:0},
  {id:"promoter",name:"Venue Promoter",side:"venue",zones:["FOH","BS","VIP","HOSPO"],qty:6,walkOnQty:0},
  {id:"ar_manager",name:"AR Manager",side:"venue",zones:["HOSPO","VIP"],qty:4,walkOnQty:0},
  {id:"hospo",name:"Hospo Guests",side:"venue",zones:["VIP"],qty:10,walkOnQty:0},
];

export const GL_STATUS=[
  {id:"draft",label:"Draft",color:T.textDim,bg:"var(--card-2)"},
  {id:"pending_approval",label:"Pending Approval",color:T.warnFg,bg:"var(--warn-bg)"},
  {id:"open",label:"Open",color:T.successFg,bg:"var(--success-bg)"},
  {id:"locked",label:"Locked",color:T.accent,bg:"var(--accent-pill-bg)"},
  {id:"closed",label:"Closed",color:"var(--text-3)",bg:"var(--bg)"},
];

export const GL_PARTY_ROLES=[
  {id:"artist",label:"Artist",side:"artist",defaultCategory:"artist_guest"},
  {id:"manager",label:"Manager",side:"artist",defaultCategory:"manager"},
  {id:"agent",label:"Agent",side:"artist",defaultCategory:"agent"},
  {id:"publicist",label:"Publicist",side:"artist",defaultCategory:"media"},
  {id:"family",label:"Family",side:"artist",defaultCategory:"artist_family"},
  {id:"feature",label:"Feature Performer",side:"artist",defaultCategory:"feature"},
  {id:"crew",label:"Crew",side:"artist",defaultCategory:"aaa_crew"},
  {id:"promoter",label:"Promoter",side:"venue",defaultCategory:"promoter"},
  {id:"ar_manager",label:"AR Manager",side:"venue",defaultCategory:"ar_manager"},
  {id:"hospo_mgr",label:"Hospo Manager",side:"venue",defaultCategory:"hospo"},
  {id:"talent_buyer",label:"Talent Buyer",side:"venue",defaultCategory:"promoter"},
];

export const GL_DEFAULT_SHOW=()=>({
  categories:GL_DEFAULT_CATEGORIES.map(c=>({...c})),
  parties:{},
  cutoffAt:"",
  status:"draft",
  walkOnCap:10,
  notes:"",
});

export const glNewId=p=>`${p}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

export const GL_BUILTIN_TEMPLATE_ID="__tour_default";

export const glBuiltinTemplate=()=>({id:GL_BUILTIN_TEMPLATE_ID,name:"Tour Default",builtin:true,categories:GL_DEFAULT_CATEGORIES.map(c=>({...c})),walkOnCap:10,notes:""});

export const glInitFromTemplate=tpl=>({categories:(tpl?.categories||GL_DEFAULT_CATEGORIES).map(c=>({...c})),parties:{},cutoffAt:"",status:"draft",walkOnCap:tpl?.walkOnCap??10,notes:tpl?.notes||"",templateId:tpl?.id||null});

export const glBuildTemplate=(name,show)=>({id:glNewId("tpl"),name:name.trim(),builtin:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),categories:(show.categories||[]).map(c=>({...c})),walkOnCap:show.walkOnCap??10,notes:show.notes||""});

export const GL_ACTIVITY_CAP=200;

export const glAppendActivity=(arr,entry)=>{
  const next=[...(arr||[]),entry];
  return next.length>GL_ACTIVITY_CAP?next.slice(-GL_ACTIVITY_CAP):next;
};

export const glApplyTemplate=(show,tpl)=>{
  // Remap parties' categoryIds: prefer same id, else first category of matching side, else first category.
  const next={...show,categories:(tpl.categories||[]).map(c=>({...c})),walkOnCap:tpl.walkOnCap??show.walkOnCap,notes:tpl.notes||show.notes,templateId:tpl.id};
  const nextIds=new Set(next.categories.map(c=>c.id));
  if(show.parties&&Object.keys(show.parties).length){
    const mapped={};
    Object.entries(show.parties).forEach(([pid,p])=>{
      let cid=p.categoryId;
      if(!nextIds.has(cid)){
        const sideMatch=next.categories.find(c=>c.side===p.side);
        cid=sideMatch?.id||next.categories[0]?.id||cid;
      }
      mapped[pid]={...p,categoryId:cid};
    });
    next.parties=mapped;
  }
  return next;
};
