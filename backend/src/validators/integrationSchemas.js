/**
 * integrationSchemas.js — request validation for Phase 14.
 *
 * The OAuth callback is the one endpoint a third party calls, so it is the
 * strictest: `state` must look like the base64url token this backend issued,
 * and only the parameters the spec defines are accepted. `returnTo` is
 * constrained to a path on this app, so a crafted connect request cannot turn
 * the callback into an open redirect.
 */
import { z } from "zod";
import { cuidLike } from "./common.js";
import { OAUTH_INTEGRATIONS } from "../services/integrations/integrationRegistry.js";
import { WORKFLOWS } from "../services/automation/automationCatalog.js";
import { EMAIL_CATEGORIES } from "../services/integrations/emailService.js";

const blank = (schema) => z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

const PROVIDERS = OAUTH_INTEGRATIONS.map((i) => i.provider);
const WORKFLOW_KEYS = WORKFLOWS.map((w) => w.key);

export const providerParams = z.object({ provider: z.enum([...PROVIDERS, "email"]) });
export const oauthProviderParams = z.object({ provider: z.enum(PROVIDERS) });
export const ruleParams = z.object({ ruleId: cuidLike });
export const executionParams = z.object({ executionId: cuidLike });

/** Only a relative path inside this app; never an absolute URL. */
const internalPath = z.string().trim().max(200).refine(
  (v) => v.startsWith("/") && !v.startsWith("//") && !/[\r\n]/.test(v),
  "returnTo must be a path within this app."
);

export const connectSchema = z.object({
  returnTo: blank(internalPath),
});

/** base64url, the shape randomBytes(32).toString("base64url") produces. */
const stateToken = z.string().regex(/^[A-Za-z0-9_-]{20,128}$/, "Invalid state.");

export const callbackQuerySchema = z.object({
  state: stateToken,
  code: blank(z.string().max(2048)),
  error: blank(z.string().max(200)),
  error_description: blank(z.string().max(500)),
  scope: blank(z.string().max(2048)),
});

export const syncQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const calendarSyncSchema = z.object({
  /** Build the plan without touching the provider. */
  dryRun: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
});

export const calendarPreferencesSchema = z.object({
  interviews: z.boolean().optional(),
  deadlines: z.boolean().optional(),
  reminders: z.boolean().optional(),
  calendarId: blank(z.string().trim().max(200)),
}).refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

export const emailPreferencesSchema = z
  .object(Object.fromEntries(EMAIL_CATEGORIES.map((c) => [c.key, z.boolean().optional()])))
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

export const driveExportSchema = z.object({
  sourceKind: z.enum(["resume_version", "cover_letter"]),
  sourceId: cuidLike,
  folderId: blank(z.string().trim().max(200)),
  folderName: blank(z.string().trim().min(1).max(120)),
});

export const ruleUpsertSchema = z.object({
  workflowKey: z.enum(WORKFLOW_KEYS),
  isEnabled: z.boolean().default(false),
  config: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export const ruleUpdateSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    config: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

export const ruleRunSchema = z.object({
  /** Required before any action that leaves this app will execute. */
  approved: z.boolean().default(false),
});

export const executionsQuerySchema = z.object({
  ruleId: blank(cuidLike),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
