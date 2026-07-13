import { createApp } from "./app.js";
import { initDb } from "./db.js";

const PORT_RAW = process.env["PORT"];
if (!PORT_RAW) {
  console.error("[billing-server] FATAL: PORT environment variable is required");
  process.exit(1);
}

const PORT = parseInt(PORT_RAW, 10);
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`[billing-server] FATAL: PORT must be a valid port number, got: ${PORT_RAW}`);
  process.exit(1);
}

const DB_PATH = process.env["TG_BILLING_DB_PATH"] ?? "./billing.db";
const SECRET_CONFIGURED = Boolean(process.env["TG_OEM_WEBHOOK_SECRET"]);

try {
  initDb();
  console.log(`[billing-server] Database initialised at: ${DB_PATH}`);
} catch (err) {
  console.error("[billing-server] FATAL: Failed to initialise database:", err);
  process.exit(1);
}

const app = createApp();

const server = app.listen(PORT, () => {
  console.log("─────────────────────────────────────────────────");
  console.log("  @transparentguard/billing-server");
  console.log("─────────────────────────────────────────────────");
  console.log(`  PORT              : ${PORT}`);
  console.log(`  DB path           : ${DB_PATH}`);
  console.log(`  Webhook secret    : ${SECRET_CONFIGURED ? "configured ✓" : "NOT SET ✗ (requests will fail)"}`);
  console.log("─────────────────────────────────────────────────");
});

process.on("SIGTERM", () => {
  console.log("[billing-server] Received SIGTERM, shutting down gracefully…");
  server.close(() => {
    console.log("[billing-server] HTTP server closed.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[billing-server] Received SIGINT, shutting down gracefully…");
  server.close(() => {
    console.log("[billing-server] HTTP server closed.");
    process.exit(0);
  });
});
