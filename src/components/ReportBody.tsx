import { useState } from "react";
import type { Task } from "../lib/types";
import { fmtLongDate, fmtTime } from "../lib/format";
import { Icon } from "./ui";

export interface ReportViewModel {
  site: { name: string; address: string; contact_name: string };
  visit: { cleaner_name: string; visit_at: string; areas_cleaned: string[]; tasks: Task[]; incomplete_reason: string; issues: string; notes: string };
  photos: { id: string; kind: "before" | "after" }[];
}

export function ReportBody({ r, photoUrl, issuesResolved }: { r: ReportViewModel; photoUrl: (id: string) => string; issuesResolved?: boolean }) {
  const [zoom, setZoom] = useState<string | null>(null);
  const done = r.visit.tasks.filter((t) => t.done);
  const outstanding = r.visit.tasks.filter((t) => !t.done);
  return (
    <div className="space-y-5">
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Site" value={r.site.name} />
        <Field label="Visit date" value={`${fmtLongDate(r.visit.visit_at)}, ${fmtTime(r.visit.visit_at)}`} />
        <Field label="Address" value={r.site.address} />
        <Field label="Customer / property manager" value={r.site.contact_name} />
        <Field label="Cleaner" value={r.visit.cleaner_name} />
        <Field label="Areas cleaned" value={r.visit.areas_cleaned.join(", ")} />
      </div>

      {r.visit.tasks.length > 0 && (
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Checklist</h2>
            <span className={`chip ${outstanding.length ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-700"}`}>
              {done.length} of {r.visit.tasks.length} completed
            </span>
          </div>
          <ul className="divide-y divide-navy-50">
            {[...done, ...outstanding].map((t, i) => (
              <li key={i} className="flex items-start gap-3 py-2.5">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${t.done ? "bg-brand-500 text-white" : "border-2 border-red-300 text-red-600"}`}>
                  <Icon name={t.done ? "check" : "x"} className="h-4 w-4" />
                </span>
                <span className={t.done ? "" : "font-semibold text-red-800"}>{t.task}{!t.done && <span className="ml-2 text-xs font-bold uppercase tracking-wide text-red-600">Not completed</span>}</span>
              </li>
            ))}
          </ul>
          {outstanding.length > 0 && r.visit.incomplete_reason && (
            <div className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><span className="font-bold">Reason not completed: </span>{r.visit.incomplete_reason}</div>
          )}
        </div>
      )}

      {r.visit.issues && (
        <div className="card border-amber-200 p-5">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="alert" className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-bold">Problems & maintenance issues</h2>
            {issuesResolved !== undefined && (
              <span className={`chip ml-auto ${issuesResolved ? "bg-brand-50 text-brand-700" : "bg-amber-100 text-amber-900"}`}>{issuesResolved ? "Resolved" : "Open"}</span>
            )}
          </div>
          <p className="whitespace-pre-wrap text-navy-700">{r.visit.issues}</p>
        </div>
      )}

      {r.visit.notes && (
        <div className="card p-5">
          <h2 className="mb-2 text-lg font-bold">Additional notes</h2>
          <p className="whitespace-pre-wrap text-navy-700">{r.visit.notes}</p>
        </div>
      )}

      {(["before", "after"] as const).map((kind) => {
        const list = r.photos.filter((p) => p.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind} className="card p-5">
            <h2 className="mb-3 text-lg font-bold">{kind === "before" ? "Before photos" : "After photos"}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {list.map((p) => (
                <button key={p.id} onClick={() => setZoom(photoUrl(p.id))} className="aspect-[4/3] overflow-hidden rounded-xl bg-navy-50">
                  <img src={photoUrl(p.id)} alt={`${kind} photo`} loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/90 p-4" onClick={() => setZoom(null)} role="dialog">
          <img src={zoom} alt="Enlarged photo" className="max-h-full max-w-full rounded-lg" />
          <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white" aria-label="Close"><Icon name="x" className="h-6 w-6" /></button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-navy-400">{label}</div>
      <div className="mt-0.5 font-semibold">{value || "—"}</div>
    </div>
  );
}
