import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool, one } from "../db.js";
import { createSession, destroySession, requireAuth } from "../lib/auth.js";
import { HttpError } from "../lib/errors.js";
import { parse, requiredText, email } from "../lib/validate.js";
import { isActive, limitsFor } from "../lib/plans.js";

export const authRouter = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts. Please wait a few minutes and try again." } });

const DUMMY_HASH = bcrypt.hashSync("timing-equaliser", 12);
const password = z.string().min(8, "must be at least 8 characters").max(200);

authRouter.post("/signup", authLimiter, async (req, res) => {
  const body = parse(z.object({ businessName: requiredText(120), name: requiredText(100), email, password }), req.body);
  const existing = await one("SELECT 1 FROM users WHERE lower(email)=lower($1)", [body.email]);
  if (existing) throw new HttpError(409, "An account with this email already exists. Try logging in.");
  const hash = await bcrypt.hash(body.password, 12);
  const client = await pool.connect();
  let userId: string;
  try {
    await client.query("BEGIN");
    const b = await client.query("INSERT INTO businesses (name, contact_email) VALUES ($1,$2) RETURNING id", [body.businessName, body.email]);
    const u = await client.query(
      "INSERT INTO users (business_id, email, name, password_hash, role) VALUES ($1,$2,$3,$4,'owner') RETURNING id",
      [b.rows[0].id, body.email, body.name, hash],
    );
    await client.query("COMMIT");
    userId = u.rows[0].id;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  await createSession(res, userId);
  res.status(201).json({ ok: true });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1).max(200) }), req.body);
  const u = await one("SELECT id, password_hash FROM users WHERE lower(email)=lower($1)", [body.email]);
  // Compare against a dummy hash when the user doesn't exist to keep timing similar.
  const ok = await bcrypt.compare(body.password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !ok) throw new HttpError(401, "Incorrect email or password");
  await createSession(res, u.id);
  res.json({ ok: true });
});

authRouter.post("/logout", async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const b = await one(
    "SELECT id,name,contact_email,phone,address,website,(logo_file IS NOT NULL) AS has_logo,plan,trial_ends_at,subscription_status FROM businesses WHERE id=$1",
    [req.user!.business_id],
  );
  res.json({
    user: { id: req.user!.id, name: req.user!.name, email: req.user!.email, role: req.user!.role },
    business: b,
    billing: { active: isActive(b), limits: limitsFor(b) },
  });
});
