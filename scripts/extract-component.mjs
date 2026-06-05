#!/usr/bin/env node
/**
 * extract-component.mjs — decomposition codemod for DosApp.jsx.
 *
 * Moves one or more top-level declarations (components OR helpers/constants)
 * out of src/DosApp.jsx into a target module, and rewires imports on BOTH
 * sides so the app keeps compiling and rendering.
 *
 * Why this is safe to automate: every top-level decl in DosApp.jsx pulls its
 * dependencies from other module-level decls, from `useContext(Ctx)`, or from
 * existing imports. None close over App's locals. So extraction is purely
 * "move the declaration(s), then make every free identifier resolvable again."
 *
 * Per run:
 *   1. Finds each named declaration (FunctionDeclaration or `const X = ...`).
 *   2. Collects free identifiers it references (skips its own params/locals,
 *      other members of the SAME group, and property/JSX-attribute names).
 *   3. Resolves each free identifier:
 *        - an existing import in DosApp  -> replicate it (relative specifiers
 *          recomputed for the new file's location)
 *        - a module-level decl in DosApp -> mark it `export` and import it back
 *          from the monolith (a temporary edge; avoid by extracting depended-on
 *          symbols FIRST — see ordering note below)
 *        - a global (window, Math, ...)  -> ignore
 *   4. Writes the target module with `export` on each moved decl.
 *   5. Removes the decls from DosApp.jsx and adds one back-import.
 *
 * ORDERING: extract depended-on symbols before their dependents. Then a
 * dependent's deps already live in real modules (they resolve to imports in
 * DosApp, which this tool replicates) and NO back-edge to the monolith forms.
 * Substrate (Ctx, lib helpers) before components; leaf helpers before the
 * helpers that use them.
 *
 * Run the safety net after EVERY run:  npm run lint && npm test
 *
 * Usage:
 *   node scripts/extract-component.mjs <Name[,Name2,...]> <dest> [--dry]
 *
 *   dest relative to src/. If it ends in .js/.jsx it is the exact module file
 *   (use this for groups). Otherwise it is a directory and the file is
 *   <dest>/<Name>.jsx (single decl only).
 *
 *   node scripts/extract-component.mjs Ctx context/DosContext.jsx
 *   node scripts/extract-component.mjs toM,fmt,dU,fD,fW,fFull lib/time.js
 *   node scripts/extract-component.mjs FlightCard components/flights
 */
import { Project, SyntaxKind, ts, Node } from "ts-morph";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const MONOLITH = path.join(SRC, "DosApp.jsx");

const [, , NAMES_ARG, DEST, ...flags] = process.argv;
const DRY = flags.includes("--dry");

if (!NAMES_ARG || !DEST) {
  console.error("usage: node scripts/extract-component.mjs <Name[,Name2,...]> <dest> [--dry]");
  process.exit(2);
}
const NAMES = NAMES_ARG.split(",").map((s) => s.trim()).filter(Boolean);
const groupNames = new Set(NAMES);

// --- resolve destination ---------------------------------------------------
const destIsFile = /\.(jsx?|tsx?)$/.test(DEST);
if (!destIsFile && NAMES.length > 1) {
  console.error("✗ a directory dest takes a single name; pass a <dest>.jsx file for groups");
  process.exit(2);
}
const targetRel = destIsFile ? DEST : path.join(DEST, `${NAMES[0]}.jsx`);
const targetAbs = path.join(SRC, targetRel);
const targetDir = path.dirname(targetAbs);
// import specifier DosApp will use to pull the moved symbols back in
const importPathFromMono =
  "./" + (destIsFile ? DEST : path.join(DEST, `${NAMES[0]}.jsx`)).replace(/\\/g, "/");
// import specifier the new module uses to reach the monolith for any back-edge
const monoFromTarget = relSpec(targetDir, MONOLITH, /*keepExt*/ true);

function relSpec(fromDir, toFile, keepExt) {
  let rel = path.relative(fromDir, toFile).replace(/\\/g, "/");
  if (!keepExt) rel = rel.replace(/\.(jsx?|tsx?)$/, "");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

// --- load project ----------------------------------------------------------
const project = new Project({
  compilerOptions: {
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  },
  skipAddingFilesFromTsConfig: true,
});
project.addSourceFilesAtPaths(path.join(SRC, "**/*.{js,jsx}"));
const mono = project.getSourceFileOrThrow(MONOLITH);

// --- locate declarations ---------------------------------------------------
const moveNodes = NAMES.map((name) => {
  const decl = mono.getFunction(name) || mono.getVariableDeclaration(name);
  if (!decl) {
    console.error(`✗ could not find a top-level "${name}" in DosApp.jsx`);
    process.exit(1);
  }
  return decl.getKind() === SyntaxKind.VariableDeclaration
    ? decl.getVariableStatementOrThrow()
    : decl;
}).sort((a, b) => a.getStart() - b.getStart()); // preserve source order

// --- helpers ---------------------------------------------------------------
function collectLocals(node) {
  const locals = new Set();
  for (const id of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const p = id.getParent();
    if (
      (Node.isParameterDeclaration(p) ||
        Node.isVariableDeclaration(p) ||
        Node.isFunctionDeclaration(p) ||
        Node.isBindingElement(p)) &&
      p.getNameNode?.() === id
    ) {
      locals.add(id.getText());
    }
  }
  return locals;
}

function isReferencePosition(id) {
  const p = id.getParent();
  if (Node.isPropertyAccessExpression(p) && p.getNameNode() === id) return false;
  if (Node.isPropertyAssignment(p) && p.getNameNode() === id) return false;
  if (Node.isShorthandPropertyAssignment(p)) return true;
  if (Node.isJsxAttribute(p)) return false;
  if (Node.isJsxAttribute(p?.getParent?.()) && p.getParent().getNameNode?.() === id) return false;
  if (Node.isImportSpecifier(p) || Node.isExportSpecifier(p)) return false;
  if (Node.isBindingElement(p) && p.getPropertyNameNode?.() === id) return false;
  return true;
}

// --- collect dependencies across the whole group ---------------------------
const deps = new Map(); // name -> { kind, ... }
for (const node of moveNodes) {
  const locals = collectLocals(node);
  for (const id of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const name = id.getText();
    if (groupNames.has(name) || locals.has(name) || deps.has(name)) continue;
    if (!isReferencePosition(id)) continue;

    const sym = id.getSymbol();
    const decls = sym?.getDeclarations?.() ?? [];
    if (decls.length === 0) continue; // global / unresolved

    const d = decls.find((x) => x.getSourceFile() === mono) ?? decls[0];
    const sf = d.getSourceFile();
    // Ambient/global symbols (Math, Date, JSX intrinsics...) resolve to .d.ts
    // lib files. They need no import.
    if (sf.isDeclarationFile()) continue;
    const imp = d.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);

    if (imp && sf === mono) {
      const spec = imp.getModuleSpecifierValue();
      let module = spec;
      if (spec.startsWith(".")) {
        const resolved = imp.getModuleSpecifierSourceFile();
        const tp = resolved ? resolved.getFilePath() : path.resolve(path.dirname(MONOLITH), spec);
        module = relSpec(targetDir, tp, /*keepExt*/ false);
      }
      deps.set(name, {
        kind: "import",
        module,
        isDefault: !!imp.getDefaultImport() && imp.getDefaultImport().getText() === name,
        isNamespace: !!imp.getNamespaceImport() && imp.getNamespaceImport().getText() === name,
      });
    } else if (sf === mono) {
      deps.set(name, { kind: "monolith" });
    } else {
      deps.set(name, { kind: "external-file", module: relSpec(targetDir, sf.getFilePath(), false) });
    }
  }
}

// --- assemble import block for the new module ------------------------------
const importsByModule = new Map();
function addImport(module, { named, def, ns } = {}) {
  if (!importsByModule.has(module)) importsByModule.set(module, { named: new Set(), def: null, ns: null });
  const e = importsByModule.get(module);
  if (named) e.named.add(named);
  if (def) e.def = def;
  if (ns) e.ns = ns;
}
const monolithBackImports = new Set();
for (const [name, info] of deps) {
  if (info.kind === "import") {
    if (info.isDefault) addImport(info.module, { def: name });
    else if (info.isNamespace) addImport(info.module, { ns: name });
    else addImport(info.module, { named: name });
  } else if (info.kind === "external-file") {
    addImport(info.module, { named: name });
  } else if (info.kind === "monolith") {
    monolithBackImports.add(name);
    addImport(monoFromTarget, { named: name });
  }
}
function renderImports() {
  const ordered = [...importsByModule.entries()].sort(([a], [b]) =>
    a === "react" ? -1 : b === "react" ? 1 : a.localeCompare(b)
  );
  return ordered
    .map(([mod, e]) => {
      const clause = [];
      if (e.def) clause.push(e.def);
      if (e.ns) clause.push(`* as ${e.ns}`);
      if (e.named.size) clause.push(`{ ${[...e.named].sort().join(", ")} }`);
      return `import ${clause.join(", ")} from "${mod}";`;
    })
    .join("\n");
}

// --- compose ---------------------------------------------------------------
const texts = moveNodes.map((n) => {
  const t = n.getText();
  return t.startsWith("export ") ? t : `export ${t}`;
});
const head = renderImports();
const newContent = (head ? `${head}\n\n` : "") + `${texts.join("\n\n")}\n`;
const backImport = `import { ${NAMES.join(", ")} } from "${importPathFromMono}";`;

// --- report ----------------------------------------------------------------
console.log(`\n● extract [${NAMES.join(", ")}] -> src/${targetRel}`);
const byKind = (k) => [...deps].filter(([, v]) => v.kind === k).map(([n]) => n);
console.log(`  imports replicated : ${byKind("import").join(", ") || "(none)"}`);
console.log(`  sibling-file deps  : ${byKind("external-file").join(", ") || "(none)"}`);
console.log(`  monolith back-edges: ${[...monolithBackImports].join(", ") || "(none)  ← clean"}`);
if (monolithBackImports.size)
  console.log(`  ⚠ extract these first to avoid the back-edge: ${[...monolithBackImports].join(", ")}`);

if (DRY) {
  console.log("\n--- new module preview (head) ---\n");
  console.log(newContent.split("\n").slice(0, 24).join("\n"));
  console.log("\n(dry run; nothing written)\n");
  process.exit(0);
}

// --- apply -----------------------------------------------------------------
// 1. export any monolith deps we back-import
for (const n of monolithBackImports) {
  const d = mono.getFunction(n) || mono.getVariableDeclaration(n);
  if (!d) continue;
  if (d.getKind() === SyntaxKind.VariableDeclaration) {
    const stmt = d.getVariableStatementOrThrow();
    if (!stmt.isExported()) stmt.setIsExported(true);
  } else if (typeof d.setIsExported === "function" && !d.isExported()) {
    d.setIsExported(true);
  }
}
// 2. write the new module
project.createSourceFile(targetAbs, newContent, { overwrite: true });
// 3. remove decls from the monolith, add the back-import
for (const n of moveNodes) n.remove();
mono.insertStatements(0, backImport);

project.saveSync();
console.log(`\n✓ wrote src/${targetRel} and rewired DosApp.jsx`);
console.log(`  next: npm run lint && npm test\n`);
