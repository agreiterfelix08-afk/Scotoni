// Provider interfaces with prototype stubs. Swap the stub for a real provider
// (e.g. an SMTP/transactional email service, a payment service) without touching the engine.

/**
 * Notifier interface:
 *   send({ to, lang, template, subject, text, data }) → Promise<void>
 * The engine writes every message to the "outbox" collection inside the booking
 * transaction first (so a message exists if and only if the booking committed),
 * then hands it to the notifier.
 */
export class ConsoleNotifier {
  constructor({ log = console.info } = {}) {
    this.log = log;
  }
  async send(message) {
    this.log(`[email stub] to=${message.to} template=${message.template}\n${message.subject}\n\n${message.text}`);
  }
}

/**
 * Payment provider interface (deposits for premium or repeat no-shows):
 *   createDeposit({ bookingId, amountCents, currency, description }) →
 *     Promise<{ status: "succeeded" | "requires_action", reference: string, redirectUrl?: string }>
 *   refundDeposit({ reference }) → Promise<void>
 *
 * Never hard-wire a provider into the engine: implement this interface in an adapter.
 */
export class StubPaymentProvider {
  constructor({ outcome = "succeeded" } = {}) {
    this.outcome = outcome;
    this.calls = [];
  }
  async createDeposit(req) {
    this.calls.push(req);
    const reference = `demo_${req.bookingId}`;
    return this.outcome === "succeeded"
      ? { status: "succeeded", reference }
      : { status: "requires_action", reference, redirectUrl: "#demo-payment" };
  }
  async refundDeposit() {}
}
