/**
 * ApiError — operational error with an HTTP status and a safe, user-facing message.
 * Anything that is not an ApiError is treated as unexpected and masked as a 500.
 */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {{ code?: string, details?: unknown, retryable?: boolean }} [options]
   */
  constructor(status, message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = options.code ?? defaultCode(status);
    this.details = options.details;
    this.retryable = options.retryable ?? false;
    this.expose = true;
  }
}

function defaultCode(status) {
  switch (status) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHORIZED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 409: return "CONFLICT";
    case 413: return "PAYLOAD_TOO_LARGE";
    case 422: return "UNPROCESSABLE";
    case 429: return "RATE_LIMITED";
    case 502: return "UPSTREAM_ERROR";
    case 503: return "SERVICE_UNAVAILABLE";
    case 504: return "UPSTREAM_TIMEOUT";
    default: return "INTERNAL_ERROR";
  }
}

export const badRequest = (message, details) => new ApiError(400, message, { details });
export const unauthorized = (message = "Authentication required.") => new ApiError(401, message);
export const forbidden = (message = "You do not have access to this resource.") => new ApiError(403, message);
export const notFound = (message = "Resource not found.") => new ApiError(404, message);
export const conflict = (message) => new ApiError(409, message);
