/**
 * End-to-end API smoke test. Start the server first (npm run dev or npm start), then:
 *   BASE_URL=http://localhost:3000 npm run test:e2e
 */
import zlib from "node:zlib";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let passed = 0;

class Client {
  cookie = "";
  async req(method: string, path: string, body?: unknown, opts: { csrf?: boolean; raw?: boolean } = {}) {
    const headers: Record<string, string> = {};
    if (opts.csrf !== false) headers["X-Requested-With"] = "cleaningproof";
    if (this.cookie) headers.Cookie = this.cookie;
    let payload: any;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    if (opts.raw) return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, headers: res.headers };
  }
}

function check(name: string, cond: unknown) {
  assert.ok(cond, name);
  passed++;
  console.log(`  ✓ ${name}`);
}

/** Builds a valid solid-colour PNG so pdfkit can embed it. */
function png(w = 64, h = 48, rgb = [22, 163, 74]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const form = (buf: Buffer, name: string, type: string) => { const f = new FormData(); f.append("file", new Blob([buf], { type }), name); return f; };

async function main() {
  const stamp = Date.now();
  const a = new Client();
  const b = new Client();
  console.log(`Smoke test against ${BASE}`);

  console.log("Auth");
  check("rejects request without CSRF header", (await a.req("POST", "/api/auth/signup", {}, { csrf: false })).status === 403);
  check("validates signup", (await a.req("POST", "/api/auth/signup", { businessName: "", name: "x", email: "bad", password: "1" })).status === 400);
  check("signup A", (await a.req("POST", "/api/auth/signup", { businessName: "Sparkle Ltd", name: "Alice Owner", email: `alice${stamp}@test.dev`, password: "password123" })).status === 201);
  check("signup B", (await b.req("POST", "/api/auth/signup", { businessName: "Rival Cleaners", name: "Bob", email: `bob${stamp}@test.dev`, password: "password123" })).status === 201);
  check("duplicate email rejected", (await new Client().req("POST", "/api/auth/signup", { businessName: "X", name: "X", email: `alice${stamp}@test.dev`, password: "password123" })).status === 409);
  const me = await a.req("GET", "/api/auth/me");
  check("me returns trial business", me.json.business?.plan === "trial" && me.json.billing.active === true);
  check("wrong password rejected", (await new Client().req("POST", "/api/auth/login", { email: `alice${stamp}@test.dev`, password: "nope-nope" })).status === 401);
  check("unauthenticated dashboard blocked", (await new Client().req("GET", "/api/dashboard")).status === 401);

  console.log("Sites");
  check("site validation (needs checklist)", (await a.req("POST", "/api/sites", { name: "X", address: "", contact_name: "", contact_email: "", frequency: "weekly", areas: [], checklist: [] })).status === 400);
  const site = await a.req("POST", "/api/sites", {
    name: "Harbour House Offices", address: "1 Quay St, Bristol BS1", contact_name: "Pat Manager", contact_email: "pat@client.dev",
    frequency: "weekly", areas: ["Reception", "Kitchen", "Toilets"], checklist: ["Empty bins", "Vacuum carpets", "Clean toilets", "Restock soap"],
  });
  check("create site", site.status === 201 && site.json.id);
  const siteId = site.json.id;
  check("other business cannot read site", (await b.req("GET", `/api/sites/${siteId}`)).status === 404);
  check("other business cannot edit site", (await b.req("PUT", `/api/sites/${siteId}`, { name: "Hacked", address: "", contact_name: "", contact_email: "", frequency: "weekly", areas: [], checklist: ["x"] })).status === 404);

  console.log("Visit");
  const visit = await a.req("POST", "/api/visits", { site_id: siteId });
  check("start visit (draft)", visit.status === 201);
  const vid = visit.json.id;
  check("other business cannot start visit on site", (await b.req("POST", "/api/visits", { site_id: siteId })).status === 404);
  const draft = await a.req("GET", `/api/visits/${vid}`);
  check("draft has checklist tasks from site", draft.json.visit.tasks.length === 4 && draft.json.visit.status === "draft");
  const dash0 = await a.req("GET", "/api/dashboard");
  check("dashboard counts draft awaiting submission", dash0.json.stats.drafts === 1);

  const tasks = draft.json.visit.tasks.map((t: any, i: number) => ({ ...t, done: i < 3 }));
  const save = await a.req("PUT", `/api/visits/${vid}`, {
    cleaner_name: "Chris Cleaner", visit_at: new Date().toISOString(), areas_cleaned: ["Reception", "Kitchen"], tasks,
    incomplete_reason: "", issues: "Leaking tap in ground floor toilet", notes: "Alarm code changed",
  });
  check("autosave draft", save.status === 200);
  check("submit blocked without reason for incomplete task", (await a.req("POST", `/api/visits/${vid}/submit`)).status === 400);
  await a.req("PUT", `/api/visits/${vid}`, {
    cleaner_name: "Chris Cleaner", visit_at: new Date().toISOString(), areas_cleaned: ["Reception", "Kitchen"], tasks,
    incomplete_reason: "Soap delivery not arrived", issues: "Leaking tap in ground floor toilet", notes: "Alarm code changed",
  });

  console.log("Photos");
  check("rejects non-image disguised as jpg", (await a.req("POST", `/api/visits/${vid}/photos?kind=before`, form(Buffer.from("<script>alert(1)</script>"), "x.jpg", "image/jpeg"))).status === 400);
  check("rejects bad kind", (await a.req("POST", `/api/visits/${vid}/photos?kind=other`, form(png(), "a.png", "image/png"))).status === 400);
  check("rejects oversize upload", (await a.req("POST", `/api/visits/${vid}/photos?kind=before`, form(Buffer.alloc(9 * 1024 * 1024, 0xff), "big.jpg", "image/jpeg"))).status === 413);
  const p1 = await a.req("POST", `/api/visits/${vid}/photos?kind=before`, form(png(64, 48, [200, 120, 40]), "a.png", "image/png"));
  const p2 = await a.req("POST", `/api/visits/${vid}/photos?kind=after`, form(png(64, 48, [22, 163, 74]), "b.png", "image/png"));
  check("upload before + after photos", p1.status === 201 && p2.status === 201);
  const photoId = p1.json.photo.id;
  const ph = await a.req("GET", `/api/visits/${vid}/photos/${photoId}`, undefined, { raw: true });
  check("owner can view photo", ph.status === 200 && ph.headers.get("content-type")?.includes("image/png"));
  check("other business cannot view photo", (await b.req("GET", `/api/visits/${vid}/photos/${photoId}`, undefined, { raw: true })).status === 404);
  check("anonymous cannot view photo", (await new Client().req("GET", `/api/visits/${vid}/photos/${photoId}`, undefined, { raw: true })).status === 401);

  console.log("Submit & report");
  check("submit report", (await a.req("POST", `/api/visits/${vid}/submit`)).status === 200);
  check("submitted report is locked", (await a.req("PUT", `/api/visits/${vid}`, { cleaner_name: "x", visit_at: new Date().toISOString(), areas_cleaned: [], tasks: [], incomplete_reason: "", issues: "", notes: "" })).status === 409);
  const pdf = await a.req("GET", `/api/visits/${vid}/pdf`, undefined, { raw: true });
  check("PDF generated", pdf.status === 200 && pdf.buf.subarray(0, 5).toString() === "%PDF-" && pdf.buf.length > 2000);
  check("other business cannot download PDF", (await b.req("GET", `/api/visits/${vid}/pdf`, undefined, { raw: true })).status === 404);

  const list = await a.req("GET", `/api/visits?q=harbour&site_id=${siteId}&from=2000-01-01&to=2100-01-01`);
  check("history search + filters find report", list.json.total === 1 && list.json.visits[0].id === vid);
  check("history search excludes non-matching", (await a.req("GET", "/api/visits?q=zzznomatch")).json.total === 0);
  check("history is isolated per business", (await b.req("GET", "/api/visits")).json.total === 0);

  const dash = await a.req("GET", "/api/dashboard");
  check("dashboard stats are live", dash.json.stats.total_visits === 1 && dash.json.stats.visits_this_month === 1 && dash.json.stats.open_issues === 1 && dash.json.stats.drafts === 0 && dash.json.stats.active_sites === 1);

  console.log("Sharing");
  const share = await a.req("POST", `/api/visits/${vid}/share`);
  check("create share link", share.status === 200 && share.json.token.length >= 32);
  const token = share.json.token;
  const anon = new Client();
  const pub = await anon.req("GET", `/api/public/reports/${token}`);
  check("public can view shared report without account", pub.status === 200 && pub.json.site.name === "Harbour House Offices");
  check("public payload hides internal ids", !JSON.stringify(pub.json).includes(vid) && !JSON.stringify(pub.json).includes(siteId));
  check("public can view photo of shared report", (await anon.req("GET", `/api/public/reports/${token}/photos/${photoId}`, undefined, { raw: true })).status === 200);
  check("public PDF download", (await anon.req("GET", `/api/public/reports/${token}/pdf`, undefined, { raw: true })).buf.subarray(0, 5).toString() === "%PDF-");
  check("guessed token rejected", (await anon.req("GET", `/api/public/reports/${"A".repeat(32)}`)).status === 404);

  // A second report from another business must not be reachable with A's token
  const bSite = await b.req("POST", "/api/sites", { name: "B site", address: "", contact_name: "", contact_email: "", frequency: "daily", areas: [], checklist: ["Task"] });
  const bVisit = await b.req("POST", "/api/visits", { site_id: bSite.json.id });
  await b.req("PUT", `/api/visits/${bVisit.json.id}`, { cleaner_name: "Bob", visit_at: new Date().toISOString(), areas_cleaned: [], tasks: [{ task: "Task", done: true }], incomplete_reason: "", issues: "", notes: "" });
  const bPhoto = await b.req("POST", `/api/visits/${bVisit.json.id}/photos?kind=after`, form(png(), "c.png", "image/png"));
  check("token cannot access another report's photo", (await anon.req("GET", `/api/public/reports/${token}/photos/${bPhoto.json.photo.id}`, undefined, { raw: true })).status === 404);

  console.log("Email & issues");
  const send = await a.req("POST", `/api/visits/${vid}/send`, { to: "pat@client.dev" });
  check("send report email", send.status === 200);
  check("send validates email", (await a.req("POST", `/api/visits/${vid}/send`, { to: "not-an-email" })).status === 400);
  check("mark issue resolved", (await a.req("POST", `/api/visits/${vid}/issues`, { resolved: true })).status === 200);
  check("dashboard issue count updates", (await a.req("GET", "/api/dashboard")).json.stats.open_issues === 0);
  check("revoke share link", (await a.req("DELETE", `/api/visits/${vid}/share`)).status === 200);
  check("revoked link stops working", (await anon.req("GET", `/api/public/reports/${token}`)).status === 404);

  console.log("Plan gating");
  check("CSV export requires Business plan", (await a.req("GET", "/api/visits/export.csv", undefined, { raw: true })).status === 402);
  check("team members require Business plan", (await a.req("POST", "/api/team", { name: "C", email: `c${stamp}@test.dev`, password: "password123" })).status === 402);
  check("logo upload allowed on trial", (await a.req("POST", "/api/business/logo", form(png(120, 40, [15, 27, 48]), "logo.png", "image/png"))).status === 200);
  check("billing endpoint", (await a.req("GET", "/api/billing")).json.limits.maxSites === 20);

  console.log("Logout");
  await a.req("POST", "/api/auth/logout");
  check("session ended", (await a.req("GET", "/api/auth/me")).status === 401);

  console.log(`\nAll ${passed} checks passed.`);
}

main().catch((e) => { console.error("\n✗ FAILED:", e.message); process.exit(1); });
