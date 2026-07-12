import { useState, useEffect } from "react";
import { st } from "./shared/analysisStyles";
import InventoryWorkspace from "./InventoryWorkspace";
import CustomerDuesWorkspace from "./CustomerDuesWorkspace";
import SupplierWorkspace from "./SupplierWorkspace";
import SalesWorkspace from "./SalesWorkspace";
import { getAnalysis } from "../../lib/posApi";

const WORKSPACES = [
  { id: "sales", label: "Sales" },
  { id: "inventory", label: "Inventory" },
  { id: "customerDues", label: "Customer Dues" },
  { id: "suppliers", label: "Suppliers" },
];

export function rs(n) {
  const v = Number(n || 0);
  return `Rs ${Math.round(v).toLocaleString()}`;
}

export default function AnalysisShell() {
  const [activeWorkspace, setActiveWorkspace] = useState("sales");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getAnalysis({});
        if (alive) setAnalysis(data);
      } catch (e) {
        console.error("Failed to load analysis", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const ov = analysis?.overview || {};
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = (analysis?.salesByDay || []).filter(d => d.date === today).reduce((s, d) => s + Number(d.total || 0), 0);
  const expensesToday = 0; // per-day expense split not surfaced; overall shown in Expenses page

  function renderWorkspace() {
    switch (activeWorkspace) {
      case "inventory": return <InventoryWorkspace analysis={analysis} />;
      case "customerDues": return <CustomerDuesWorkspace analysis={analysis} />;
      case "suppliers": return <SupplierWorkspace analysis={analysis} />;
      case "sales": default: return <SalesWorkspace analysis={analysis} />;
    }
  }

  return (
    <div style={st.page}>
      <div style={st.shell}>
        {/* STABLE HEADER */}
        <div style={st.header}>
          <div>
            <h1 style={st.title}>Operational Analysis</h1>
            <p style={st.subtitle}>Inventory movement, stock awareness and financial overview.</p>
          </div>
          <button style={st.exportBtn}>Export Report</button>
        </div>

        {/* WORKSPACE NAVIGATION */}
        <div style={st.navStrip}>
          {WORKSPACES.map((ws) => (
            <button
              key={ws.id}
              style={{ ...st.navBtn, ...(activeWorkspace === ws.id ? st.navBtnActive : {}) }}
              onClick={() => setActiveWorkspace(ws.id)}
            >
              {ws.label}
            </button>
          ))}
        </div>

        {/* STABLE STATUS BAR */}
        <div style={st.statusBar}>
          <StatusCard label="Today's Sales" value={loading ? "…" : rs(todaySales)} />
          <StatusCard label="Cash In Hand" value={loading ? "…" : rs(ov.cashInHand)} />
          <StatusCard label="Supplier Dues" value={loading ? "…" : rs(ov.totalPayable)} />
          <StatusCard label="Credit Outstanding" value={loading ? "…" : rs(ov.totalReceivable)} />
          <StatusCard label="Inventory Value" value={loading ? "…" : rs(analysis?.inventory?.stockValue)} />
        </div>

        {/* MAIN GRID: WORKSPACE BODY + STABLE RIGHT PANEL */}
        <div style={st.mainGrid}>
          <div style={st.workspaceBody}>
            {renderWorkspace()}
          </div>

          <div style={st.rightPanel}>
            {/* FINANCIAL OVERVIEW */}
            <div style={st.sideCard}>
              <h3 style={st.sideTitle}>Financial Overview</h3>
              <div style={st.metricList}>
                <MetricRow label="Net Profit (period)" value={loading ? "…" : rs(ov.netProfit)} highlight />
                <MetricRow label="Gross Profit (period)" value={loading ? "…" : rs(ov.grossProfit)} />
                <MetricRow label="Pending Supplier Payments" value={loading ? "…" : rs(ov.totalPayable)} />
                <MetricRow label="Customer Credit" value={loading ? "…" : rs(ov.totalReceivable)} />
                <MetricRow label="Total Expenses (period)" value={loading ? "…" : rs(ov.expenses)} />
              </div>
            </div>

            {/* OPERATIONAL RECOMMENDATIONS */}
            <div style={st.sideCard}>
              <h3 style={st.sideTitle}>Operational Recommendations</h3>
              <div style={st.insightList}>
                <div style={st.insightItem}>Roundup likely requires restocking within 5 days based on current movement.</div>
                <div style={st.insightItem}>12 batches approaching expiry this month — review inventory workspace.</div>
                <div style={st.insightItem}>Ali Traders credit overdue by 41 days. Consider follow-up.</div>
                <div style={st.insightItem}>Mospilan movement slowing compared to last month.</div>
              </div>
            </div>

            {/* RECENT ACTIVITY */}
            <div style={st.sideCard}>
              <h3 style={st.sideTitle}>Recent Activity</h3>
              <div style={st.activityList}>
                <div style={st.activityItem}>Invoice INV-1042 generated.</div>
                <div style={st.activityItem}>New supplier payment recorded for Bayer.</div>
                <div style={st.activityItem}>Inventory batch added for Roundup.</div>
                <div style={st.activityItem}>Product pricing updated for Mospilan.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ label, value }) {
  return (
    <div style={st.statusCard}>
      <span style={st.statusLabel}>{label}</span>
      <strong style={st.statusValue}>{value}</strong>
    </div>
  );
}

function MetricRow({ label, value, highlight }) {
  return (
    <div style={{ ...st.metricRow, ...(highlight ? st.metricHighlight : {}) }}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
