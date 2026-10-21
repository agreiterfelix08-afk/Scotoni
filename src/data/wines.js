// Wine list data.
//
// The real list (about 700 labels) is not available yet. Until it is, the explorer uses a
// clearly labelled DEMO dataset with exactly the structure the real list must have.
//
// To publish the real list (TODO: wine list from the hut):
//   1. Export the spreadsheet as CSV with the columns of `WINE_FIELDS`.
//   2. Run: node scripts/wines-from-csv.mjs path/to/wines.csv
//      → writes src/data/wines.json
//   3. Set REAL_LIST_URL below to "../src/data/wines.json" and rebuild.

export const REAL_LIST_URL = null;

/** Columns of one label. price = bottle price in EUR (optional; shown only if present). */
export const WINE_FIELDS = ["id", "name", "producer", "region", "country", "colour", "grape", "vintage", "priceBand", "price"];
export const COLOURS = ["red", "white", "rose", "sparkling", "sweet"];

// Demo generator: deterministic, obviously fictional producer names.
const REGIONS = [
  ["Alto Adige", "IT", ["Lagrein", "Schiava", "Pinot Bianco", "Gewürztraminer", "Sauvignon", "Pinot Nero"]],
  ["Trentino", "IT", ["Teroldego", "Müller-Thurgau", "Chardonnay", "Marzemino"]],
  ["Veneto", "IT", ["Corvina", "Garganega", "Glera"]],
  ["Friuli", "IT", ["Friulano", "Ribolla Gialla", "Refosco"]],
  ["Piemonte", "IT", ["Nebbiolo", "Barbera", "Moscato"]],
  ["Toscana", "IT", ["Sangiovese", "Vermentino"]],
  ["Austria", "AT", ["Grüner Veltliner", "Blaufränkisch", "Riesling"]],
  ["France", "FR", ["Pinot Noir", "Chardonnay", "Syrah"]],
];
const COLOUR_OF = {
  Lagrein: "red", Schiava: "red", "Pinot Nero": "red", Teroldego: "red", Marzemino: "red", Corvina: "red", Refosco: "red",
  Nebbiolo: "red", Barbera: "red", Sangiovese: "red", Blaufränkisch: "red", "Pinot Noir": "red", Syrah: "red",
  Glera: "sparkling", Moscato: "sweet",
};

export function demoWines(count = 700) {
  const out = [];
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 1; i <= count; i++) {
    const [region, country, grapes] = REGIONS[Math.floor(rnd() * REGIONS.length)];
    const grape = grapes[Math.floor(rnd() * grapes.length)];
    let colour = COLOUR_OF[grape] || "white";
    if (colour === "red" && rnd() < 0.08) colour = "rose";
    const sparklingNv = colour === "sparkling";
    out.push({
      id: `demo-${i}`,
      name: `Demo ${grape} ${String(i).padStart(3, "0")}`,
      producer: `Demo winery ${String.fromCharCode(65 + (i % 26))}`,
      region, country, colour, grape,
      vintage: sparklingNv ? null : 2012 + Math.floor(rnd() * 12),
      priceBand: 1 + Math.floor(rnd() * 4),
      price: null,
      demo: true,
    });
  }
  return out;
}

export async function loadWines(fetchImpl = globalThis.fetch) {
  if (REAL_LIST_URL) {
    const res = await fetchImpl(REAL_LIST_URL);
    if (res.ok) return { wines: await res.json(), demo: false };
  }
  return { wines: demoWines(), demo: true };
}
