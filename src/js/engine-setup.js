// The one place where the reservation engine is wired up in the browser.
//
// Prototype: the engine runs in the browser on top of LocalStorageStore (works offline).
// Going live with a backend is a one-line change — replace the `engine` export with:
//   export const engine = createRemoteEngine("https://<your-server>/reservations");
// (see src/reservation-engine/remote-engine.stub.js and docs/TECHNICAL.md → Backend).

import { createEngine } from "../reservation-engine/engine.js";
import { LocalStorageStore } from "../reservation-engine/stores/local-storage-store.js";
import { ConsoleNotifier, StubPaymentProvider } from "../reservation-engine/providers.js";
import { engineConfig, hut } from "../data/hut.config.js";

const pages = new URL("./", location.href); // the current language folder, e.g. …/en/
const links = {
  manage: (token) => `${pages}reserve.html#manage=${token}`,
  offer: (token) => `${pages}reserve.html#offer=${token}`,
  waitlist: (token) => `${pages}reserve.html#waitlist=${token}`,
};

export const store = new LocalStorageStore();
export const config = engineConfig();
export const engine = createEngine({
  config,
  store,
  notifier: new ConsoleNotifier(),
  payments: new StubPaymentProvider(),
  links,
  hutName: hut.name,
});
