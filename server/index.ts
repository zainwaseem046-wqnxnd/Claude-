import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import multer from "multer";
import { config } from "./config.js";
import { migrate } from "./migrate.js";
import { loadUser, requireCsrfHeader } from "./lib/auth.js";
import { HttpError } from "./lib/errors.js";
import { authRouter } from "./routes/auth.js";
import { businessRouter } from "./routes/business.js";
import { sitesRouter } from "./routes/sites.js";
import { visitsRouter } from "./routes/visits.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { publicRouter } from "./routes/public.js";
import { billingRouter, stripeWebhook } from "./routes/billing.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'", "https://checkout.stripe.com"],
          upgradeInsecureRequests: config.isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.get("/api/health", (_req, res) => { res.json({ ok: true }); });
  app.post("/api/stripe/webhook", ...stripeWebhook);

  app.use(cookieParser());
  app.use(express.json({ limit: "200kb" }));
  app.use("/api", requireCsrfHeader, loadUser);
  app.use("/api/auth", authRouter);
  app.use("/api", businessRouter);
  app.use("/api/sites", sitesRouter);
  app.use("/api/visits", visitsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/billing", billingRouter);
  app.use("/api/public", publicRouter);
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

  // Serve the built React app in production
  const dist = [path.join(here, "..", "dist")].find((d) => fs.existsSync(path.join(d, "index.html")));
  if (dist) {
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "Photo is too large (maximum 8 MB)" : "Invalid upload";
      return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: msg });
    }
    const e = err as { type?: string; code?: string; status?: number; message?: string; raw?: { message?: string } };
    if (e?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON" });
    if (e?.type === "entity.too.large") return res.status(413).json({ error: "Request too large" });
    if (e?.code === "22P02") return res.status(404).json({ error: "Not found" });
    if (typeof e?.type === "string" && e.type.startsWith("Stripe")) {
      console.error("Stripe error:", e.message);
      return res.status(502).json({ error: `Payment provider error: ${e.message}` });
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });
  return app;
}

if (process.env.NODE_ENV !== "test") {
  migrate()
    .then(() => {
      createApp().listen(config.port, () => console.log(`CleaningProof API listening on http://localhost:${config.port}`));
    })
    .catch((e) => {
      console.error("Failed to start:", e);
      process.exit(1);
    });
}
