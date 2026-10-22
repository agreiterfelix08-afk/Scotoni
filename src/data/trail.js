// Access trail — verified figures from public listings.
// The hut's altitude comes from hut.config.js so the profile always matches the rest of the site.

export const trail = {
  start: { name: "Capanna Alpina", altitudeM: 1720, near: "Armentarola", mapsQuery: "Capanna Alpina, Armentarola, San Cassiano" },
  trailNo: "20",
  minutes: 60, // one way, about
  ascentM: 320, // about
  difficulty: "easy",
  extension: { name: "Lago Lagazuoi", altitudeM: 2180, minutes: 30 }, // about, from the hut
  // Schematic shape of the climb: [fraction of time, fraction of ascent].
  // "Wide track, steeper in the upper part" → gentle first, steeper last third.
  shape: [[0, 0], [0.25, 0.12], [0.5, 0.3], [0.7, 0.52], [0.85, 0.78], [1, 1]],
  parkingNote: null, // TODO: verify parking at Capanna Alpina (fees, capacity, summer road rules)
};
