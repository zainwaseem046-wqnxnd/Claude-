export type PlanId = "trial" | "starter" | "professional" | "business";
export interface Limits { label: string; priceGbp: number; maxSites: number; maxUsers: number; branding: boolean; sharing: boolean; advancedReporting: boolean }
export interface Business { id: string; name: string; contact_email: string; phone: string; address: string; website: string; has_logo: boolean; plan: PlanId; trial_ends_at: string; subscription_status: string | null }
export interface Me { user: { id: string; name: string; email: string; role: "owner" | "cleaner" }; business: Business; billing: { active: boolean; limits: Limits } }
export interface Site { id: string; name: string; address: string; contact_name: string; contact_email: string; frequency: string; areas: string[]; checklist: string[]; archived: boolean; last_visit_at: string | null; visit_count: number }
export interface Task { task: string; done: boolean }
export interface Visit {
  id: string; status: "draft" | "submitted"; cleaner_name: string; visit_at: string; areas_cleaned: string[]; tasks: Task[];
  incomplete_reason: string; issues: string; issues_resolved: boolean; notes: string; share_token: string | null;
  submitted_at: string | null; last_sent_at: string | null; last_sent_to: string | null; updated_at: string; created_by: string | null;
}
export interface Photo { id: string; kind: "before" | "after" }
export interface VisitListItem {
  id: string; status: string; cleaner_name: string; visit_at: string; submitted_at: string | null; updated_at: string; has_issues: boolean; issues_resolved: boolean;
  last_sent_at: string | null; shared: boolean; site_id: string; site_name: string; task_count: number; done_count: string | number; photo_count: number;
}
export const FREQUENCIES: { value: string; label: string }[] = [
  { value: "daily", label: "Daily" }, { value: "weekdays", label: "Weekdays (Mon–Fri)" }, { value: "twice-weekly", label: "Twice weekly" },
  { value: "weekly", label: "Weekly" }, { value: "fortnightly", label: "Fortnightly" }, { value: "monthly", label: "Monthly" }, { value: "ad-hoc", label: "Ad hoc" },
];
export const frequencyLabel = (v: string) => FREQUENCIES.find((f) => f.value === v)?.label ?? v;
