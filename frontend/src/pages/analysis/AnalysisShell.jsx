import { useState, useEffect } from "react";
import { st } from "./shared/analysisStyles";
import InventoryWorkspace from "./InventoryWorkspace";
import CustomerDuesWorkspace from "./CustomerDuesWorkspace";
import SupplierWorkspace from "./SupplierWorkspace";
import SalesWorkspace from "./SalesWorkspace";
import { getAnalysisOverview, getRoiStats } from "../../lib/posApi";

const WORKSPACES = [
  { id: "sales", label: "Sales" },
  { id: "inventory", label: "Inventory" },
  { id: "customerDues", label: "Customer Dues" },
  { id: "suppliers", label: "Suppliers" },
  { id: "roiCalculator", label: "ROI Calculator" },
];

export default function AnalysisShell() {
  const [activeWorkspace, setActiveWorkspace] = useState("sales");
  const [datePreset, setDatePreset] = useState("all"); // "all", "7days", "30days", "thisYear", "custom"
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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
  const [roiStats, setRoiStats] = useState(null);
  const [showRoiDetails, setShowRoiDetails] = useState(false);

  const getDatesForPreset = (preset, customFrom, customTo) => {
    const today = new Date();
    const toStr = today.toISOString().split("T")[0];
    
    if (preset === "7days") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString().split("T")[0], to: toStr };
    }
    if (preset === "30days") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return { from: d.toISOString().split("T")[0], to: toStr };
    }
    if (preset === "thisYear") {
      return { from: `${today.getFullYear()}-01-01`, to: toStr };
    }
    if (preset === "custom") {
      return { from: customFrom, to: customTo };
    }
    return { from: "", to: "" };
  };

  useEffect(() => {
    getAnalysisOverview()
      .then((data) => {
        if (data) {
          setOverview(data);
        }
      })
      .catch(console.error);
  }, [activeWorkspace]);

  useEffect(() => {
    const filters = getDatesForPreset(datePreset, fromDate, toDate);
    getRoiStats(filters)
      .then((data) => {
        if (data) {
          setRoiStats(data);
        }
      })
      .catch(console.error);
  }, [datePreset, fromDate, toDate]);

  function renderWorkspace() {
    const dateFilters = getDatesForPreset(datePreset, fromDate, toDate);
    switch (activeWorkspace) {
      case "inventory": return <InventoryWorkspace filters={dateFilters} />;
      case "customerDues": return <CustomerDuesWorkspace filters={dateFilters} />;
      case "suppliers": return <SupplierWorkspace filters={dateFilters} />;
      case "roiCalculator": return renderRoiCalculator();
      case "sales": default: return <SalesWorkspace filters={dateFilters} />;
    }
  }

  function renderRoiCalculator() {
    return (
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.02)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--success)" }}>
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>Business ROI Calculator</h3>
              <p style={{ margin: 0, marginTop: 2, fontSize: 12, color: "var(--text-secondary)" }}>Derived from Sales, COGS (5000), Expenses, and Capital (3000) accounts.</p>
            </div>
          </div>
          <button
            onClick={() => setShowRoiDetails(!showRoiDetails)}
            style={{
              background: "rgba(46, 125, 50, 0.1)",
              border: "none",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--success)",
              cursor: "pointer",
              transition: "background 0.2s"
            }}
          >
            {showRoiDetails ? "Hide Ledger Details" : "View Ledger Details"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <RoiCard
            period="Weekly ROI"
            roi={roiStats?.weekly?.roi}
            profit={roiStats?.weekly?.netProfit}
            cost={roiStats?.weekly?.totalCost}
          />
          <RoiCard
            period="Monthly ROI"
            roi={roiStats?.monthly?.roi}
            profit={roiStats?.monthly?.netProfit}
            cost={roiStats?.monthly?.totalCost}
          />
          <RoiCard
            period="Per Annum ROI"
            roi={roiStats?.yearly?.roi}
            profit={roiStats?.yearly?.netProfit}
            cost={roiStats?.yearly?.totalCost}
          />
          {datePreset !== "all" && roiStats?.custom ? (
            <RoiCard
              period="Filtered ROI"
              roi={roiStats?.custom?.roi}
              profit={roiStats?.custom?.netProfit}
              cost={roiStats?.custom?.totalCost}
              isHighlighted
            />
          ) : (
            <div style={{
              background: "var(--background)",
              borderRadius: 10,
              padding: 12,
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between"
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>Invested Capital</span>
              <strong style={{ fontSize: 18, color: "var(--text-primary)", display: "block", marginTop: 4 }}>
                Rs {roiStats?.capital ? roiStats.capital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
              </strong>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>Account 3000 balance</span>
            </div>
          )}
        </div>

        {datePreset !== "all" && roiStats?.custom && (
          <div style={{
            background: "var(--background)",
            borderRadius: 10,
            padding: 12,
            border: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>Invested Capital</span>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: 6 }}>(Account 3000)</span>
            </div>
            <strong style={{ fontSize: 16, color: "var(--text-primary)" }}>
              Rs {roiStats?.capital ? roiStats.capital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
            </strong>
          </div>
        )}

        {showRoiDetails && (
          <div style={{
            background: "var(--background)",
            borderRadius: 10,
            padding: 14,
            border: "1px solid var(--border)",
            marginTop: 4,
            display: "flex",
            flexDirection: "column",
            gap: 16
          }}>
            <RoiDetailsTable title="Weekly" data={roiStats?.weekly} />
            <RoiDetailsTable title="Monthly" data={roiStats?.monthly} />
            <RoiDetailsTable title="Per Annum (Yearly)" data={roiStats?.yearly} />
            {datePreset !== "all" && roiStats?.custom && (
              <RoiDetailsTable title="Filtered Period" data={roiStats?.custom} />
            )}
            <div style={{
              background: "rgba(46, 125, 50, 0.05)",
              borderRadius: 8,
              padding: "8px 12px",
              border: "1px dashed rgba(46, 125, 50, 0.2)",
              fontSize: 11,
              color: "var(--text-secondary)",
              textAlign: "center"
            }}>
              <strong>Formula:</strong> ROI = (Net Profit / Total Cost) × 100
            </div>
          </div>
        )}
      </div>
    );
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

        {/* WORKSPACE NAVIGATION & DATE FILTER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <div style={{ ...st.navStrip, marginBottom: 0 }}>
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

          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", padding: "6px 12px", borderRadius: 10, border: "1px solid var(--border)", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginRight: 4 }}>Date Filter:</span>
            <select
              value={datePreset}
              onChange={(e) => {
                setDatePreset(e.target.value);
                if (e.target.value !== "custom") {
                  setFromDate("");
                  setToDate("");
                } else {
                  const today = new Date();
                  const thirtyDaysAgo = new Date();
                  thirtyDaysAgo.setDate(today.getDate() - 30);
                  setFromDate(thirtyDaysAgo.toISOString().split("T")[0]);
                  setToDate(today.toISOString().split("T")[0]);
                }
              }}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
                outline: "none",
                cursor: "pointer"
              }}
            >
              <option value="all">All Time (Default)</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="thisYear">This Year</option>
              <option value="custom">Custom Range...</option>
            </select>
            
            {datePreset === "custom" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, borderLeft: "1px solid var(--border)", paddingLeft: 8, marginLeft: 4 }}>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: 12,
                    color: "var(--text-primary)",
                    outline: "none",
                    cursor: "pointer"
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: 12,
                    color: "var(--text-primary)",
                    outline: "none",
                    cursor: "pointer"
                  }}
                />
              </div>
            )}
          </div>
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

function RoiCard({ period, roi, profit, cost, isHighlighted }) {
  const isPositive = roi >= 0;
  return (
    <div style={{
      background: isHighlighted ? "rgba(46, 125, 50, 0.04)" : "var(--background)",
      borderRadius: 10,
      padding: 12,
      border: isHighlighted ? "1.5px solid var(--success)" : "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      position: "relative",
      boxShadow: isHighlighted ? "0 4px 12px rgba(46, 125, 50, 0.08)" : "none"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>{period}</span>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: isPositive ? "var(--success)" : "var(--danger)",
          background: isPositive ? "rgba(46, 125, 50, 0.1)" : "rgba(211, 47, 47, 0.1)",
          padding: "2px 6px",
          borderRadius: 4
        }}>
          {roi ? roi.toFixed(1) : "0.0"}%
        </span>
      </div>
      <strong style={{ fontSize: 18, color: "var(--text-primary)", display: "block", marginTop: 4 }}>
        {roi ? `${roi.toFixed(1)}%` : "0.0%"}
      </strong>
      <span style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
        Profit: Rs {profit ? Math.round(profit).toLocaleString() : "0"}
      </span>
    </div>
  );
}

function RoiDetailsTable({ title, data }) {
  const rowStyle = { display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px dashed var(--border)", fontSize: 12 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, borderBottom: "2px solid var(--border)", paddingBottom: 4 }}>{title}</h4>
      <div style={rowStyle}>
        <span>Revenue</span>
        <strong>Rs {data?.revenue ? Math.round(data.revenue).toLocaleString() : "0"}</strong>
      </div>
      <div style={rowStyle}>
        <span>COGS (5000)</span>
        <strong>Rs {data?.cogs ? Math.round(data.cogs).toLocaleString() : "0"}</strong>
      </div>
      <div style={rowStyle}>
        <span>Expenses</span>
        <strong>Rs {data?.expenses ? Math.round(data.expenses).toLocaleString() : "0"}</strong>
      </div>
      <div style={rowStyle}>
        <span>Total Cost</span>
        <strong>Rs {data?.totalCost ? Math.round(data.totalCost).toLocaleString() : "0"}</strong>
      </div>
      <div style={{ ...rowStyle, borderBottom: "none", fontWeight: 700 }}>
        <span>Net Profit</span>
        <span style={{ color: (data?.netProfit >= 0) ? "var(--success)" : "var(--danger)" }}>
          Rs {data?.netProfit ? Math.round(data.netProfit).toLocaleString() : "0"}
        </span>
      </div>
    </div>
  );
}
