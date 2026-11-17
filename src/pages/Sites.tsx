import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import type { Site } from "../lib/types";
import { frequencyLabel } from "../lib/types";
import { fmtDate } from "../lib/format";
import { Alert, Empty, Icon, PageHeader, PageLoader } from "../components/ui";

export function Sites() {
  const { me } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const [actionError, setActionError] = useState("");
  const { data, error, loading, reload } = useAsync(() => api.get<{ sites: Site[] }>(`/api/sites${showArchived ? "?archived=1" : ""}`), [showArchived]);
  const owner = me!.user.role === "owner";
  const limits = me!.billing.limits;

  async function toggleArchive(s: Site) {
    setActionError("");
    if (!s.archived && !confirm(`Archive ${s.name}? Its reports are kept, but no new visits can be started.`)) return;
    try {
      await api.post(`/api/sites/${s.id}/${s.archived ? "restore" : "archive"}`);
      reload();
    } catch (e) { setActionError((e as Error).message); }
  }

  const active = data?.sites.filter((s) => !s.archived).length ?? 0;
  return (
    <div>
      <PageHeader title="Sites" subtitle={data ? `${active} of ${limits.maxSites} active sites on your plan` : undefined}
        action={owner && <Link to="/app/sites/new" className="btn-primary"><Icon name="plus" />Add site</Link>} />
      {actionError && <div className="mb-4"><Alert>{actionError}</Alert></div>}
      {loading ? <PageLoader /> : error ? <Alert>{error}</Alert> : data!.sites.length === 0 ? (
        <Empty title="No sites yet" body="Add the buildings you clean, each with its own checklist." action={owner && <Link to="/app/sites/new" className="btn-primary">Add your first site</Link>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data!.sites.map((s) => (
            <div key={s.id} className={`card p-5 ${s.archived ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold">{s.name}</h3>
                  <p className="text-sm text-navy-500">{s.address || "No address"}</p>
                </div>
                {s.archived ? <span className="chip bg-navy-100 text-navy-600">Archived</span> : <span className="chip bg-brand-50 text-brand-700">{frequencyLabel(s.frequency)}</span>}
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-navy-400">Tasks</dt><dd className="font-semibold">{s.checklist.length}</dd></div>
                <div><dt className="text-navy-400">Visits</dt><dd className="font-semibold">{s.visit_count}</dd></div>
                <div><dt className="text-navy-400">Last visit</dt><dd className="font-semibold">{s.last_visit_at ? fmtDate(s.last_visit_at) : "—"}</dd></div>
              </dl>
              {s.contact_name && <p className="mt-3 text-sm text-navy-600">Contact: {s.contact_name}{s.contact_email && ` · ${s.contact_email}`}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {!s.archived && <Link to={`/app/visits/new?site=${s.id}`} className="btn-primary btn-sm">Start visit</Link>}
                <Link to={`/app/reports?site_id=${s.id}`} className="btn-secondary btn-sm">Reports</Link>
                {owner && !s.archived && <Link to={`/app/sites/${s.id}/edit`} className="btn-secondary btn-sm">Edit</Link>}
                {owner && <button onClick={() => toggleArchive(s)} className="btn-ghost btn-sm">{s.archived ? "Restore" : "Archive"}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <label className="mt-6 inline-flex items-center gap-2 text-sm text-navy-600">
        <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived sites
      </label>
    </div>
  );
}
