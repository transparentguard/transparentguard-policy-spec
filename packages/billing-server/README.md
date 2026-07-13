# @transparentguard/billing-server

A standalone Express server that receives OEM usage webhook POSTs from `@transparentguard/runtime-oem` and provides billing aggregation APIs.

## What this server does

- Accepts signed webhook POSTs from OEM runtimes reporting API call usage per period
- Persists usage events in a local SQLite database (via `better-sqlite3`)
- Deduplicates events per customer + period window (returns 409 on re-submission)
- Exposes read-only billing APIs for querying aggregated usage by customer, provider, and time range

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | **Yes** | — | TCP port the HTTP server listens on |
| `TG_BILLING_DB_PATH` | No | `./billing.db` | Filesystem path to the SQLite database file |
| `TG_OEM_WEBHOOK_SECRET` | **Yes** | — | Shared secret; callers must supply this as a Bearer token |

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Set required environment variables
export PORT=4000
export TG_OEM_WEBHOOK_SECRET=supersecret
export TG_BILLING_DB_PATH=/var/data/billing.db

# Development (hot-reload)
pnpm dev

# Production build + run
pnpm build
pnpm start
```

---

## Webhook Payload Reference

OEM runtimes POST to `POST /webhook/usage` with a JSON body:

```json
{
  "period_start": "2024-01-01T00:00:00.000Z",
  "period_end":   "2024-01-01T01:00:00.000Z",
  "call_count":   142,
  "by_provider": {
    "openai":    120,
    "anthropic":  22
  },
  "customer_id":      "acme-corp",
  "runtime_version":  "1.2.3"
}
```

All fields are required. `call_count` must be a non-negative integer. `by_provider` must be an object mapping provider names (strings) to call counts (numbers). `period_start` and `period_end` must be valid ISO 8601 date strings.

---

## OEM Partner Configuration

OEM partners should set the following environment variable in their runtime to point at this server:

```bash
TG_OEM_WEBHOOK=http://your-billing-server-host:4000/webhook/usage
TG_OEM_WEBHOOK_SECRET=supersecret
```

The runtime-oem package will POST usage reports to the configured URL with `Authorization: Bearer <TG_OEM_WEBHOOK_SECRET>` on each reporting interval.

---

## API Endpoint Reference

All billing endpoints require `Authorization: Bearer <TG_OEM_WEBHOOK_SECRET>`.

### POST /webhook/usage

Receive a usage report from an OEM runtime.

```bash
curl -X POST http://localhost:4000/webhook/usage \
  -H "Authorization: Bearer supersecret" \
  -H "Content-Type: application/json" \
  -d '{
    "period_start": "2024-01-01T00:00:00.000Z",
    "period_end":   "2024-01-01T01:00:00.000Z",
    "call_count":   142,
    "by_provider":  { "openai": 120, "anthropic": 22 },
    "customer_id":  "acme-corp",
    "runtime_version": "1.2.3"
  }'
```

**Responses:**
- `200` — `{ "received": true, "event_id": "<uuid>" }`
- `400` — Validation error with field details
- `401` — Missing or invalid Bearer token
- `409` — Duplicate event for this customer + period

---

### GET /billing/customers

List all customers with their total call counts.

```bash
curl http://localhost:4000/billing/customers \
  -H "Authorization: Bearer supersecret"
```

**Response:**
```json
{
  "customers": [
    { "id": "acme-corp", "created_at": "2024-01-01T00:00:00.000Z", "active": 1, "total_calls": 9420 }
  ]
}
```

---

### GET /billing/customers/:id/usage

Get usage summary for a single customer, optionally filtered by date range.

```bash
curl "http://localhost:4000/billing/customers/acme-corp/usage?from=2024-01-01T00:00:00Z&to=2024-02-01T00:00:00Z" \
  -H "Authorization: Bearer supersecret"
```

**Query parameters:** `from` (ISO date, optional), `to` (ISO date, optional)

**Response:**
```json
{
  "customer_id": "acme-corp",
  "total_calls": 9420,
  "period_count": 66,
  "by_provider_aggregate": { "openai": 8000, "anthropic": 1420 },
  "events": [ { "id": "...", "period_start": "...", "period_end": "...", "call_count": 142, "..." : "..." } ]
}
```

---

### GET /billing/summary

Aggregate totals across all customers, optionally filtered by date range.

```bash
curl "http://localhost:4000/billing/summary?from=2024-01-01T00:00:00Z" \
  -H "Authorization: Bearer supersecret"
```

**Query parameters:** `from` (ISO date, optional), `to` (ISO date, optional)

**Response:**
```json
{
  "total_calls": 45000,
  "customer_count": 12,
  "by_provider_aggregate": { "openai": 38000, "anthropic": 7000 },
  "by_customer": { "acme-corp": 9420, "globex": 35580 }
}
```

---

### GET /billing/events

Paginated raw events for a customer.

```bash
curl "http://localhost:4000/billing/events?customer_id=acme-corp&limit=20&offset=0" \
  -H "Authorization: Bearer supersecret"
```

**Query parameters:**
- `customer_id` (string, **required**)
- `from` (ISO date, optional)
- `to` (ISO date, optional)
- `limit` (integer, optional, default 50, max 500)
- `offset` (integer, optional, default 0)

**Response:**
```json
{
  "customer_id": "acme-corp",
  "total": 66,
  "limit": 20,
  "offset": 0,
  "events": [ { "id": "...", "period_start": "...", "call_count": 142, "..." : "..." } ]
}
```
