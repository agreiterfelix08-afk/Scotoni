// Email templates in IT / DE / EN. Plain text only: readable on any device and connection.

const LOCALE = { it: "it-IT", de: "de-DE", en: "en-GB" };

const ZONE = {
  it: { stube: "stube (interno)", terrace: "terrazza", premium: "area riservata" },
  de: { stube: "Stube (innen)", terrace: "Terrasse", premium: "reservierter Bereich" },
  en: { stube: "stube (indoors)", terrace: "terrace", premium: "reserved area" },
};

function when(d, lang, tz) {
  const start = new Date(d.start);
  const date = start.toLocaleDateString(LOCALE[lang], { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = start.toLocaleTimeString(LOCALE[lang], { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  return { date, time };
}

const PREMIUM = {
  it: (p) => p.model === "deposit"
    ? `Area riservata: caparra di ${p.amountPerPerson} ${p.currency} a persona, scalata dal conto.`
    : `Area riservata: spesa minima di ${p.amountPerPerson} ${p.currency} a persona, verificata al conto.`,
  de: (p) => p.model === "deposit"
    ? `Reservierter Bereich: Anzahlung ${p.amountPerPerson} ${p.currency} pro Person, wird von der Rechnung abgezogen.`
    : `Reservierter Bereich: Mindestkonsum ${p.amountPerPerson} ${p.currency} pro Person, bei der Rechnung geprüft.`,
  en: (p) => p.model === "deposit"
    ? `Reserved area: deposit of ${p.amountPerPerson} ${p.currency} per person, deducted from the bill.`
    : `Reserved area: minimum spend of ${p.amountPerPerson} ${p.currency} per person, checked at billing.`,
};

function premiumLine(lang, d) {
  return d.premium ? `\n\n${PREMIUM[lang](d.premium)}` : "";
}

function clock(iso, lang, tz) {
  return new Date(iso).toLocaleTimeString(LOCALE[lang], { timeZone: tz, hour: "2-digit", minute: "2-digit" });
}

const T = {
  it: {
    sign: (d) => `A presto,\n${d.hutName}`,
    confirmation: (d, w) => ({
      subject: `Prenotazione confermata ${d.ref} – ${d.hutName}`,
      text: `Ciao ${d.name},\n\nil tuo tavolo è confermato: ${w.date}, ore ${w.time}, ${d.party} persone, ${ZONE.it[d.zone]}.\nCodice: ${d.ref}\n\nTeniamo il tavolo per ${d.holdMinutes} minuti. Cancellazione gratuita fino a ${d.freeCancellationHours} ore prima.\nModifica o cancella: ${d.manageUrl}${premiumLine("it", d)}`,
    }),
    request: (d, w) => ({
      subject: `Richiesta ricevuta ${d.ref} – ${d.hutName}`,
      text: `Ciao ${d.name},\n\nabbiamo ricevuto la tua richiesta per un gruppo di ${d.party} persone (${w.date}, ore ${w.time}). Il tavolo è riservato provvisoriamente; ti confermiamo a breve.\nCodice: ${d.ref}\nGestisci: ${d.manageUrl}`,
    }),
    cancellation: (d, w) => ({
      subject: `Prenotazione cancellata ${d.ref}`,
      text: `Ciao ${d.name},\n\nla tua prenotazione del ${w.date}, ore ${w.time}, è stata cancellata.`,
    }),
    waitlist: (d, w) => ({
      subject: `Sei in lista d'attesa – ${d.hutName}`,
      text: `Ciao ${d.name},\n\nsei in lista d'attesa per ${w.date}, ore ${w.time}, ${d.party} persone. Se si libera un tavolo ti scriviamo subito.\nEsci dalla lista: ${d.manageUrl}`,
    }),
    offer: (d, w) => ({
      subject: `Si è liberato un tavolo! – ${d.hutName}`,
      text: `Ciao ${d.name},\n\nsi è liberato un tavolo per ${d.party} persone: ${w.date}, ore ${w.time}.\nConferma entro le ore ${clock(d.expiresAt, "it", d.tz)}: ${d.offerUrl}\nDopo, il tavolo passa alla persona successiva in lista.`,
    }),
    rain_moved: (d, w) => ({
      subject: `Maltempo: il tuo tavolo è all'interno – ${d.hutName}`,
      text: `Ciao ${d.name},\n\nper il maltempo la terrazza è chiusa. Ti abbiamo spostato nella stube: ${w.date}, ore ${w.time}. Nulla da fare da parte tua.`,
    }),
    rain_affected: (d, w) => ({
      subject: `Maltempo: la tua prenotazione – ${d.hutName}`,
      text: `Ciao ${d.name},\n\nper il maltempo la terrazza è chiusa e al momento non abbiamo posto all'interno per ${w.date}, ore ${w.time}. Ti contatteremo; puoi anche cancellare gratuitamente: ${d.manageUrl}`,
    }),
  },
  de: {
    sign: (d) => `Bis bald,\n${d.hutName}`,
    confirmation: (d, w) => ({
      subject: `Reservierung bestätigt ${d.ref} – ${d.hutName}`,
      text: `Hallo ${d.name},\n\nIhr Tisch ist bestätigt: ${w.date}, ${w.time} Uhr, ${d.party} Personen, ${ZONE.de[d.zone]}.\nCode: ${d.ref}\n\nWir halten den Tisch ${d.holdMinutes} Minuten. Kostenlose Stornierung bis ${d.freeCancellationHours} Stunden vorher.\nÄndern oder stornieren: ${d.manageUrl}${premiumLine("de", d)}`,
    }),
    request: (d, w) => ({
      subject: `Anfrage erhalten ${d.ref} – ${d.hutName}`,
      text: `Hallo ${d.name},\n\nwir haben Ihre Gruppenanfrage für ${d.party} Personen erhalten (${w.date}, ${w.time} Uhr). Der Tisch ist vorläufig reserviert; wir bestätigen in Kürze.\nCode: ${d.ref}\nVerwalten: ${d.manageUrl}`,
    }),
    cancellation: (d, w) => ({
      subject: `Reservierung storniert ${d.ref}`,
      text: `Hallo ${d.name},\n\nIhre Reservierung am ${w.date} um ${w.time} Uhr wurde storniert.`,
    }),
    waitlist: (d, w) => ({
      subject: `Sie stehen auf der Warteliste – ${d.hutName}`,
      text: `Hallo ${d.name},\n\nSie stehen auf der Warteliste für ${w.date}, ${w.time} Uhr, ${d.party} Personen. Sobald ein Tisch frei wird, melden wir uns.\nVon der Liste abmelden: ${d.manageUrl}`,
    }),
    offer: (d, w) => ({
      subject: `Ein Tisch ist frei geworden! – ${d.hutName}`,
      text: `Hallo ${d.name},\n\nein Tisch für ${d.party} Personen ist frei geworden: ${w.date}, ${w.time} Uhr.\nBitte bestätigen Sie bis ${clock(d.expiresAt, "de", d.tz)} Uhr: ${d.offerUrl}\nDanach geht der Tisch an die nächste Person auf der Liste.`,
    }),
    rain_moved: (d, w) => ({
      subject: `Schlechtwetter: Ihr Tisch ist drinnen – ${d.hutName}`,
      text: `Hallo ${d.name},\n\nwegen Schlechtwetter ist die Terrasse geschlossen. Wir haben Sie in die Stube umgesetzt: ${w.date}, ${w.time} Uhr. Sie müssen nichts tun.`,
    }),
    rain_affected: (d, w) => ({
      subject: `Schlechtwetter: Ihre Reservierung – ${d.hutName}`,
      text: `Hallo ${d.name},\n\nwegen Schlechtwetter ist die Terrasse geschlossen und drinnen ist am ${w.date} um ${w.time} Uhr derzeit kein Platz frei. Wir melden uns; Sie können auch kostenlos stornieren: ${d.manageUrl}`,
    }),
  },
  en: {
    sign: (d) => `See you soon,\n${d.hutName}`,
    confirmation: (d, w) => ({
      subject: `Booking confirmed ${d.ref} – ${d.hutName}`,
      text: `Hello ${d.name},\n\nyour table is confirmed: ${w.date} at ${w.time}, ${d.party} people, ${ZONE.en[d.zone]}.\nReference: ${d.ref}\n\nWe hold the table for ${d.holdMinutes} minutes. Free cancellation up to ${d.freeCancellationHours} hours before.\nChange or cancel: ${d.manageUrl}${premiumLine("en", d)}`,
    }),
    request: (d, w) => ({
      subject: `Request received ${d.ref} – ${d.hutName}`,
      text: `Hello ${d.name},\n\nwe received your group request for ${d.party} people (${w.date} at ${w.time}). The table is provisionally held; we will confirm shortly.\nReference: ${d.ref}\nManage: ${d.manageUrl}`,
    }),
    cancellation: (d, w) => ({
      subject: `Booking cancelled ${d.ref}`,
      text: `Hello ${d.name},\n\nyour booking on ${w.date} at ${w.time} has been cancelled.`,
    }),
    waitlist: (d, w) => ({
      subject: `You're on the waitlist – ${d.hutName}`,
      text: `Hello ${d.name},\n\nyou're on the waitlist for ${w.date} at ${w.time}, ${d.party} people. If a table frees up we'll write to you straight away.\nLeave the waitlist: ${d.manageUrl}`,
    }),
    offer: (d, w) => ({
      subject: `A table just became free! – ${d.hutName}`,
      text: `Hello ${d.name},\n\na table for ${d.party} people is free: ${w.date} at ${w.time}.\nPlease confirm by ${clock(d.expiresAt, "en", d.tz)}: ${d.offerUrl}\nAfter that, the table goes to the next person on the list.`,
    }),
    rain_moved: (d, w) => ({
      subject: `Bad weather: your table is indoors – ${d.hutName}`,
      text: `Hello ${d.name},\n\nthe terrace is closed because of the weather. We have moved you into the stube: ${w.date} at ${w.time}. Nothing for you to do.`,
    }),
    rain_affected: (d, w) => ({
      subject: `Bad weather: your booking – ${d.hutName}`,
      text: `Hello ${d.name},\n\nthe terrace is closed because of the weather and there is currently no room indoors on ${w.date} at ${w.time}. We will contact you; you can also cancel free of charge: ${d.manageUrl}`,
    }),
  },
};

export const TEMPLATE_NAMES = Object.keys(T.en).filter((k) => k !== "sign");

export function renderTemplate(template, lang, data) {
  const L = T[lang] ? lang : "it";
  const w = when(data, L, data.tz);
  const { subject, text } = T[L][template](data, w);
  return { subject, text: `${text}\n\n${T[L].sign(data)}` };
}
