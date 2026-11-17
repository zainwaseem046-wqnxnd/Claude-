import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import { fmtDateTime, relative, fmtDate } from "../lib/format";
import { Alert, Empty, Icon, PageHeader, PageLoader, StatusChip } from "../components/ui";

interface DashboardData {
  stats: { total_visits: number; visits_this_month: number; active_sites: number; open_issues: number; drafts: number };
  recent: { id: string; visit_at: string; cleaner_name: string; site_name: string; open_issue: boolean; task_count: number; done_count: number }[];
  drafts: { id: string; updated_at: string; cleaner_name: string; site_name: string }[];
  siteStats: { id: string; name: string; frequency: string; visits_30d: number; last_visit_at: string | null; open_issues: number; completion_pct: number | null }[] | null;
}

export function Dashboard() {
  const { me } = useAuth();
  const { data, error, loading } = useAsync(() => api.get<DashboardData>("/api/dashboard"), []);
  if (loading) return <PageLoader />;
  if (error || !data) return <Alert>{error}</Alert>;
  const s = data.stats;
  const firstName = me!.user.name.split(" ")[0];

  return (
    <div>
      <PageHeader title={`Hello, ${firstName}`} subtitle={me!.business.name}
        action={<Link to="/app/visits/new" className="btn-primary btn-lg hidden sm:inline-flex"><Icon name="plus" />New cleaning visit</Link>} />

      <Link to="/app/visits/new" className="btn-primary btn-lg mb-6 w-full sm:hidden"><Icon name="plus" />New cleaning visit</Link>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total visits" value={s.total_visits} to="/app/reports" />
        <Stat label="Completed this month" value={s.visits_this_month} to="/app/reports" accent />
        <Stat label="Sites serviced" value={s.active_sites} to="/app/sites" />
        <Stat label="Outstanding issues" value={s.open_issues} to="/app/reports?issues=open" warn={s.open_issues > 0} />
        <Stat label="Awaiting submission" value={s.drafts} to="/app/reports?status=draft" warn={s.drafts > 0} />
      </div>

      {s.active_sites === 0 && (
        <div className="mt-6">
          <Empty title="Add your first site" body="Create a site with its own checklist, then cleaners can start submitting visit reports."
            action={me!.user.role === "owner" ? <Link to="/app/sites/new" className="btn-primary">Add a site</Link> : undefined} />
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Recent reports</h2><Link to="/app/reports" className="text-sm font-semibold text-brand-600">View all</Link></div>
          {data.recent.length === 0 ? (
            <div className="card p-6 text-center text-navy-500">No reports submitted yet.</div>
          ) : (
            <div className="card divide-y divide-navy-50">
              {data.recent.map((r) => (
                <Link key={r.id} to={`/app/reports/${r.id}`} className="flex items-center gap-3 p-4 hover:bg-navy-50/50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.site_name}</div>
                    <div className="text-sm text-navy-500">{fmtDateTime(r.visit_at)} · {r.cleaner_name}</div>
                  </div>
                  {r.open_issue && <span className="chip bg-amber-100 text-amber-900">Issue</span>}
                  <StatusChip done={Number(r.done_count)} total={r.task_count} />
                  <Icon name="chevron" className="h-4 w-4 text-navy-300" />
                </Link>
              ))}
            </div>
          )}
        </section>
        <section>
          <h2 className="mb-3 text-lg font-bold">Reports awaiting submission</h2>
          {data.drafts.length === 0 ? (
            <div className="card p-6 text-center text-navy-500">No drafts. Everything has been submitted.</div>
          ) : (
            <div className="card divide-y divide-navy-50">
              {data.drafts.map((d) => (
                <Link key={d.id} to={`/app/visits/${d.id}`} className="flex items-center gap-3 p-4 hover:bg-navy-50/50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{d.site_name}</div>
                    <div className="text-sm text-navy-500">{d.cleaner_name} · edited {relative(d.updated_at)}</div>
                  </div>
                  <span className="btn-secondary btn-sm">Continue</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {data.siteStats && data.siteStats.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Site performance (last 30 days)</h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-navy-100 text-xs uppercase tracking-wide text-navy-400">
                <tr><th className="p-3">Site</th><th className="p-3">Visits</th><th className="p-3">Task completion</th><th className="p-3">Open issues</th><th className="p-3">Last visit</th></tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {data.siteStats.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 font-semibold">{r.name}</td>
                    <td className="p-3">{r.visits_30d}</td>
                    <td className="p-3">{r.completion_pct == null ? "—" : `${r.completion_pct}%`}</td>
                    <td className={`p-3 ${r.open_issues ? "font-semibold text-amber-700" : ""}`}>{r.open_issues}</td>
                    <td className="p-3 text-navy-500">{r.last_visit_at ? fmtDate(r.last_visit_at) : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, to, accent, warn }: { label: string; value: number; to: string; accent?: boolean; warn?: boolean }) {
  return (
    <Link to={to} className={`card block p-4 transition hover:border-navy-200 ${accent ? "border-brand-200 bg-brand-50/60" : ""} ${warn ? "border-amber-200 bg-amber-50/60" : ""}`}>
      <div className="text-3xl font-extrabold">{value}</div>
      <div className="mt-1 text-sm font-medium text-navy-500">{label}</div>
    </Link>
  );
}
