import { Link } from "react-router-dom";
import { Icon, Logo } from "../components/ui";
import { PricingTable } from "../components/PricingTable";
import { useAuth } from "../lib/auth";

const features = [
  { icon: "camera", title: "Before & after photos", body: "Cleaners snap photos on their phone. We compress them for mobile data and store them privately." },
  { icon: "clipboard", title: "Site-specific checklists", body: "Every site gets its own areas and tasks. Tick them off in seconds. Missed tasks need a reason." },
  { icon: "file", title: "Branded PDF reports", body: "A professional report with your logo, the checklist, issues and photos is generated automatically." },
  { icon: "link", title: "Private client links", body: "Share each report with a private, unguessable link. Clients view it without creating an account." },
  { icon: "alert", title: "Issue tracking", body: "Leaks, broken fittings, missing supplies — log them on the visit and track until they're resolved." },
  { icon: "search", title: "Searchable history", body: "Find any visit by site, date or keyword. Download or resend a report whenever a client asks." },
];

const faqs = [
  { q: "How long does a report take?", a: "About two minutes. The cleaner picks the site, ticks the checklist, adds a few photos and taps submit. Drafts save automatically, so a dropped signal won't lose their work." },
  { q: "Do my clients need an account?", a: "No. On Professional and Business plans you can send a private link that opens just that one report — nothing else in your account is visible." },
  { q: "Are photos kept private?", a: "Yes. Photos are stored outside the public web, are only served to logged-in members of your company, or to someone holding the private link for that specific report. Location data is stripped before upload." },
  { q: "Does it work on any phone?", a: "Yes — CleaningProof runs in the browser on iPhone and Android. There's nothing to install." },
  { q: "Is there a free trial?", a: "Every account starts with a 14-day free trial with Professional features. No card needed to start." },
  { q: "How do I pay?", a: "Choose a plan in Settings and we'll invoice you monthly. There's no contract and no card details are stored in the app. Cancel any time by letting us know." },
];

export function Landing() {
  const { me } = useAuth();
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-30 border-b border-navy-100/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="flex items-center gap-2">
            <a href="#pricing" className="hidden px-3 text-sm font-semibold text-navy-600 hover:text-navy-900 sm:inline">Pricing</a>
            <a href="#faq" className="hidden px-3 text-sm font-semibold text-navy-600 hover:text-navy-900 sm:inline">FAQ</a>
            {me ? (
              <Link to="/app" className="btn-primary btn-sm">Open app</Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost btn-sm px-2 sm:px-3.5">Log in</Link>
                <Link to="/signup" className="btn-primary btn-sm"><span className="sm:hidden">Free trial</span><span className="hidden sm:inline">Start free trial</span></Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_70%_0%,#d1fadf_0%,transparent_60%)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1.1fr_1fr] md:py-24">
          <div>
            <span className="chip bg-brand-50 text-brand-700">For UK commercial cleaning companies</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] sm:text-5xl lg:text-6xl">
              Prove Every Clean. <span className="text-brand-600">Keep Every Client Informed.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-navy-600">
              Create professional cleaning completion reports with photos and checklists in minutes.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/signup" className="btn-primary btn-lg">Start your 14-day free trial</Link>
              <a href="#how" className="btn-secondary btn-lg">See how it works</a>
            </div>
            <p className="mt-4 text-sm text-navy-500">No card required · Works on any phone · Cancel any time</p>
          </div>
          <PhoneMock />
        </div>
      </section>

      <section className="border-y border-navy-100 bg-navy-50/50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-center sm:grid-cols-3">
          {["Offices & shared workspaces", "Communal apartment blocks", "Gyms, shops & commercial premises"].map((t) => (
            <div key={t} className="font-semibold text-navy-700">{t}</div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-extrabold sm:text-4xl">From clean to client in three steps</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            ["1", "Set up your sites", "Add each building with its contact, cleaning frequency and its own checklist."],
            ["2", "Cleaner completes the visit", "On their phone: tick tasks, add before & after photos, note any problems."],
            ["3", "Client gets the proof", "A branded PDF and a private link are ready the moment the report is submitted."],
          ].map(([n, t, b]) => (
            <div key={n} className="card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-900 font-bold text-white">{n}</div>
              <h3 className="mt-4 text-lg font-bold">{t}</h3>
              <p className="mt-2 text-navy-600">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="bg-navy-900 py-20 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold sm:text-4xl">Everything you need to prove the work. Nothing you don't.</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-200"><Icon name={f.icon} className="h-6 w-6" /></div>
                <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-navy-200">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-extrabold sm:text-4xl">Simple monthly pricing</h2>
        <p className="mt-3 text-center text-navy-600">Every plan starts with a 14-day free trial. Prices exclude VAT.</p>
        <div className="mt-12">
          <PricingTable renderAction={(_id, popular) => <Link to="/signup" className={`${popular ? "btn-primary" : "btn-secondary"} w-full`}>Start free trial</Link>} />
        </div>
      </section>

      <section id="faq" className="bg-navy-50/50 py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-extrabold sm:text-4xl">Frequently asked questions</h2>
          <div className="mt-10 space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="card group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-lg font-semibold">
                  {f.q}
                  <Icon name="plus" className="h-5 w-5 shrink-0 text-brand-600 transition group-open:rotate-45" />
                </summary>
                <p className="mt-3 text-navy-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="rounded-3xl bg-navy-900 px-6 py-14 text-center text-white">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Stop arguing about whether the job was done.</h2>
          <p className="mx-auto mt-3 max-w-xl text-navy-200">Send proof after every visit and keep your contracts.</p>
          <Link to="/signup" className="btn-primary btn-lg mt-8">Create your free account</Link>
        </div>
      </section>

      <footer className="border-t border-navy-100 py-8 text-center text-sm text-navy-500">
        © {new Date().getFullYear()} CleaningProof · <Link to="/login" className="hover:text-navy-900">Log in</Link> · <Link to="/pricing" className="hover:text-navy-900">Pricing</Link>
      </footer>
    </div>
  );
}

function PhoneMock() {
  const tasks: [string, boolean][] = [["Vacuum all carpets", true], ["Empty bins & replace liners", true], ["Clean & disinfect toilets", true], ["Restock hand soap", false]];
  return (
    <div className="mx-auto w-full max-w-[320px] rounded-[2.5rem] border-[10px] border-navy-900 bg-white shadow-2xl">
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div><div className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">Visit report</div><div className="font-bold">Harbour House Offices</div></div>
          <span className="chip bg-brand-50 text-brand-700">3/4</span>
        </div>
        {tasks.map(([t, d]) => (
          <div key={t} className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-medium ${d ? "border-brand-200 bg-brand-50" : "border-navy-100"}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-md ${d ? "bg-brand-500 text-white" : "border-2 border-navy-200"}`}>{d && <Icon name="check" className="h-4 w-4" />}</span>{t}
          </div>
        ))}
        <div className="grid grid-cols-3 gap-2">
          {["bg-gradient-to-br from-navy-100 to-navy-200", "bg-gradient-to-br from-brand-100 to-brand-200", "border-2 border-dashed border-navy-200"].map((c, i) => (
            <div key={i} className={`flex aspect-square items-center justify-center rounded-lg text-navy-400 ${c}`}>{i === 2 && <Icon name="camera" />}</div>
          ))}
        </div>
        <div className="flex h-12 items-center justify-center rounded-xl bg-brand-500 font-semibold text-white">Submit report</div>
      </div>
    </div>
  );
}
