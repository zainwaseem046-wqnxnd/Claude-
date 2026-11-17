import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { FREQUENCIES, type Site } from "../lib/types";
import { Alert, PageHeader, PageLoader, Spinner } from "../components/ui";

const TEMPLATES: Record<string, { areas: string[]; tasks: string[] }> = {
  Office: {
    areas: ["Reception", "Open-plan office", "Meeting rooms", "Kitchen", "Toilets", "Stairs & corridors"],
    tasks: ["Empty all bins and replace liners", "Vacuum carpets", "Mop hard floors", "Wipe desks and work surfaces", "Clean and disinfect toilets and sinks", "Restock toilet roll, soap and hand towels", "Clean kitchen surfaces, sink and microwave", "Load/unload dishwasher", "Clean glass doors and partitions", "Dust skirting boards and window sills"],
  },
  "Communal building": {
    areas: ["Entrance lobby", "Stairwells", "Landings & corridors", "Lift", "Bin store"],
    tasks: ["Sweep and mop entrance lobby", "Vacuum stairs and landings", "Wipe handrails and door handles", "Clean lift interior and mirrors", "Clean entrance glass", "Remove cobwebs", "Check and clear bin store area", "Report any lights not working"],
  },
  Gym: {
    areas: ["Gym floor", "Changing rooms", "Showers", "Toilets", "Reception"],
    tasks: ["Disinfect cardio and weights equipment", "Mop gym floor", "Clean mirrors", "Clean and disinfect showers", "Clean toilets and sinks", "Empty bins", "Restock soap, paper and sanitiser", "Wipe lockers and benches"],
  },
  Shop: {
    areas: ["Shop floor", "Fitting rooms", "Stockroom", "Staff room", "Toilets"],
    tasks: ["Sweep and mop shop floor", "Clean entrance doors and glass", "Dust shelving and displays", "Clean fitting rooms", "Clean staff kitchen", "Clean and restock toilets", "Empty all bins"],
  },
};

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

export function SiteForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({ name: "", address: "", contact_name: "", contact_email: "", frequency: "weekly", areas: "", checklist: "" });

  useEffect(() => {
    if (!id) return;
    api.get<{ site: Site }>(`/api/sites/${id}`)
      .then(({ site }) => setF({ name: site.name, address: site.address, contact_name: site.contact_name, contact_email: site.contact_email, frequency: site.frequency, areas: site.areas.join("\n"), checklist: site.checklist.join("\n") }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const body = { ...f, areas: lines(f.areas), checklist: lines(f.checklist) };
    try {
      if (id) await api.put(`/api/sites/${id}`, body);
      else await api.post("/api/sites", body);
      nav("/app/sites");
    } catch (err) { setError((err as Error).message); window.scrollTo({ top: 0, behavior: "smooth" }); } finally { setBusy(false); }
  }

  if (loading) return <PageLoader />;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={id ? "Edit site" : "Add a site"} subtitle={params.get("welcome") ? "Welcome! Start by adding a building you clean." : "Each site has its own areas and checklist."} />
      <form onSubmit={submit} className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <div className="card space-y-4 p-5">
          <div><label className="label" htmlFor="name">Site name *</label><input id="name" className="input" required maxLength={120} value={f.name} onChange={set("name")} placeholder="e.g. Harbour House Offices" /></div>
          <div><label className="label" htmlFor="addr">Address</label><textarea id="addr" className="input" rows={2} maxLength={300} value={f.address} onChange={set("address")} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="cn">Customer / property manager</label><input id="cn" className="input" maxLength={120} value={f.contact_name} onChange={set("contact_name")} /></div>
            <div><label className="label" htmlFor="ce">Contact email</label><input id="ce" className="input" type="email" maxLength={254} value={f.contact_email} onChange={set("contact_email")} /><p className="hint">Reports can be emailed here.</p></div>
          </div>
          <div><label className="label" htmlFor="fq">Cleaning frequency</label>
            <select id="fq" className="input" value={f.frequency} onChange={set("frequency")}>{FREQUENCIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
          </div>
        </div>

        <div className="card space-y-4 p-5">
          <div>
            <div className="label">Start from a template</div>
            <div className="flex flex-wrap gap-2">
              {Object.keys(TEMPLATES).map((t) => (
                <button type="button" key={t} className="btn-secondary btn-sm"
                  onClick={() => { if ((f.areas || f.checklist) && !confirm("Replace the current areas and checklist?")) return; setF({ ...f, areas: TEMPLATES[t].areas.join("\n"), checklist: TEMPLATES[t].tasks.join("\n") }); }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div><label className="label" htmlFor="areas">Areas</label><textarea id="areas" className="input font-mono text-sm" rows={5} value={f.areas} onChange={set("areas")} placeholder={"Reception\nKitchen\nToilets"} /><p className="hint">One area per line. Cleaners tick the areas they cleaned.</p></div>
          <div><label className="label" htmlFor="tasks">Checklist tasks *</label><textarea id="tasks" className="input font-mono text-sm" rows={9} required value={f.checklist} onChange={set("checklist")} placeholder={"Empty all bins\nVacuum carpets\nClean toilets"} /><p className="hint">One task per line ({lines(f.checklist).length} tasks).</p></div>
        </div>

        <div className="flex gap-3">
          <button className="btn-primary btn-lg flex-1 sm:flex-none" disabled={busy}>{busy && <Spinner />}{id ? "Save changes" : "Create site"}</button>
          <Link to="/app/sites" className="btn-secondary btn-lg">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
