import type { ReactNode } from "react";
import { Icon } from "./ui";

export const PRICING = [
  { id: "starter", name: "Starter", price: 19, blurb: "For sole traders getting started.", features: ["Up to 5 sites", "Unlimited cleaning reports", "Photo checklists", "PDF downloads"] },
  { id: "professional", name: "Professional", price: 29, blurb: "For growing cleaning companies.", popular: true, features: ["Up to 20 sites", "Unlimited reports", "Your company logo on reports", "Private client sharing links", "Email reports to clients"] },
  { id: "business", name: "Business", price: 49, blurb: "For teams with multiple cleaners.", features: ["Up to 100 sites", "Multiple cleaner logins", "Advanced reporting & CSV export", "Per-site completion stats", "Everything in Professional"] },
] as const;

export function PricingTable({ renderAction }: { renderAction: (planId: string, popular: boolean) => ReactNode }) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {PRICING.map((p) => {
        const popular = "popular" in p && p.popular;
        return (
          <div key={p.id} className={`card relative flex flex-col p-6 ${popular ? "border-2 border-brand-500 shadow-lg" : ""}`}>
            {popular && <span className="chip absolute -top-3 left-6 bg-brand-500 text-white">Most popular</span>}
            <h3 className="text-lg font-bold">{p.name}</h3>
            <p className="mt-1 text-sm text-navy-500">{p.blurb}</p>
            <p className="mt-5"><span className="text-4xl font-extrabold">£{p.price}</span><span className="text-navy-500">/month</span></p>
            <ul className="mt-6 flex-1 space-y-3">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[15px]">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Icon name="check" className="h-3.5 w-3.5" /></span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-7">{renderAction(p.id, Boolean(popular))}</div>
          </div>
        );
      })}
    </div>
  );
}
