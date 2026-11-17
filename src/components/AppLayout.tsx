import { NavLink, Outlet, Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Icon, Logo, PageLoader } from "./ui";
import { fmtDate } from "../lib/format";

const nav = [
  { to: "/app", label: "Dashboard", icon: "home", end: true },
  { to: "/app/visits/new", label: "New visit", icon: "plus" },
  { to: "/app/reports", label: "Reports", icon: "file" },
  { to: "/app/sites", label: "Sites", icon: "building" },
  { to: "/app/settings", label: "Settings", icon: "settings", ownerOnly: true },
];

export function AppLayout() {
  const { me, loading, logout } = useAuth();
  const navigate = useNavigate();
  if (loading) return <PageLoader />;
  if (!me) return <Navigate to="/login" replace />;
  const items = nav.filter((n) => !n.ownerOnly || me.user.role === "owner");
  const trialDays = Math.ceil((new Date(me.business.trial_ends_at).getTime() - Date.now()) / 864e5);

  return (
    <div className="min-h-screen bg-navy-50/40">
      <header className="sticky top-0 z-30 border-b border-navy-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo to="/app" />
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "bg-navy-50 text-navy-900" : "text-navy-500 hover:text-navy-900"}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-navy-500 lg:inline">{me.business.name}</span>
            <button className="btn-ghost btn-sm" onClick={async () => { await logout(); navigate("/login"); }} aria-label="Log out">
              <Icon name="logout" className="h-4 w-4" /><span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      {!me.billing.active ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-900">
          {me.business.plan === "trial" ? "Your free trial has ended." : "Your subscription is not active."} You can still view and download reports.{" "}
          {me.user.role === "owner" && <Link to="/app/settings#billing" className="font-bold underline">Choose a plan</Link>}
        </div>
      ) : me.business.plan === "trial" && trialDays <= 7 ? (
        <div className="border-b border-navy-100 bg-white px-4 py-2 text-center text-sm text-navy-600">
          Free trial ends {fmtDate(me.business.trial_ends_at)}.{" "}
          {me.user.role === "owner" && <Link to="/app/settings#billing" className="font-semibold text-brand-600 underline">Choose a plan</Link>}
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-12">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-navy-100 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${isActive ? "text-brand-600" : "text-navy-400"}`}>
              {n.icon === "plus" ? (
                <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg ring-4 ring-white"><Icon name="plus" className="h-6 w-6" /></span>
              ) : <Icon name={n.icon} className="h-6 w-6" />}
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
