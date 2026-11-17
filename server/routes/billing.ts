import express, { Router } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { one, query } from "../db.js";
import { config } from "../config.js";
import { requireAuth, requireOwner } from "../lib/auth.js";
import { HttpError, badRequest, forbidden } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import { PLANS, PAID_PLANS, type PaidPlan, isActive, limitsFor } from "../lib/plans.js";

let stripeClient: Stripe | null = null;

export function stripeMode(): "test" | "live" | "unconfigured" {
  const k = config.stripe.secretKey;
  if (!k) return "unconfigured";
  return /^(sk|rk)_live_/.test(k) ? "live" : "test";
}

function stripe(): Stripe {
  const mode = stripeMode();
  if (mode === "unconfigured") throw new HttpError(503, "Payments are not configured yet (STRIPE_SECRET_KEY is missing).");
  if (mode === "live" && !config.stripe.allowLive) {
    throw new HttpError(503, "Live Stripe keys are disabled. Finish testing in test mode, then set STRIPE_ALLOW_LIVE=true.");
  }
  // fetch-based client honours standard proxy settings (NODE_USE_ENV_PROXY) and works on all modern Node hosts
  stripeClient ??= new Stripe(config.stripe.secretKey, { httpClient: Stripe.createFetchHttpClient() });
  return stripeClient;
}

function lineItem(plan: PaidPlan): Stripe.Checkout.SessionCreateParams.LineItem {
  const priceId = config.stripe.prices[plan];
  if (priceId) return { price: priceId, quantity: 1 };
  return {
    quantity: 1,
    price_data: {
      currency: "gbp",
      unit_amount: PLANS[plan].priceGbp * 100,
      recurring: { interval: "month" },
      product_data: { name: `CleaningProof ${PLANS[plan].label}` },
    },
  };
}

/** Applies a Stripe subscription's state to the business it belongs to. */
async function applySubscription(sub: Stripe.Subscription, fallbackBusinessId?: string) {
  const businessId = sub.metadata?.business_id || fallbackBusinessId;
  const plan = sub.metadata?.plan as PaidPlan | undefined;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const set: string[] = ["subscription_status=$1", "stripe_subscription_id=$2", "stripe_customer_id=$3"];
  const params: unknown[] = [sub.status, sub.id, customerId];
  if (plan && PAID_PLANS.includes(plan) && sub.status !== "canceled") { params.push(plan); set.push(`plan=$${params.length}`); }
  if (businessId) {
    params.push(businessId);
    await query(`UPDATE businesses SET ${set.join(",")} WHERE id=$${params.length}`, params);
  } else {
    params.push(customerId);
    await query(`UPDATE businesses SET ${set.join(",")} WHERE stripe_customer_id=$${params.length}`, params);
  }
}

export const billingRouter = Router();
billingRouter.use(requireAuth);

billingRouter.get("/", async (req, res) => {
  const b = await one("SELECT plan, trial_ends_at, subscription_status, stripe_customer_id FROM businesses WHERE id=$1", [req.user!.business_id]);
  const sites = Number((await one("SELECT count(*) FROM sites WHERE business_id=$1 AND NOT archived", [req.user!.business_id])).count);
  const users = Number((await one("SELECT count(*) FROM users WHERE business_id=$1", [req.user!.business_id])).count);
  res.json({
    plan: b.plan, trial_ends_at: b.trial_ends_at, subscription_status: b.subscription_status, active: isActive(b),
    limits: limitsFor(b), usage: { sites, users }, has_customer: Boolean(b.stripe_customer_id), stripe_mode: stripeMode(),
  });
});

const originOf = (req: express.Request) => {
  const o = req.get("origin");
  return o && /^https?:\/\/[^/]+$/.test(o) ? o : config.appUrl;
};

billingRouter.post("/checkout", requireOwner, async (req, res) => {
  const { plan } = parse(z.object({ plan: z.enum(PAID_PLANS) }), req.body);
  const b = await one("SELECT id, contact_email, stripe_customer_id, stripe_subscription_id, subscription_status FROM businesses WHERE id=$1", [req.user!.business_id]);
  if (b.stripe_subscription_id && ["active", "trialing", "past_due"].includes(b.subscription_status)) {
    throw badRequest("You already have a subscription. Use “Manage billing” to change plan.");
  }
  const origin = originOf(req);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [lineItem(plan)],
    ...(b.stripe_customer_id ? { customer: b.stripe_customer_id } : { customer_email: b.contact_email }),
    client_reference_id: b.id,
    metadata: { business_id: b.id, plan },
    subscription_data: { metadata: { business_id: b.id, plan } },
    success_url: `${origin}/app/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/app/settings?checkout=cancelled`,
  });
  res.json({ url: session.url });
});

/** Confirms a completed checkout on return (works even before webhooks are configured). */
billingRouter.post("/sync", requireOwner, async (req, res) => {
  const { session_id } = parse(z.object({ session_id: z.string().regex(/^cs_[A-Za-z0-9_]+$/) }), req.body);
  const s = await stripe().checkout.sessions.retrieve(session_id, { expand: ["subscription"] });
  if (s.metadata?.business_id !== req.user!.business_id) throw forbidden("This checkout belongs to another account");
  if (s.subscription && typeof s.subscription !== "string") await applySubscription(s.subscription, req.user!.business_id);
  res.json({ ok: true, status: s.status });
});

billingRouter.post("/portal", requireOwner, async (req, res) => {
  const b = await one("SELECT stripe_customer_id FROM businesses WHERE id=$1", [req.user!.business_id]);
  if (!b.stripe_customer_id) throw badRequest("No billing account yet. Choose a plan first.");
  const portal = await stripe().billingPortal.sessions.create({ customer: b.stripe_customer_id, return_url: `${originOf(req)}/app/settings` });
  res.json({ url: portal.url });
});

/** Stripe webhook: must receive the raw body for signature verification. */
export const stripeWebhook = [
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req: express.Request, res: express.Response) => {
    if (!config.stripe.webhookSecret) throw new HttpError(503, "Webhook secret not configured");
    let event: Stripe.Event;
    try {
      event = stripe().webhooks.constructEvent(req.body, req.get("stripe-signature") ?? "", config.stripe.webhookSecret);
    } catch {
      throw badRequest("Invalid signature");
    }
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.mode === "subscription" && typeof s.subscription === "string") {
          const sub = await stripe().subscriptions.retrieve(s.subscription);
          await applySubscription(sub, s.metadata?.business_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object);
        break;
    }
    res.json({ received: true });
  },
];
