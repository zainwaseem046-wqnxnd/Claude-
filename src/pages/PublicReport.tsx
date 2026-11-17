import { useParams } from "react-router-dom";
import { useState } from "react";
import { api, downloadFile } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { ReportBody, type ReportViewModel } from "../components/ReportBody";
import { Alert, Icon, LogoMark, PageLoader, Spinner } from "../components/ui";
import { fmtDateTime } from "../lib/format";

interface PublicResp extends ReportViewModel {
  business: { name: string; contact_email: string; phone: string; address: string; website: string; has_logo: boolean };
  visit: ReportViewModel["visit"] & { ref: string; submitted_at: string | null };
}

export function PublicReport() {
  const { token } = useParams();
  const base = `/api/public/reports/${encodeURIComponent(token ?? "")}`;
  const { data, error, loading } = useAsync(() => api.get<PublicResp>(base), [base]);
  const [busy, setBusy] = useState(false);
  const [dlError, setDlError] = useState("");

  if (loading) return <PageLoader />;
  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-50/50 px-4">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-xl font-bold">Report not available</h1>
          <p className="mt-2 text-navy-500">This link is invalid or has been revoked. Please contact your cleaning company for a new link.</p>
        </div>
      </div>
    );
  }
  const b = data.business;
  return (
    <div className="min-h-screen bg-navy-50/40">
      <header className="border-b border-navy-100 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-5">
          <div className="flex items-center gap-4">
            {b.has_logo && <img src={`${base}/logo`} alt={`${b.name} logo`} className="h-12 max-w-[140px] object-contain" />}
            <div>
              <div className="text-lg font-extrabold">{b.name}</div>
              <div className="text-sm text-navy-500">{[b.phone, b.contact_email].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
          <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); setDlError(""); try { await downloadFile(`${base}/pdf`, "cleaning-report.pdf"); } catch (e) { setDlError((e as Error).message); } finally { setBusy(false); } }}>
            {busy ? <Spinner /> : <Icon name="download" />}Download PDF
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-5">
          <div className="text-xs font-bold uppercase tracking-wide text-brand-600">Cleaning completion report</div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{data.site.name}</h1>
          <p className="text-navy-500">Ref {data.visit.ref}{data.visit.submitted_at && ` · submitted ${fmtDateTime(data.visit.submitted_at)}`}</p>
        </div>
        {dlError && <div className="mb-4"><Alert>{dlError}</Alert></div>}
        <ReportBody r={data} photoUrl={(pid) => `${base}/photos/${pid}`} />
        <footer className="mt-10 flex items-center justify-center gap-2 text-sm text-navy-400"><LogoMark className="h-5 w-5" />Report delivered with CleaningProof</footer>
      </main>
    </div>
  );
}
