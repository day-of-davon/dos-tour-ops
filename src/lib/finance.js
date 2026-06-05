export const LEDGER_EDITABLE={
  confirmedFlight:new Set(["date","amount","currency","ref","bookedDate","paidDate"]),
  event:new Set(["date","desc","amount","currency","status","ref","bookedDate","paidDate"]),
  payout:new Set(["payee","amount","currency","status","ref","bookedDate","paidDate"]),
  ledgerEntry:new Set(["date","desc","payee","amount","currency","ref","bookedDate","paidDate"]),
  flightExpense:new Set(["desc","amount","currency","ref","bookedDate","paidDate"]),
  legacySettlement:new Set(["amount","ref"]),
};
