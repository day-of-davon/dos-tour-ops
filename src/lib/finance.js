export const LEDGER_EDITABLE={
  confirmedFlight:new Set(["date","amount","currency","ref","bookedDate","paidDate"]),
  event:new Set(["date","desc","amount","currency","status","ref","bookedDate","paidDate"]),
  payout:new Set(["payee","amount","currency","status","ref","bookedDate","paidDate"]),
  ledgerEntry:new Set(["date","desc","payee","amount","currency","ref","bookedDate","paidDate"]),
  lodgingHotel:new Set(["amount","currency"]),
  flightExpense:new Set(["desc","amount","currency","ref","bookedDate","paidDate"]),
  legacySettlement:new Set(["amount","ref"]),
};

// Expense categories that an uploaded receipt or scanned ride can carry. Used to
// surface the real category for receipt-backed payouts instead of "Payout".
export const EXPENSE_CATS=new Set(["Hotel","Transport","Ground","Rideshare","Car Rental","Meals","Equipment","Production","Venue","Merch","Other"]);
