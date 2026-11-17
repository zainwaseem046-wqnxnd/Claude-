import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { one, query } from "../db.js";
import { requireAuth, requireOwner } from "../lib/auth.js";
import { badRequest, notFound, forbidden, HttpError } from "../lib/errors.js";
import { parse, requiredText, text, uuid, idParam, email } from "../lib/validate.js";
import { imageUpload, saveImage, deleteFile, filePath, MAX_PHOTOS_PER_KIND } from "../lib/storage.js";
import { requireActive, requireFeature, limitsFor } from "../lib/plans.js";
import { loadReport } from "../lib/reportData.js";
import { renderReportPdf, reportFileName } from "../lib/pdf.js";
import { sendMail, escapeHtml } from "../lib/mail.js";
import { config } from "../config.js";

export const visitsRouter = Router();
visitsRouter.use(requireAuth);

const getBusiness = (id: string) => one("SELECT * FROM businesses WHERE id=$1", [id]);

async function getVisit(id: unknown, businessId: string) {
  const v = await one("SELECT * FROM visits WHERE id=$1 AND business_id=$2", [idParam(id), businessId]);
  if (!v) throw notFound("Visit not found");
  return v;
}

function assertDraft(v: { status: string }) {
  if (v.status !== "draft") throw new HttpError(409, "This report has already been submitted and can no longer be edited");
}

// ---- List / search history
const listSchema = z.object({
  status: z.enum(["draft", "submitted"]).default("submitted"),
  q: text(100).optional(),
  site_id: z.union([uuid, z.literal("")]).optional(),
  from: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  to: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  issues: z.enum(["open", ""]).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

function buildFilter(businessId: string, f: z.infer<typeof listSchema>) {
  const where = ["v.business_id=$1", "v.status=$2"];
  const params: unknown[] = [businessId, f.status];
  if (f.site_id) { params.push(f.site_id); where.push(`v.site_id=$${params.length}`); }
  if (f.from) { params.push(f.from); where.push(`v.visit_at >= ($${params.length}::date AT TIME ZONE 'Europe/London')`); }
  if (f.to) { params.push(f.to); where.push(`v.visit_at < (($${params.length}::date + 1) AT TIME ZONE 'Europe/London')`); }
  if (f.issues === "open") where.push("v.issues <> '' AND NOT v.issues_resolved");
  if (f.q) {
    params.push(`%${f.q.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
    const p = `$${params.length}`;
    where.push(`(s.name ILIKE ${p} OR s.address ILIKE ${p} OR v.cleaner_name ILIKE ${p} OR v.notes ILIKE ${p} OR v.issues ILIKE ${p} OR s.contact_name ILIKE ${p})`);
  }
  return { where: where.join(" AND "), params };
}

visitsRouter.get("/", async (req, res) => {
  const f = parse(listSchema, req.query);
  const { where, params } = buildFilter(req.user!.business_id, f);
  const pageSize = 20;
  const total = Number((await one(`SELECT count(*) FROM visits v JOIN sites s ON s.id=v.site_id WHERE ${where}`, params)).count);
  const r = await query(
    `SELECT v.id, v.status, v.cleaner_name, v.visit_at, v.submitted_at, v.updated_at, v.issues <> '' AS has_issues, v.issues_resolved,
            v.last_sent_at, v.share_token IS NOT NULL AS shared, s.id AS site_id, s.name AS site_name,
            jsonb_array_length(v.tasks) AS task_count,
            (SELECT count(*) FROM jsonb_array_elements(v.tasks) t WHERE (t->>'done')::boolean) AS done_count,
            (SELECT count(*)::int FROM photos p WHERE p.visit_id=v.id) AS photo_count
       FROM visits v JOIN sites s ON s.id=v.site_id
      WHERE ${where}
      ORDER BY ${f.status === "draft" ? "v.updated_at" : "v.visit_at"} DESC
      LIMIT ${pageSize} OFFSET ${(f.page - 1) * pageSize}`,
    params,
  );
  res.json({ visits: r.rows, total, page: f.page, pageSize });
});

// ---- CSV export (Business plan: advanced reporting)
visitsRouter.get("/export.csv", requireOwner, async (req, res) => {
  requireFeature(await getBusiness(req.user!.business_id), "advancedReporting");
  const f = parse(listSchema, { ...req.query, status: "submitted", page: 1 });
  const { where, params } = buildFilter(req.user!.business_id, f);
  const r = await query(
    `SELECT v.id, v.visit_at, s.name AS site, s.address, v.cleaner_name, v.areas_cleaned, v.tasks, v.incomplete_reason, v.issues, v.issues_resolved, v.notes,
            (SELECT count(*)::int FROM photos p WHERE p.visit_id=v.id) AS photos
       FROM visits v JOIN sites s ON s.id=v.site_id WHERE ${where} ORDER BY v.visit_at DESC LIMIT 10000`,
    params,
  );
  const cell = (val: unknown) => {
    let s = val == null ? "" : String(val);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // prevent spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ["Report ref", "Date", "Time", "Site", "Address", "Cleaner", "Areas cleaned", "Tasks completed", "Tasks total", "Outstanding tasks", "Reason incomplete", "Issues", "Issues resolved", "Notes", "Photos"];
  const lines = [header.map(cell).join(",")];
  for (const v of r.rows) {
    const d = new Date(v.visit_at);
    const tasks = v.tasks as { task: string; done: boolean }[];
    lines.push([
      v.id.slice(0, 8).toUpperCase(),
      d.toLocaleDateString("en-GB", { timeZone: "Europe/London" }),
      d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }),
      v.site, v.address, v.cleaner_name, (v.areas_cleaned as string[]).join("; "),
      tasks.filter((t) => t.done).length, tasks.length, tasks.filter((t) => !t.done).map((t) => t.task).join("; "),
      v.incomplete_reason, v.issues, v.issues ? (v.issues_resolved ? "Yes" : "No") : "", v.notes, v.photos,
    ].map(cell).join(","));
  }
  res.set("Content-Disposition", `attachment; filename="cleaning-reports-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.type("text/csv").send("﻿" + lines.join("\r\n"));
});

// ---- Start a visit (creates a draft from the site's checklist)
visitsRouter.post("/", async (req, res) => {
  const { site_id } = parse(z.object({ site_id: uuid }), req.body);
  requireActive(await getBusiness(req.user!.business_id));
  const site = await one("SELECT * FROM sites WHERE id=$1 AND business_id=$2 AND NOT archived", [site_id, req.user!.business_id]);
  if (!site) throw notFound("Site not found");
  const tasks = (site.checklist as string[]).map((task) => ({ task, done: false }));
  const v = await one(
    `INSERT INTO visits (business_id, site_id, created_by, cleaner_name, tasks) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [req.user!.business_id, site.id, req.user!.id, req.user!.name, JSON.stringify(tasks)],
  );
  res.status(201).json({ id: v.id });
});

visitsRouter.get("/:id", async (req, res) => {
  const r = await loadReport({ visitId: idParam(req.params.id), businessId: req.user!.business_id });
  const site = await one("SELECT areas, checklist FROM sites WHERE id=$1", [r.site.id]);
  res.json({
    visit: r.visit,
    site: { ...r.site, areas: site.areas, checklist: site.checklist },
    photos: r.photos.map((p) => ({ id: p.id, kind: p.kind })),
    business: { name: r.business.name, has_logo: Boolean(r.business.logo_file) },
    features: limitsFor(r.business),
    emailDelivery: Boolean(config.smtp.host),
  });
});

// ---- Save draft (autosave)
const visitUpdate = z.object({
  cleaner_name: text(100),
  visit_at: z.string().datetime({ offset: true }),
  areas_cleaned: z.array(requiredText(80)).max(40),
  tasks: z.array(z.object({ task: requiredText(160), done: z.boolean() })).max(80),
  incomplete_reason: text(2000),
  issues: text(4000),
  notes: text(4000),
});

visitsRouter.put("/:id", async (req, res) => {
  const v = await getVisit(req.params.id, req.user!.business_id);
  assertDraft(v);
  const body = parse(visitUpdate, req.body);
  const when = new Date(body.visit_at);
  if (when.getTime() > Date.now() + 24 * 3600e3) throw badRequest("Visit date cannot be in the future");
  await query(
    `UPDATE visits SET cleaner_name=$1, visit_at=$2, areas_cleaned=$3, tasks=$4, incomplete_reason=$5, issues=$6, notes=$7, updated_at=now()
      WHERE id=$8 AND business_id=$9 AND status='draft'`,
    [body.cleaner_name, when, JSON.stringify(body.areas_cleaned), JSON.stringify(body.tasks), body.incomplete_reason, body.issues, body.notes, v.id, req.user!.business_id],
  );
  res.json({ ok: true, updated_at: new Date().toISOString() });
});

visitsRouter.post("/:id/submit", async (req, res) => {
  const v = await getVisit(req.params.id, req.user!.business_id);
  assertDraft(v);
  requireActive(await getBusiness(req.user!.business_id));
  const tasks = v.tasks as { task: string; done: boolean }[];
  if (!v.cleaner_name.trim()) throw badRequest("Enter the cleaner's name");
  if (!tasks.some((t) => t.done) && !(v.areas_cleaned as string[]).length) throw badRequest("Tick at least one area or completed task");
  if (tasks.some((t) => !t.done) && !v.incomplete_reason.trim()) throw badRequest("Give a reason for the tasks that were not completed");
  await query("UPDATE visits SET status='submitted', submitted_at=now(), updated_at=now() WHERE id=$1 AND business_id=$2 AND status='draft'", [v.id, req.user!.business_id]);
  res.json({ ok: true });
});

visitsRouter.delete("/:id", async (req, res) => {
  const v = await getVisit(req.params.id, req.user!.business_id);
  if (v.status !== "draft") throw new HttpError(409, "Submitted reports cannot be deleted");
  if (req.user!.role !== "owner" && v.created_by !== req.user!.id) throw forbidden();
  const photos = await query("SELECT file_name FROM photos WHERE visit_id=$1", [v.id]);
  await query("DELETE FROM visits WHERE id=$1 AND business_id=$2", [v.id, req.user!.business_id]);
  await Promise.all(photos.rows.map((p) => deleteFile(p.file_name)));
  res.json({ ok: true });
});

// ---- Photos
visitsRouter.post("/:id/photos", imageUpload.single("file"), async (req, res) => {
  const kind = parse(z.enum(["before", "after"]), req.query.kind);
  const v = await getVisit(req.params.id, req.user!.business_id);
  assertDraft(v);
  const n = Number((await one("SELECT count(*) FROM photos WHERE visit_id=$1 AND kind=$2", [v.id, kind])).count);
  if (n >= MAX_PHOTOS_PER_KIND) throw badRequest(`Maximum ${MAX_PHOTOS_PER_KIND} ${kind} photos per visit`);
  const saved = await saveImage(req.file?.buffer);
  const p = await one(
    "INSERT INTO photos (visit_id, business_id, kind, file_name, mime, size_bytes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, kind",
    [v.id, req.user!.business_id, kind, saved.fileName, saved.mime, saved.size],
  );
  await query("UPDATE visits SET updated_at=now() WHERE id=$1", [v.id]);
  res.status(201).json({ photo: p });
});

visitsRouter.delete("/:id/photos/:photoId", async (req, res) => {
  const v = await getVisit(req.params.id, req.user!.business_id);
  assertDraft(v);
  const p = await one("DELETE FROM photos WHERE id=$1 AND visit_id=$2 AND business_id=$3 RETURNING file_name", [idParam(req.params.photoId), v.id, req.user!.business_id]);
  if (!p) throw notFound("Photo not found");
  await deleteFile(p.file_name);
  res.json({ ok: true });
});

visitsRouter.get("/:id/photos/:photoId", async (req, res) => {
  const p = await one("SELECT file_name, mime FROM photos WHERE id=$1 AND visit_id=$2 AND business_id=$3", [
    idParam(req.params.photoId), idParam(req.params.id), req.user!.business_id,
  ]);
  if (!p) throw notFound("Photo not found");
  res.set("Cache-Control", "private, max-age=3600").type(p.mime).sendFile(filePath(p.file_name));
});

// ---- PDF
visitsRouter.get("/:id/pdf", async (req, res) => {
  const r = await loadReport({ visitId: idParam(req.params.id), businessId: req.user!.business_id });
  const pdf = await renderReportPdf(r);
  res.set("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename="${reportFileName(r)}"`);
  res.set("Cache-Control", "private, no-store");
  res.type("application/pdf").send(pdf);
});

// ---- Issues
visitsRouter.post("/:id/issues", requireOwner, async (req, res) => {
  const { resolved } = parse(z.object({ resolved: z.boolean() }), req.body);
  const v = await getVisit(req.params.id, req.user!.business_id);
  await query("UPDATE visits SET issues_resolved=$1 WHERE id=$2 AND business_id=$3", [resolved, v.id, req.user!.business_id]);
  res.json({ ok: true });
});

// ---- Client share links
async function ensureShareToken(visit: { id: string; share_token: string | null }, businessId: string) {
  if (visit.share_token) return visit.share_token;
  const token = crypto.randomBytes(24).toString("base64url"); // 192 bits, unguessable
  await query("UPDATE visits SET share_token=$1 WHERE id=$2 AND business_id=$3", [token, visit.id, businessId]);
  return token;
}

visitsRouter.post("/:id/share", requireOwner, async (req, res) => {
  const v = await getVisit(req.params.id, req.user!.business_id);
  if (v.status !== "submitted") throw badRequest("Submit the report before sharing it");
  requireFeature(await getBusiness(req.user!.business_id), "sharing");
  res.json({ token: await ensureShareToken(v, req.user!.business_id) });
});

visitsRouter.delete("/:id/share", requireOwner, async (req, res) => {
  const v = await getVisit(req.params.id, req.user!.business_id);
  await query("UPDATE visits SET share_token=NULL WHERE id=$1 AND business_id=$2", [v.id, req.user!.business_id]);
  res.json({ ok: true });
});

// ---- Email / resend to the customer
visitsRouter.post("/:id/send", requireOwner, async (req, res) => {
  const { to } = parse(z.object({ to: email }), req.body);
  const r = await loadReport({ visitId: idParam(req.params.id), businessId: req.user!.business_id });
  if (r.visit.status !== "submitted") throw badRequest("Submit the report before sending it");
  requireActive(r.business);
  const canShare = limitsFor(r.business).sharing;
  let link = "";
  if (canShare) {
    const origin = req.get("origin") && /^https?:\/\/[^/]+$/.test(req.get("origin")!) ? req.get("origin")! : config.appUrl;
    link = `${origin}/r/${await ensureShareToken(r.visit, r.business.id)}`;
  }
  const pdf = await renderReportPdf(r);
  const date = new Date(r.visit.visit_at).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" });
  const outstanding = r.visit.tasks.filter((t) => !t.done).length;
  const subject = `Cleaning report: ${r.site.name} – ${date}`;
  const greeting = r.site.contact_name ? `Hello ${r.site.contact_name},` : "Hello,";
  const summary = `${r.visit.tasks.filter((t) => t.done).length} of ${r.visit.tasks.length} tasks completed${outstanding ? ` (${outstanding} outstanding)` : ""}.`;
  const textBody = [greeting, "", `Please find attached the cleaning report for ${r.site.name} on ${date}.`, summary, link ? `\nView online: ${link}` : "", "", `Kind regards,`, r.business.name].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#0f1b30;max-width:560px">
    <p>${escapeHtml(greeting)}</p>
    <p>Please find attached the cleaning report for <strong>${escapeHtml(r.site.name)}</strong> on ${escapeHtml(date)}.</p>
    <p>${escapeHtml(summary)}</p>
    ${link ? `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">View report online</a></p>` : ""}
    <p>Kind regards,<br>${escapeHtml(r.business.name)}</p></div>`;
  const result = await sendMail({ to, replyTo: r.business.contact_email, subject, text: textBody, html, attachments: [{ filename: reportFileName(r), content: pdf }] });
  await query("UPDATE visits SET last_sent_at=now(), last_sent_to=$1 WHERE id=$2", [to, r.visit.id]);
  res.json({ ok: true, delivered: result.delivered });
});
