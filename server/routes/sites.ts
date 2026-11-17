import { Router } from "express";
import { z } from "zod";
import { one, query } from "../db.js";
import { requireAuth, requireOwner } from "../lib/auth.js";
import { notFound, paymentRequired } from "../lib/errors.js";
import { parse, requiredText, text, optionalEmail, idParam } from "../lib/validate.js";
import { limitsFor, requireActive } from "../lib/plans.js";

export const sitesRouter = Router();
sitesRouter.use(requireAuth);

const FREQUENCIES = ["daily", "weekdays", "twice-weekly", "weekly", "fortnightly", "monthly", "ad-hoc"] as const;

const siteSchema = z.object({
  name: requiredText(120),
  address: text(300),
  contact_name: text(120),
  contact_email: optionalEmail,
  frequency: z.enum(FREQUENCIES),
  areas: z.array(requiredText(80)).max(40, "max 40 areas"),
  checklist: z.array(requiredText(160)).min(1, "add at least one checklist task").max(80, "max 80 tasks"),
});

const dedupe = (a: string[]) => [...new Set(a)];

async function assertSiteCapacity(businessId: string) {
  const b = await one("SELECT plan, trial_ends_at, subscription_status FROM businesses WHERE id=$1", [businessId]);
  requireActive(b);
  const max = limitsFor(b).maxSites;
  const n = Number((await one("SELECT count(*) FROM sites WHERE business_id=$1 AND NOT archived", [businessId])).count);
  if (n >= max) throw paymentRequired(`Your plan allows up to ${max} active sites. Upgrade or archive a site to add another.`);
}

sitesRouter.get("/", async (req, res) => {
  const includeArchived = req.query.archived === "1";
  const r = await query(
    `SELECT s.*, (SELECT max(visit_at) FROM visits v WHERE v.site_id=s.id AND v.status='submitted') AS last_visit_at,
            (SELECT count(*)::int FROM visits v WHERE v.site_id=s.id AND v.status='submitted') AS visit_count
       FROM sites s WHERE s.business_id=$1 ${includeArchived ? "" : "AND NOT s.archived"} ORDER BY s.archived, s.name`,
    [req.user!.business_id],
  );
  res.json({ sites: r.rows });
});

sitesRouter.get("/:id", async (req, res) => {
  const s = await one("SELECT * FROM sites WHERE id=$1 AND business_id=$2", [idParam(req.params.id), req.user!.business_id]);
  if (!s) throw notFound("Site not found");
  res.json({ site: s });
});

sitesRouter.post("/", requireOwner, async (req, res) => {
  const body = parse(siteSchema, req.body);
  await assertSiteCapacity(req.user!.business_id);
  const s = await one(
    `INSERT INTO sites (business_id,name,address,contact_name,contact_email,frequency,areas,checklist)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [req.user!.business_id, body.name, body.address, body.contact_name, body.contact_email, body.frequency, JSON.stringify(dedupe(body.areas)), JSON.stringify(dedupe(body.checklist))],
  );
  res.status(201).json({ id: s.id });
});

sitesRouter.put("/:id", requireOwner, async (req, res) => {
  const body = parse(siteSchema, req.body);
  const r = await query(
    `UPDATE sites SET name=$1,address=$2,contact_name=$3,contact_email=$4,frequency=$5,areas=$6,checklist=$7 WHERE id=$8 AND business_id=$9`,
    [body.name, body.address, body.contact_name, body.contact_email, body.frequency, JSON.stringify(dedupe(body.areas)), JSON.stringify(dedupe(body.checklist)), idParam(req.params.id), req.user!.business_id],
  );
  if (!r.rowCount) throw notFound("Site not found");
  res.json({ ok: true });
});

sitesRouter.post("/:id/archive", requireOwner, async (req, res) => {
  const r = await query("UPDATE sites SET archived=true WHERE id=$1 AND business_id=$2", [idParam(req.params.id), req.user!.business_id]);
  if (!r.rowCount) throw notFound("Site not found");
  res.json({ ok: true });
});

sitesRouter.post("/:id/restore", requireOwner, async (req, res) => {
  const id = idParam(req.params.id);
  const s = await one("SELECT archived FROM sites WHERE id=$1 AND business_id=$2", [id, req.user!.business_id]);
  if (!s) throw notFound("Site not found");
  if (s.archived) await assertSiteCapacity(req.user!.business_id);
  await query("UPDATE sites SET archived=false WHERE id=$1 AND business_id=$2", [id, req.user!.business_id]);
  res.json({ ok: true });
});
