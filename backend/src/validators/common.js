import { z } from "zod";

export const cuidLike = z.string().regex(/^[a-z0-9]{20,32}$/i, "Invalid id.");
export const idParam = z.object({ id: cuidLike });

/** ISO date or YYYY-MM-DD → Date */
export const dateInput = z.preprocess((v) => (typeof v === "string" && v.trim() ? new Date(v) : v), z.date({ invalid_type_error: "Invalid date." }));
export const optionalDate = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), dateInput.optional());
export const nullableDate = z.preprocess((v) => (v === "" || v === undefined ? undefined : v), dateInput.nullable().optional());

export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a valid http(s) URL.");
export const optionalUrl = z.preprocess((v) => (v === "" || v === null ? undefined : v), httpUrl.optional());

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export function paginate(page, limit) {
  return { skip: (page - 1) * limit, take: limit };
}

export function pageMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export const TARGET_ROLE = z.string().trim().min(2).max(80);
