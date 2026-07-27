export const sG=async k=>{try{const r=await window.storage.get(k);return r?JSON.parse(r.value):null}catch(e){console.error("[storage.get]",k,e?.message||e);return null}};

export const sS=async(k,v)=>{try{await window.storage.set(k,JSON.stringify(v));return true}catch(e){console.error("[storage.set]",k,e?.message||e);return false}};

export const sGP=async k=>{try{const r=await window.storage.getPrivate(k);return r?JSON.parse(r.value):null}catch(e){console.error("[storage.getPrivate]",k,e?.message||e);return null}};

export const sSP=async(k,v)=>{try{await window.storage.setPrivate(k,JSON.stringify(v));return true}catch(e){console.error("[storage.setPrivate]",k,e?.message||e);return false}};
