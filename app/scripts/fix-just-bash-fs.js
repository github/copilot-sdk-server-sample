/**
 * Patches the just-bash OverlayFs to work on Windows.
 *
 * The upstream `isPathWithinRoot` function only checks for forward-slash
 * separators (`/`), but on Windows `fs.realpathSync` and `path.resolve`
 * return backslash-separated paths.  This causes stat() and readFile()
 * to fail for every real file under the overlay root.
 *
 * Run after `npm install`:
 *   node fix-just-bash-fs.js
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const bundleDir = join("node_modules", "just-bash", "dist", "bundle");

// Matches the minified isPathWithinRoot (unpatched):
//   function X(a,b){return a===b||a.startsWith(`${b}/`)}
// Captures: funcName, param1, param2
const unpatched =
  /function (\w+)\((\w+),(\w+)\)\{return \2===\3\|\|\2\.startsWith\(`\$\{\3\}\/`\)\}/g;

// Matches the already-patched form so we can detect idempotent re-runs
const alreadyPatched =
  /function \w+\(\w+,\w+\)\{return \w+===\w+\|\|\w+\.startsWith\(`\$\{\w+\}\/`\)\|\|\w+\.startsWith\(`\$\{\w+\}\\\\`\)\}/;

function patchFile(filePath) {
  const original = readFileSync(filePath, "utf-8");
  if (alreadyPatched.test(original)) {
    return "already";
  }
  const patched = original.replace(
    unpatched,
    // Add a parallel backslash check: || param1.startsWith(`${param2}\\`)
    (match, fn, p1, p2) =>
      `function ${fn}(${p1},${p2}){return ${p1}===${p2}||${p1}.startsWith(\`\${${p2}}/\`)||${p1}.startsWith(\`\${${p2}}\\\\\`)}`,
  );
  if (patched !== original) {
    writeFileSync(filePath, patched, "utf-8");
    return "patched";
  }
  return "none";
}

// Patch all JS files in the bundle dir (handles chunks too)
let patchCount = 0;
let alreadyCount = 0;
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".cjs")) {
      const result = patchFile(full);
      if (result === "patched") {
        console.log(`  patched: ${full}`);
        patchCount++;
      } else if (result === "already") {
        alreadyCount++;
      }
    }
  }
}

console.log("Patching just-bash for Windows path separators...");
walk(bundleDir);

if (patchCount > 0) {
  console.log(`Done (${patchCount} file(s) patched).`);
} else if (alreadyCount > 0) {
  console.log(`Already patched (${alreadyCount} file(s)), nothing to do.`);
} else {
  console.log("  WARNING: no isPathWithinRoot matches found — the bundle format may have changed.");
  process.exit(1);
}
