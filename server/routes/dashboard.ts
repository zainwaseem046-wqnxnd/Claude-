import { Router } from "express";
import { one, query } from "../db.js";
import { requireAuth } from "../lib/auth.js";
import { limitsFor } from "../lib/plans.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/", async (req, res) => {
  const bid = req.user!.business_id;
  const stats = await one(
    `SELECT
       (SELECT count(*)::int FROM visits WHERE business_id=$1 AND status='submitted') AS total_visits,
       (SELECT count(*)::int FROM visits WHERE business_id=$1 AND status='submitted'
          AND visit_at >= (date_trunc('month', now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London')) AS visits_this_month,
       (SELECT count(*)::int FROM sites WHERE business_id=$1 AND NOT archived) AS active_sites,
       (SELECT count(*)::int FROM visits WHERE business_id=$1 AND status='submitted' AND issues <> '' AND NOT issues_resolved) AS open_issues,
       (SELECT count(*)::int FROM visits WHERE business_id=$1 AND status='draft') AS drafts`,
    [bid],
  );
  const recent = await query(
    `SELECT v.id, v.visit_at, v.cleaner_name, s.name AS site_name, v.issues <> '' AND NOT v.issues_resolved AS open_issue,
            jsonb_array_length(v.tasks) AS task_count,
            (SELECT count(*)::int FROM jsonb_array_elements(v.tasks) t WHERE (t->>'done')::boolean) AS done_count
       FROM visits v JOIN sites s ON s.id=v.site_id WHERE v.business_id=$1 AND v.status='submitted' ORDER BY v.visit_at DESC LIMIT 6`,
    [bid],
  );
  const drafts = await query(
    `SELECT v.id, v.updated_at, v.cleaner_name, s.name AS site_name FROM visits v JOIN sites s ON s.id=v.site_id
      WHERE v.business_id=$1 AND v.status='draft' ORDER BY v.updated_at DESC LIMIT 6`,
    [bid],
  );
  const b = await one("SELECT plan, trial_ends_at, subscription_status FROM businesses WHERE id=$1", [bid]);
  let siteStats = null;
  if (limitsFor(b).advancedReporting) {
    siteStats = (
      await query(
        `SELECT s.id, s.name, s.frequency,
                count(v.id) FILTER (WHERE v.visit_at > now() - interval '30 days')::int AS visits_30d,
                max(v.visit_at) AS last_visit_at,
                count(v.id) FILTER (WHERE v.issues <> '' AND NOT v.issues_resolved)::int AS open_issues,
                coalesce(round(100.0 * sum((SELECT count(*) FROM jsonb_array_elements(v.tasks) t WHERE (t->>'done')::boolean)) FILTER (WHERE v.visit_at > now() - interval '30 days')
                  / nullif(sum(jsonb_array_length(v.tasks)) FILTER (WHERE v.visit_at > now() - interval '30 days'), 0)), NULL)::int AS completion_pct
           FROM sites s LEFT JOIN visits v ON v.site_id=s.id AND v.status='submitted'
          WHERE s.business_id=$1 AND NOT s.archived GROUP BY s.id ORDER BY s.name`,
        [bid],
      )
    ).rows;
  }
  res.json({ stats, recent: recent.rows, drafts: drafts.rows, siteStats });
});
