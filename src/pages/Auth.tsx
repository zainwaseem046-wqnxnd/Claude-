import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Logo, Spinner } from "../components/ui";

function Shell({ title, subtitle, children }: { title: string; subtitle: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-navy-50/50">
      <div className="px-4 py-5"><Logo /></div>
      <div className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center">
        <div className="card w-full max-w-md p-6 sm:p-8">
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <p className="mt-1 text-navy-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const { me, refresh } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (me) return <Navigate to="/app" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api.post("/api/auth/login", { email, password });
      await refresh();
      nav("/app");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <Shell title="Log in" subtitle={<>New to CleaningProof? <Link to="/signup" className="font-semibold text-brand-600">Start a free trial</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div><label className="label" htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label" htmlFor="pw">Password</label><input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn-primary btn-lg w-full" disabled={busy}>{busy && <Spinner />}Log in</button>
      </form>
    </Shell>
  );
}

export function Signup() {
  const { me, refresh } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ businessName: "", name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const justCreated = useRef(false);
  if (me && !justCreated.current) return <Navigate to="/app" replace />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api.post("/api/auth/signup", f);
      justCreated.current = true;
      await refresh();
      nav("/app/sites/new?welcome=1");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <Shell title="Start your free trial" subtitle={<>14 days free, no card needed. Already have an account? <Link to="/login" className="font-semibold text-brand-600">Log in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div><label className="label" htmlFor="bn">Business name</label><input id="bn" className="input" required maxLength={120} autoComplete="organization" value={f.businessName} onChange={set("businessName")} placeholder="e.g. Sparkle Commercial Cleaning Ltd" /></div>
        <div><label className="label" htmlFor="nm">Your name</label><input id="nm" className="input" required maxLength={100} autoComplete="name" value={f.name} onChange={set("name")} /></div>
        <div><label className="label" htmlFor="em">Work email</label><input id="em" className="input" type="email" required autoComplete="email" value={f.email} onChange={set("email")} /></div>
        <div><label className="label" htmlFor="pw">Password</label><input id="pw" className="input" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set("password")} /><p className="hint">At least 8 characters.</p></div>
        <button className="btn-primary btn-lg w-full" disabled={busy}>{busy && <Spinner />}Create account</button>
      </form>
    </Shell>
  );
}
