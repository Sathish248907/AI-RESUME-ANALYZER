/**
 * requestId.js — a correlation id for every request.
 *
 * One id ties the access log line, any error log, and the body the client was
 * given together. When someone reports "it failed at 14:03" the id in their
 * error response finds the exact request, without anyone having to log request
 * bodies to make failures diagnosable.
 *
 * An inbound `x-request-id` is honoured so a proxy or load balancer can keep
 * one id across hops, but only when it looks like an id: it is echoed into a
 * response header, so an unvalidated value would be header injection.
 */
import { randomUUID } from "node:crypto";

const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

export function requestId(req, res, next) {
  const inbound = req.headers["x-request-id"];
  req.id = typeof inbound === "string" && SAFE_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
}
