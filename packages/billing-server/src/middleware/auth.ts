import type { Request, Response, NextFunction, RequestHandler } from "express";

export function requireAuth(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
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

    next();
  };
}
