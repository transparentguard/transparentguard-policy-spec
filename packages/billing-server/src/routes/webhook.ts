import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { insertUsageEvent, DuplicateEventError } from "../db.js";

const router: ExpressRouter = Router();

function isValidISODate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isByProvider(value: unknown): value is Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([, v]) => typeof v === "number"
  );
}

router.post("/webhook/usage", (req: Request, res: Response): void => {
  // Auth check
  const secret = process.env.TG_OEM_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).json({ error: "Server misconfiguration: TG_OEM_WEBHOOK_SECRET not set" });
    return;
  }
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: missing or malformed Authorization header" });
    return;
  }
  const token = authHeader.slice("Bearer ".length);
  if (token !== secret) {
    res.status(401).json({ error: "Unauthorized: invalid token" });
    return;
  }

  // Body validation
  const body = req.body as Record<string, unknown>;
  const missingFields: string[] = [];
  const invalidFields: string[] = [];

  const requiredTextFields = ["period_start", "period_end", "customer_id", "runtime_version"] as const;
  for (const field of requiredTextFields) {
    if (body[field] === undefined || body[field] === null) {
      missingFields.push(field);
    } else if (typeof body[field] !== "string") {
      invalidFields.push(`${field} (must be a string)`);
    }
  }

  if (body["call_count"] === undefined || body["call_count"] === null) {
    missingFields.push("call_count");
  } else if (!isNonNegativeInteger(body["call_count"])) {
    invalidFields.push("call_count (must be a non-negative integer)");
  }

  if (body["by_provider"] === undefined || body["by_provider"] === null) {
    missingFields.push("by_provider");
  } else if (!isByProvider(body["by_provider"])) {
    invalidFields.push("by_provider (must be an object with string keys and number values)");
  }

  if (missingFields.length > 0 || invalidFields.length > 0) {
    res.status(400).json({
      error: "Invalid request body",
      details: { missing: missingFields, invalid: invalidFields },
    });
    return;
  }

  // Validate ISO date strings
  const period_start = body["period_start"] as string;
  const period_end = body["period_end"] as string;
  const dateErrors: string[] = [];

  if (!isValidISODate(period_start)) {
    dateErrors.push("period_start is not a valid ISO date string");
  }
  if (!isValidISODate(period_end)) {
    dateErrors.push("period_end is not a valid ISO date string");
  }

  if (dateErrors.length > 0) {
    res.status(400).json({ error: "Invalid date fields", details: dateErrors });
    return;
  }

  const id = randomUUID();

  try {
    insertUsageEvent({
      id,
      customer_id: body["customer_id"] as string,
      period_start,
      period_end,
      call_count: body["call_count"] as number,
      by_provider: body["by_provider"] as Record<string, number>,
      runtime_version: body["runtime_version"] as string,
    });
  } catch (err: unknown) {
    if (err instanceof DuplicateEventError) {
      res.status(409).json({ error: "Duplicate event", details: err.message });
      return;
    }
    throw err;
  }

  res.status(200).json({ received: true, event_id: id });
});

export default router;
