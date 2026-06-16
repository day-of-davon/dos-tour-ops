// Encode an ArrayBuffer to base64 without overflowing the call stack. Spreading a
// whole byte array into String.fromCharCode(...) passes one argument per byte, which
// throws "Maximum call stack size exceeded" for large PDFs. Process in fixed chunks.
export function arrayBufferToBase64(buf){
  const bytes=new Uint8Array(buf);
  const CHUNK=0x8000;
  let binary="";
  for(let i=0;i<bytes.length;i+=CHUNK){
    binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+CHUNK));
  }
  return btoa(binary);
}

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
