import { HashRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import BillingPage from "./pages/bill";
import SalesHistory from "./pages/SalesHistory";
import AnalysisPage from "./pages/analysis/AnalysisShell";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/"          element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/bill"      element={<BillingPage />} />
        <Route path="/sales"     element={<SalesHistory />} />
        <Route path="/analysis"  element={<AnalysisPage />} />
      </Routes>
    </HashRouter>
  );
}

export default App;