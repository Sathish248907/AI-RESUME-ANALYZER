/**
 * tokenVault.js — encrypted storage for OAuth credentials (`token-vault-1.0`).
 *
 * Access and refresh tokens are the keys to someone's Google account. They are
 * encrypted with AES-256-GCM before they reach the database, so a database dump
 * alone does not yield a usable token, and they are decrypted only inside the
 * request that is about to call the provider.
 *
 * Three rules hold throughout:
 *
 *   1. **No key, no connection.** When `INTEGRATION_ENCRYPTION_KEY` is absent
 *      the vault refuses to seal anything. Connecting then fails with a setup
 *      error instead of silently writing a token in the clear.
 *   2. **Nothing decrypted leaves the backend.** `describe()` returns only
 *      metadata — the provider, expiry and scopes — and is the only shape the
 *      API ever serialises. There is no code path from a stored token to a
 *      response body.
 *   3. **GCM, not CBC.** The auth tag means a tampered ciphertext fails to
 *      open rather than decrypting to attacker-chosen bytes.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { ApiError } from "../../utils/errors.js";

export const VAULT_METHOD = "token-vault-1.0";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Decode and validate the key. A wrong-length key is a configuration error we
 * want at the first use, not a confusing crypto failure later.
 * @param {string} rawKey base64
 */
function loadKey(rawKey) {
  if (!rawKey) {
    throw new ApiError(503, "Integration credential storage is not configured, so no account can be connected. Set INTEGRATION_ENCRYPTION_KEY in the backend environment and restart.", {
      code: "VAULT_NOT_CONFIGURED",
      details: [
        { message: `Generate one with: node -e "console.log(require('crypto').randomBytes(${KEY_BYTES}).toString('base64'))"` },
        { message: "Without it, OAuth tokens would have to be stored unencrypted, which this build refuses to do." },
      ],
    });
  }
  let key;
  try { key = Buffer.from(rawKey, "base64"); } catch { key = Buffer.alloc(0); }
  if (key.length !== KEY_BYTES) {
    throw new ApiError(503, `INTEGRATION_ENCRYPTION_KEY must be ${KEY_BYTES} bytes encoded as base64 (it decoded to ${key.length}).`, { code: "VAULT_KEY_INVALID" });
  }
  return key;
}

/**
 * @param {{ INTEGRATION_ENCRYPTION_KEY: string }} env
 */
export function createTokenVault(env) {
  const configured = Boolean(env?.INTEGRATION_ENCRYPTION_KEY);

  return {
    method: VAULT_METHOD,
    configured,

    /** Throws the setup error unless the vault can actually protect a token. */
    assertReady() {
      loadKey(env.INTEGRATION_ENCRYPTION_KEY);
    },

    /**
     * Encrypt a credential bundle. Returns an opaque string for the database:
     * `v1.<iv>.<tag>.<ciphertext>`, all base64url.
     * @param {object} payload e.g. { accessToken, refreshToken, idToken }
     */
    seal(payload) {
      const key = loadKey(env.INTEGRATION_ENCRYPTION_KEY);
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const json = Buffer.from(JSON.stringify(payload ?? {}), "utf8");
      const ciphertext = Buffer.concat([cipher.update(json), cipher.final()]);
      const tag = cipher.getAuthTag();
      return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
    },

    /**
     * Decrypt a bundle. A tampered or truncated value throws rather than
     * returning partial data.
     * @param {string} sealed
     */
    open(sealed) {
      const key = loadKey(env.INTEGRATION_ENCRYPTION_KEY);
      const parts = String(sealed ?? "").split(".");
      if (parts.length !== 4 || parts[0] !== "v1") {
        throw new ApiError(500, "Stored credentials are unreadable. Disconnect and reconnect the integration.", { code: "VAULT_FORMAT" });
      }
      try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(parts[1], "base64url"));
        decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
        const plain = Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]);
        return JSON.parse(plain.toString("utf8"));
      } catch {
        // Either the key rotated or the row was altered; both mean reconnect.
        throw new ApiError(500, "Stored credentials could not be decrypted. This happens if the encryption key changed. Disconnect and reconnect the integration.", { code: "VAULT_DECRYPT_FAILED" });
      }
    },

    /**
     * Metadata safe to serialise. Deliberately contains no token material, and
     * the fingerprint is a hash so two connections can be compared without
     * revealing either.
     * @param {object} integration row
     */
    describe(integration) {
      return {
        provider: integration.provider,
        status: integration.status,
        scopes: Array.isArray(integration.scopes) ? integration.scopes : [],
        connectedAt: integration.connectedAt ?? null,
        expiresAt: integration.expiresAt ?? null,
        externalAccountLabel: integration.externalAccountLabel ?? null,
        hasRefreshToken: Boolean(integration.hasRefreshToken),
        credentialFingerprint: integration.credentials
          ? createHash("sha256").update(String(integration.credentials)).digest("hex").slice(0, 12)
          : null,
      };
    },
  };
}

/** Constant-time compare for OAuth state values. */
export function safeEquals(a, b) {
  const left = Buffer.from(String(a ?? ""), "utf8");
  const right = Buffer.from(String(b ?? ""), "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}
