import { Link } from "react-router-dom";
import { Logo } from "../components/ui";
import { PricingTable } from "../components/PricingTable";

export function Pricing() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-navy-100"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4"><Logo /><Link to="/signup" className="btn-primary btn-sm">Start free trial</Link></div></header>
      <main className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-center text-4xl font-extrabold">Pricing</h1>
        <p className="mt-3 text-center text-navy-600">Start with a 14-day free trial with Professional features. Prices exclude VAT. Cancel any time.</p>
        <div className="mt-12"><PricingTable renderAction={(_id, popular) => <Link to="/signup" className={`${popular ? "btn-primary" : "btn-secondary"} w-full`}>Start free trial</Link>} /></div>
      </main>
    </div>
  );
}
