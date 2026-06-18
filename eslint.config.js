// Surgical ESLint config for the DosApp decomposition.
//
// Purpose: catch the ONE failure mode that the decomposition codemod can
// introduce — a moved component that references an identifier it no longer
// imports. `vite build` (esbuild) does NOT error on undefined identifiers; it
// assumes they are globals. So we rely on these two rules as the static net:
//
//   no-undef            -> catches a missing helper/constant/hook import
//   react/jsx-no-undef  -> catches a missing component import (<FlightCard/>)
//
// Everything else is intentionally OFF. We are not trying to lint this
// 10k-line file for style; we only want a hard signal when a move breaks a
// reference. Keep this baseline at ZERO errors so any new error after a move
// is unambiguous.
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    // The source contains inline `eslint-disable react-hooks/exhaustive-deps`
    // comments; an unused/unknown directive should not fail the build.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        // Vitest globals (used in test files; harmless to allow everywhere).
        ...globals.vitest,
      },
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "18.3" } },
    rules: {
      "no-undef": "error",
      "react/jsx-no-undef": "error",
      // Registered only so inline disable comments referencing this rule
      // resolve; we are not enforcing hook deps in this safety net.
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    // import.meta is module-level; ensure parser treats these as modules too.
    files: ["**/*.test.{js,jsx}"],
    languageOptions: { globals: { ...globals.node } },
  },
];
