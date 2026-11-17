import { paymentRequired } from "./errors.js";

export type PlanId = "trial" | "starter" | "professional" | "business";

export interface PlanLimits {
  label: string;
  priceGbp: number;
  maxSites: number;
  maxUsers: number;
  branding: boolean;
  sharing: boolean;
  advancedReporting: boolean;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  trial: { label: "Free trial", priceGbp: 0, maxSites: 20, maxUsers: 1, branding: true, sharing: true, advancedReporting: false },
  starter: { label: "Starter", priceGbp: 19, maxSites: 5, maxUsers: 1, branding: false, sharing: false, advancedReporting: false },
  professional: { label: "Professional", priceGbp: 29, maxSites: 20, maxUsers: 1, branding: true, sharing: true, advancedReporting: false },
  business: { label: "Business", priceGbp: 49, maxSites: 100, maxUsers: 15, branding: true, sharing: true, advancedReporting: true },
};

export const PAID_PLANS = ["starter", "professional", "business"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

export interface BusinessBilling {
  plan: PlanId;
  trial_ends_at: Date | string;
  subscription_status: string | null;
}

export function isActive(b: BusinessBilling): boolean {
  if (b.plan === "trial") return new Date(b.trial_ends_at).getTime() > Date.now();
  return b.subscription_status === "active" || b.subscription_status === "trialing" || b.subscription_status === "past_due";
}

export function limitsFor(b: BusinessBilling): PlanLimits {
  return PLANS[b.plan] ?? PLANS.starter;
}

export function requireActive(b: BusinessBilling) {
  if (!isActive(b)) {
    throw paymentRequired(
      b.plan === "trial"
        ? "Your free trial has ended. Choose a plan to keep creating reports."
        : "Your subscription is not active. Update your billing to keep creating reports.",
      "subscription_inactive",
    );
  }
}

export function requireFeature(b: BusinessBilling, feature: "branding" | "sharing" | "advancedReporting") {
  if (!limitsFor(b)[feature]) {
    const names = { branding: "Company branding", sharing: "Client sharing links", advancedReporting: "Advanced reporting" };
    const needed = feature === "advancedReporting" ? "Business" : "Professional";
    throw paymentRequired(`${names[feature]} is available on the ${needed} plan and above.`);
  }
}
