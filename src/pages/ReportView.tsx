import { useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { api, downloadFile } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import type { Limits, Photo, Visit } from "../lib/types";
import { fmtDateTime } from "../lib/format";
import { ReportBody } from "../components/ReportBody";
import { Alert, Icon, PageLoader, Spinner } from "../components/ui";

interface Resp { visit: Visit; site: { id: string; name: string; address: string; contact_name: string; contact_email: string }; photos: Photo[]; features: Limits; emailDelivery: boolean }

export function ReportView() {
  const { id } = useParams();
  const { me } = useAuth();
  const [params] = useSearchParams();
  const { data, error, loading, reload } = useAsync(() => api.get<Resp>(`/api/visits/${id}`), [id]);
  const [msg, setMsg] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(params.get("submitted") ? { kind: "success", text: "Report submitted. Download the PDF or send it to your client." } : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const owner = me!.user.role === "owner";

  if (loading) return <PageLoader />;
  if (error || !data) return <Alert>{error}</Alert>;
  if (data.visit.status === "draft") return <Navigate to={`/app/visits/${id}`} replace />;
  const v = data.visit;
  const shareUrl = v.share_token ? `${window.location.origin}/r/${v.share_token}` : "";
  const email = to ?? data.site.contact_email;

  async function run(key: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(key); setMsg(null);
    try { await fn(); if (success) setMsg({ kind: "success", text: success }); } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); } finally { setBusy(null); }
  }

  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setMsg({ kind: "success", text: "Private link copied to clipboard." }); }
    catch { setMsg({ kind: "info", text: url }); }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/app/reports" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-500 hover:text-navy-900">← All reports</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{data.site.name}</h1>
          <p className="text-navy-500">Report ref {v.id.slice(0, 8).toUpperCase()} · submitted {v.submitted_at && fmtDateTime(v.submitted_at)}</p>
        </div>
        <button className="btn-primary" disabled={busy === "pdf"} onClick={() => run("pdf", () => downloadFile(`/api/visits/${id}/pdf`, "cleaning-report.pdf"))}>
          {busy === "pdf" ? <Spinner /> : <Icon name="download" />}Download PDF
        </button>
      </div>

      {msg && <div className="mb-4 break-all"><Alert kind={msg.kind}>{msg.text}</Alert></div>}

      {owner && (
        <div className="card mb-5 space-y-5 p-5">
          <div>
            <h2 className="flex items-center gap-2 font-bold"><Icon name="mail" />Send to client</h2>
            <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run("send", async () => { await api.post(`/api/visits/${id}/send`, { to: email }); await reload(); }, `Report sent to ${email}.${data.emailDelivery ? "" : " (Development mode: the email was logged on the server, not delivered.)"}`); }}>
              <input className="input flex-1" type="email" required placeholder="client@example.com" value={email} onChange={(e) => setTo(e.target.value)} aria-label="Client email" />
              <button className="btn-navy" disabled={busy === "send"}>{busy === "send" ? <Spinner /> : <Icon name="mail" />}{v.last_sent_at ? "Resend" : "Send"}</button>
            </form>
            <p className="hint">{v.last_sent_at ? `Last sent to ${v.last_sent_to} on ${fmtDateTime(v.last_sent_at)}. ` : ""}The PDF is attached{data.features.sharing ? " with a private link to view online" : ""}.</p>
          </div>

          <div className="border-t border-navy-50 pt-5">
            <h2 className="flex items-center gap-2 font-bold"><Icon name="link" />Private client link</h2>
            {!data.features.sharing ? (
              <p className="mt-2 text-sm text-navy-500">Client sharing links are available on the Professional plan and above. <Link to="/app/settings#billing" className="font-semibold text-brand-600">Upgrade</Link></p>
            ) : v.share_token ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input className="input flex-1 text-sm" readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label="Share link" />
                  <button className="btn-secondary" onClick={() => copyLink(shareUrl)}>Copy link</button>
                </div>
                <div className="flex gap-3 text-sm">
                  <a href={shareUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-600">Open client view</a>
                  <button className="font-semibold text-red-700" onClick={() => confirm("Revoke this link? Anyone using it will lose access.") && run("revoke", async () => { await api.del(`/api/visits/${id}/share`); await reload(); }, "Link revoked.")}>Revoke link</button>
                </div>
                <p className="hint">Anyone with this link can view only this report. No account needed.</p>
              </div>
            ) : (
              <button className="btn-secondary mt-3" disabled={busy === "share"} onClick={() => run("share", async () => { const r = await api.post<{ token: string }>(`/api/visits/${id}/share`); await reload(); await copyLink(`${window.location.origin}/r/${r.token}`); })}>
                {busy === "share" ? <Spinner /> : <Icon name="link" />}Create private link
              </button>
            )}
          </div>

          {v.issues && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-50 pt-5">
              <div><h2 className="font-bold">Reported issues</h2><p className="text-sm text-navy-500">{v.issues_resolved ? "Marked as resolved." : "Open: shown on your dashboard until resolved."}</p></div>
              <button className="btn-secondary btn-sm" disabled={busy === "issue"} onClick={() => run("issue", async () => { await api.post(`/api/visits/${id}/issues`, { resolved: !v.issues_resolved }); await reload(); })}>
                {v.issues_resolved ? "Reopen issue" : "Mark resolved"}
              </button>
            </div>
          )}
        </div>
      )}

      <ReportBody r={data} issuesResolved={v.issues ? v.issues_resolved : undefined} photoUrl={(pid) => `/api/visits/${id}/photos/${pid}`} />
    </div>
  );
}
