import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import type { Site, VisitListItem } from "../lib/types";
import { frequencyLabel } from "../lib/types";
import { relative } from "../lib/format";
import { Alert, Empty, Icon, PageHeader, PageLoader, Spinner } from "../components/ui";

export function NewVisit() {
  const { me } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const started = useRef(false);
  const { data, loading, error: loadError } = useAsync(async () => {
    const [sites, drafts] = await Promise.all([
      api.get<{ sites: Site[] }>("/api/sites"),
      api.get<{ visits: VisitListItem[] }>("/api/visits?status=draft"),
    ]);
    return { sites: sites.sites, drafts: drafts.visits };
  }, []);

  async function start(siteId: string) {
    setBusyId(siteId); setError("");
    try {
      const { id } = await api.post<{ id: string }>("/api/visits", { site_id: siteId });
      nav(`/app/visits/${id}`, { replace: true });
    } catch (e) { setError((e as Error).message); setBusyId(null); }
  }

  useEffect(() => {
    const site = params.get("site");
    if (site && !started.current) { started.current = true; start(site); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || (params.get("site") && !error)) return <PageLoader />;
  if (loadError) return <Alert>{loadError}</Alert>;
  const sites = data!.sites.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || s.address.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New cleaning visit" subtitle="Choose the site you're cleaning." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {!me!.billing.active && <div className="mb-4"><Alert kind="warning">Your plan is inactive, so new visits can't be started.</Alert></div>}

      {data!.drafts.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-navy-400">Continue a draft</h2>
          <div className="card divide-y divide-navy-50">
            {data!.drafts.map((d) => (
              <Link key={d.id} to={`/app/visits/${d.id}`} className="flex items-center justify-between gap-3 p-4">
                <div><div className="font-semibold">{d.site_name}</div><div className="text-sm text-navy-500">Started {relative(d.updated_at)} · {d.cleaner_name}</div></div>
                <Icon name="chevron" className="h-5 w-5 text-navy-300" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {data!.sites.length === 0 ? (
        <Empty title="No sites yet" body="A site needs to be added before a visit can be recorded."
          action={me!.user.role === "owner" ? <Link to="/app/sites/new" className="btn-primary">Add a site</Link> : undefined} />
      ) : (
        <>
          {data!.sites.length > 6 && (
            <div className="relative mb-3">
              <Icon name="search" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-400" />
              <input className="input pl-11" placeholder="Search sites" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          <div className="space-y-3">
            {sites.map((s) => (
              <button key={s.id} disabled={Boolean(busyId) || !me!.billing.active} onClick={() => start(s.id)}
                className="card flex w-full items-center gap-4 p-5 text-left transition hover:border-brand-500 active:bg-brand-50 disabled:opacity-60">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-600"><Icon name="building" className="h-6 w-6" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-bold">{s.name}</div>
                  <div className="truncate text-sm text-navy-500">{s.address || frequencyLabel(s.frequency)} · {s.checklist.length} tasks</div>
                </div>
                {busyId === s.id ? <Spinner className="h-6 w-6 text-brand-500" /> : <Icon name="chevron" className="h-5 w-5 text-navy-300" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
