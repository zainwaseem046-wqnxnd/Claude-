import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAsync } from "../lib/useAsync";
import { compressImage } from "../lib/image";
import type { Limits, PlanId } from "../lib/types";
import { fmtDate } from "../lib/format";
import { PricingTable } from "../components/PricingTable";
import { Alert, PageHeader, PageLoader, Spinner, Icon } from "../components/ui";

export function Settings() {
  const { me } = useAuth();
  if (me!.user.role !== "owner") return <Navigate to="/app" replace />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" />
      <BusinessDetails />
      <Branding />
      <Billing />
      <Team />
    </div>
  );
}

function Card({ id, title, subtitle, children }: { id?: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 p-5 sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {subtitle && <p className="text-sm text-navy-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BusinessDetails() {
  const { me, refresh } = useAuth();
  const b = me!.business;
  const [f, setF] = useState({ name: b.name, contact_email: b.contact_email, phone: b.phone, address: b.address, website: b.website });
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await api.put("/api/business", f); await refresh(); setMsg({ kind: "success", text: "Business details saved." }); }
    catch (err) { setMsg({ kind: "error", text: (err as Error).message }); } finally { setBusy(false); }
  }
  return (
    <Card title="Business details" subtitle="Shown at the top of every report.">
      <form onSubmit={save} className="space-y-4">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <div><label className="label" htmlFor="bn">Business name</label><input id="bn" className="input" required maxLength={120} value={f.name} onChange={set("name")} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="be">Contact email</label><input id="be" className="input" type="email" required value={f.contact_email} onChange={set("contact_email")} /><p className="hint">Client replies go here.</p></div>
          <div><label className="label" htmlFor="bp">Phone</label><input id="bp" className="input" type="tel" maxLength={40} value={f.phone} onChange={set("phone")} /></div>
        </div>
        <div><label className="label" htmlFor="ba">Address</label><textarea id="ba" className="input" rows={2} maxLength={300} value={f.address} onChange={set("address")} /></div>
        <div><label className="label" htmlFor="bw">Website</label><input id="bw" className="input" maxLength={200} value={f.website} onChange={set("website")} placeholder="www.example.co.uk" /></div>
        <button className="btn-primary" disabled={busy}>{busy && <Spinner />}Save details</button>
      </form>
    </Card>
  );
}

function Branding() {
  const { me, refresh } = useAuth();
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState(0);
  const allowed = me!.billing.limits.branding;
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const isPng = file.type === "image/png";
      const blob = isPng && file.size < 2_000_000 ? file : await compressImage(file, 800, 0.9);
      const fd = new FormData(); fd.append("file", blob, isPng ? "logo.png" : "logo.jpg");
      await api.upload("/api/business/logo", fd);
      await refresh(); setV((x) => x + 1);
      setMsg({ kind: "success", text: "Logo updated." });
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await api.del("/api/business/logo"); await refresh(); } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); } finally { setBusy(false); }
  }
  return (
    <Card title="Company branding" subtitle="Your logo on PDF reports and client links.">
      {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      {!allowed ? (
        <p className="text-sm text-navy-600">Company branding is available on the Professional plan and above. <a href="#billing" className="font-semibold text-brand-600">Upgrade</a></p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-40 items-center justify-center rounded-xl border border-navy-100 bg-navy-50/50 p-2">
            {me!.business.has_logo ? <img src={`/api/business/logo?v=${v}`} alt="Company logo" className="max-h-full max-w-full object-contain" /> : <span className="text-sm text-navy-400">No logo</span>}
          </div>
          <label className="btn-secondary cursor-pointer">
            {busy ? <Spinner /> : <Icon name="camera" />}{me!.business.has_logo ? "Replace logo" : "Upload logo"}
            <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {me!.business.has_logo && <button className="btn-ghost" onClick={remove} disabled={busy}>Remove</button>}
          <p className="hint w-full">PNG or JPEG, up to 8 MB.</p>
        </div>
      )}
    </Card>
  );
}

interface BillingInfo { plan: PlanId; trial_ends_at: string; subscription_status: string | null; active: boolean; limits: Limits; usage: { sites: number; users: number }; plan_requested: string | null; plan_requested_at: string | null; requests_enabled: boolean }

function Billing() {
  const { me } = useAuth();
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, reload } = useAsync(() => api.get<BillingInfo>("/api/billing"), []);

  async function request(plan: string) {
    setBusy(plan); setMsg(null);
    try {
      await api.post("/api/billing/request", { plan });
      await reload();
      setMsg({ kind: "success", text: `Request sent. We'll contact you at ${me!.user.email} to arrange payment and activate your plan.` });
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); } finally { setBusy(null); }
  }

  if (loading || !data) return <Card id="billing" title="Plan & billing"><PageLoader /></Card>;
  const label = (id: string) => id[0].toUpperCase() + id.slice(1);
  return (
    <Card id="billing" title="Plan & billing" subtitle="Monthly plans, invoiced directly. No card details are stored in CleaningProof.">
      {msg && <div className="mb-4"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      <div className="mb-5 rounded-xl bg-navy-50/70 p-4">
        <div className="font-bold">{data.limits.label}{data.plan !== "trial" && ` – £${data.limits.priceGbp}/month`}{!data.active && <span className="chip ml-2 bg-amber-100 text-amber-900">Inactive</span>}</div>
        <div className="text-sm text-navy-500">
          {data.plan === "trial" ? (data.active ? `Free trial until ${fmtDate(data.trial_ends_at)}` : `Trial ended ${fmtDate(data.trial_ends_at)}`) : data.active ? "Active" : "Not active"}
          {" · "}{data.usage.sites}/{data.limits.maxSites} sites · {data.usage.users}/{data.limits.maxUsers} users
        </div>
        {data.plan_requested && data.plan_requested_at && (
          <div className="mt-2 text-sm font-medium text-brand-700">{label(data.plan_requested)} plan requested on {fmtDate(data.plan_requested_at)}. We'll be in touch to activate it.</div>
        )}
      </div>
      {!data.requests_enabled ? (
        <Alert kind="info">Plan changes are not set up on this server yet.</Alert>
      ) : (
        <PricingTable renderAction={(id, popular) => {
          const current = data.plan === id && data.active;
          return (
            <button className={`${popular ? "btn-primary" : "btn-secondary"} w-full`} disabled={Boolean(busy) || current || data.plan_requested === id} onClick={() => request(id)}>
              {busy === id && <Spinner />}{current ? "Current plan" : data.plan_requested === id ? "Requested" : `Request ${label(id)}`}
            </button>
          );
        }} />
      )}
    </Card>
  );
}

function Team() {
  const { me } = useAuth();
  const allowed = me!.billing.limits.maxUsers > 1;
  const { data, reload } = useAsync(() => api.get<{ members: { id: string; name: string; email: string; role: string }[] }>("/api/team"), []);
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function add(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await api.post("/api/team", f); setF({ name: "", email: "", password: "" }); await reload(); setMsg({ kind: "success", text: `${f.name} can now log in with ${f.email}.` }); }
    catch (err) { setMsg({ kind: "error", text: (err as Error).message }); } finally { setBusy(false); }
  }
  async function remove(id: string, name: string) {
    if (!confirm(`Remove ${name}? Their submitted reports are kept.`)) return;
    try { await api.del(`/api/team/${id}`); await reload(); } catch (err) { setMsg({ kind: "error", text: (err as Error).message }); }
  }
  return (
    <Card title="Team" subtitle="Cleaner logins can start visits and view reports, but can't change sites, settings or billing.">
      {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      <ul className="mb-4 divide-y divide-navy-50">
        {data?.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0"><div className="truncate font-semibold">{m.name}</div><div className="truncate text-sm text-navy-500">{m.email}</div></div>
            <div className="flex items-center gap-2">
              <span className={`chip ${m.role === "owner" ? "bg-navy-900 text-white" : "bg-navy-50 text-navy-600"}`}>{m.role === "owner" ? "Owner" : "Cleaner"}</span>
              {m.role !== "owner" && <button className="btn-ghost btn-sm" onClick={() => remove(m.id, m.name)} aria-label={`Remove ${m.name}`}><Icon name="trash" className="h-4 w-4" /></button>}
            </div>
          </li>
        ))}
      </ul>
      {!allowed ? (
        <p className="text-sm text-navy-600">Multiple cleaner logins are available on the Business plan. <a href="#billing" className="font-semibold text-brand-600">Upgrade</a></p>
      ) : (
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input className="input" required placeholder="Name" maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Cleaner name" />
          <input className="input" required type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="Cleaner email" />
          <input className="input" required type="password" minLength={8} placeholder="Temporary password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} aria-label="Temporary password" />
          <button className="btn-primary" disabled={busy}>{busy && <Spinner />}Add</button>
        </form>
      )}
    </Card>
  );
}
