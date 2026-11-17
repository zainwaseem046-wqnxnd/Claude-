import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";
import { HttpError } from "./errors.js";

let transporter: Transporter | null = null;

export function emailConfigured() {
  return Boolean(config.smtp.host) || !config.isProd;
}

function getTransport() {
  if (transporter) return transporter;
  if (config.smtp.host) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  } else if (!config.isProd) {
    // Development without SMTP: messages are rendered and logged instead of delivered.
    transporter = nodemailer.createTransport({ jsonTransport: true });
  } else {
    throw new HttpError(503, "Email is not configured on this server (set SMTP_HOST). Use the share link or download the PDF instead.");
  }
  return transporter;
}

export async function sendMail(msg: { to: string; replyTo?: string; subject: string; text: string; html: string; attachments?: { filename: string; content: Buffer }[] }) {
  const t = getTransport();
  const info = await t.sendMail({ from: config.smtp.from, ...msg });
  if (!config.smtp.host) console.log(`[mail:dev] would send "${msg.subject}" to ${msg.to} (${msg.attachments?.length ?? 0} attachment(s))`);
  return { delivered: Boolean(config.smtp.host), id: info.messageId };
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
