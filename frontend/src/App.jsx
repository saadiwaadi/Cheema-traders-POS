import { HashRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import BillingPage from "./pages/bill";
import InvoiceHistory from "./pages/invoices";
import SalesHistory from "./pages/SalesHistory";
import AnalysisPage from "./pages/analysis/AnalysisShell";
import ReportsPage from "./pages/reports";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/"          element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/bill"      element={<BillingPage />} />
        <Route path="/invoices"  element={<InvoiceHistory />} />
        <Route path="/sales"     element={<SalesHistory />} />
        <Route path="/analysis"  element={<AnalysisPage />} />
        <Route path="/reports/*" element={<ReportsPage />} />
      </Routes>
    </HashRouter>
  );
}

export default App;