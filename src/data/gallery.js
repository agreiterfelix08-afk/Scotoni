// Gallery. Until real photos exist, each item shows an illustrated placeholder (`art`),
// and the page says so.
//
// To add a real photo (TODO: photos from the hut):
//  1. Export it at 480, 960 and 1600 px wide as .avif, .webp and .jpg into assets/photos/
//     named <file>-480.avif, <file>-960.webp, … (see docs/TODO-FOR-THE-HUT.md).
//  2. Set `photo: { file: "<file>", width: 1600, height: 1067 }` on the item.

export const gallery = [
  {
    id: "grill", art: "grill", photo: null,
    caption: { it: "La griglia aperta", de: "Der offene Grill", en: "The open grill" },
    alt: { it: "Illustrazione: fiamme della griglia", de: "Illustration: Flammen des Grills", en: "Illustration: grill flames" },
  },
  {
    id: "hut", art: "hut", photo: null,
    caption: { it: "Il rifugio sotto le cime", de: "Die Hütte unter den Gipfeln", en: "The hut below the peaks" },
    alt: { it: "Illustrazione: rifugio e montagne", de: "Illustration: Hütte und Berge", en: "Illustration: hut and mountains" },
  },
  {
    id: "alpacas", art: "alpaca", photo: null,
    caption: { it: "Il parco degli alpaca", de: "Der Alpakapark", en: "The alpaca park" },
    alt: { it: "Illustrazione: un alpaca", de: "Illustration: ein Alpaka", en: "Illustration: an alpaca" },
  },
  {
    id: "lake", art: "lake", photo: null,
    caption: { it: "Verso il Lago Lagazuoi", de: "Zum Lagazuoi-See", en: "Up to Lago Lagazuoi" },
    alt: { it: "Illustrazione: lago di montagna", de: "Illustration: Bergsee", en: "Illustration: mountain lake" },
  },
  {
    id: "chapel", art: "chapel", photo: null,
    caption: { it: "La cappella in legno", de: "Die Holzkapelle", en: "The wooden chapel" },
    alt: { it: "Illustrazione: piccola cappella in legno", de: "Illustration: kleine Holzkapelle", en: "Illustration: small wooden chapel" },
  },
  {
    id: "dessert", art: "dessert", photo: null,
    caption: { it: "Kaiserschmarrn", de: "Kaiserschmarrn", en: "Kaiserschmarrn" },
    alt: { it: "Illustrazione: piatto di Kaiserschmarrn", de: "Illustration: Teller Kaiserschmarrn", en: "Illustration: a plate of Kaiserschmarrn" },
  },
];
