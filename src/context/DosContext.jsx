import { createContext, useContext } from "react";

// Single app-wide store. App builds the value and wraps the tree in
// <Ctx.Provider>; every feature component reads what it needs via useDos().
export const Ctx = createContext(null);

// Preferred accessor for extracted components: `const { flights, sel } = useDos();`
export const useDos = () => useContext(Ctx);
