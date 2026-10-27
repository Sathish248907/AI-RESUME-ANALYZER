/**
 * googleDriveService.js — export documents to the user's own Drive
 * (`google-drive-1.0`). Direct REST, no SDK.
 *
 * The scope is `drive.file`, which is the narrowest one that can do this job:
 * it lets the app create files and manage *only the files it created*. It
 * cannot list, read or touch anything else in the user's Drive, so connecting
 * does not hand this product a view of their documents.
 *
 * Nothing is exported on a schedule or in the background. Every upload is a
 * response to the user pressing export on a specific document, and the file is
 * created with default (private) permissions — no sharing call is ever made.
 */
import { ApiError } from "../../utils/errors.js";

export const DRIVE_METHOD = "google-drive-1.0";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const API = "https://www.googleapis.com/drive/v3/files";

export const DEFAULT_DRIVE_PREFERENCES = Object.freeze({
  folderId: null,
  folderName: null,
});

/**
 * @param {{ oauth: object, repo: object, fetchImpl?: typeof fetch, logger?: object }} deps
 */
export function createGoogleDriveService({ oauth, repo, fetchImpl, logger = { info() {}, warn() {} } }) {
  const doFetch = fetchImpl ?? globalThis.fetch;

  function mapError(status, data, what) {
    if (status === 401) return new ApiError(409, "Google Drive rejected the stored access. Reconnect the account.", { code: "REAUTH_REQUIRED" });
    if (status === 403) {
      const reason = data?.error?.errors?.[0]?.reason ?? "";
      if (reason.includes("ateLimit")) return new ApiError(429, "Google Drive is rate limiting this account. Try again shortly.", { code: "DRIVE_RATE_LIMITED" });
      if (reason === "storageQuotaExceeded") return new ApiError(507, "Your Google Drive is out of space, so the file was not uploaded.", { code: "DRIVE_QUOTA" });
      return new ApiError(403, `Google Drive refused the ${what}${reason ? ` (${reason})` : ""}.`, { code: "DRIVE_FORBIDDEN" });
    }
    if (status === 429) return new ApiError(429, "Google Drive is rate limiting this account. Try again shortly.", { code: "DRIVE_RATE_LIMITED" });
    return new ApiError(502, `Google Drive returned HTTP ${status}${data?.error?.message ? `: ${data.error.message}` : ""}.`, { code: "DRIVE_ERROR" });
  }

  /**
   * Upload one PDF. Multipart so metadata and bytes go in a single request.
   *
   * @param {string} userId
   * @param {{ name: string, buffer: Buffer, mimeType?: string, sourceKind: string, sourceId: string }} file
   * @param {{ folderId?: string|null, replaceExisting?: boolean }} [opts]
   */
  async function exportFile(userId, file, { folderId = null, replaceExisting = true } = {}) {
    const integration = await repo.findIntegration(userId, "google_drive");
    if (!integration || integration.status !== "connected") {
      throw new ApiError(409, "Google Drive is not connected.", { code: "NOT_CONNECTED" });
    }
    const { accessToken } = await oauth.accessTokenFor(userId, "google_drive");

    // A previous export of the same document is updated in place rather than
    // leaving a trail of near-identical files in someone's Drive.
    const previous = await repo.findDriveExport(integration.id, file.sourceKind, file.sourceId);
    const mimeType = file.mimeType ?? "application/pdf";

    if (previous?.externalFileId && replaceExisting) {
      const res = await rawUpload(accessToken, `${UPLOAD_API}/${encodeURIComponent(previous.externalFileId)}?uploadType=media&fields=id,name,webViewLink`, "PATCH", file.buffer, mimeType);
      if (res.ok && res.data?.id) {
        await repo.recordDriveExport(integration.id, userId, { ...file, externalFileId: res.data.id, webViewLink: res.data.webViewLink ?? null });
        await repo.logSync(integration.id, userId, { action: "drive_update", status: "ok", detail: file.name, externalId: res.data.id });
        return { action: "updated", fileId: res.data.id, webViewLink: res.data.webViewLink ?? null, name: file.name };
      }
      if (res.status !== 404) throw mapError(res.status, res.data, "upload");
      // 404: the user deleted it in Drive; fall through and create a new one.
    }

    const boundary = `drive-${Date.now().toString(16)}`;
    const metadata = { name: file.name, mimeType, ...(folderId ? { parents: [folderId] } : {}) };
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      file.buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    let res;
    try {
      res = await doFetch(`${UPLOAD_API}?uploadType=multipart&fields=id,name,webViewLink`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": `multipart/related; boundary=${boundary}` },
        body,
      });
    } catch {
      throw new ApiError(502, "Google Drive could not be reached.", { code: "DRIVE_UNREACHABLE" });
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || !data?.id) throw mapError(res.status, data, "upload");

    await repo.recordDriveExport(integration.id, userId, { ...file, externalFileId: data.id, webViewLink: data.webViewLink ?? null });
    await repo.logSync(integration.id, userId, { action: "drive_create", status: "ok", detail: file.name, externalId: data.id });
    logger.info?.("drive export", { meta: { userId, name: file.name, bytes: file.buffer.length } });

    return {
      action: "created",
      fileId: data.id,
      webViewLink: data.webViewLink ?? null,
      name: data.name ?? file.name,
      note: "The file is private to your Drive. Nothing was shared and no link was made public.",
    };
  }

  async function rawUpload(accessToken, url, method, buffer, mimeType) {
    try {
      const res = await doFetch(url, { method, headers: { authorization: `Bearer ${accessToken}`, "content-type": mimeType }, body: buffer });
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      return { ok: res.ok, status: res.status, data };
    } catch {
      throw new ApiError(502, "Google Drive could not be reached.", { code: "DRIVE_UNREACHABLE" });
    }
  }

  /**
   * Folders this app can see. With `drive.file` that is only folders it
   * created, so the list is usually empty — which the caller explains rather
   * than presenting as an error.
   */
  async function listFolders(userId) {
    const { accessToken } = await oauth.accessTokenFor(userId, "google_drive");
    const url = `${API}?q=${encodeURIComponent("mimeType='application/vnd.google-apps.folder' and trashed=false")}&fields=files(id,name)&pageSize=50`;
    let res;
    try {
      res = await doFetch(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
    } catch {
      throw new ApiError(502, "Google Drive could not be reached.", { code: "DRIVE_UNREACHABLE" });
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw mapError(res.status, data, "folder listing");
    return {
      folders: (data?.files ?? []).map((f) => ({ id: f.id, name: f.name })),
      note: "Only folders this app created are visible, because it asks for the narrowest Drive permission. Leave the folder empty to export to the top level of your Drive.",
    };
  }

  /** Create a folder to export into, so the user can keep exports together. */
  async function createFolder(userId, name) {
    const { accessToken } = await oauth.accessTokenFor(userId, "google_drive");
    let res;
    try {
      res = await doFetch(`${API}?fields=id,name`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
      });
    } catch {
      throw new ApiError(502, "Google Drive could not be reached.", { code: "DRIVE_UNREACHABLE" });
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || !data?.id) throw mapError(res.status, data, "folder creation");
    return { id: data.id, name: data.name };
  }

  return { method: DRIVE_METHOD, exportFile, listFolders, createFolder };
}
