import { useState, useEffect } from "react";
import { st } from "./shared/analysisStyles";
import InventoryWorkspace from "./InventoryWorkspace";
import CustomerDuesWorkspace from "./CustomerDuesWorkspace";
import SupplierWorkspace from "./SupplierWorkspace";
import SalesWorkspace from "./SalesWorkspace";
import { getAnalysisOverview } from "../../lib/posApi";

const WORKSPACES = [
  { id: "sales", label: "Sales" },
  { id: "inventory", label: "Inventory" },
  { id: "customerDues", label: "Customer Dues" },
  { id: "suppliers", label: "Suppliers" },
];

export default function AnalysisShell() {
  const [activeWorkspace, setActiveWorkspace] = useState("sales");
  const [overview, setOverview] = useState({
    todaySales: 0,
    cashInHand: 0,
    supplierDues: 0,
    creditOutstanding: 0,
    inventoryValue: 0,
    todayExpenses: 0,
    todayProfit: 0,
    recommendations: [],
    activities: []
  });

  useEffect(() => {
    getAnalysisOverview()
      .then((data) => {
        if (data) {
          setOverview(data);
        }
      })
      .catch(console.error);
  }, [activeWorkspace]);

  function renderWorkspace() {
    switch (activeWorkspace) {
      case "inventory": return <InventoryWorkspace />;
      case "customerDues": return <CustomerDuesWorkspace />;
      case "suppliers": return <SupplierWorkspace />;
      case "sales": default: return <SalesWorkspace />;
    }
  }

  function formatValue(val) {
    if (val >= 1000000) return `Rs ${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `Rs ${(val / 1000).toFixed(1)}k`;
    return `Rs ${val.toLocaleString()}`;
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
          <StatusCard label="Today's Sales" value={`Rs ${overview.todaySales.toLocaleString()}`} />
          <StatusCard label="Cash In Hand" value={`Rs ${overview.cashInHand.toLocaleString()}`} />
          <StatusCard label="Supplier Dues" value={`Rs ${overview.supplierDues.toLocaleString()}`} />
          <StatusCard label="Credit Outstanding" value={`Rs ${overview.creditOutstanding.toLocaleString()}`} />
          <StatusCard label="Inventory Value" value={formatValue(overview.inventoryValue)} />
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
                <MetricRow label="Today's Profit" value={`Rs ${overview.todayProfit.toLocaleString()}`} highlight />
                <MetricRow label="Pending Supplier Payments" value={`Rs ${overview.supplierDues.toLocaleString()}`} />
                <MetricRow label="Customer Credit" value={`Rs ${overview.creditOutstanding.toLocaleString()}`} />
                <MetricRow label="Expenses Today" value={`Rs ${overview.todayExpenses.toLocaleString()}`} />
              </div>
            </div>

            {/* OPERATIONAL RECOMMENDATIONS */}
            <div style={st.sideCard}>
              <h3 style={st.sideTitle}>Operational Recommendations</h3>
              <div style={st.insightList}>
                {overview.recommendations.map((item, i) => (
                  <div key={i} style={st.insightItem}>{item}</div>
                ))}
              </div>
            </div>

            {/* RECENT ACTIVITY */}
            <div style={st.sideCard}>
              <h3 style={st.sideTitle}>Recent Activity</h3>
              <div style={st.activityList}>
                {overview.activities.map((item, i) => (
                  <div key={i} style={st.activityItem}>{item}</div>
                ))}
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
