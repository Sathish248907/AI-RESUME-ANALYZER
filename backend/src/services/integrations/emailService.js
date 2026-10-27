/**
 * emailService.js — outbound email (`email-delivery-1.0`).
 *
 * This build ships **no mail dependency**, so there are two transports:
 *
 *   `log`  (default) — the message is recorded in full and **nothing is
 *                      delivered**. Every result says `delivered: false`, so no
 *                      caller can mistake a recorded message for a sent one.
 *   `smtp`           — requires `createSmtpTransport` to be implemented against
 *                      a mail library the deployment installs. Until then it
 *                      refuses with the setup steps rather than pretending.
 *
 * Rules that hold for both:
 *   - Mail goes **only to the address on the user's own account**. There is no
 *     code path that takes a recipient from a job listing, an interviewer or
 *     any other third party, so this cannot email an employer.
 *   - Every message is de-duplicated on `(userId, dedupeKey)` through the
 *     delivery log, so a retried workflow cannot send twice.
 *   - Only categories the user has switched on are sent, and the preference is
 *     checked at send time rather than when the workflow was queued.
 *   - Delivery status is logged; message bodies are stored truncated, and no
 *     inbox is ever read — this build requests no mailbox scope at all.
 */
import { ApiError } from "../../utils/errors.js";

export const EMAIL_METHOD = "email-delivery-1.0";

/** Categories a user can switch on. Each maps to one workflow. */
export const EMAIL_CATEGORIES = Object.freeze([
  { key: "reminders", label: "Reminder digests", description: "Due follow-ups and deadlines you already track in the app.", default: false },
  { key: "interview_prep", label: "Interview preparation", description: "A summary before a scheduled interview round.", default: false },
  { key: "weekly_summary", label: "Weekly career summary", description: "Learning, interviews, resume and application activity.", default: false },
]);

export const DEFAULT_EMAIL_PREFERENCES = Object.freeze(
  Object.fromEntries(EMAIL_CATEGORIES.map((c) => [c.key, c.default]))
);

/**
 * Not implemented on purpose: this build installs no mail client. A deployment
 * that wants real delivery implements this against its own library.
 */
function createSmtpTransport() {
  throw new ApiError(503, "SMTP delivery is selected but no mail transport is implemented in this build. Install a mail client library and implement createSmtpTransport in emailService.js.", {
    code: "EMAIL_TRANSPORT_MISSING",
    details: [
      { message: "This build intentionally ships no mail dependency, so nothing can be delivered yet." },
      { message: "Set EMAIL_TRANSPORT=log to record messages instead, which is the default." },
    ],
  });
}

/**
 * @param {{ env: object, repo: object, logger?: object }} deps
 */
export function createEmailService({ env, repo, logger = { info() {}, warn() {} } }) {
  const transportName = env.EMAIL_TRANSPORT ?? "log";

  /** Does this deployment actually deliver? */
  function status() {
    return {
      method: EMAIL_METHOD,
      transport: transportName,
      /** Deliberately false for `log`: recording is not delivering. */
      delivers: transportName === "smtp" && Boolean(env.EMAIL_CONFIGURED),
      from: env.EMAIL_FROM || null,
      categories: EMAIL_CATEGORIES,
      note: transportName === "log"
        ? "Email is in recording mode: messages are stored so you can see exactly what would be sent, and nothing is delivered."
        : env.EMAIL_CONFIGURED
          ? "SMTP is configured."
          : "EMAIL_TRANSPORT is smtp but SMTP_HOST or EMAIL_FROM is missing, so nothing can be delivered.",
      neverDoes: [
        "It never reads your inbox — no mailbox permission is requested anywhere in this product.",
        "It never emails an employer, recruiter or interviewer. Only the address on your own account is ever used.",
      ],
    };
  }

  /**
   * Send (or record) one message.
   *
   * @param {string} userId
   * @param {object} message
   * @param {string} message.category    one of EMAIL_CATEGORIES
   * @param {string} message.subject
   * @param {string} message.body        plain text
   * @param {string} message.dedupeKey   makes a retry idempotent
   * @param {{ force?: boolean }} [opts] skip the preference check (user pressed "send me this now")
   */
  async function send(userId, message, { force = false } = {}) {
    const { category, subject, body, dedupeKey } = message;
    if (!EMAIL_CATEGORIES.some((c) => c.key === category)) {
      throw new ApiError(400, `“${category}” is not an email category this product sends.`, { code: "UNKNOWN_EMAIL_CATEGORY" });
    }

    const recipient = await repo.userEmail(userId);
    if (!recipient) throw new ApiError(409, "Your account has no email address to send to.", { code: "NO_RECIPIENT" });

    const preferences = { ...DEFAULT_EMAIL_PREFERENCES, ...(await repo.emailPreferences(userId)) };
    if (!force && !preferences[category]) {
      return { sent: false, delivered: false, skipped: "preference_off", reason: `You have “${category}” email switched off.` };
    }

    // The log is the dedupe record: a retried workflow cannot send twice.
    const already = await repo.findEmailDelivery(userId, dedupeKey);
    if (already) {
      return { sent: false, delivered: already.status === "delivered", skipped: "duplicate", reason: "This message was already handled.", deliveryId: already.id };
    }

    if (transportName === "smtp") {
      if (!env.EMAIL_CONFIGURED) {
        throw new ApiError(503, "SMTP is selected but SMTP_HOST or EMAIL_FROM is missing, so nothing can be delivered.", { code: "EMAIL_NOT_CONFIGURED" });
      }
      const transport = createSmtpTransport(env); // throws until implemented
      await transport.send({ to: recipient, from: env.EMAIL_FROM, subject, text: body });
      const delivery = await repo.recordEmailDelivery(userId, { category, dedupeKey, subject, recipient, status: "delivered", transport: "smtp", preview: body.slice(0, 500) });
      return { sent: true, delivered: true, deliveryId: delivery.id, recipient };
    }

    const delivery = await repo.recordEmailDelivery(userId, {
      category, dedupeKey, subject, recipient,
      status: "recorded",
      transport: "log",
      preview: body.slice(0, 500),
    });
    logger.info?.("email recorded (not delivered)", { meta: { userId, category, subject } });
    return {
      sent: false,
      delivered: false,
      recorded: true,
      deliveryId: delivery.id,
      recipient,
      reason: "Recorded only: this deployment has no mail transport, so nothing was delivered.",
    };
  }

  async function history(userId, { limit = 50 } = {}) {
    const rows = await repo.listEmailDeliveries(userId, { limit });
    return {
      method: EMAIL_METHOD,
      deliveries: rows.map((r) => ({
        id: r.id,
        category: r.category,
        subject: r.subject,
        recipient: r.recipient,
        status: r.status,
        statusLabel: r.status === "delivered" ? "Delivered" : "Recorded only — not delivered",
        transport: r.transport,
        preview: r.preview,
        createdAt: r.createdAt,
      })),
      ...status(),
    };
  }

  return { method: EMAIL_METHOD, send, history, status, EMAIL_CATEGORIES, DEFAULT_EMAIL_PREFERENCES };
}
