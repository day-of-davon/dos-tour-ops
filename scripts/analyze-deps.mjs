#!/usr/bin/env node
/**
 * analyze-deps.mjs — build the component dependency DAG inside DosApp.jsx and
 * print a leaves-first topological order, so Phase 2 extraction never creates a
 * back-edge (a parent is always extracted after its children).
 *
 * A "component" here = a top-level function whose name starts uppercase.
 * Edge A -> B means A references B (B is rendered/used by A).
 */
import { Project, SyntaxKind, ts, Node } from "ts-morph";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src");
const MONOLITH = path.join(SRC, "DosApp.jsx");

const project = new Project({
  compilerOptions: { allowJs: true, checkJs: false, jsx: ts.JsxEmit.ReactJSX },
  skipAddingFilesFromTsConfig: true,
});
project.addSourceFilesAtPaths(path.join(SRC, "**/*.{js,jsx}"));
const mono = project.getSourceFileOrThrow(MONOLITH);

// top-level component functions (uppercase-initial), excluding App
const comps = new Map(); // name -> node
for (const fn of mono.getFunctions()) {
  const n = fn.getName();
  if (n && /^[A-Z]/.test(n) && n !== "App") comps.set(n, fn);
}
const names = new Set(comps.keys());

// edges
const edges = new Map(); // name -> Set(deps within comps)
for (const [name, node] of comps) {
  const deps = new Set();
  for (const id of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const t = id.getText();
    if (t === name || !names.has(t)) continue;
    const p = id.getParent();
    if (Node.isPropertyAccessExpression(p) && p.getNameNode() === id) continue;
    deps.add(t);
  }
  edges.set(name, deps);
}

// also note App's direct children (the tab roots / chrome) for sequencing
const appNode = mono.getFunction("App");
const appChildren = new Set();
for (const id of appNode.getDescendantsOfKind(SyntaxKind.Identifier)) {
  if (names.has(id.getText())) appChildren.add(id.getText());
}

// topological order, leaves first (Kahn on reverse dependency count)
const order = [];
const remaining = new Set(names);
const depCount = new Map([...edges].map(([n, d]) => [n, new Set([...d].filter((x) => remaining.has(x))).size]));
let guard = 0;
while (remaining.size && guard++ < 1000) {
  const ready = [...remaining].filter((n) => [...edges.get(n)].every((d) => !remaining.has(d)));
  if (ready.length === 0) {
    // cycle: break it by taking the node with fewest unresolved deps
    const pick = [...remaining].sort(
      (a, b) =>
        [...edges.get(a)].filter((d) => remaining.has(d)).length -
        [...edges.get(b)].filter((d) => remaining.has(d)).length
    )[0];
    order.push(pick + "  (cycle-break)");
    remaining.delete(pick);
    continue;
  }
  ready.sort();
  for (const n of ready) {
    order.push(n);
    remaining.delete(n);
  }
}

console.log(`components: ${names.size}`);
console.log(`\nleaves-first extraction order:\n`);
order.forEach((n, i) => {
  const raw = n.replace("  (cycle-break)", "");
  const fanout = edges.has(raw) ? edges.get(raw).size : 0;
  console.log(`${String(i + 1).padStart(3)}. ${n}${fanout ? `   (uses ${fanout})` : ""}`);
});
console.log(`\nApp directly renders: ${[...appChildren].sort().join(", ")}`);
