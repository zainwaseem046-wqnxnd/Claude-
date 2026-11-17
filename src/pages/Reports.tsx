import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, downloadFile } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import type { Site, VisitListItem } from "../lib/types";
import { fmtDateTime, relative } from "../lib/format";
import { Alert, Empty, Icon, PageHeader, PageLoader, StatusChip, Spinner } from "../components/ui";

export function Reports() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") === "draft" ? "draft" : "submitted";
  const filters = { q: params.get("q") ?? "", site_id: params.get("site_id") ?? "", from: params.get("from") ?? "", to: params.get("to") ?? "", issues: params.get("issues") ?? "" };
  const page = Number(params.get("page") ?? 1);
  const [q, setQ] = useState(filters.q);
  const [dlError, setDlError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const qs = new URLSearchParams({ status, ...filters, page: String(page) }).toString();
  const { data, error, loading } = useAsync(() => api.get<{ visits: VisitListItem[]; total: number; pageSize: number }>(`/api/visits?${qs}`), [qs]);
  const sites = useAsync(() => api.get<{ sites: Site[] }>("/api/sites?archived=1"), []);

  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    next.delete("page");
    setParams(next, { replace: true });
  };

  async function download(id: string) {
    setBusy(id); setDlError("");
    try { await downloadFile(`/api/visits/${id}/pdf`, "cleaning-report.pdf"); } catch (e) { setDlError((e as Error).message); } finally { setBusy(null); }
  }
  async function exportCsv() {
    setBusy("csv"); setDlError("");
    const exportQs = new URLSearchParams(filters).toString();
    try { await downloadFile(`/api/visits/export.csv?${exportQs}`, "cleaning-reports.csv"); } catch (e) { setDlError((e as Error).message); } finally { setBusy(null); }
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader title="Reports" subtitle="Search, download and resend previous cleaning reports."
        action={me!.user.role === "owner" && me!.billing.limits.advancedReporting && status === "submitted" && (
          <button className="btn-secondary" onClick={exportCsv} disabled={busy === "csv"}>{busy === "csv" ? <Spinner /> : <Icon name="download" />}Export CSV</button>
        )} />

      <div className="mb-4 inline-flex rounded-xl bg-navy-50 p-1">
        {(["submitted", "draft"] as const).map((s) => (
          <button key={s} onClick={() => { const n = new URLSearchParams(params); if (s === "draft") n.set("status", "draft"); else n.delete("status"); n.delete("page"); setParams(n); }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${status === s ? "bg-white shadow-sm" : "text-navy-500"}`}>
            {s === "submitted" ? "Submitted" : "Awaiting submission"}
          </button>
        ))}
      </div>

      <div className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_1fr]">
        <form onSubmit={(e) => { e.preventDefault(); setFilter("q", q.trim()); }} className="relative">
          <Icon name="search" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-400" />
          <input className="input pl-11" placeholder="Search site, cleaner, notes…" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== filters.q && setFilter("q", q.trim())} aria-label="Search reports" />
        </form>
        <select className="input" value={filters.site_id} onChange={(e) => setFilter("site_id", e.target.value)} aria-label="Filter by site">
          <option value="">All sites</option>
          {sites.data?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}{s.archived ? " (archived)" : ""}</option>)}
        </select>
        <input className="input" type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} aria-label="From date" title="From date" />
        <input className="input" type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} aria-label="To date" title="To date" />
        {(hasFilters) && (
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
            {filters.issues === "open" && <span className="chip bg-amber-100 text-amber-900">Open issues only</span>}
            <button className="text-sm font-semibold text-brand-600" onClick={() => { setQ(""); setParams(status === "draft" ? { status } : {}); }}>Clear filters</button>
          </div>
        )}
      </div>

      {dlError && <div className="mb-4"><Alert>{dlError}</Alert></div>}

      {loading ? <PageLoader /> : error ? <Alert>{error}</Alert> : data!.visits.length === 0 ? (
        <Empty title={hasFilters ? "No matching reports" : status === "draft" ? "No drafts" : "No reports yet"}
          body={hasFilters ? "Try changing the search or filters." : status === "draft" ? "Every visit has been submitted." : "Submitted cleaning visits will appear here."}
          action={!hasFilters && status === "submitted" ? <Link to="/app/visits/new" className="btn-primary">Start a visit</Link> : undefined} />
      ) : (
        <>
          <p className="mb-2 text-sm text-navy-500">{data!.total} {data!.total === 1 ? "report" : "reports"}</p>
          <div className="card divide-y divide-navy-50">
            {data!.visits.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 p-4">
                <Link to={status === "draft" ? `/app/visits/${v.id}` : `/app/reports/${v.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{v.site_name}</div>
                  <div className="text-sm text-navy-500">
                    {status === "draft" ? `Draft · edited ${relative(v.updated_at)}` : fmtDateTime(v.visit_at)} · {v.cleaner_name || "No cleaner"} · {v.photo_count} photos
                  </div>
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  {v.has_issues && <span className={`chip ${v.issues_resolved ? "bg-navy-50 text-navy-500" : "bg-amber-100 text-amber-900"}`}>{v.issues_resolved ? "Issue resolved" : "Open issue"}</span>}
                  {v.last_sent_at && <span className="chip bg-navy-50 text-navy-600">Sent</span>}
                  <StatusChip done={Number(v.done_count)} total={v.task_count} />
                  {status === "submitted" ? (
                    <>
                      <button className="btn-secondary btn-sm" onClick={() => download(v.id)} disabled={busy === v.id} aria-label="Download PDF">
                        {busy === v.id ? <Spinner className="h-4 w-4" /> : <Icon name="download" className="h-4 w-4" />}PDF
                      </button>
                      <Link to={`/app/reports/${v.id}`} className="btn-secondary btn-sm">View</Link>
                    </>
                  ) : <Link to={`/app/visits/${v.id}`} className="btn-primary btn-sm">Continue</Link>}
                </div>
              </div>
            ))}
          </div>
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => { const n = new URLSearchParams(params); n.set("page", String(page - 1)); setParams(n); }}>Previous</button>
              <span className="text-sm text-navy-500">Page {page} of {pages}</span>
              <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => { const n = new URLSearchParams(params); n.set("page", String(page + 1)); setParams(n); }}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
