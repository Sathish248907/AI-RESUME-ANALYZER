/**
 * integrationRegistry.js — what this build can integrate with, and what each
 * one actually needs (`integration-registry-1.0`).
 *
 * The registry is the single source of truth for the dashboard. Every entry
 * declares its category, the scopes it would request, the environment it
 * requires, and — crucially — its *readiness*:
 *
 *   `available`      the integration works right now
 *   `needs_setup`    implemented, but credentials are missing; it cannot connect
 *   `unavailable`    this build cannot offer it at all
 *
 * A card is never rendered as connectable unless the backend really could
 * complete the flow, so there are no buttons that lead nowhere.
 *
 * Scopes follow least privilege: calendar access is `calendar.events` (not full
 * calendar administration) and Drive access is `drive.file`, which can only see
 * files this app created — it cannot read the rest of someone's Drive.
 */
export const REGISTRY_METHOD = "integration-registry-1.0";

export const INTEGRATION_CATEGORIES = [
  { key: "calendar", label: "Calendar and scheduling" },
  { key: "email", label: "Email and reminders" },
  { key: "storage", label: "Cloud document storage" },
  { key: "jobs", label: "Job discovery providers" },
];

/** OAuth-based integrations. Job providers are API-key based and listed separately. */
export const OAUTH_INTEGRATIONS = Object.freeze([
  {
    provider: "google_calendar",
    displayName: "Google Calendar",
    category: "calendar",
    summary: "Put interviews, assessment deadlines and follow-ups in your own calendar.",
    /** Only what the implemented features need. */
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
    scopeExplanations: {
      "https://www.googleapis.com/auth/calendar.events":
        "Create and update events this app makes. It cannot read your other calendars' settings or delete calendars.",
    },
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    /** Google needs these to return a refresh token at all. */
    authorizationParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    supportsPkce: true,
    credentialKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    setupUrl: "https://console.cloud.google.com/apis/credentials",
    setupSteps: [
      "Create a Google Cloud project and enable the Google Calendar API.",
      "Create an OAuth 2.0 Client ID of type “Web application”.",
      "Add {REDIRECT_URI} as an authorised redirect URI — it must match exactly.",
      "Put the client id and secret in GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then restart the backend.",
    ],
    features: [
      "Create a calendar event for an interview round you recorded",
      "Update the event when you change the time",
      "Cancel the event when you cancel the round",
      "Choose which event types sync",
    ],
    doesNot: [
      "It never reads your existing calendar entries.",
      "It never invites anyone: events are created on your calendar only, with no attendees.",
    ],
  },
  {
    provider: "google_drive",
    displayName: "Google Drive",
    category: "storage",
    summary: "Export approved resume versions and cover letters to your own Drive.",
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    scopeExplanations: {
      "https://www.googleapis.com/auth/drive.file":
        "Create files in your Drive and manage only the files this app created. It cannot list or read anything else in your Drive.",
    },
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    authorizationParams: { access_type: "offline", prompt: "consent" },
    supportsPkce: true,
    credentialKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    setupUrl: "https://console.cloud.google.com/apis/credentials",
    setupSteps: [
      "In the same Google Cloud project, enable the Google Drive API.",
      "Reuse the OAuth client; add {REDIRECT_URI} as an authorised redirect URI.",
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then restart the backend.",
    ],
    features: [
      "Export an approved resume version as PDF",
      "Export an approved cover letter as PDF",
      "Choose the destination folder",
    ],
    doesNot: [
      "Nothing is uploaded automatically — every export is one you ask for.",
      "Exported files are private to your Drive; nothing is shared or made public.",
    ],
  },
]);

export const EMAIL_INTEGRATION = Object.freeze({
  provider: "email",
  displayName: "Email delivery",
  category: "email",
  summary: "Send yourself reminders, interview preparation summaries and weekly progress reports.",
  /** Not OAuth: this is server-side transport configuration, not an account link. */
  kind: "server_config",
  credentialKeys: ["EMAIL_TRANSPORT", "EMAIL_FROM", "SMTP_HOST"],
  setupSteps: [
    "Choose a transport your deployment can use (an SMTP relay or a transactional email API).",
    "Install its client library in backend/ — this build intentionally ships no mail dependency.",
    "Implement `createSmtpTransport` in emailService.js against that library.",
    "Set EMAIL_TRANSPORT=smtp, EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD, then restart.",
  ],
  features: [
    "Email reminders you have already chosen to receive in-app",
    "Weekly career summary",
    "Interview preparation summary before a scheduled round",
  ],
  doesNot: [
    "It never reads your inbox. Nothing in this build requests mailbox read access.",
    "It never emails an employer, a recruiter or any third party — only the address on your own account.",
    "With the default `log` transport nothing is delivered; messages are recorded so you can see exactly what would have been sent.",
  ],
});

/**
 * Describe every integration with its real readiness.
 *
 * @param {object} env validated environment
 * @param {object} deps
 * @param {Array} [deps.jobProviders] from the Phase 12 registry, surfaced read-only
 * @param {Map<string, object>} [deps.connections] provider → stored integration row
 */
export function describeIntegrations(env, { jobProviders = [], connections = new Map() } = {}) {
  const redirectUri = redirectUriFor(env);
  const vaultReady = Boolean(env.INTEGRATION_VAULT_READY);

  const oauth = OAUTH_INTEGRATIONS.map((spec) => {
    const missingCredentials = spec.credentialKeys.filter((k) => !env[k]);
    const blockers = [];
    if (missingCredentials.length) blockers.push(`Missing ${missingCredentials.join(" and ")} in the backend environment.`);
    if (!vaultReady) blockers.push("INTEGRATION_ENCRYPTION_KEY is not set, so OAuth tokens cannot be stored securely.");

    const connection = connections.get(spec.provider) ?? null;
    const readiness = blockers.length ? "needs_setup" : "available";

    return {
      provider: spec.provider,
      displayName: spec.displayName,
      category: spec.category,
      summary: spec.summary,
      kind: "oauth",
      readiness,
      blockers,
      missingCredentials,
      scopes: spec.scopes,
      scopeExplanations: spec.scopeExplanations,
      features: spec.features,
      doesNot: spec.doesNot,
      setupUrl: spec.setupUrl,
      setupSteps: spec.setupSteps.map((s) => s.replace("{REDIRECT_URI}", redirectUri)),
      redirectUri,
      supportsPkce: spec.supportsPkce,
      connection: connection
        ? {
            status: connection.status,
            connectedAt: connection.connectedAt,
            expiresAt: connection.expiresAt,
            externalAccountLabel: connection.externalAccountLabel,
            scopes: connection.scopes ?? [],
            lastSyncAt: connection.lastSyncAt,
            lastError: connection.lastError,
            preferences: connection.preferences ?? {},
          }
        : null,
      /** The UI enables "Connect" only on this. */
      connectable: readiness === "available" && (!connection || connection.status !== "connected"),
    };
  });

  const emailMissing = EMAIL_INTEGRATION.credentialKeys.filter((k) => !env[k] || (k === "EMAIL_TRANSPORT" && env[k] === "log"));
  const email = {
    ...EMAIL_INTEGRATION,
    readiness: env.EMAIL_CONFIGURED ? "available" : "needs_setup",
    blockers: env.EMAIL_CONFIGURED ? [] : [
      env.EMAIL_TRANSPORT === "log"
        ? "EMAIL_TRANSPORT is “log”: messages are recorded but nothing is delivered."
        : "SMTP_HOST or EMAIL_FROM is not set.",
      "No mail client library is installed in this build.",
    ],
    missingCredentials: emailMissing,
    transport: env.EMAIL_TRANSPORT,
    connectable: false,
    connection: null,
  };

  // Job providers are already a working integration (Phase 12); surfaced here
  // so the dashboard shows one honest picture rather than a second notion of
  // what is connected.
  const jobs = jobProviders.map((p) => ({
    provider: `job:${p.slug}`,
    displayName: p.displayName,
    category: "jobs",
    summary: p.attribution ?? "Job listings provider.",
    kind: "api_key",
    readiness: p.enabled && p.configured ? "available" : "needs_setup",
    blockers: p.enabled && p.configured
      ? []
      : p.missingCredentials?.length
        ? [`Missing ${p.missingCredentials.join(" and ")}.`]
        : [`Not listed in JOB_PROVIDERS.`],
    missingCredentials: p.missingCredentials ?? [],
    scopes: [],
    scopeExplanations: {},
    features: ["Search live job listings", "Normalised and de-duplicated results", "Source attribution preserved"],
    doesNot: ["It sends nothing on your behalf and stores no personal data with the provider."],
    setupUrl: p.docsUrl ?? null,
    setupSteps: p.requiresCredentials
      ? [`Obtain credentials from the provider.`, `Set ${(p.credentialKeys ?? []).join(" and ")}.`, `Add “${p.slug}” to JOB_PROVIDERS and restart.`]
      : [`Add “${p.slug}” to JOB_PROVIDERS and restart. No credentials needed.`],
    connectable: false,
    managedAt: "/dashboard/jobs/preferences",
    connection: p.enabled && p.configured
      ? { status: "connected", lastSyncAt: p.lastFetchedAt ?? null, lastError: p.lastError ?? null, scopes: [], connectedAt: null, expiresAt: null, externalAccountLabel: null, preferences: {} }
      : null,
  }));

  const all = [...oauth, email, ...jobs];
  return {
    method: REGISTRY_METHOD,
    categories: INTEGRATION_CATEGORIES,
    integrations: all,
    counts: {
      total: all.length,
      available: all.filter((i) => i.readiness === "available").length,
      connected: all.filter((i) => i.connection?.status === "connected").length,
      needsSetup: all.filter((i) => i.readiness === "needs_setup").length,
    },
    vault: {
      configured: vaultReady,
      note: vaultReady
        ? "OAuth tokens are encrypted with AES-256-GCM before they are stored."
        : "INTEGRATION_ENCRYPTION_KEY is not set, so no OAuth account can be connected. This build refuses to store tokens unencrypted.",
    },
    redirectUri,
  };
}

/** Find an OAuth spec by provider id. */
export function findOAuthIntegration(provider) {
  return OAUTH_INTEGRATIONS.find((i) => i.provider === provider) ?? null;
}

/** The single redirect URI this backend accepts callbacks on. */
export function redirectUriFor(env) {
  const base = String(env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/api/integrations/callback`;
}
