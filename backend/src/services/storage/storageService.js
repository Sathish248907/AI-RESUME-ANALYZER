/**
 * storageService.js — storage abstraction for original resume files.
 *
 * Drivers:
 *   none  — originals are discarded after text extraction (default, nothing on disk)
 *   local — originals saved under STORAGE_LOCAL_DIR with random opaque keys.
 *           Keys never contain user input; the real path is never exposed to clients.
 *
 * A cloud driver (S3, GCS, …) can implement the same four methods.
 */
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

const EXT_BY_MIME = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
};

function createNoneDriver() {
  return {
    name: "none",
    enabled: false,
    async save() {
      return null;
    },
    async getStream() {
      throw new ApiError(404, "Original files are not retained on this server.", { code: "FILE_NOT_STORED" });
    },
    async remove() {},
  };
}

function createLocalDriver(baseDir) {
  const root = path.resolve(baseDir);
  const KEY_RX = /^[a-f0-9]{32}\.(pdf|docx|doc)$/;

  function resolveKey(key) {
    if (typeof key !== "string" || !KEY_RX.test(key)) throw new ApiError(404, "File not found.", { code: "FILE_NOT_FOUND" });
    const full = path.join(root, key);
    if (!full.startsWith(root)) throw new ApiError(404, "File not found.", { code: "FILE_NOT_FOUND" });
    return full;
  }

  return {
    name: "local",
    enabled: true,
    async save(buffer, mimeType) {
      await mkdir(root, { recursive: true });
      const key = `${randomBytes(16).toString("hex")}.${EXT_BY_MIME[mimeType] ?? "bin"}`;
      await writeFile(path.join(root, key), buffer, { flag: "wx" });
      return key;
    },
    async getStream(key) {
      const full = resolveKey(key);
      try {
        const info = await stat(full);
        return { stream: createReadStream(full), size: info.size };
      } catch {
        throw new ApiError(404, "File not found.", { code: "FILE_NOT_FOUND" });
      }
    },
    async remove(key) {
      if (!key) return;
      try {
        await unlink(resolveKey(key));
      } catch (err) {
        if (err?.code !== "ENOENT") logger.warn("Could not remove stored file", { key, message: err?.message });
      }
    },
  };
}

/** @param {{ STORAGE_DRIVER: "none"|"local", STORAGE_LOCAL_DIR: string }} env */
export function createStorage(env) {
  return env.STORAGE_DRIVER === "local" ? createLocalDriver(env.STORAGE_LOCAL_DIR) : createNoneDriver();
}
