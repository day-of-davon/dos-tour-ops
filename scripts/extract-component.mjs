#!/usr/bin/env node
/**
 * extract-component.mjs — Phase 2 decomposition codemod for DosApp.jsx.
 *
 * Moves one top-level component (or helper) out of src/DosApp.jsx into its own
 * file under src/components/<subdir>/, and rewires imports on BOTH sides so the
 * app keeps compiling and rendering.
 *
 * Why this is safe to automate: every component in DosApp.jsx is a top-level
 * `function` that pulls its dependencies either from module-level
 * helpers/constants, from `useContext(Ctx)`, or from existing imports. None
 * close over App's locals. So extraction is purely "move the declaration, then
 * make every free identifier resolvable again."
 *
 * What it does, per target:
 *   1. Finds the declaration by name (FunctionDeclaration or const = ...).
 *   2. Collects every free identifier it references (skips its own params/locals
 *      and property/JSX-attribute names).
 *   3. Resolves each free identifier to where it is declared:
 *        - an existing import in DosApp  -> replicate that import in the new file
 *        - a module-level decl in DosApp -> mark it `export` and import it back
 *          from "../../DosApp.jsx" (a temporary edge later phases collapse)
 *        - a global (window, Math, ...)  -> ignore
 *   4. Writes src/components/<subdir>/<Name>.jsx with `export function/const`.
 *   5. Removes the declaration from DosApp.jsx and adds
 *      `import { Name } from "./components/<subdir>/<Name>.jsx";`
 *
 * Run the safety net after EVERY extraction:
 *   npm run lint && npm test
 *
 * Usage:
 *   node scripts/extract-component.mjs <Name> <subdir> [--dry]
 *   node scripts/extract-component.mjs FlightCard flights
 *   node scripts/extract-component.mjs GLMetric shared --dry
 */
import { Project, SyntaxKind, ts, Node } from "ts-morph";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MONOLITH = path.join(ROOT, "src/DosApp.jsx");

const [, , NAME, SUBDIR, ...flags] = process.argv;
const DRY = flags.includes("--dry");

if (!NAME || !SUBDIR) {
  console.error("usage: node scripts/extract-component.mjs <Name> <subdir> [--dry]");
  process.exit(2);
}

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
project.addSourceFilesAtPaths(path.join(ROOT, "src/**/*.{js,jsx}"));

const mono = project.getSourceFileOrThrow(MONOLITH);

// --- locate the declaration ------------------------------------------------
let decl =
  mono.getFunction(NAME) ||
  mono.getVariableDeclaration(NAME);
if (!decl) {
  console.error(`✗ could not find a top-level "${NAME}" in DosApp.jsx`);
  process.exit(1);
}
// The whole statement we will move (function decl, or the `const ...` statement).
const moveNode =
  decl.getKind() === SyntaxKind.VariableDeclaration
    ? decl.getVariableStatementOrThrow()
    : decl;

// --- collect free identifiers ----------------------------------------------
// Names declared inside the moved node (params, locals, nested fns) are NOT
// dependencies. Everything else referenced is.
const internalNames = new Set();
for (const id of moveNode.getDescendantsOfKind(SyntaxKind.Identifier)) {
  const p = id.getParent();
  // collect binding names that are LOCAL to the moved node
  if (
    Node.isParameterDeclaration(p) ||
    Node.isVariableDeclaration(p) ||
    Node.isFunctionDeclaration(p) ||
    Node.isBindingElement(p)
  ) {
    if (p.getNameNode?.() === id) internalNames.add(id.getText());
  }
}
internalNames.add(NAME);

function isReferencePosition(id) {
  const p = id.getParent();
  // skip property names: obj.foo, {foo: ...}, jsx attr name=, import/export
  if (Node.isPropertyAccessExpression(p) && p.getNameNode() === id) return false;
  if (Node.isPropertyAssignment(p) && p.getNameNode() === id) return false;
  if (Node.isShorthandPropertyAssignment(p)) return true; // {foo} -> foo is a ref
  if (Node.isJsxAttribute(p)) return false;
  if (Node.isJsxAttribute(p?.getParent?.()) && p.getParent().getNameNode?.() === id) return false;
  if (Node.isImportSpecifier(p) || Node.isExportSpecifier(p)) return false;
  if (Node.isBindingElement(p) && p.getPropertyNameNode?.() === id) return false;
  return true;
}

const deps = new Map(); // name -> { kind, ... }
for (const id of moveNode.getDescendantsOfKind(SyntaxKind.Identifier)) {
  const name = id.getText();
  if (internalNames.has(name)) continue;
  if (deps.has(name)) continue;
  if (!isReferencePosition(id)) continue;

  const sym = id.getSymbol();
  const decls = sym?.getDeclarations?.() ?? [];
  if (decls.length === 0) continue; // global / unresolved -> ignore

  // Prefer a declaration that lives in the monolith.
  const d = decls.find((x) => x.getSourceFile() === mono) ?? decls[0];
  const sf = d.getSourceFile();

  // Is it an imported binding (in any file we control)?
  const imp = d.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  if (imp && sf === mono) {
    // Bare specifiers (react, @supabase/...) carry over unchanged. Relative
    // specifiers must be recomputed from the NEW file's directory.
    const spec = imp.getModuleSpecifierValue();
    let module = spec;
    if (spec.startsWith(".")) {
      const resolved = imp.getModuleSpecifierSourceFile();
      const targetPath = resolved
        ? resolved.getFilePath()
        : path.resolve(path.dirname(MONOLITH), spec);
      let rel = path
        .relative(path.join(ROOT, "src/components", SUBDIR), targetPath)
        .replace(/\\/g, "/")
        // drop a resolved extension so it matches the source's import style
        .replace(/\.(jsx?|tsx?)$/, "");
      if (!rel.startsWith(".")) rel = "./" + rel;
      module = rel;
    }
    deps.set(name, {
      kind: "import",
      module,
      isDefault: !!imp.getDefaultImport() && imp.getDefaultImport().getText() === name,
      isNamespace: !!imp.getNamespaceImport() && imp.getNamespaceImport().getText() === name,
    });
    continue;
  }

  // Module-level declaration inside the monolith -> needs export + back-import.
  if (sf === mono) {
    deps.set(name, { kind: "monolith", node: d });
    continue;
  }

  // Declared in another project file directly (rare) -> import from there.
  deps.set(name, {
    kind: "external-file",
    module: "./" + path.relative(path.join(ROOT, "src/components", SUBDIR), sf.getFilePath()).replace(/\\/g, "/"),
  });
}

// --- build the import block for the new file -------------------------------
const importsByModule = new Map(); // module -> {named:Set, default:string|null, namespace:string|null}
function addImport(module, { named, def, ns } = {}) {
  if (!importsByModule.has(module))
    importsByModule.set(module, { named: new Set(), def: null, ns: null });
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
  }
}
if (monolithBackImports.size) {
  for (const n of monolithBackImports) addImport("../../DosApp.jsx", { named: n });
}

function renderImports() {
  const lines = [];
  // react first for readability
  const ordered = [...importsByModule.entries()].sort(([a], [b]) =>
    a === "react" ? -1 : b === "react" ? 1 : a.localeCompare(b)
  );
  for (const [mod, e] of ordered) {
    const clause = [];
    if (e.def) clause.push(e.def);
    if (e.ns) clause.push(`* as ${e.ns}`);
    if (e.named.size) clause.push(`{ ${[...e.named].sort().join(", ")} }`);
    lines.push(`import ${clause.join(", ")} from "${mod}";`);
  }
  return lines.join("\n");
}

// --- compose & apply -------------------------------------------------------
const body = moveNode.getText();
const exported = body.startsWith("export ") ? body : `export ${body}`;
const newRelDir = path.join("src/components", SUBDIR);
const newRelPath = path.join(newRelDir, `${NAME}.jsx`);
const newAbsPath = path.join(ROOT, newRelPath);
const newContent = `${renderImports()}\n\n${exported}\n`;
const backImport = `import { ${NAME} } from "./components/${SUBDIR}/${NAME}.jsx";`;

// Report
console.log(`\n● extract ${NAME} -> ${newRelPath}`);
const byKind = (k) => [...deps].filter(([, v]) => v.kind === k).map(([n]) => n);
console.log(`  imports replicated : ${byKind("import").join(", ") || "(none)"}`);
console.log(`  monolith deps      : ${[...monolithBackImports].join(", ") || "(none)"}`);
const extFile = byKind("external-file");
if (extFile.length) console.log(`  sibling-file deps  : ${extFile.join(", ")}`);
console.log(`  -> will mark exported in DosApp.jsx: ${[...monolithBackImports].join(", ") || "(none)"}`);

if (DRY) {
  console.log("\n--- new file preview ---\n");
  console.log(newContent.split("\n").slice(0, 40).join("\n"));
  console.log("\n(dry run; nothing written)\n");
  process.exit(0);
}

// 1. mark monolith deps exported
for (const n of monolithBackImports) {
  const d = mono.getFunction(n) || mono.getVariableDeclaration(n);
  if (!d) continue;
  if (d.getKind() === SyntaxKind.VariableDeclaration) {
    const stmt = d.getVariableStatementOrThrow();
    if (!stmt.isExported()) stmt.setIsExported(true);
  } else if (typeof d.setIsExported === "function") {
    if (!d.isExported()) d.setIsExported(true);
  }
}

// 2. write the new file
project.createSourceFile(newAbsPath, newContent, { overwrite: true });

// 3. remove the declaration from the monolith and add the back-import
moveNode.remove();
mono.insertStatements(0, backImport);

project.saveSync();
console.log(`\n✓ wrote ${newRelPath} and rewired DosApp.jsx`);
console.log(`  next: npm run lint && npm test\n`);
