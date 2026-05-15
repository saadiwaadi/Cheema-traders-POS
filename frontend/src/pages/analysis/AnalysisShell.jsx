import { useState } from "react";
import { st } from "./shared/analysisStyles";
import OverviewWorkspace from "./OverviewWorkspace";
import InventoryWorkspace from "./InventoryWorkspace";
import CustomerDuesWorkspace from "./CustomerDuesWorkspace";
import SupplierWorkspace from "./SupplierWorkspace";
import ExpenseWorkspace from "./ExpenseWorkspace";
import SalesWorkspace from "./SalesWorkspace";

const WORKSPACES = [
  { id: "overview", label: "Overview" },
  { id: "inventory", label: "Inventory" },
  { id: "customerDues", label: "Customer Dues" },
  { id: "suppliers", label: "Suppliers" },
  { id: "expenses", label: "Expenses" },
  { id: "sales", label: "Sales" },
];

export default function AnalysisShell() {
  const [activeWorkspace, setActiveWorkspace] = useState("overview");

  function renderWorkspace() {
    switch (activeWorkspace) {
      case "inventory": return <InventoryWorkspace />;
      case "customerDues": return <CustomerDuesWorkspace />;
      case "suppliers": return <SupplierWorkspace />;
      case "expenses": return <ExpenseWorkspace />;
      case "sales": return <SalesWorkspace />;
      default: return <OverviewWorkspace />;
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
          <StatusCard label="Today's Sales" value="Rs 148,200" />
          <StatusCard label="Cash In Hand" value="Rs 84,000" />
          <StatusCard label="Supplier Dues" value="Rs 245,000" />
          <StatusCard label="Credit Outstanding" value="Rs 212,400" />
          <StatusCard label="Inventory Value" value="Rs 2.8M" />
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
                <MetricRow label="Today's Profit" value="Rs 18,400" highlight />
                <MetricRow label="Pending Supplier Payments" value="Rs 245,000" />
                <MetricRow label="Customer Credit" value="Rs 212,400" />
                <MetricRow label="Expenses Today" value="Rs 8,200" />
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
