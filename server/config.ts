import "dotenv/config";
import path from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  isProd: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? "./uploads"),
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  /** Where plan upgrade requests are emailed. Payments are handled manually (invoice/bank transfer). */
  billingContactEmail: process.env.BILLING_CONTACT_EMAIL ?? "",
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "CleaningProof <reports@example.com>",
  },
};
