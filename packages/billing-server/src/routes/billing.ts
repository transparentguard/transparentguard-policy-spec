import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getAllCustomers,
  getUsageSummary,
  getTotalCallsByPeriod,
  getCustomerEvents,
} from "../db.js";

const router: ExpressRouter = Router();
const auth = requireAuth();

function parseOptionalDate(
  value: unknown,
  fieldName: string
): { value: string | undefined; error: string | null } {
  if (value === undefined || value === null || value === "") {
    return { value: undefined, error: null };
  }
  if (typeof value !== "string") {
    return { value: undefined, error: `${fieldName} must be a string` };
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return {
      value: undefined,
      error: `${fieldName} is not a valid ISO date string`,
    };
  }
  return { value, error: null };
}

function parsePositiveInt(
  value: unknown,
  fieldName: string,
  defaultValue: number
): { value: number; error: string | null } {
  if (value === undefined || value === null || value === "") {
    return { value: defaultValue, error: null };
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    return {
      value: defaultValue,
      error: `${fieldName} must be a non-negative integer`,
    };
  }
  return { value: n, error: null };
}

// GET /billing/customers
router.get("/billing/customers", auth, (_req: Request, res: Response): void => {
  const customers = getAllCustomers();
  res.status(200).json({ customers });
});

// GET /billing/customers/:id/usage?from=ISO&to=ISO
router.get(
  "/billing/customers/:id/usage",
  auth,
  (req: Request, res: Response): void => {
    const customerId = req.params["id"];
    const fromResult = parseOptionalDate(req.query["from"], "from");
    const toResult = parseOptionalDate(req.query["to"], "to");

    const errors: string[] = [];
    if (fromResult.error) errors.push(fromResult.error);
    if (toResult.error) errors.push(toResult.error);

    if (errors.length > 0) {
      res.status(400).json({ error: "Invalid query parameters", details: errors });
      return;
    }

    const summary = getUsageSummary(customerId, fromResult.value, toResult.value);
    res.status(200).json(summary);
  }
);

// GET /billing/summary?from=ISO&to=ISO
router.get("/billing/summary", auth, (req: Request, res: Response): void => {
  const fromResult = parseOptionalDate(req.query["from"], "from");
  const toResult = parseOptionalDate(req.query["to"], "to");

  const errors: string[] = [];
  if (fromResult.error) errors.push(fromResult.error);
  if (toResult.error) errors.push(toResult.error);

  if (errors.length > 0) {
    res.status(400).json({ error: "Invalid query parameters", details: errors });
    return;
  }

  const summary = getTotalCallsByPeriod(fromResult.value, toResult.value);
  res.status(200).json(summary);
});

// GET /billing/events?customer_id=&limit=&offset=
router.get("/billing/events", auth, (req: Request, res: Response): void => {
  const customerId =
    typeof req.query["customer_id"] === "string"
      ? req.query["customer_id"]
      : undefined;

  const fromResult = parseOptionalDate(req.query["from"], "from");
  const toResult = parseOptionalDate(req.query["to"], "to");
  const limitResult = parsePositiveInt(req.query["limit"], "limit", 50);
  const offsetResult = parsePositiveInt(req.query["offset"], "offset", 0);

  const errors: string[] = [];
  if (fromResult.error) errors.push(fromResult.error);
  if (toResult.error) errors.push(toResult.error);
  if (limitResult.error) errors.push(limitResult.error);
  if (offsetResult.error) errors.push(offsetResult.error);

  if (errors.length > 0) {
    res.status(400).json({ error: "Invalid query parameters", details: errors });
    return;
  }

  if (!customerId) {
    res.status(400).json({ error: "customer_id query parameter is required" });
    return;
  }

  const result = getCustomerEvents(
    customerId,
    fromResult.value,
    toResult.value,
    Math.min(limitResult.value, 500),
    offsetResult.value
  );

  res.status(200).json({
    customer_id: customerId,
    total: result.total,
    limit: Math.min(limitResult.value, 500),
    offset: offsetResult.value,
    events: result.events,
  });
});

export default router;
