// Project checks without third-party tools (no dependency to install on a slow connection):
//  1. JavaScript syntax of every file
//  2. i18n: identical keys and placeholders in IT / DE / EN, no empty strings
//  3. Built pages: no unresolved template tags, one <h1>, unique ids, alt text, working internal links, valid JSON-LD
//  4. Safety: no innerHTML/eval/document.write in browser code, no third-party scripts or styles
// Run `npm run build` first (npm run check does both).

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import it from "../src/i18n/it.js";
import de from "../src/i18n/de.js";
import en from "../src/i18n/en.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

function walk(dir, filter) {
  const out = [];
  if (!existsSync(join(ROOT, dir))) return out;
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

// 1. syntax
const jsFiles = [...walk("src", (p) => /\.m?js$/.test(p)), ...walk("scripts", (p) => /\.mjs$/.test(p)), ...walk("test", (p) => /\.js$/.test(p))];
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ["--check", join(ROOT, f)], { encoding: "utf8" });
  if (r.status !== 0) fail(f, r.stderr.split("\n").slice(0, 5).join(" "));
}

// 2. i18n
const dicts = { it, de, en };
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const keys = Object.keys(en);
for (const [lang, d] of Object.entries(dicts)) {
  for (const k of keys) if (!(k in d)) fail(`src/i18n/${lang}.js`, `missing key "${k}"`);
  for (const k of Object.keys(d)) {
    if (!(k in en)) fail(`src/i18n/${lang}.js`, `extra key "${k}"`);
    if (!String(d[k]).trim()) fail(`src/i18n/${lang}.js`, `empty "${k}"`);
    if (k in en && vars(d[k]) !== vars(en[k])) fail(`src/i18n/${lang}.js`, `placeholders of "${k}" differ from en: {${vars(d[k])}} vs {${vars(en[k])}}`);
  }
}

// 3. built pages
const pages = walk(".", (p) => p.endsWith(".html") && /^(it|de|en)[\\/]/.test(p));
if (pages.length === 0) fail("build", "no built pages – run npm run build");
for (const page of pages) {
  const html = readFileSync(join(ROOT, page), "utf8");
  if (/\{\{|\}\}/.test(html)) fail(page, "unresolved template tag");
  if (!/<html lang="(it|de|en)">/.test(html)) fail(page, "missing html lang");
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) fail(page, `${h1} <h1> elements`);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) fail(page, `duplicate ids: ${[...new Set(dup)].join(", ")}`);
  for (const img of html.match(/<img\b[^>]*>/g) || []) if (!/\salt="/.test(img)) fail(page, "img without alt");
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|tel:|#|data:)/.test(url)) continue;
    const target = resolve(ROOT, dirname(page), url.split("#")[0].split("?")[0]);
    const file = existsSync(target) && statSync(target).isDirectory() ? join(target, "index.html") : target;
    if (!existsSync(file)) fail(page, `broken link ${url}`);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { fail(page, `invalid JSON-LD: ${e.message}`); }
  }
  if (/<script[^>]+src="https?:/.test(html) || /<link[^>]+rel="stylesheet"[^>]+href="https?:/.test(html)) fail(page, "third-party script or stylesheet");
}

// 4. safety in browser code
for (const f of walk("src", (p) => /\.js$/.test(p) && !p.includes("reservation-engine/stores/sqlite"))) {
  const code = readFileSync(join(ROOT, f), "utf8");
  if (/\.innerHTML\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/.test(code)) fail(f, "unsafe DOM/code injection API");
  if (/console\.log\(/.test(code)) fail(f, "console.log left in code");
}
const engineDir = walk("src/reservation-engine", (p) => p.endsWith(".js") && !p.includes("local-storage-store") && !p.includes("remote-engine"));
for (const f of engineDir) {
  const code = readFileSync(join(ROOT, f), "utf8");
  if (/\b(document|window|localStorage)\b/.test(code)) fail(f, "reservation engine must not touch the DOM or browser storage");
}

if (problems.length) {
  console.error(`✖ ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`✔ lint passed: ${jsFiles.length} scripts, ${keys.length} keys × 3 languages, ${pages.length} pages`);
