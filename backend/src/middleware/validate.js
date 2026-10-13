import { badRequest } from "../utils/errors.js";

/**
 * validate — parses `req[source]` with a Zod schema and replaces it with the
 * typed, trimmed result. Field-level messages are returned under `details`.
 * @param {import("zod").ZodTypeAny} schema
 * @param {"body"|"params"|"query"} source
 */
export function validate(schema, source = "body") {
  return function validateMiddleware(req, _res, next) {
    const parsed = schema.safeParse(req[source] ?? {});
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => ({ field: i.path.join(".") || source, message: i.message }));
      return next(badRequest(details[0]?.message ?? "Invalid request.", details));
    }
    req[source] = parsed.data;
    next();
  };
}
