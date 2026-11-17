import { z } from "zod";
import { badRequest } from "./errors.js";

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    const field = issue.path.join(".");
    throw badRequest(field ? `${humanise(field)}: ${issue.message}` : issue.message);
  }
  return r.data;
}

const humanise = (f: string) => f.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const uuid = z.string().uuid("Invalid id");
export const text = (max: number) => z.string().trim().max(max, `must be ${max} characters or fewer`);
export const requiredText = (max: number) => text(max).min(1, "is required");
export const email = z.string().trim().toLowerCase().email("must be a valid email address").max(254);
export const optionalEmail = z.union([z.literal(""), email]);
export const idParam = (id: unknown) => parse(uuid, id);
