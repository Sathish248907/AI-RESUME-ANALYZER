/**
 * oauthService.js — the OAuth 2.0 authorization-code flow with PKCE
 * (`oauth-2.0-pkce-1.0`). No SDK: the flow is a handful of HTTP calls, and
 * hand-rolling it keeps the scopes and the redirect URI visible in one file.
 *
 * The security properties that matter here, and where they come from:
 *
 *   - **CSRF on the callback** — `state` is a 32-byte random value stored
 *     server-side against the user who started the flow. The callback is
 *     matched in constant time and the record is single-use, so a replayed or
 *     forged callback cannot attach someone else's Google account to a session.
 *   - **Code interception** — PKCE (S256). The verifier never leaves the
 *     backend; only its SHA-256 goes to the provider, so an intercepted
 *     authorization code cannot be redeemed by anyone else.
 *   - **Expiry** — a pending authorization is valid for ten minutes.
 *   - **Redirect URI** — built once from `APP_BASE_URL` and sent identically on
 *     both the authorize and token calls, which is what the provider checks.
 *
 * `fetchImpl` is injected so the whole flow is testable without the network.
 */
import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "../../utils/errors.js";
import { safeEquals } from "./tokenVault.js";
import { findOAuthIntegration, redirectUriFor } from "./integrationRegistry.js";

export const OAUTH_METHOD = "oauth-2.0-pkce-1.0";

/** How long a started authorization may sit unfinished. */
export const AUTHORIZATION_TTL_MS = 10 * 60 * 1000;

/** base64url of 32 random bytes: the PKCE verifier and the state value. */
const randomToken = () => randomBytes(32).toString("base64url");
const s256 = (verifier) => createHash("sha256").update(verifier).digest("base64url");

/**
 * @param {{ env: object, repo: object, vault: object, fetchImpl?: typeof fetch, logger?: object }} deps
 */
export function createOAuthService({ env, repo, vault, fetchImpl, logger = { info() {}, warn() {} } }) {
  const doFetch = fetchImpl ?? globalThis.fetch;

  /** The provider spec, or a 404 that does not leak which providers exist. */
  function specFor(provider) {
    const spec = findOAuthIntegration(provider);
    if (!spec) throw new ApiError(404, `“${provider}” is not an integration this build supports.`, { code: "UNKNOWN_PROVIDER" });
    return spec;
  }

  /** Refuse early and specifically when the deployment cannot complete a flow. */
  function assertConnectable(spec) {
    vault.assertReady();
    const missing = spec.credentialKeys.filter((k) => !env[k]);
    if (missing.length) {
      throw new ApiError(503, `${spec.displayName} is not configured on this server, so it cannot be connected. Missing ${missing.join(" and ")}.`, {
        code: "PROVIDER_NOT_CONFIGURED",
        details: spec.setupSteps.map((s) => ({ message: s.replace("{REDIRECT_URI}", redirectUriFor(env)) })),
      });
    }
  }

  /**
   * Begin a connection. Returns the URL to send the user to, plus the state we
   * will demand back. Nothing is connected yet.
   *
   * @param {string} userId
   * @param {string} provider
   * @param {{ returnTo?: string }} [opts]
   */
  async function startAuthorization(userId, provider, { returnTo = null } = {}) {
    const spec = specFor(provider);
    assertConnectable(spec);

    const state = randomToken();
    const codeVerifier = spec.supportsPkce ? randomToken() : null;
    const redirectUri = redirectUriFor(env);

    await repo.createPendingAuthorization({
      userId,
      provider,
      state,
      codeVerifier,
      redirectUri,
      returnTo,
      expiresAt: new Date(Date.now() + AUTHORIZATION_TTL_MS),
    });

    const url = new URL(spec.authorizationUrl);
    url.searchParams.set("client_id", env[spec.credentialKeys[0]]);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", spec.scopes.join(" "));
    url.searchParams.set("state", state);
    if (codeVerifier) {
      url.searchParams.set("code_challenge", s256(codeVerifier));
      url.searchParams.set("code_challenge_method", "S256");
    }
    for (const [k, v] of Object.entries(spec.authorizationParams ?? {})) url.searchParams.set(k, v);

    logger.info?.("oauth authorization started", { meta: { userId, provider } });
    return {
      authorizationUrl: url.toString(),
      state,
      expiresAt: new Date(Date.now() + AUTHORIZATION_TTL_MS).toISOString(),
      scopes: spec.scopes,
      scopeExplanations: spec.scopeExplanations,
      redirectUri,
      note: "You will be sent to the provider to approve these permissions. Nothing is connected until you come back.",
    };
  }

  /**
   * Finish a connection. Validates state, exchanges the code, and stores the
   * tokens encrypted. The provider's `error` parameter (e.g. `access_denied`)
   * is reported as a cancellation rather than a failure.
   *
   * @param {{ state: string, code?: string, error?: string, errorDescription?: string }} callback
   */
  async function completeAuthorization({ state, code, error, errorDescription }) {
    if (!state) throw new ApiError(400, "This callback is missing its state value.", { code: "OAUTH_STATE_MISSING" });

    const pending = await repo.findPendingAuthorization(state);
    // Constant-time compare even though the lookup already matched: the record
    // may be found by a prefix-equal value in some stores.
    if (!pending || !safeEquals(pending.state, state)) {
      throw new ApiError(400, "This authorization request is not recognised. Start the connection again.", { code: "OAUTH_STATE_INVALID" });
    }
    await repo.consumePendingAuthorization(pending.id);

    if (new Date(pending.expiresAt) < new Date()) {
      throw new ApiError(400, "This authorization request expired. Start the connection again.", { code: "OAUTH_STATE_EXPIRED" });
    }
    if (error) {
      logger.info?.("oauth authorization declined", { meta: { provider: pending.provider, error } });
      throw new ApiError(400, error === "access_denied"
        ? "You declined the permissions, so nothing was connected."
        : `The provider returned “${error}”${errorDescription ? `: ${errorDescription}` : ""}.`,
      { code: "OAUTH_DECLINED" });
    }
    if (!code) throw new ApiError(400, "This callback is missing its authorization code.", { code: "OAUTH_CODE_MISSING" });

    const spec = specFor(pending.provider);
    assertConnectable(spec);

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env[spec.credentialKeys[0]],
      client_secret: env[spec.credentialKeys[1]],
      redirect_uri: pending.redirectUri,
    });
    if (pending.codeVerifier) body.set("code_verifier", pending.codeVerifier);

    const tokens = await exchange(spec, body, "authorization_code");

    // Google returns a refresh token only on the first consent; keep whatever
    // we were given and never overwrite a good one with nothing.
    const granted = typeof tokens.scope === "string" ? tokens.scope.split(/\s+/).filter(Boolean) : spec.scopes;
    const sealed = vault.seal({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenType: tokens.token_type ?? "Bearer",
    });

    const integration = await repo.upsertIntegration(pending.userId, pending.provider, {
      status: "connected",
      credentials: sealed,
      hasRefreshToken: Boolean(tokens.refresh_token),
      scopes: granted,
      expiresAt: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null,
      connectedAt: new Date(),
      lastError: null,
      externalAccountLabel: null,
    });

    await repo.logSync(integration.id, pending.userId, {
      action: "connect",
      status: "ok",
      detail: `Connected with scopes: ${granted.join(", ")}`,
    });

    logger.info?.("oauth connected", { meta: { userId: pending.userId, provider: pending.provider, scopes: granted.length } });
    return {
      provider: pending.provider,
      displayName: spec.displayName,
      scopes: granted,
      returnTo: pending.returnTo,
      /** Granted scopes can be narrower than requested; say so rather than assuming. */
      missingScopes: spec.scopes.filter((s) => !granted.includes(s)),
      integration: vault.describe(integration),
    };
  }

  /** POST to the token endpoint, with provider errors mapped to useful messages. */
  async function exchange(spec, body, grant) {
    let res;
    try {
      res = await doFetch(spec.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: body.toString(),
      });
    } catch {
      throw new ApiError(502, `${spec.displayName} could not be reached to complete the connection.`, { code: "OAUTH_PROVIDER_UNREACHABLE" });
    }
    let payload = null;
    try { payload = await res.json(); } catch { payload = null; }

    if (!res.ok || !payload?.access_token) {
      const reason = payload?.error_description || payload?.error || `HTTP ${res.status}`;
      logger.warn?.("oauth token exchange failed", { meta: { provider: spec.provider, grant, status: res.status } });
      throw new ApiError(502, `${spec.displayName} refused the ${grant === "refresh_token" ? "token refresh" : "connection"}: ${reason}`, {
        code: grant === "refresh_token" ? "OAUTH_REFRESH_FAILED" : "OAUTH_EXCHANGE_FAILED",
      });
    }
    return payload;
  }

  /**
   * A usable access token for a provider call, refreshing when it has expired.
   * Throws a reconnect error when the grant is gone — which is what a user sees
   * after revoking access from their Google account page.
   */
  async function accessTokenFor(userId, provider) {
    const spec = specFor(provider);
    const integration = await repo.findIntegration(userId, provider);
    if (!integration || integration.status !== "connected") {
      throw new ApiError(409, `${spec.displayName} is not connected.`, { code: "NOT_CONNECTED" });
    }

    const creds = vault.open(integration.credentials);
    const expired = integration.expiresAt && new Date(integration.expiresAt).getTime() < Date.now() + 60_000;
    if (!expired) return { accessToken: creds.accessToken, integration };

    if (!creds.refreshToken) {
      await repo.updateIntegration(integration.id, {
        status: "expired",
        lastError: "The access token expired and no refresh token is stored. Reconnect the account.",
      });
      throw new ApiError(409, `${spec.displayName} needs to be reconnected: the stored access expired and there is no refresh token.`, { code: "REAUTH_REQUIRED" });
    }

    assertConnectable(spec);
    let tokens;
    try {
      tokens = await exchange(spec, new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
        client_id: env[spec.credentialKeys[0]],
        client_secret: env[spec.credentialKeys[1]],
      }), "refresh_token");
    } catch (err) {
      // A refused refresh means the user revoked access at the provider.
      await repo.updateIntegration(integration.id, { status: "expired", lastError: err.message });
      await repo.logSync(integration.id, userId, { action: "refresh", status: "error", detail: err.message });
      throw new ApiError(409, `${spec.displayName} needs to be reconnected. Access may have been revoked from your account settings.`, { code: "REAUTH_REQUIRED" });
    }

    const updated = await repo.updateIntegration(integration.id, {
      credentials: vault.seal({
        accessToken: tokens.access_token,
        // A refresh response usually omits the refresh token; keep the old one.
        refreshToken: tokens.refresh_token ?? creds.refreshToken,
        tokenType: tokens.token_type ?? "Bearer",
      }),
      expiresAt: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null,
      status: "connected",
      lastError: null,
    });
    return { accessToken: tokens.access_token, integration: updated };
  }

  /**
   * Disconnect: tell the provider to drop the grant, then delete the stored
   * credentials. The local delete happens even when the provider call fails,
   * because a user asking to disconnect must not be left holding a token.
   */
  async function disconnect(userId, provider) {
    const spec = specFor(provider);
    const integration = await repo.findIntegration(userId, provider);
    if (!integration) throw new ApiError(404, `${spec.displayName} is not connected.`, { code: "NOT_CONNECTED" });

    let revoked = false;
    let revokeError = null;
    if (spec.revokeUrl && integration.credentials) {
      try {
        const creds = vault.open(integration.credentials);
        const token = creds.refreshToken ?? creds.accessToken;
        const res = await doFetch(spec.revokeUrl, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }).toString(),
        });
        revoked = res.ok;
        if (!res.ok) revokeError = `The provider returned HTTP ${res.status} when revoking.`;
      } catch (err) {
        revokeError = err instanceof ApiError ? err.message : "The provider could not be reached to revoke the token.";
      }
    }

    await repo.logSync(integration.id, userId, {
      action: "disconnect",
      status: revoked ? "ok" : "warning",
      detail: revoked ? "Access revoked at the provider and credentials deleted." : `Credentials deleted locally. ${revokeError ?? ""}`.trim(),
    });
    await repo.deleteIntegrationCredentials(integration.id);

    logger.info?.("oauth disconnected", { meta: { userId, provider, revoked } });
    return {
      provider,
      revokedAtProvider: revoked,
      credentialsDeleted: true,
      note: revoked
        ? "Access was revoked at the provider and the stored credentials were deleted."
        : `The stored credentials were deleted. ${revokeError ?? "The provider could not confirm revocation"} — you can also remove access from your account's security settings.`,
    };
  }

  return { method: OAUTH_METHOD, startAuthorization, completeAuthorization, accessTokenFor, disconnect, specFor, assertConnectable };
}
