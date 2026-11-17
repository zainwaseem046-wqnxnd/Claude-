import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { one } from "../db.js";
import { notFound } from "../lib/errors.js";
import { idParam } from "../lib/validate.js";
import { loadReport } from "../lib/reportData.js";
import { renderReportPdf, reportFileName } from "../lib/pdf.js";
import { filePath } from "../lib/storage.js";
import { limitsFor } from "../lib/plans.js";

/** Unauthenticated access to ONE shared report, identified only by its unguessable token. */
export const publicRouter = Router();
publicRouter.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
publicRouter.use((_req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.set("Referrer-Policy", "no-referrer");
  next();
});

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{24,64}$/, "Invalid link");
const tokenOf = (t: unknown) => {
  const r = tokenSchema.safeParse(t);
  if (!r.success) throw notFound("Report not found");
  return r.data;
};

publicRouter.get("/reports/:token", async (req, res) => {
  const r = await loadReport({ shareToken: tokenOf(req.params.token) });
  const branding = limitsFor(r.business).branding;
  const v = r.visit;
  res.set("Cache-Control", "private, no-store");
  res.json({
    business: {
      name: r.business.name, contact_email: r.business.contact_email, phone: r.business.phone, address: r.business.address,
      website: r.business.website, has_logo: branding && Boolean(r.business.logo_file),
    },
    site: { name: r.site.name, address: r.site.address, contact_name: r.site.contact_name },
    visit: {
      ref: v.id.slice(0, 8).toUpperCase(), cleaner_name: v.cleaner_name, visit_at: v.visit_at, submitted_at: v.submitted_at,
      areas_cleaned: v.areas_cleaned, tasks: v.tasks, incomplete_reason: v.incomplete_reason, issues: v.issues, notes: v.notes,
    },
    photos: r.photos.map((p) => ({ id: p.id, kind: p.kind })),
  });
});

publicRouter.get("/reports/:token/photos/:photoId", async (req, res) => {
  const p = await one(
    `SELECT p.file_name, p.mime FROM photos p JOIN visits v ON v.id=p.visit_id
      WHERE v.share_token=$1 AND v.status='submitted' AND p.id=$2`,
    [tokenOf(req.params.token), idParam(req.params.photoId)],
  );
  if (!p) throw notFound();
  res.set("Cache-Control", "private, max-age=3600").type(p.mime).sendFile(filePath(p.file_name));
});

publicRouter.get("/reports/:token/logo", async (req, res) => {
  const b = await one(
    `SELECT b.logo_file, b.logo_mime, b.plan, b.trial_ends_at, b.subscription_status FROM visits v JOIN businesses b ON b.id=v.business_id
      WHERE v.share_token=$1 AND v.status='submitted'`,
    [tokenOf(req.params.token)],
  );
  if (!b?.logo_file || !limitsFor(b).branding) throw notFound();
  res.set("Cache-Control", "private, max-age=3600").type(b.logo_mime).sendFile(filePath(b.logo_file));
});

publicRouter.get("/reports/:token/pdf", async (req, res) => {
  const r = await loadReport({ shareToken: tokenOf(req.params.token) });
  const pdf = await renderReportPdf(r);
  res.set("Content-Disposition", `attachment; filename="${reportFileName(r)}"`);
  res.set("Cache-Control", "private, no-store");
  res.type("application/pdf").send(pdf);
});

