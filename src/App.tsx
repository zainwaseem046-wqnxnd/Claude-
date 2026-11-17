import { BrowserRouter, Route, Routes, Link } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { AppLayout } from "./components/AppLayout";
import { Landing } from "./pages/Landing";
import { Pricing } from "./pages/Pricing";
import { Login, Signup } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { Sites } from "./pages/Sites";
import { SiteForm } from "./pages/SiteForm";
import { NewVisit } from "./pages/NewVisit";
import { VisitForm } from "./pages/VisitForm";
import { Reports } from "./pages/Reports";
import { ReportView } from "./pages/ReportView";
import { Settings } from "./pages/Settings";
import { PublicReport } from "./pages/PublicReport";

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-3xl font-extrabold">Page not found</h1>
      <Link to="/" className="btn-primary mt-6">Go home</Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/r/:token" element={<PublicReport />} />
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="sites" element={<Sites />} />
            <Route path="sites/new" element={<SiteForm />} />
            <Route path="sites/:id/edit" element={<SiteForm />} />
            <Route path="visits/new" element={<NewVisit />} />
            <Route path="visits/:id" element={<VisitForm />} />
            <Route path="reports" element={<Reports />} />
            <Route path="reports/:id" element={<ReportView />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
