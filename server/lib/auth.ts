import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { one, query } from "../db.js";
import { config } from "../config.js";
import { HttpError, forbidden } from "./errors.js";

export const SESSION_COOKIE = "cp_session";
const SESSION_DAYS = 30;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "owner" | "cleaner";
  business_id: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function createSession(res: Response, userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)", [hashToken(token), userId, expires]);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    expires,
    path: "/",
  });
}

export async function destroySession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token.length > 20) {
    const u = await one<AuthUser>(
      `SELECT u.id, u.email, u.name, u.role, u.business_id
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash=$1 AND s.expires_at > now()`,
      [hashToken(token)],
    );
    if (u) req.user = u;
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, "Please log in"));
  next();
}

export function requireOwner(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, "Please log in"));
  if (req.user.role !== "owner") return next(forbidden("Only the account owner can do that"));
  next();
}

/** CSRF defence: state-changing API calls must carry a custom header, which browsers will not send cross-site without CORS. */
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("x-requested-with") !== "cleaningproof") return next(new HttpError(403, "Missing request header"));
  next();
}
