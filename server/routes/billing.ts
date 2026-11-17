import { Router } from "express";
import { z } from "zod";
import { one, query } from "../db.js";
import { config } from "../config.js";
import { requireAuth, requireOwner } from "../lib/auth.js";
import { HttpError } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import { PLANS, PAID_PLANS, isActive, limitsFor } from "../lib/plans.js";
import { sendMail, escapeHtml } from "../lib/mail.js";

/**
 * Billing without a payment provider: owners request a plan, the request is emailed to
 * BILLING_CONTACT_EMAIL, and the operator activates it with `npm run set-plan` after payment.
 */
export const billingRouter = Router();
billingRouter.use(requireAuth);

billingRouter.get("/", async (req, res) => {
  const b = await one("SELECT plan, trial_ends_at, subscription_status, plan_requested, plan_requested_at FROM businesses WHERE id=$1", [req.user!.business_id]);
  const sites = Number((await one("SELECT count(*) FROM sites WHERE business_id=$1 AND NOT archived", [req.user!.business_id])).count);
  const users = Number((await one("SELECT count(*) FROM users WHERE business_id=$1", [req.user!.business_id])).count);
  res.json({
    plan: b.plan, trial_ends_at: b.trial_ends_at, subscription_status: b.subscription_status, active: isActive(b),
    limits: limitsFor(b), usage: { sites, users },
    plan_requested: b.plan_requested, plan_requested_at: b.plan_requested_at,
    requests_enabled: Boolean(config.billingContactEmail) || !config.isProd,
  });
});

billingRouter.post("/request", requireOwner, async (req, res) => {
  const { plan } = parse(z.object({ plan: z.enum(PAID_PLANS) }), req.body);
  const to = config.billingContactEmail || (config.isProd ? "" : "billing@localhost");
  if (!to) throw new HttpError(503, "Plan requests are not set up on this server yet (BILLING_CONTACT_EMAIL).");
  const b = await one("SELECT id, name, contact_email, phone, plan, subscription_status FROM businesses WHERE id=$1", [req.user!.business_id]);
  const p = PLANS[plan];
  const lines = [
    `${b.name} has requested the ${p.label} plan (£${p.priceGbp}/month).`,
    ``,
    `Requested by: ${req.user!.name} <${req.user!.email}>`,
    `Business contact: ${b.contact_email}${b.phone ? `, ${b.phone}` : ""}`,
    `Current plan: ${PLANS[b.plan as keyof typeof PLANS]?.label ?? b.plan} (${b.subscription_status ?? "no status"})`,
    ``,
    `After payment is arranged, activate it with:`,
    `  npm run set-plan -- ${req.user!.email} ${plan}`,
  ];
  await sendMail({
    to, replyTo: req.user!.email, subject: `Plan request: ${b.name} → ${p.label}`,
    text: lines.join("\n"),
    html: `<pre style="font-family:Menlo,Consolas,monospace;font-size:13px">${escapeHtml(lines.join("\n"))}</pre>`,
  });
  await query("UPDATE businesses SET plan_requested=$1, plan_requested_at=now() WHERE id=$2", [plan, b.id]);
  res.json({ ok: true });
});
