import { one, query } from "../db.js";
import { notFound } from "./errors.js";

export interface TaskItem { task: string; done: boolean }

export interface ReportData {
  visit: {
    id: string; status: string; cleaner_name: string; visit_at: Date; areas_cleaned: string[]; tasks: TaskItem[];
    incomplete_reason: string; issues: string; issues_resolved: boolean; notes: string; submitted_at: Date | null;
    share_token: string | null; last_sent_at: Date | null; last_sent_to: string | null; created_at: Date; updated_at: Date;
  };
  site: { id: string; name: string; address: string; contact_name: string; contact_email: string; frequency: string };
  business: {
    id: string; name: string; contact_email: string; phone: string; address: string; website: string;
    logo_file: string | null; plan: any; trial_ends_at: Date; subscription_status: string | null;
  };
  photos: { id: string; kind: "before" | "after"; file_name: string; mime: string }[];
}

/** Loads a visit and its related records. Pass businessId to enforce tenant isolation, or a shareToken for public access. */
export async function loadReport(opts: { visitId: string; businessId: string } | { shareToken: string }): Promise<ReportData> {
  const row =
    "shareToken" in opts
      ? await one(`SELECT * FROM visits WHERE share_token=$1 AND status='submitted'`, [opts.shareToken])
      : await one(`SELECT * FROM visits WHERE id=$1 AND business_id=$2`, [opts.visitId, opts.businessId]);
  if (!row) throw notFound("Report not found");
  const site = await one(`SELECT id,name,address,contact_name,contact_email,frequency FROM sites WHERE id=$1 AND business_id=$2`, [row.site_id, row.business_id]);
  const business = await one(
    `SELECT id,name,contact_email,phone,address,website,logo_file,plan,trial_ends_at,subscription_status FROM businesses WHERE id=$1`,
    [row.business_id],
  );
  const photos = await query(`SELECT id,kind,file_name,mime FROM photos WHERE visit_id=$1 AND business_id=$2 ORDER BY kind DESC, created_at`, [row.id, row.business_id]);
  if (!site || !business) throw notFound("Report not found");
  return { visit: row, site, business, photos: photos.rows };
}
