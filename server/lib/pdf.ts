import fs from "node:fs";
import PDFDocument from "pdfkit";
import type { ReportData } from "./reportData.js";
import { filePath } from "./storage.js";
import { limitsFor } from "./plans.js";

const NAVY = "#0f1b30";
const MUTED = "#4a5f80";
const GREEN = "#16a34a";
const RED = "#b42318";
const LINE = "#e3e9f2";

const fmtDate = (d: Date) =>
  new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtTime = (d: Date) => new Date(d).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });

function readIfExists(name: string | null): Buffer | null {
  if (!name) return null;
  try { return fs.readFileSync(filePath(name)); } catch { return null; }
}

export function reportFileName(r: ReportData) {
  const day = new Date(r.visit.visit_at).toISOString().slice(0, 10);
  const slug = r.site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site";
  return `cleaning-report-${slug}-${day}.pdf`;
}

export function renderReportPdf(r: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true, info: { Title: `Cleaning report – ${r.site.name}`, Author: r.business.name } });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 30;
    const ensure = (h: number) => { if (doc.y + h > bottom()) doc.addPage(); };

    // ---- Header
    const logo = limitsFor(r.business).branding ? readIfExists(r.business.logo_file) : null;
    const top = doc.y;
    let textX = left;
    if (logo) {
      try { doc.image(logo, left, top, { fit: [110, 56] }); textX = left + 124; } catch { /* unreadable logo: skip */ }
    }
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(16).text(r.business.name, textX, top, { width: width - (textX - left) });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    const contact = [r.business.address, [r.business.phone, r.business.contact_email].filter(Boolean).join("  ·  "), r.business.website].filter(Boolean);
    for (const line of contact) doc.text(line, textX, doc.y, { width: width - (textX - left) });
    doc.y = Math.max(doc.y, top + 60) + 10;
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(2).strokeColor(GREEN).stroke();
    doc.moveDown(0.8);

    // ---- Title
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(20).text("Cleaning Completion Report", left, doc.y);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`Report ref ${r.visit.id.slice(0, 8).toUpperCase()}`);
    doc.moveDown(0.8);

    // ---- Details grid
    const kv = (label: string, value: string, x: number, y: number, w: number) => {
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y, { width: w, characterSpacing: 0.5 });
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(NAVY).text(value || "—", x, doc.y + 2, { width: w });
      return doc.y;
    };
    const colW = (width - 16) / 2;
    const boxTop = doc.y;
    doc.roundedRect(left, boxTop, width, 10, 6).fill("#ffffff"); // placeholder, redrawn below
    let y = boxTop + 12;
    const ly1 = kv("Site", r.site.name, left + 12, y, colW - 12);
    const ry1 = kv("Visit date", fmtDate(r.visit.visit_at), left + colW + 16, y, colW - 12);
    y = Math.max(ly1, ry1) + 8;
    const ly2 = kv("Address", r.site.address, left + 12, y, colW - 12);
    const ry2 = kv("Time", fmtTime(r.visit.visit_at), left + colW + 16, y, colW - 12);
    y = Math.max(ly2, ry2) + 8;
    const ly3 = kv("Customer / property manager", r.site.contact_name, left + 12, y, colW - 12);
    const ry3 = kv("Cleaner", r.visit.cleaner_name, left + colW + 16, y, colW - 12);
    y = Math.max(ly3, ry3) + 12;
    doc.save().roundedRect(left, boxTop, width, y - boxTop, 6).lineWidth(1).strokeColor(LINE).stroke().restore();
    doc.y = y + 14;

    const section = (title: string) => {
      ensure(50);
      doc.x = left;
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(12.5).text(title, left, doc.y);
      doc.moveTo(left, doc.y + 3).lineTo(left + width, doc.y + 3).lineWidth(1).strokeColor(LINE).stroke();
      doc.moveDown(0.7);
    };

    const box = (x: number, yy: number, done: boolean) => {
      doc.save();
      doc.roundedRect(x, yy, 11, 11, 2).lineWidth(1).fillAndStroke(done ? GREEN : "#ffffff", done ? GREEN : RED);
      if (done) {
        doc.moveTo(x + 2.5, yy + 5.8).lineTo(x + 4.8, yy + 8.2).lineTo(x + 8.8, yy + 3).lineWidth(1.6).strokeColor("#ffffff").stroke();
      } else {
        doc.moveTo(x + 3, yy + 3).lineTo(x + 8, yy + 8).moveTo(x + 8, yy + 3).lineTo(x + 3, yy + 8).lineWidth(1.4).strokeColor(RED).stroke();
      }
      doc.restore();
    };

    const done = r.visit.tasks.filter((t) => t.done);
    const notDone = r.visit.tasks.filter((t) => !t.done);

    // ---- Summary
    section("Summary");
    doc.font("Helvetica").fontSize(10.5).fillColor(NAVY);
    const total = r.visit.tasks.length;
    doc.text(
      total
        ? `${done.length} of ${total} checklist tasks completed${notDone.length ? `, ${notDone.length} outstanding` : " — all tasks completed"}.`
        : "No checklist tasks recorded.",
    );
    if (r.visit.areas_cleaned.length) {
      doc.moveDown(0.3).font("Helvetica-Bold").text("Areas cleaned: ", { continued: true }).font("Helvetica").text(r.visit.areas_cleaned.join(", "));
    }
    doc.moveDown(1);

    // ---- Checklist
    if (total) {
      section("Completed checklist");
      for (const t of done) {
        ensure(18);
        const yy = doc.y;
        box(left, yy, true);
        doc.font("Helvetica").fontSize(10.5).fillColor(NAVY).text(t.task, left + 18, yy, { width: width - 18 });
        doc.moveDown(0.35);
      }
      if (!done.length) doc.font("Helvetica-Oblique").fontSize(10).fillColor(MUTED).text("No tasks were completed.");
      doc.moveDown(0.8);
    }

    if (notDone.length) {
      section("Outstanding tasks");
      for (const t of notDone) {
        ensure(18);
        const yy = doc.y;
        box(left, yy, false);
        doc.font("Helvetica").fontSize(10.5).fillColor(NAVY).text(t.task, left + 18, yy, { width: width - 18 });
        doc.moveDown(0.35);
      }
      if (r.visit.incomplete_reason) {
        doc.moveDown(0.3).font("Helvetica-Bold").fontSize(10).fillColor(NAVY).text("Reason: ", left, doc.y, { continued: true })
          .font("Helvetica").text(r.visit.incomplete_reason, { width });
      }
      doc.moveDown(0.8);
    }

    if (r.visit.issues) {
      section("Problems & maintenance issues");
      doc.font("Helvetica").fontSize(10.5).fillColor(NAVY).text(r.visit.issues, left, doc.y, { width });
      doc.moveDown(0.8);
    }
    if (r.visit.notes) {
      section("Additional notes");
      doc.font("Helvetica").fontSize(10.5).fillColor(NAVY).text(r.visit.notes, left, doc.y, { width });
      doc.moveDown(0.8);
    }

    // ---- Photos
    for (const kind of ["before", "after"] as const) {
      const list = r.photos.filter((p) => p.kind === kind);
      if (!list.length) continue;
      const gap = 12;
      const pw = (width - gap) / 2;
      const ph = pw * 0.75;
      ensure(ph + 60); // keep the heading with its first row of photos
      section(kind === "before" ? "Before photos" : "After photos");
      for (let i = 0; i < list.length; i += 2) {
        ensure(ph + 10);
        const rowY = doc.y;
        for (let j = 0; j < 2 && i + j < list.length; j++) {
          const img = readIfExists(list[i + j].file_name);
          const x = left + j * (pw + gap);
          doc.save().rect(x, rowY, pw, ph).fill("#f2f5f9").restore();
          if (img) {
            try { doc.image(img, x, rowY, { fit: [pw, ph], align: "center", valign: "center" }); } catch { /* skip corrupt */ }
          }
        }
        doc.y = rowY + ph + gap;
      }
      doc.moveDown(0.4);
    }

    // ---- Sign-off
    ensure(60);
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(
      `Completed by ${r.visit.cleaner_name || "—"} on ${fmtDate(r.visit.visit_at)} at ${fmtTime(r.visit.visit_at)}.` +
        (r.visit.submitted_at ? ` Report submitted ${fmtDate(r.visit.submitted_at)} at ${fmtTime(r.visit.submitted_at)}.` : ""),
      left, doc.y, { width },
    );

    // ---- Footer with page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const fy = doc.page.height - doc.page.margins.bottom - 10;
      doc.font("Helvetica").fontSize(8).fillColor(MUTED);
      doc.text(`${r.business.name} · ${r.site.name}`, left, fy, { width: width / 2, lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, left + width / 2, fy, { width: width / 2, align: "right", lineBreak: false });
    }
    doc.end();
  });
}
