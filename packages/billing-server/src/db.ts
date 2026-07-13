import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

const DB_PATH = process.env.TG_BILLING_DB_PATH ?? "./billing.db";

export class DuplicateEventError extends Error {
  constructor(customerId: string, periodStart: string, periodEnd: string) {
    super(
      `Duplicate event for customer ${customerId} period ${periodStart}–${periodEnd}`
    );
    this.name = "DuplicateEventError";
  }
}

let db: Database.Database;

export function initDb(): void {
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id         TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      active     INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id              TEXT PRIMARY KEY,
      customer_id     TEXT NOT NULL,
      period_start    TEXT NOT NULL,
      period_end      TEXT NOT NULL,
      call_count      INTEGER NOT NULL,
      by_provider     TEXT NOT NULL,
      runtime_version TEXT NOT NULL,
      received_at     TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_customer_period
      ON usage_events(customer_id, period_start, period_end);

    CREATE INDEX IF NOT EXISTS idx_usage_customer
      ON usage_events(customer_id);

    CREATE INDEX IF NOT EXISTS idx_usage_received
      ON usage_events(received_at);
  `);
}

export interface UsageEventInput {
  customer_id: string;
  period_start: string;
  period_end: string;
  call_count: number;
  by_provider: Record<string, number>;
  runtime_version: string;
}

export interface UsageEventRow {
  id: string;
  customer_id: string;
  period_start: string;
  period_end: string;
  call_count: number;
  by_provider: string; // JSON string
  runtime_version: string;
  received_at: string;
}

export interface UsageSummary {
  customer_id: string;
  total_calls: number;
  period_count: number;
  by_provider_aggregate: Record<string, number>;
  events: Array<UsageEventRow & { by_provider_parsed: Record<string, number> }>;
}

export interface TotalCallsByPeriod {
  total_calls: number;
  customer_count: number;
  by_provider_aggregate: Record<string, number>;
  by_customer: Record<string, number>;
}

export interface CustomerRow {
  id: string;
  created_at: string;
  active: number;
}

export function upsertCustomer(id: string): void {
  const stmt = db.prepare(`
    INSERT INTO customers (id, created_at, active)
    VALUES (?, ?, 1)
    ON CONFLICT(id) DO NOTHING
  `);
  stmt.run(id, new Date().toISOString());
}

export function insertUsageEvent(
  event: UsageEventInput & { id?: string }
): string {
  upsertCustomer(event.customer_id);

  const id = event.id ?? randomUUID();
  const received_at = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO usage_events
      (id, customer_id, period_start, period_end, call_count, by_provider, runtime_version, received_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(
      id,
      event.customer_id,
      event.period_start,
      event.period_end,
      event.call_count,
      JSON.stringify(event.by_provider),
      event.runtime_version,
      received_at
    );
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes("UNIQUE constraint failed")
    ) {
      throw new DuplicateEventError(
        event.customer_id,
        event.period_start,
        event.period_end
      );
    }
    throw err;
  }

  return id;
}

function mergeByProvider(
  aggregate: Record<string, number>,
  parsed: Record<string, number>
): void {
  for (const [provider, count] of Object.entries(parsed)) {
    aggregate[provider] = (aggregate[provider] ?? 0) + count;
  }
}

export function getUsageSummary(
  customerId: string,
  from?: string,
  to?: string
): UsageSummary {
  const conditions: string[] = ["customer_id = ?"];
  const params: unknown[] = [customerId];

  if (from) {
    conditions.push("period_start >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("period_end <= ?");
    params.push(to);
  }

  const rows = db
    .prepare(
      `SELECT * FROM usage_events WHERE ${conditions.join(" AND ")} ORDER BY period_start ASC`
    )
    .all(...params) as UsageEventRow[];

  const by_provider_aggregate: Record<string, number> = {};
  let total_calls = 0;

  const events = rows.map((row) => {
    const by_provider_parsed: Record<string, number> = JSON.parse(
      row.by_provider
    );
    total_calls += row.call_count;
    mergeByProvider(by_provider_aggregate, by_provider_parsed);
    return { ...row, by_provider_parsed };
  });

  return {
    customer_id: customerId,
    total_calls,
    period_count: rows.length,
    by_provider_aggregate,
    events,
  };
}

export function getAllCustomers(): Array<
  CustomerRow & { total_calls: number }
> {
  const customers = db
    .prepare("SELECT * FROM customers ORDER BY created_at ASC")
    .all() as CustomerRow[];

  return customers.map((c) => {
    const row = db
      .prepare(
        "SELECT COALESCE(SUM(call_count), 0) AS total FROM usage_events WHERE customer_id = ?"
      )
      .get(c.id) as { total: number };
    return { ...c, total_calls: row.total };
  });
}

export function getCustomerEvents(
  customerId: string,
  from?: string,
  to?: string,
  limit = 50,
  offset = 0
): { events: UsageEventRow[]; total: number } {
  const conditions: string[] = ["customer_id = ?"];
  const params: unknown[] = [customerId];

  if (from) {
    conditions.push("period_start >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("period_end <= ?");
    params.push(to);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM usage_events ${where}`)
      .get(...params) as { cnt: number }
  ).cnt;

  const events = db
    .prepare(
      `SELECT * FROM usage_events ${where} ORDER BY period_start ASC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as UsageEventRow[];

  return { events, total };
}

export function getTotalCallsByPeriod(
  from?: string,
  to?: string
): TotalCallsByPeriod {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (from) {
    conditions.push("period_start >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("period_end <= ?");
    params.push(to);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(`SELECT * FROM usage_events ${where} ORDER BY period_start ASC`)
    .all(...params) as UsageEventRow[];

  const by_provider_aggregate: Record<string, number> = {};
  const by_customer: Record<string, number> = {};
  let total_calls = 0;

  for (const row of rows) {
    total_calls += row.call_count;
    by_customer[row.customer_id] =
      (by_customer[row.customer_id] ?? 0) + row.call_count;
    mergeByProvider(by_provider_aggregate, JSON.parse(row.by_provider));
  }

  return {
    total_calls,
    customer_count: Object.keys(by_customer).length,
    by_provider_aggregate,
    by_customer,
  };
}
