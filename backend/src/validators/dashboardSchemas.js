import { z } from "zod";

export const RANGES = ["7d", "30d", "90d", "12m", "all"];

export const analyticsQuerySchema = z.object({
  range: z.enum(RANGES).default("90d"),
  granularity: z.enum(["week", "month"]).optional(),
});

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
