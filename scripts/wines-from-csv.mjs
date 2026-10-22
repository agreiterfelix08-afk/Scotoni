// Convert the hut's wine spreadsheet (exported as CSV) into src/data/wines.json.
//
//   node scripts/wines-from-csv.mjs path/to/wines.csv
//
// Expected header (order free, case-insensitive):
//   name, producer, region, country, colour, grape, vintage, priceBand, price
// colour: red | white | rose | sparkling | sweet  ·  priceBand: 1–4  ·  price (optional): bottle price in EUR
// Separator: comma or semicolon (Excel in Italy/Germany uses ";").

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLOURS } from "../src/data/wines.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/wines-from-csv.mjs wines.csv");
  process.exit(1);
}

function parseCSV(text) {
  const sep = (text.split("\n")[0].match(/;/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const [header, ...rows] = parseCSV(readFileSync(file, "utf8").replace(/^﻿/, ""));
const col = Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase(), i]));
const get = (r, k) => (col[k.toLowerCase()] != null ? r[col[k.toLowerCase()]].trim() : "");
const errors = [];
const wines = rows.map((r, i) => {
  const colour = get(r, "colour").toLowerCase();
  const band = Number(get(r, "priceBand"));
  if (!get(r, "name")) errors.push(`row ${i + 2}: name missing`);
  if (!COLOURS.includes(colour)) errors.push(`row ${i + 2}: colour "${colour}" must be one of ${COLOURS.join(", ")}`);
  if (!(band >= 1 && band <= 4)) errors.push(`row ${i + 2}: priceBand must be 1–4`);
  const price = get(r, "price").replace(",", ".");
  return {
    id: `w${i + 1}`, name: get(r, "name"), producer: get(r, "producer"), region: get(r, "region"), country: get(r, "country"),
    colour, grape: get(r, "grape"), vintage: Number(get(r, "vintage")) || null, priceBand: band, price: price ? Number(price) : null,
  };
});
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const out = join(dirname(fileURLToPath(import.meta.url)), "../src/data/wines.json");
writeFileSync(out, JSON.stringify(wines));
console.log(`Wrote ${wines.length} wines to src/data/wines.json. Now set REAL_LIST_URL in src/data/wines.js and run npm run build.`);
