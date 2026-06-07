import React, { useState } from "react";
import ReceivablesWorkspace from "./ReceivablesWorkspace";
import PayablesWorkspace from "./PayablesWorkspace";
import CashFlowWorkspace from "./CashFlowWorkspace";
import { st } from "./shared/reportsStyles";

const WORKSPACES = [
  { id: "receivables", label: "Receivables" },
  { id: "payables", label: "Payables" },
  { id: "cashflow", label: "Cash Flow" },
];

export default function ReportsShell() {
  const [activeWorkspace, setActiveWorkspace] = useState("receivables");

  function renderWorkspace() {
    switch (activeWorkspace) {
      case "payables": return <PayablesWorkspace />;
      case "cashflow": return <CashFlowWorkspace />;
      case "receivables": default: return <ReceivablesWorkspace />;
    }
  }

  const navStripStyle = {
    display: "flex",
    gap: 4,
    background: "#e4ede4",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20
  };

  const navBtnStyle = {
    flex: 1,
    padding: "10px 0",
    border: "none",
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    background: "transparent",
    color: "#5a755c",
    transition: "all 0.15s ease-in-out"
  };

  const navBtnActiveStyle = {
    background: "#fff",
    color: "#1d351f",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)"
  };

  return (
    <div style={{ ...st.pageWrapper, padding: "20px 24px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1d351f", letterSpacing: "-0.02em" }}>Reports</h1>
        <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#6a8f6c" }}>Financial reporting and accounting metrics.</p>
      </div>

      <div style={navStripStyle}>
        {WORKSPACES.map((ws) => (
          <button
            key={ws.id}
            style={{ ...navBtnStyle, ...(activeWorkspace === ws.id ? navBtnActiveStyle : {}) }}
            onClick={() => setActiveWorkspace(ws.id)}
          >
            {ws.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }}>
        {renderWorkspace()}
      </div>
    </div>
  );
}
