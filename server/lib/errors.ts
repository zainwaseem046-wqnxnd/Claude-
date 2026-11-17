export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
export const badRequest = (m: string) => new HttpError(400, m);
export const notFound = (m = "Not found") => new HttpError(404, m);
export const forbidden = (m = "You do not have permission to do that") => new HttpError(403, m);
export const paymentRequired = (m: string, code = "plan_required") => new HttpError(402, m, code);
