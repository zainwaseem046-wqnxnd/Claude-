import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { one, query } from "../db.js";
import { requireAuth, requireOwner } from "../lib/auth.js";
import { HttpError, notFound, paymentRequired, badRequest } from "../lib/errors.js";
import { parse, requiredText, text, email, idParam } from "../lib/validate.js";
import { imageUpload, saveImage, deleteFile, filePath } from "../lib/storage.js";
import { limitsFor, requireFeature } from "../lib/plans.js";

export const businessRouter = Router();
businessRouter.use(["/business", "/team"], requireAuth);

businessRouter.put("/business", requireOwner, async (req, res) => {
  const body = parse(
    z.object({ name: requiredText(120), contact_email: email, phone: text(40), address: text(300), website: text(200) }),
    req.body,
  );
  await query("UPDATE businesses SET name=$1, contact_email=$2, phone=$3, address=$4, website=$5 WHERE id=$6", [
    body.name, body.contact_email, body.phone, body.address, body.website, req.user!.business_id,
  ]);
  res.json({ ok: true });
});

businessRouter.post("/business/logo", requireOwner, imageUpload.single("file"), async (req, res) => {
  const b = await one("SELECT plan, trial_ends_at, subscription_status, logo_file FROM businesses WHERE id=$1", [req.user!.business_id]);
  requireFeature(b, "branding");
  const saved = await saveImage(req.file?.buffer);
  await query("UPDATE businesses SET logo_file=$1, logo_mime=$2 WHERE id=$3", [saved.fileName, saved.mime, req.user!.business_id]);
  await deleteFile(b.logo_file);
  res.json({ ok: true });
});

businessRouter.delete("/business/logo", requireOwner, async (req, res) => {
  const b = await one("SELECT logo_file FROM businesses WHERE id=$1", [req.user!.business_id]);
  await query("UPDATE businesses SET logo_file=NULL, logo_mime=NULL WHERE id=$1", [req.user!.business_id]);
  await deleteFile(b?.logo_file);
  res.json({ ok: true });
});

businessRouter.get("/business/logo", async (req, res) => {
  const b = await one("SELECT logo_file, logo_mime FROM businesses WHERE id=$1", [req.user!.business_id]);
  if (!b?.logo_file) throw notFound();
  res.set("Cache-Control", "private, max-age=300").type(b.logo_mime).sendFile(filePath(b.logo_file));
});

// ---- Team (multiple cleaner logins: Business plan)
businessRouter.get("/team", requireOwner, async (req, res) => {
  const r = await query("SELECT id,name,email,role,created_at FROM users WHERE business_id=$1 ORDER BY role DESC, created_at", [req.user!.business_id]);
  res.json({ members: r.rows });
});

businessRouter.post("/team", requireOwner, async (req, res) => {
  const body = parse(z.object({ name: requiredText(100), email, password: z.string().min(8, "must be at least 8 characters").max(200) }), req.body);
  const b = await one("SELECT plan, trial_ends_at, subscription_status FROM businesses WHERE id=$1", [req.user!.business_id]);
  const max = limitsFor(b).maxUsers;
  const count = Number((await one("SELECT count(*) FROM users WHERE business_id=$1", [req.user!.business_id])).count);
  if (max <= 1) throw paymentRequired("Multiple cleaner logins are available on the Business plan.");
  if (count >= max) throw paymentRequired(`Your plan allows up to ${max} users.`);
  if (await one("SELECT 1 FROM users WHERE lower(email)=lower($1)", [body.email])) throw new HttpError(409, "A user with this email already exists");
  const hash = await bcrypt.hash(body.password, 12);
  await query("INSERT INTO users (business_id,email,name,password_hash,role) VALUES ($1,$2,$3,$4,'cleaner')", [req.user!.business_id, body.email, body.name, hash]);
  res.status(201).json({ ok: true });
});

businessRouter.delete("/team/:id", requireOwner, async (req, res) => {
  const id = idParam(req.params.id);
  if (id === req.user!.id) throw badRequest("You cannot remove yourself");
  const r = await query("DELETE FROM users WHERE id=$1 AND business_id=$2 AND role='cleaner'", [id, req.user!.business_id]);
  if (!r.rowCount) throw notFound("User not found");
  res.json({ ok: true });
});
