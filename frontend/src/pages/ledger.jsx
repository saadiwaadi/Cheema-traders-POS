import { useState, useEffect, useCallback } from "react";
import { getGeneralLedger } from "../lib/posApi";

export default function LedgerPage() {
  const [selectedAccount, setSelectedAccount] = useState("All");
  const [rows, setRows] = useState([]);
  const [accountList, setAccountList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getGeneralLedger({ account: selectedAccount === "All" ? "" : selectedAccount });
      setRows(res.rows || []);
      setAccountList(res.accounts || []);
    } catch (e) {
      setError(e.message || "Failed to load ledger");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount]);

  useEffect(() => { load(); }, [load]);

  const accounts = ["All", ...accountList];

  // Backend supplies a running balance per row when a single account is selected.
  const displayData = rows.map((r, i) => ({ id: r.ref ? `${r.ref}-${i}` : i, ...r }));

  const totalDebits = displayData.filter(r => r.type === "debit").reduce((sum, r) => sum + r.amount, 0);
  const totalCredits = displayData.filter(r => r.type === "credit").reduce((sum, r) => sum + r.amount, 0);
  const netChange = totalDebits - totalCredits;

  return (
    <div style={st.page}>
      <div style={st.main}>
        {/* TOOLBAR */}
        <div style={st.toolbar}>
          <div style={st.toolbarLeft}>
            <h1 style={st.pageTitle}>General Ledger</h1>
            <span style={st.badge}>Financial Tracking</span>
          </div>

          <div style={st.toolbarRight}>
            <select 
              style={st.accountSelect} 
              value={selectedAccount} 
              onChange={(e) => setSelectedAccount(e.target.value)}
            >
              {accounts.map(acc => <option key={acc} value={acc}>{acc === "All" ? "All Accounts" : acc}</option>)}
            </select>
            <button style={st.toolBtn}>Export CSV</button>
            <button style={st.toolBtn}>Print</button>
          </div>
        </div>

        {/* METRICS ROW */}
        <div style={st.metricsRow}>
          <div style={st.metricCard}>
            <div style={st.metricLabel}>Total Debits (In)</div>
            <div style={{ ...st.metricValue, color: "#2e7d32" }}>Rs {totalDebits.toLocaleString()}</div>
          </div>
          <div style={st.metricCard}>
            <div style={st.metricLabel}>Total Credits (Out)</div>
            <div style={{ ...st.metricValue, color: "#c62828" }}>Rs {totalCredits.toLocaleString()}</div>
          </div>
          <div style={{ ...st.metricCard, background: "#f4fbf4", borderColor: "#c8e6c9" }}>
            <div style={st.metricLabel}>Net Change</div>
            <div style={{ ...st.metricValue, color: netChange >= 0 ? "#1b3a1d" : "#c62828" }}>
              {netChange >= 0 ? "+" : ""}Rs {netChange.toLocaleString()}
            </div>
          </div>
        </div>

        {/* LEDGER TABLE */}
        <div style={st.card}>
          <div style={st.cardTop}>
            <div>
              <h2 style={st.sectionTitle}>{selectedAccount === "All" ? "Master Ledger View" : `${selectedAccount} Ledger`}</h2>
              <p style={st.subText}>Chronological record of financial transactions.</p>
            </div>
          </div>

          <div style={st.tableWrap}>
            <div style={st.tableHead}>
              <span style={{ width: 100 }}>Date</span>
              <span style={{ width: 100 }}>Ref</span>
              <span style={{ flex: 2 }}>Account</span>
              <span style={{ flex: 3 }}>Description</span>
              <span style={{ width: 120, textAlign: "right" }}>Debit (+)</span>
              <span style={{ width: 120, textAlign: "right" }}>Credit (-)</span>
              <span style={{ width: 120, textAlign: "right" }}>Balance</span>
            </div>

            {loading ? (
              <div style={st.emptyState}>Loading ledger…</div>
            ) : error ? (
              <div style={{ ...st.emptyState, color: "#c62828" }}>{error}</div>
            ) : displayData.length === 0 ? (
              <div style={st.emptyState}>No transactions found for this account.</div>
            ) : (
              displayData.map((row) => (
                <div key={row.id} style={st.tableRow}>
                  <span style={{ width: 100, color: "#555", fontSize: 13 }}>{row.date}</span>
                  <span style={{ width: 100, color: "#708571", fontSize: 13, fontWeight: 500 }}>{row.ref}</span>
                  <span style={{ flex: 2, fontWeight: 600, color: "#1b3a1d", fontSize: 14 }}>{row.account}</span>
                  <span style={{ flex: 3, color: "#444", fontSize: 14 }}>{row.description}</span>
                  
                  <span style={{ width: 120, textAlign: "right", color: "#2e7d32", fontWeight: 600, fontSize: 14 }}>
                    {row.type === "debit" ? `Rs ${row.amount.toLocaleString()}` : "—"}
                  </span>
                  <span style={{ width: 120, textAlign: "right", color: "#c62828", fontWeight: 600, fontSize: 14 }}>
                    {row.type === "credit" ? `Rs ${row.amount.toLocaleString()}` : "—"}
                  </span>
                  
                  <span style={{ width: 120, textAlign: "right", fontWeight: "bold", color: "#1b3a1d", fontSize: 14 }}>
                    {row.balance == null ? "—" : `Rs ${row.balance.toLocaleString()}`}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const st = {
  page: { display: "flex", flexDirection: "column", minHeight: "100%", background: "#f0f6f0", fontFamily: "system-ui, sans-serif" },
  main: { flex: 1, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 },
  
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  toolbarLeft: { display: "flex", alignItems: "center", gap: 12 },
  pageTitle: { margin: 0, fontSize: 24, fontWeight: "bold", color: "#1b3a1d" },
  badge: { background: "#dcf5dc", color: "#2e7d32", padding: "4px 10px", borderRadius: 20, fontSize: 13, fontWeight: 600 },
  
  toolbarRight: { display: "flex", gap: 10, alignItems: "center" },
  accountSelect: { padding: "8px 14px", border: "1.5px solid #cde0cd", borderRadius: 8, outline: "none", fontWeight: 600, color: "#1b3a1d", minWidth: 200, cursor: "pointer" },
  toolBtn: { padding: "8px 14px", border: "1px solid #d3e5d3", background: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 500, color: "#555" },

  metricsRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
  metricCard: { background: "#fff", border: "1px solid #dbe8db", borderRadius: 14, padding: "20px" },
  metricLabel: { fontSize: 12, fontWeight: 600, color: "#6a8f6c", textTransform: "uppercase", marginBottom: 6 },
  metricValue: { fontSize: 24, fontWeight: 700 },

  card: { background: "#fff", borderRadius: 14, padding: 24, border: "1px solid #d5e8d5", display: "flex", flexDirection: "column" },
  cardTop: { marginBottom: 20 },
  sectionTitle: { margin: 0, fontSize: 18, fontWeight: "bold", color: "#1b3a1d" },
  subText: { margin: "4px 0 0 0", fontSize: 13, color: "#666" },

  tableWrap: { display: "flex", flexDirection: "column", flex: 1 },
  tableHead: { display: "flex", padding: "0 12px 10px", borderBottom: "2px solid #e8f0e8", fontSize: 12, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase" },
  tableRow: { display: "flex", alignItems: "center", padding: "14px 12px", borderBottom: "1px solid #f2f7f2", transition: "background 0.1s" },
  emptyState: { padding: "30px", textAlign: "center", color: "#666", fontSize: 14, fontStyle: "italic" }
};
