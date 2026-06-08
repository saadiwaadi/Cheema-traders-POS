import { useState, useEffect, useRef } from "react";
import { fmtPKR, drcr } from "../lib/money";

const ipc = typeof window !== "undefined" ? window.ipc : null;

export default function LedgerPage() {
  const [activeTab, setActiveTab] = useState("ledger"); // "ledger" | "vouchers" | "new-voucher"

  // Master Data
  const [accounts, setAccounts] = useState([]);
  
  // Ledger Tab State
  const [ledgerLines, setLedgerLines] = useState([]);
  const [selectedLedgerAccount, setSelectedLedgerAccount] = useState("All");
  const [ledgerFrom, setLedgerFrom] = useState("");
  const [ledgerTo, setLedgerTo] = useState("");

  // Journal Vouchers Tab State
  
  // Reversal Prompt State (inside Detail view)
  
  // Refs for focusing next inputs
  const inputRefs = useRef([]);

  // Fetch accounts list on mount
  useEffect(() => {
    loadAccounts();
  }, []);

  // Reload data when active tab changes
  useEffect(() => {
    if (activeTab === "ledger") {
      loadLedger();
    }
  }, [activeTab, selectedLedgerAccount, ledgerFrom, ledgerTo]);

  const loadAccounts = async () => {
    if (!ipc) return;
    try {
      const list = await ipc.invoke("coa:list");
      setAccounts(list || []);
    } catch (err) {
      console.error("Failed to load accounts:", err);
    }
  };

  const loadLedger = async () => {
    if (!ipc) return;
    try {
      const lines = await ipc.invoke("journal:ledger", {
        accountId: selectedLedgerAccount,
        from: ledgerFrom || null,
        to: ledgerTo || null
      });
      setLedgerLines(lines || []);
    } catch (err) {
      console.error("Failed to load ledger:", err);
    }
  };

  
  
  
  // Helper to get running balance list
  const getLedgerWithRunning = () => {
    let running = 0;
    return ledgerLines.map(line => {
      // Add debit, subtract credit
      running += (line.debit - line.credit);
      return {
        ...line,
        runningBalance: running
      };
    });
  };

  const ledgerDisplayRows = getLedgerWithRunning();

  // Calculate Ledger Summary Metrics
  const ledgerMetrics = () => {
    let totalDr = 0;
    let totalCr = 0;
    ledgerLines.forEach(l => {
      totalDr += l.debit;
      totalCr += l.credit;
    });
    return {
      debits: totalDr,
      credits: totalCr,
      net: totalDr - totalCr
    };
  };
  const metrics = ledgerMetrics();

  return (
    <div style={st.page}>
      <div style={st.main}>
        {/* HEADER TOOLBAR */}
        <div style={st.toolbar}>
          <div style={st.toolbarLeft}>
            <h1 style={st.pageTitle}>General Ledger</h1>
            <span style={st.badge}>Financial Accounting</span>
          </div>

          <div style={st.tabBar}>
            <button
              onClick={() => setActiveTab("ledger")}
              style={activeTab === "ledger" ? st.activeTabBtn : st.tabBtn}
            >
              General Ledger
            </button>
            
            
          </div>
        </div>

        {/* ======================================================== */}
        {/* TAB 1: GENERAL LEDGER */}
        {/* ======================================================== */}
        {activeTab === "ledger" && (
          <>
            {/* LEDGER FILTERS */}
            <div style={st.filterBar}>
              <div style={st.filterGroup}>
                <label style={st.label}>Account</label>
                <select
                  style={st.select}
                  value={selectedLedgerAccount}
                  onChange={(e) => setSelectedLedgerAccount(e.target.value)}
                >
                  <option value="All">All Accounts (Master Ledger)</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} — {acc.name} ({acc.type.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div style={st.filterGroup}>
                <label style={st.label}>From Date</label>
                <input
                  type="date"
                  style={st.input}
                  value={ledgerFrom}
                  onChange={(e) => setLedgerFrom(e.target.value)}
                />
              </div>

              <div style={st.filterGroup}>
                <label style={st.label}>To Date</label>
                <input
                  type="date"
                  style={st.input}
                  value={ledgerTo}
                  onChange={(e) => setLedgerTo(e.target.value)}
                />
              </div>
            </div>

            {/* METRICS ROW */}
            <div style={st.metricsRow}>
              <div style={st.metricCard}>
                <div style={st.metricLabel}>Total Debits</div>
                <div style={{ ...st.metricValue, color: "#2e7d32" }}>
                  {fmtPKR(metrics.debits)} Dr
                </div>
              </div>
              <div style={st.metricCard}>
                <div style={st.metricLabel}>Total Credits</div>
                <div style={{ ...st.metricValue, color: "#c62828" }}>
                  {fmtPKR(metrics.credits)} Cr
                </div>
              </div>
              <div style={{ ...st.metricCard, background: "#f4fbf4", borderColor: "#c8e6c9" }}>
                <div style={st.metricLabel}>Net Movement</div>
                <div style={{ ...st.metricValue, color: metrics.net >= 0 ? "#2e7d32" : "#c62828" }}>
                  {fmtPKR(Math.abs(metrics.net))} {drcr(metrics.net)}
                </div>
              </div>
            </div>

            {/* LEDGER TABLE */}
            <div style={st.card}>
              <div style={st.cardHeader}>
                <h3 style={st.cardTitle}>Ledger Entries</h3>
                <span style={st.subText}>Chronological record of posted double-entry movements</span>
              </div>
              <div style={st.tableWrap}>
                <table style={st.table}>
                  <thead>
                    <tr style={st.tableHeadRow}>
                      <th style={{ ...st.th, width: "10%" }}>Date</th>
                      <th style={{ ...st.th, width: "12%" }}>Reference</th>
                      <th style={{ ...st.th, width: "15%" }}>Account Code</th>
                      <th style={{ ...st.th, width: "20%" }}>Account Name</th>
                      <th style={{ ...st.th, width: "23%" }}>Narration / Memo</th>
                      <th style={{ ...st.th, width: "10%", textAlign: "right" }}>Debit (+)</th>
                      <th style={{ ...st.th, width: "10%", textAlign: "right" }}>Credit (-)</th>
                      <th style={{ ...st.th, width: "10%", textAlign: "right" }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerDisplayRows.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={st.emptyCell}>
                          No transaction postings found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      ledgerDisplayRows.map((row) => (
                        <tr key={row.id} style={st.tableRow}>
                          <td style={st.td}>{row.date}</td>
                          <td style={{ ...st.td, fontWeight: 600, color: "#2e7d32" }}>
                            {row.entry_no}
                          </td>
                          <td style={{ ...st.td, fontFamily: "monospace" }}>{row.account_code}</td>
                          <td style={st.td}>{row.account_name}</td>
                          <td style={st.td}>
                            <div style={{ fontSize: 13, color: "#1b3a1d" }}>{row.narration}</div>
                            {row.line_memo && (
                              <div style={{ fontSize: 11, color: "#777", fontStyle: "italic" }}>
                                Line Memo: {row.line_memo}
                              </div>
                            )}
                          </td>
                          <td style={{ ...st.td, ...st.num, color: "#2e7d32" }}>
                            {row.debit > 0 ? fmtPKR(row.debit) : "—"}
                          </td>
                          <td style={{ ...st.td, ...st.num, color: "#c62828" }}>
                            {row.credit > 0 ? fmtPKR(row.credit) : "—"}
                          </td>
                          <td style={{ ...st.td, ...st.num, fontWeight: "bold" }}>
                            {fmtPKR(Math.abs(row.runningBalance))} {drcr(row.runningBalance)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
const st = {
  page: { display: "flex", flexDirection: "column", minHeight: "100%", background: "#f4faf4", fontFamily: "system-ui, sans-serif" },
  main: { flex: 1, padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 24, paddingBottom: 100 },
  
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  toolbarLeft: { display: "flex", alignItems: "center", gap: 12 },
  pageTitle: { margin: 0, fontSize: 24, fontWeight: "bold", color: "#1b3a1d" },
  badge: { background: "#dcf5dc", color: "#2e7d32", padding: "4px 10px", borderRadius: 20, fontSize: 13, fontWeight: 600 },
  
  tabBar: { display: "flex", gap: 8, background: "#e8f2e8", padding: 4, borderRadius: 6 },
  tabBtn: { padding: "8px 16px", border: "none", background: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600, color: "#555", fontSize: 14 },
  activeTabBtn: { padding: "8px 16px", border: "none", background: "#2e7d32", color: "#fff", borderRadius: 4, cursor: "pointer", fontWeight: 600, fontSize: 14 },

  filterBar: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, background: "#fff", border: "1px solid #dbe8db", borderRadius: 8, padding: 16 },
  filterGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, fontWeight: 600, color: "#6a8f6c", textTransform: "uppercase" },
  select: { padding: "10px 12px", border: "1.5px solid #cde0cd", borderRadius: 4, outline: "none", fontSize: 14, color: "#1b3a1d", background: "#fff" },
  input: { padding: "10px 12px", border: "1.5px solid #cde0cd", borderRadius: 4, outline: "none", fontSize: 14, color: "#1b3a1d" },

  metricsRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
  metricCard: { background: "#fff", border: "1px solid #dbe8db", borderRadius: 8, padding: 20 },
  metricLabel: { fontSize: 12, fontWeight: 600, color: "#6a8f6c", textTransform: "uppercase", marginBottom: 6 },
  metricValue: { fontSize: 22, fontWeight: 700, fontFamily: "monospace" },

  card: { background: "#fff", borderRadius: 8, padding: 24, border: "1px solid #d5e8d5", display: "flex", flexDirection: "column" },
  cardHeader: { marginBottom: 20 },
  cardTitle: { margin: 0, fontSize: 18, fontWeight: "bold", color: "#1b3a1d" },
  subText: { margin: "4px 0 0 0", fontSize: 13, color: "#666" },

  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
  tableHeadRow: { borderBottom: "2px solid #e8f0e8" },
  th: { padding: "12px 8px", fontSize: 12, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase" },
  tableRow: { borderBottom: "1px solid #f2f7f2", transition: "background 0.15s" },
  td: { padding: "14px 8px", fontSize: 14, color: "#1b3a1d", verticalAlign: "middle" },
  num: { textAlign: "right", fontFamily: "monospace", fontWeight: 500 },
  emptyCell: { padding: 40, textAlign: "center", color: "#999", fontStyle: "italic", fontSize: 14 },

  sourceBadge: { padding: "4px 8px", borderRadius: 4, fontSize: 11, fontWeight: "bold" },
  viewBtn: { padding: "6px 12px", background: "#fff", border: "1px solid #2e7d32", color: "#2e7d32", borderRadius: 4, cursor: "pointer", fontWeight: 600, fontSize: 12 },
  
  // Voucher Form Grid
  voucherForm: { display: "flex", flexDirection: "column", gap: 24 },
  formHeaderRow: { display: "flex", gap: 16, width: "100%" },
  formHeaderField: { display: "flex", flexDirection: "column", gap: 6, flex: 1 },
  
  gridHeader: { display: "flex", background: "#e8f2e8", padding: "12px 0", fontSize: 12, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", borderBottom: "1px solid #d5e8d5" },
  gridBody: { display: "flex", flexDirection: "column" },
  gridRow: { display: "flex", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #eee", gap: 8, paddingLeft: 12, paddingRight: 12 },
  removeBtn: { padding: "8px 12px", border: "none", background: "#ffebee", color: "#c62828", borderRadius: 4, cursor: "pointer", fontWeight: "bold", fontSize: 14 },
  
  gridFooterActions: { padding: 16, display: "flex" },
  addBtn: { padding: "8px 16px", border: "1.5px dashed #2e7d32", background: "#fff", color: "#2e7d32", borderRadius: 4, cursor: "pointer", fontWeight: 600, fontSize: 13 },
  
  // Sticky Footer
  stickyFooter: {
    position: "fixed", bottom: 0, left: 0, right: 0,
    background: "#fff", borderTop: "2px solid #2e7d32",
    padding: "16px 40px", display: "flex", justifyContent: "space-between",
    alignItems: "center", boxShadow: "0 -4px 12px rgba(0,0,0,0.05)", zIndex: 10
  },
  stickyFooterInfo: { display: "flex", gap: 40 },
  footerMetric: { display: "flex", flexDirection: "column" },
  footerLabel: { fontSize: 11, color: "#666", fontWeight: 600 },
  footerValue: { fontSize: 18, fontWeight: "bold", fontFamily: "monospace" },
  stickyFooterActions: { display: "flex", gap: 12 },
  balanceBtn: { padding: "12px 20px", background: "#f0f7f0", color: "#2e7d32", border: "1.5px solid #2e7d32", borderRadius: 4, cursor: "pointer", fontWeight: 600 },
  saveBtn: { padding: "12px 24px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 4, fontWeight: 600, fontSize: 15 },

  // Modal / Drawer Styling
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(27,58,29,0.5)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" },
  modalContent: { background: "#fff", borderRadius: 8, width: "70%", maxWidth: 900, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 10px 30px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #eee" },
  modalTitle: { margin: 0, fontSize: 18, color: "#1b3a1d", fontWeight: "bold" },
  modalSubText: { fontSize: 12, color: "#666" },
  closeModalBtn: { border: "none", background: "none", fontSize: 20, color: "#999", cursor: "pointer" },
  modalBody: { padding: 24 },
  modalTableWrap: { border: "1px solid #eee", borderRadius: 6, overflow: "hidden", marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", marginBottom: 8 },
  miniCard: { background: "#f9faf9", border: "1px solid #eef2ee", borderRadius: 6, padding: "12px 16px" },
  miniLabel: { fontSize: 11, color: "#888", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 },
  miniValue: { fontSize: 14, color: "#1b3a1d", fontWeight: 500 },

  alertBoxWarning: { background: "#fff8e1", borderLeft: "4px solid #ffb300", color: "#b78103", padding: 14, borderRadius: 4, fontSize: 13, marginTop: 16 },
  alertBoxInfo: { background: "#e8f0fe", borderLeft: "4px solid #1a73e8", color: "#185abc", padding: 14, borderRadius: 4, fontSize: 13, marginTop: 16 },
  reverseActionBtn: { padding: "10px 18px", background: "#ffebee", border: "1px solid #c62828", color: "#c62828", borderRadius: 4, cursor: "pointer", fontWeight: 600, fontSize: 13 },

  reversalForm: { border: "1px solid #ffebeb", background: "#fffbfb", borderRadius: 6, padding: 16, marginTop: 24 },
  reversalFormTitle: { margin: "0 0 16px 0", color: "#c62828", fontSize: 14, fontWeight: "bold" },
  reversalFormRow: { display: "flex", gap: 16, marginBottom: 16 },
  reversalFormActions: { display: "flex", justifyContent: "flex-end", gap: 12 },
  cancelBtn: { padding: "8px 16px", border: "1px solid #ccc", background: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 13, color: "#555" },
  postReversalBtn: { padding: "8px 16px", border: "none", background: "#c62828", color: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 },

  errorBanner: { background: "#ffebee", borderLeft: "4px solid #c62828", color: "#c62828", padding: 12, borderRadius: 4, fontSize: 14, marginBottom: 16 },
  successBanner: { background: "#e8f5e9", borderLeft: "4px solid #2e7d32", color: "#2e7d32", padding: 12, borderRadius: 4, fontSize: 14, marginBottom: 16 }
};
