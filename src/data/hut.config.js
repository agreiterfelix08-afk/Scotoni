// ============================================================================
//  Rifugio Scotoni — the ONE file the hut edits.
//
//  Rules for this file:
//   - Only verified facts. Anything not verified is `null` or marked TODO.
//   - `null` means "unknown": the site then hides the value or says
//     "to be confirmed" instead of guessing.
//   - Every TODO is also listed in docs/TODO-FOR-THE-HUT.md.
//  After editing, run `npm run build` (or ask Felix) to regenerate the pages.
// ============================================================================

export const hut = {
  name: "Rifugio Scotoni",
  family: "Agreiter",
  familyYears: 50, // "more than 50 years" (public listings)
  grillMaster: "Christian",

  // TODO: verify with the hut. Sources disagree:
  //   1985 m — Dolomites restaurant guide, trekking sites
  //   1998 m — Alta Badia tourism board
  //   2040 m — Planetmountain, and our own Instagram caption
  // Change this ONE value; every page uses it.
  altitudeM: 2040,
  altitudeVerified: false,

  address: {
    street: "Alpe Lagazuoi 2",
    locality: "San Cassiano",
    region: "Alta Badia, South Tyrol",
    postalCode: null, // TODO: verify (39036 is the postcode of Badia/San Cassiano)
    country: "IT",
  },
  geo: { lat: 46.5531, lon: 11.9984 }, // approximate, from listings
  email: "info@scotoni.it",
  phone: null, // TODO: phone number (never guessed)
  whatsapp: null, // TODO: optional WhatsApp number in international format, e.g. "39xxxxxxxxxx"
  website: "https://www.scotoni.it", // TODO: confirm the official domain

  park: "Fanes-Sennes-Braies Nature Park",
  peaks: ["Lagazuoi", "Fanis", "Scotoni", "Conturines"],
  beds: 20, // "about 20 beds in the summer season"
  wineLabels: 700, // "roughly 700 labels"

  // Opening periods as MM-DD ranges, e.g. [{ from: "06-15", to: "10-15" }].
  // TODO: exact opening/closing dates and whether there is winter operation.
  seasons: null,

  // Kitchen/opening hours per weekday (0 = Sunday … 6 = Saturday), e.g.
  // { 0: ["09:00", "17:00"], 1: ["09:00", "17:00"], ... }. TODO: real hours.
  openingHours: null,
  closedWeekdays: [], // TODO: rest day, if any (numbers as above)
  closedDates: [],    // TODO: extra closed days "YYYY-MM-DD"

  // Live banner set by the hut, e.g. kitchen closing early or a weather alert.
  // { type: "weather" | "kitchen" | "info", until: "YYYY-MM-DD", message: { it, de, en } }
  alert: null,

  links: {
    reviews: null, // TODO: link to real reviews (e.g. Google Maps or Tripadvisor listing)
    instagram: null, // TODO: Instagram profile URL
    mapsQuery: "Rifugio Scotoni, Alpe Lagazuoi 2, San Cassiano",
  },

  // Menu prices in EUR by menu item id (see src/data/menu.js). null = hidden.
  // TODO: fill in when the hut wants prices online.
  prices: {},
};

export const site = {
  // Public base URL, used for canonical/hreflang/sitemap. TODO: change when moving to the hut's own domain.
  baseUrl: "https://agreiterfelix08-afk.github.io/Scotoni/",
  languages: ["it", "de", "en"],
  defaultLanguage: "it",
  forms: {
    // Endpoint for the room enquiry form (e.g. Formspree). null → the form opens the guest's email app.
    roomEnquiryEndpoint: null,
  },
};

// One switch per optional feature. Turning a flag off removes the feature
// from navigation, homepage and the build.
export const features = {
  egaScotoni: true, // TODO: confirm what "Ega Scotoni" is (see src/features/ega-scotoni/README.md)
  wineList: true,
  gallery: true,
  familyCorner: true,
  rooms: true,
  onlineBooking: true,
};

// ---------------------------------------------------------------------------
//  Table reservations. All numbers below are PLACEHOLDERS for the prototype.
//  TODO: replace with the real table plan and rules agreed with Christian.
// ---------------------------------------------------------------------------
export const reservations = {
  // Prototype mode: bookings live in the browser (LocalStorageStore) and the
  // booking page shows a "demo" notice. Set to false only with a real backend.
  demo: true,
  timezone: "Europe/Rome",

  slots: ["11:30", "12:00", "12:30", "13:00", "13:30", "14:00"], // TODO: real seating times
  // How long a party keeps its table, by party size.
  dwell: [
    { maxParty: 4, minutes: 90 },
    { maxParty: 99, minutes: 120 },
  ],
  maxCombine: 3, // at most this many tables pushed together

  zones: [
    {
      id: "stube",
      weatherDependent: false,
      onlineShare: 0.6, // 60% of seats bookable online, 40% kept for walk-ins. TODO
      tables: [ // TODO: real table plan
        { id: "S1", seats: 2, combinableWith: ["S2"] },
        { id: "S2", seats: 2, combinableWith: ["S1", "S3"] },
        { id: "S3", seats: 4, combinableWith: ["S2", "S4"] },
        { id: "S4", seats: 4, combinableWith: ["S3"] },
        { id: "S5", seats: 6, minParty: 3, combinableWith: ["S6"] },
        { id: "S6", seats: 6, minParty: 3, combinableWith: ["S5"] },
        { id: "S7", seats: 8, minParty: 5, combinableWith: [] },
      ],
    },
    {
      id: "terrace",
      weatherDependent: true,
      onlineShare: 0.5, // TODO
      tables: [ // `covered: true` = stays usable in "reduced" rain mode. TODO
        { id: "T1", seats: 4, covered: true, combinableWith: ["T2"] },
        { id: "T2", seats: 4, covered: true, combinableWith: ["T1", "T3"] },
        { id: "T3", seats: 4, combinableWith: ["T2", "T4"] },
        { id: "T4", seats: 4, combinableWith: ["T3"] },
        { id: "T5", seats: 6, minParty: 3, combinableWith: ["T6"] },
        { id: "T6", seats: 6, minParty: 3, combinableWith: ["T5"] },
        { id: "T7", seats: 2, combinableWith: [] },
        { id: "T8", seats: 2, combinableWith: [] },
      ],
    },
    {
      id: "premium",
      weatherDependent: false,
      onlineShare: 1, // the premium area is fully bookable: the rule (minimum spend/deposit) is the filter
      tables: [ // TODO: which tables, if any, form the premium area
        { id: "P1", seats: 4, combinableWith: ["P2"] },
        { id: "P2", seats: 4, combinableWith: ["P1"] },
        { id: "P3", seats: 6, minParty: 3, combinableWith: [] },
      ],
    },
  ],

  walkIn: { releaseAt: "10:30" }, // held walk-in seats open for online booking at this time on the day. TODO

  peak: {
    slots: ["12:00", "12:30", "13:00"], // TODO
    protectLargeTables: true, // a small party never gets a big table at peak times
    largeTableSeats: 6,
    minPartyForLargeTable: 4,
  },

  overbooking: { enabled: false, percent: 0 }, // optional, based on no-show rate; off by default

  policy: {
    bookingWindowDays: 60, // bookings open N days ahead. TODO
    sameDayCutoff: "11:00", // no online bookings for today after this time. TODO
    minLeadMinutes: 60,
    holdMinutes: 15, // table held for latecomers
    freeCancellationHours: 24, // TODO
    groupRequestThreshold: 9, // parties of 9+ become a request, not instant confirmation. TODO
    maxPartyOnline: 16, // above this: contact the hut. TODO
    onePerGuestPerDay: true, // one table per email per day, against table hoarding
  },

  noShow: {
    depositAfter: 2, // no-shows + late cancellations before a deposit is required. TODO
    depositPerPerson: null, // EUR. TODO (needs a payment provider)
  },

  premium: {
    enabled: true,
    zone: "premium",
    model: "minimumSpend", // "minimumSpend" (checked at billing) or "deposit" (needs a payment provider)
    minimumSpendPerPerson: null, // EUR. TODO: decide with Christian
    depositPerPerson: null, // EUR, for model "deposit". TODO
    currency: "EUR",
  },

  // Example values used ONLY while `demo` is true, so the owner can see the premium
  // flow in a meeting. They are labelled "demo value" in the interface.
  demoFallbacks: {
    minimumSpendPerPerson: 40,
    depositPerPerson: 20,
    noShowDepositPerPerson: 15,
  },

  rain: { fallbackZones: ["stube"] }, // where terrace guests are re-seated in rain mode
  waitlist: { offerMinutes: 30, maxPerSlot: 20 },
  depositHoldMinutes: 15,
  rateLimit: { windowMinutes: 60, perEmail: 4, perIp: 12 },
  retentionMonths: 12, // personal data is anonymised after this

  // Prototype staff access. NOT security: anyone can read this file.
  // Replace with real server-side login before going live.
  demoPins: { staff: "1111", owner: "2222" },
};

/** Reservations config ready for the engine: hut calendar merged in, demo fallbacks applied. */
export function engineConfig(r = reservations, h = hut) {
  const premium = { ...r.premium };
  const noShow = { ...r.noShow };
  if (r.demo) {
    if (premium.minimumSpendPerPerson == null && premium.model === "minimumSpend") {
      premium.minimumSpendPerPerson = r.demoFallbacks.minimumSpendPerPerson;
      premium.isDemoValue = true;
    }
    if (premium.depositPerPerson == null && premium.model === "deposit") {
      premium.depositPerPerson = r.demoFallbacks.depositPerPerson;
      premium.isDemoValue = true;
    }
    if (noShow.depositPerPerson == null) noShow.depositPerPerson = r.demoFallbacks.noShowDepositPerPerson;
  }
  return {
    ...r,
    premium,
    noShow,
    seasons: h.seasons,
    closedWeekdays: h.closedWeekdays,
    closedDates: h.closedDates,
  };
}
