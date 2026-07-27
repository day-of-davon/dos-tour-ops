// Design system primitives — canonical Button, Pill, Card components.
// Use these for new code. Existing inline-styled sites in DosApp.jsx can
// migrate opportunistically. Tokens flow from index.html CSS vars.

// ── Scale tokens (JS mirror of the canonical scale) ──────────────────────────
export const FS  = { xxs: 8, xs: 9, sm: 10, base: 11, md: 13, lg: 16, xl: 20, xxl: 24 };
export const R   = { sm: 4, md: 6, lg: 10, pill: 99 };
export const SP  = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, xxl: 20 };
export const MN  = "'JetBrains Mono',ui-monospace,monospace";
export const SN  = "'Outfit',system-ui,-apple-system,sans-serif";

// ── Button ────────────────────────────────────────────────────────────────────
// Variants: primary (accent bg), secondary (card-2 bg), ghost (transparent),
//           danger (danger fg), link (text only)
// Sizes:    sm (fontSize:sm, padding:3px 8px) | md (base, 5px 12px) | lg (md, 8px 16px)
export function Button({ variant="secondary", size="md", disabled, loading, children, style, ...rest }) {
  const palettes = {
    primary:   { bg: "var(--accent)",      fg: "#fff",           border: "var(--accent)" },
    secondary: { bg: "var(--card-2)",      fg: "var(--text)",    border: "var(--border)" },
    ghost:     { bg: "transparent",        fg: "var(--text-2)",  border: "var(--border)" },
    danger:    { bg: "var(--danger-bg)",   fg: "var(--danger-fg)", border: "var(--danger-fg)" },
    link:      { bg: "transparent",        fg: "var(--link)",    border: "transparent" },
  };
  const sizes = {
    sm: { fontSize: FS.sm,   padding: "3px 8px",  minHeight: 22 },
    md: { fontSize: FS.base, padding: "5px 12px", minHeight: 28 },
    lg: { fontSize: FS.md,   padding: "8px 16px", minHeight: 36 },
  };
  const p = palettes[variant] || palettes.secondary;
  const s = sizes[size] || sizes.md;
  return (
    <button
      disabled={disabled || loading}
      style={{
        background: p.bg, color: p.fg, border: `1px solid ${p.border}`,
        borderRadius: R.md, fontFamily: MN, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : loading ? 0.7 : 1,
        transition: "background 120ms ease, opacity 120ms ease",
        ...s, ...style,
      }}
      {...rest}
    >
      {loading ? "…" : children}
    </button>
  );
}

// ── Pill ──────────────────────────────────────────────────────────────────────
// Semantic status badge. Use `tone` for color role.
export function Pill({ tone="muted", size="sm", children, style, ...rest }) {
  const tones = {
    success: { bg: "var(--success-bg)", fg: "var(--success-fg)" },
    warn:    { bg: "var(--warn-bg)",    fg: "var(--warn-fg)" },
    danger:  { bg: "var(--danger-bg)",  fg: "var(--danger-fg)" },
    info:    { bg: "var(--info-bg)",    fg: "var(--info-fg)" },
    accent:  { bg: "var(--accent-pill-bg)", fg: "var(--accent)" },
    muted:   { bg: "var(--muted-bg)",   fg: "var(--text-dim)" },
  };
  const sizes = {
    xs: { fontSize: FS.xxs, padding: "1px 6px" },
    sm: { fontSize: FS.xs,  padding: "2px 7px" },
    md: { fontSize: FS.sm,  padding: "3px 9px" },
  };
  const t = tones[tone] || tones.muted;
  const s = sizes[size] || sizes.sm;
  return (
    <span
      style={{
        background: t.bg, color: t.fg, borderRadius: R.pill,
        fontFamily: MN, fontWeight: 700, whiteSpace: "nowrap",
        display: "inline-block", lineHeight: 1.2,
        ...s, ...style,
      }}
      {...rest}
    >{children}</span>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
// Surface container. Tier 1 = default; Tier 2-3 = nested panels.
export function Card({ tier=1, padded=true, children, style, ...rest }) {
  const bg = tier === 1 ? "var(--card)" : tier === 2 ? "var(--card-2)" : tier === 3 ? "var(--card-3)" : "var(--card-4)";
  return (
    <div
      style={{
        background: bg,
        border: "1px solid var(--border)",
        borderRadius: R.lg,
        padding: padded ? SP.lg : 0,
        color: "var(--text)",
        ...style,
      }}
      {...rest}
    >{children}</div>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ size="md", style, ...rest }) {
  const sizes = {
    sm: { fontSize: FS.sm,   padding: "4px 8px",  minHeight: 26 },
    md: { fontSize: FS.base, padding: "6px 10px", minHeight: 32 },
    lg: { fontSize: FS.md,   padding: "9px 12px", minHeight: 40 },
  };
  const s = sizes[size] || sizes.md;
  return (
    <input
      style={{
        background: "var(--card-2)", color: "var(--text)",
        border: "1px solid var(--border)", borderRadius: R.md,
        fontFamily: MN, outline: "none",
        ...s, ...style,
      }}
      onFocus={e => { e.target.style.borderColor = "var(--accent)"; }}
      onBlur={e => { e.target.style.borderColor = "var(--border)"; }}
      {...rest}
    />
  );
}
