/**
 * Operator tool to change a business's plan after payment is arranged (no payment provider is used).
 *
 *   npm run set-plan -- <owner-or-user-email> <starter|professional|business>   activate a paid plan
 *   npm run set-plan -- <email> inactive                                        suspend (reports stay viewable)
 *   npm run set-plan -- <email> trial <days>                                    (re)start a free trial of N days
 *   npm run set-plan -- <email>                                                 show current plan
 */
import { pool, one } from "../server/db.js";
import { PLANS, PAID_PLANS, isActive } from "../server/lib/plans.js";

async function main() {
  const [email, action, arg] = process.argv.slice(2);
  if (!email) throw new Error("Usage: npm run set-plan -- <email> [starter|professional|business|inactive|trial <days>]");
  const b = await one(
    `SELECT b.id, b.name, b.plan, b.trial_ends_at, b.subscription_status, b.plan_requested
       FROM users u JOIN businesses b ON b.id=u.business_id WHERE lower(u.email)=lower($1)`,
    [email],
  );
  if (!b) throw new Error(`No user with email ${email}`);

  if (action) {
    if ((PAID_PLANS as readonly string[]).includes(action)) {
      await pool.query("UPDATE businesses SET plan=$1, subscription_status='active', plan_requested=NULL, plan_requested_at=NULL WHERE id=$2", [action, b.id]);
    } else if (action === "inactive") {
      await pool.query("UPDATE businesses SET subscription_status='inactive' WHERE id=$1", [b.id]);
    } else if (action === "trial") {
      const days = Number(arg);
      if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("trial needs a number of days (1-365)");
      await pool.query("UPDATE businesses SET plan='trial', subscription_status=NULL, trial_ends_at=now() + make_interval(days => $1) WHERE id=$2", [days, b.id]);
    } else {
      throw new Error(`Unknown plan "${action}"`);
    }
  }

  const now = await one("SELECT name, plan, trial_ends_at, subscription_status, plan_requested FROM businesses WHERE id=$1", [b.id]);
  console.log(`${now.name}: ${PLANS[now.plan as keyof typeof PLANS].label}` +
    (now.plan === "trial" ? `, trial ends ${new Date(now.trial_ends_at).toISOString().slice(0, 10)}` : `, status ${now.subscription_status ?? "none"}`) +
    `, ${isActive(now) ? "ACTIVE" : "INACTIVE"}` + (now.plan_requested ? ` (requested: ${now.plan_requested})` : ""));
}

main().then(() => pool.end()).catch((e) => { console.error(e.message); pool.end(); process.exit(1); });
