import express, { type Request, type Response, type NextFunction } from "express";
import webhookRouter from "./routes/webhook.js";
import billingRouter from "./routes/billing.js";

export function createApp(): express.Application {
  const app = express();

  // Body parser
  app.use(express.json({ limit: "512kb" }));

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`
      );
    });
    next();
  });

  // Routers
  app.use("/", webhookRouter);
  app.use("/", billingRouter);

  // 404 handler
  app.use((_req: Request, res: Response): void => {
    res.status(404).json({ error: "Not found" });
  });

  // Global error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    console.error("[billing-server] Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
