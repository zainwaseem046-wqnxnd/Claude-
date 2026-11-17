import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { compressImage } from "../lib/image";
import { toLocalInput } from "../lib/format";
import type { Photo, Task, Visit } from "../lib/types";
import { Alert, Icon, PageLoader, Spinner } from "../components/ui";

interface VisitResponse { visit: Visit; site: { id: string; name: string; address: string; areas: string[]; checklist: string[] }; photos: Photo[] }
interface FormState { cleaner_name: string; visit_at: string; areas_cleaned: string[]; tasks: Task[]; incomplete_reason: string; issues: string; notes: string }

const MAX_PER_KIND = 8;

export function VisitForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<VisitResponse | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<FormState | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    api.get<VisitResponse>(`/api/visits/${id}`).then((d) => {
      setData(d);
      setPhotos(d.photos);
      const f = {
        cleaner_name: d.visit.cleaner_name, visit_at: toLocalInput(d.visit.visit_at), areas_cleaned: d.visit.areas_cleaned,
        tasks: d.visit.tasks, incomplete_reason: d.visit.incomplete_reason, issues: d.visit.issues, notes: d.visit.notes,
      };
      setForm(f);
      latest.current = f;
    }).catch((e) => setLoadError(e.message));
  }, [id]);

  const save = useCallback(async () => {
    const f = latest.current;
    if (!f) return;
    if (inflight.current) await inflight.current;
    setSaveState("saving");
    const p = api.put(`/api/visits/${id}`, { ...f, visit_at: new Date(f.visit_at).toISOString() })
      .then(() => setSaveState((s) => (s === "saving" ? "saved" : s)))
      .catch((e) => { setSaveState("error"); throw e; });
    inflight.current = p.then(() => undefined, () => undefined);
    await p;
  }, [id]);

  const update = (patch: Partial<FormState>) => {
    setForm((prev) => {
      const next = { ...prev!, ...patch };
      latest.current = next;
      return next;
    });
    setSaveState("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { save().catch(() => {}); }, 800);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (saveState === "dirty" || saveState === "saving") e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  async function addPhotos(kind: "before" | "after", files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const room = MAX_PER_KIND - photos.filter((p) => p.kind === kind).length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) setError(`You can add up to ${MAX_PER_KIND} ${kind} photos.`);
    for (const file of list) {
      setUploading((u) => ({ ...u, [kind]: (u[kind] ?? 0) + 1 }));
      try {
        const blob = await compressImage(file);
        const fd = new FormData();
        fd.append("file", blob, "photo.jpg");
        const { photo } = await api.upload<{ photo: Photo }>(`/api/visits/${id}/photos?kind=${kind}`, fd);
        setPhotos((p) => [...p, photo]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploading((u) => ({ ...u, [kind]: (u[kind] ?? 1) - 1 }));
      }
    }
  }

  async function removePhoto(pid: string) {
    try {
      await api.del(`/api/visits/${id}/photos/${pid}`);
      setPhotos((p) => p.filter((x) => x.id !== pid));
    } catch (e) { setError((e as Error).message); }
  }

  async function submit() {
    setError("");
    const f = latest.current!;
    if (!f.cleaner_name.trim()) return fail("Enter the cleaner's name.");
    if (!f.tasks.some((t) => t.done) && !f.areas_cleaned.length) return fail("Tick at least one area or completed task.");
    if (f.tasks.some((t) => !t.done) && !f.incomplete_reason.trim()) return fail("Give a reason for the tasks that were not completed.");
    if (Object.values(uploading).some((n) => n > 0)) return fail("Please wait for photos to finish uploading.");
    setSubmitting(true);
    try {
      window.clearTimeout(timer.current);
      await save();
      await api.post(`/api/visits/${id}/submit`);
      nav(`/app/reports/${id}?submitted=1`, { replace: true });
    } catch (e) { fail((e as Error).message); } finally { setSubmitting(false); }
  }

  async function discard() {
    if (!confirm("Delete this draft and its photos?")) return;
    try { await api.del(`/api/visits/${id}`); nav("/app", { replace: true }); } catch (e) { setError((e as Error).message); }
  }

  function fail(msg: string) {
    setError(msg);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!data || !form) return <PageLoader />;
  if (data.visit.status === "submitted") return <Navigate to={`/app/reports/${id}`} replace />;

  const doneCount = form.tasks.filter((t) => t.done).length;
  const notDone = form.tasks.filter((t) => !t.done);
  const toggleTask = (i: number) => update({ tasks: form.tasks.map((t, j) => (j === i ? { ...t, done: !t.done } : t)) });
  const toggleArea = (a: string) => update({ areas_cleaned: form.areas_cleaned.includes(a) ? form.areas_cleaned.filter((x) => x !== a) : [...form.areas_cleaned, a] });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide text-navy-400">Cleaning visit</div>
          <h1 className="truncate text-2xl font-extrabold">{data.site.name}</h1>
          {data.site.address && <p className="truncate text-sm text-navy-500">{data.site.address}</p>}
        </div>
        <SaveBadge state={saveState} onRetry={() => save().catch(() => {})} />
      </div>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="space-y-5">
        <Section title="Visit details">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="cleaner">Cleaner name *</label><input id="cleaner" className="input" maxLength={100} value={form.cleaner_name} onChange={(e) => update({ cleaner_name: e.target.value })} /></div>
            <div><label className="label" htmlFor="when">Date & time *</label><input id="when" className="input" type="datetime-local" value={form.visit_at} onChange={(e) => e.target.value && update({ visit_at: e.target.value })} /></div>
          </div>
        </Section>

        {data.site.areas.length > 0 && (
          <Section title="Areas cleaned" right={<button type="button" className="text-sm font-semibold text-brand-600" onClick={() => update({ areas_cleaned: form.areas_cleaned.length === data.site.areas.length ? [] : [...data.site.areas] })}>{form.areas_cleaned.length === data.site.areas.length ? "Clear" : "Select all"}</button>}>
            <div className="flex flex-wrap gap-2">
              {data.site.areas.map((a) => {
                const on = form.areas_cleaned.includes(a);
                return (
                  <button type="button" key={a} onClick={() => toggleArea(a)} aria-pressed={on}
                    className={`min-h-[44px] rounded-xl border-2 px-4 text-[15px] font-semibold transition ${on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-navy-100 text-navy-600"}`}>
                    {on && "✓ "}{a}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        <Section title={`Checklist (${doneCount}/${form.tasks.length})`}
          right={form.tasks.length > 0 && <button type="button" className="text-sm font-semibold text-brand-600" onClick={() => update({ tasks: form.tasks.map((t) => ({ ...t, done: doneCount !== form.tasks.length })) })}>{doneCount === form.tasks.length ? "Untick all" : "Tick all"}</button>}>
          <div className="space-y-2">
            {form.tasks.map((t, i) => (
              <button type="button" key={i} onClick={() => toggleTask(i)} aria-pressed={t.done}
                className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-[15px] font-medium transition ${t.done ? "border-brand-500 bg-brand-50" : "border-navy-100 bg-white"}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.done ? "bg-brand-500 text-white" : "border-2 border-navy-200"}`}>{t.done && <Icon name="check" className="h-5 w-5" />}</span>
                {t.task}
              </button>
            ))}
            {form.tasks.length === 0 && <p className="text-navy-500">This site has no checklist tasks.</p>}
          </div>
        </Section>

        {notDone.length > 0 && (
          <Section title="Tasks not completed" tone="warn">
            <ul className="mb-3 list-inside list-disc text-sm text-amber-900">{notDone.map((t) => <li key={t.task}>{t.task}</li>)}</ul>
            <label className="label" htmlFor="reason">Reason not completed *</label>
            <textarea id="reason" className="input" rows={3} maxLength={2000} value={form.incomplete_reason} onChange={(e) => update({ incomplete_reason: e.target.value })} placeholder="e.g. Meeting room 2 was in use; no access to the store cupboard" />
          </Section>
        )}

        <Section title="Photos">
          <div className="space-y-5">
            {(["before", "after"] as const).map((kind) => {
              const list = photos.filter((p) => p.kind === kind);
              const busy = (uploading[kind] ?? 0) > 0;
              return (
                <div key={kind}>
                  <div className="mb-2 font-semibold capitalize">{kind} <span className="font-normal text-navy-400">({list.length}/{MAX_PER_KIND})</span></div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {list.map((p) => (
                      <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-navy-50">
                        <img src={`/api/visits/${id}/photos/${p.id}`} alt={`${kind} photo`} className="h-full w-full object-cover" />
                        <button type="button" onClick={() => removePhoto(p.id)} className="absolute right-1 top-1 rounded-full bg-navy-900/70 p-1.5 text-white" aria-label="Remove photo"><Icon name="x" className="h-4 w-4" /></button>
                      </div>
                    ))}
                    {busy && <div className="flex aspect-square items-center justify-center rounded-xl bg-navy-50 text-brand-500"><Spinner className="h-6 w-6" /></div>}
                    {list.length < MAX_PER_KIND && (
                      <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-navy-200 text-navy-500 hover:border-brand-500 hover:text-brand-600">
                        <Icon name="camera" className="h-7 w-7" />
                        <span className="text-xs font-semibold">Add photo</span>
                        <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addPhotos(kind, e.target.files); e.target.value = ""; }} />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="hint">Photos are compressed on your phone and stored privately. Location data is removed.</p>
          </div>
        </Section>

        <Section title="Problems or maintenance issues">
          <textarea className="input" rows={3} maxLength={4000} value={form.issues} onChange={(e) => update({ issues: e.target.value })} placeholder="e.g. Leaking tap in ground-floor toilet; light out on stairwell 2" />
          <p className="hint">Leave blank if there were no problems.</p>
        </Section>

        <Section title="Additional notes">
          <textarea className="input" rows={3} maxLength={4000} value={form.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Anything else the client should know" />
        </Section>

        <div className="space-y-3 pt-2">
          <button type="button" onClick={submit} disabled={submitting} className="btn-primary btn-lg w-full text-lg">
            {submitting ? <Spinner /> : <Icon name="check" />}Submit report
          </button>
          <div className="flex gap-3">
            <Link to="/app" className="btn-secondary flex-1">Save draft & exit</Link>
            <button type="button" onClick={discard} className="btn-danger"><Icon name="trash" className="h-4 w-4" />Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, right, tone, children }: { title: string; right?: React.ReactNode; tone?: "warn"; children: React.ReactNode }) {
  return (
    <section className={`card p-5 ${tone === "warn" ? "border-amber-200 bg-amber-50/50" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{title}</h2>{right}</div>
      {children}
    </section>
  );
}

function SaveBadge({ state, onRetry }: { state: string; onRetry: () => void }) {
  if (state === "error") return <button onClick={onRetry} className="chip shrink-0 bg-red-50 text-red-700">Not saved · Retry</button>;
  if (state === "saved") return <span className="chip shrink-0 bg-brand-50 text-brand-700">✓ Draft saved</span>;
  return <span className="chip shrink-0 bg-navy-50 text-navy-500">Saving…</span>;
}
