// Design tokens — source of truth for CSS variable references in inline styles.
// Import: import { T } from "./styles/tokens";
// Use:    style={{ color: T.textDim, background: T.card }}
// Do NOT introduce new var(--x) strings in inline styles — add here first.

export const T = {
  // ── Text ──────────────────────────────────────────────────────────────────
  text:       "var(--text)",
  text2:      "var(--text-2)",
  text3:      "var(--text-3)",
  textDim:    "var(--text-dim)",
  textMute:   "var(--text-mute)",
  textFaint:  "var(--text-faint)",

  // ── Semantic colors ───────────────────────────────────────────────────────
  accent:     "var(--accent)",
  accentSoft: "var(--accent-soft)",
  link:       "var(--link)",
  successFg:  "var(--success-fg)",
  successBg:  "var(--success-bg)",
  warnFg:     "var(--warn-fg)",
  warnBg:     "var(--warn-bg)",
  dangerFg:   "var(--danger-fg)",
  dangerBg:   "var(--danger-bg)",
  infoFg:     "var(--info-fg)",
  infoBg:     "var(--info-bg)",

  // ── Surfaces ──────────────────────────────────────────────────────────────
  bg:         "var(--bg)",
  card:       "var(--card)",
  card2:      "var(--card-2)",
  card3:      "var(--card-3)",
  card4:      "var(--card-4)",
  border:     "var(--border)",

  // ── Accent pill ───────────────────────────────────────────────────────────
  accentPillBg:     "var(--accent-pill-bg)",
  accentPillBorder: "var(--accent-pill-border)",
};
