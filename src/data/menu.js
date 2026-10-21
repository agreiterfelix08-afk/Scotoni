// Menu — only dishes confirmed by public listings. Prices live in hut.config.js (`hut.prices`)
// and are hidden while unset.
//
// Dietary tags are provisional. TODO: verify every tag with the kitchen before relying on it.
// No dish is tagged gluten-free: "gluten-free cuisine" is listed for the hut, but which dishes
// qualify must come from the kitchen (allergen information is a legal matter).

export const categories = ["grill", "soups", "pasta", "polenta", "cold", "desserts", "drinks"];
export const diets = ["vegetarian", "glutenFree"];

export const menu = [
  {
    id: "mixed-grill", cat: "grill", signature: true, tags: [],
    name: { it: "Grigliata mista Scotoni", de: "Scotoni-Grillteller", en: "Scotoni mixed grill" },
    desc: {
      it: "La nostra specialità, dalla griglia aperta: Christian la prepara davanti a voi.",
      de: "Unsere Spezialität vom offenen Grill – Christian grillt vor Ihren Augen.",
      en: "Our speciality from the open grill — Christian cooks it in front of you.",
    },
  },
  {
    id: "ribs", cat: "grill", tags: [],
    name: { it: "Costine alla griglia", de: "Gegrillte Rippchen", en: "Grilled ribs" },
    desc: { it: "Specialità BBQ dalla griglia aperta.", de: "BBQ-Spezialität vom offenen Grill.", en: "BBQ speciality from the open grill." },
  },
  {
    id: "sausages", cat: "grill", tags: [],
    name: { it: "Salsicce alla griglia", de: "Gegrillte Würste", en: "Grilled sausages" },
    desc: { it: "Dalla griglia, come da tradizione.", de: "Vom Grill, wie es Tradition ist.", en: "From the grill, the traditional way." },
  },
  {
    id: "grilled-vegetables", cat: "grill", tags: ["vegetarian"], // TODO: verify tag
    name: { it: "Verdure alla griglia", de: "Gegrilltes Gemüse", en: "Grilled vegetables" },
    desc: { it: "Verdure di stagione dalla griglia.", de: "Saisongemüse vom Grill.", en: "Seasonal vegetables from the grill." },
  },
  {
    id: "goulash-soup", cat: "soups", tags: [],
    name: { it: "Zuppa di gulasch", de: "Gulaschsuppe", en: "Goulash soup" },
    desc: { it: "Calda, dopo la salita.", de: "Wärmt nach dem Aufstieg.", en: "Warming after the climb." },
  },
  {
    id: "home-made-pasta", cat: "pasta", tags: [],
    name: { it: "Pasta fatta in casa", de: "Hausgemachte Nudeln", en: "Home-made pasta" },
    desc: { it: "Fatta nella nostra cucina.", de: "In unserer Küche gemacht.", en: "Made in our kitchen." },
  },
  {
    id: "polenta-cheese", cat: "polenta", tags: ["vegetarian"], // TODO: verify tag
    name: { it: "Polenta con formaggio fuso", de: "Polenta mit geschmolzenem Käse", en: "Polenta with melted cheese" },
    desc: { it: "Un classico di montagna.", de: "Ein Klassiker der Berge.", en: "A mountain classic." },
  },
  {
    id: "speck-cheese", cat: "cold", tags: [],
    name: { it: "Speck di produzione propria e formaggi altoatesini", de: "Hausgemachter Speck und Südtiroler Käse", en: "House-made speck and South Tyrolean cheese" },
    desc: {
      it: "Lo speck lo facciamo noi; formaggi e salumi vengono dall'Alto Adige.",
      de: "Den Speck machen wir selbst; Käse und Wurst kommen aus Südtirol.",
      en: "We make the speck ourselves; cheese and cured meats come from South Tyrol.",
    },
  },
  {
    id: "kaiserschmarrn", cat: "desserts", signature: true, tags: [],
    name: { it: "Kaiserschmarrn", de: "Kaiserschmarrn", en: "Kaiserschmarrn" },
    desc: { it: "Il preferito dei nostri ospiti.", de: "Der Liebling unserer Gäste.", en: "Our guests' favourite." },
  },
  {
    id: "strudel", cat: "desserts", tags: [],
    name: { it: "Strudel fatto in casa", de: "Hausgemachter Strudel", en: "Home-made strudel" },
    desc: { it: "Dalla nostra cucina.", de: "Aus unserer Küche.", en: "From our kitchen." },
  },
  {
    id: "cakes-tarts", cat: "desserts", tags: [],
    name: { it: "Torte e crostate", de: "Kuchen und Torten", en: "Cakes and tarts" },
    desc: { it: "Fatte in casa, come le nostre marmellate.", de: "Hausgemacht, wie unsere Marmeladen.", en: "Home-made, like our jams." },
  },
  {
    id: "wine", cat: "drinks", tags: [], link: "wine.html",
    name: { it: "Carta dei vini", de: "Weinkarte", en: "Wine list" },
    desc: { it: "Circa 700 etichette.", de: "Rund 700 Etiketten.", en: "About 700 labels." },
  },
];
