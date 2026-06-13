import { useState, useEffect, useRef, useCallback } from "react";
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

  // Collapsible dropdown details state
  const [expandedEntries, setExpandedEntries] = useState(new Set());
  const [entryDetails, setEntryDetails] = useState({});

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
      setExpandedEntries(new Set()); // Reset expanded dropdowns when reloading/filtering
    } catch (err) {
      console.error("Failed to load ledger:", err);
    }
  };

  const toggleRow = async (entryId) => {
    const next = new Set(expandedEntries);
    if (next.has(entryId)) {
      next.delete(entryId);
      setExpandedEntries(next);
    } else {
      next.add(entryId);
      setExpandedEntries(next);
      if (!entryDetails[entryId]) {
        try {
          const detail = await ipc.invoke("journal:get", entryId);
          setEntryDetails(prev => ({ ...prev, [entryId]: detail }));
        } catch (err) {
          console.error("Failed to load journal entry details:", err);
        }
      }
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
                <div style={{ ...st.metricValue, color: "var(--success)" }}>
                  {fmtPKR(metrics.debits)} Dr
                </div>
              </div>
              <div style={st.metricCard}>
                <div style={st.metricLabel}>Total Credits</div>
                <div style={{ ...st.metricValue, color: "var(--danger)" }}>
                  {fmtPKR(metrics.credits)} Cr
                </div>
              </div>
              <div style={{ ...st.metricCard, background: "rgba(46, 125, 50, 0.1)", borderColor: "var(--success)" }}>
                <div style={st.metricLabel}>Net Movement</div>
                <div style={{ ...st.metricValue, color: metrics.net >= 0 ? "var(--success)" : "var(--danger)" }}>
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
                      <th style={{ ...st.th, width: "3%", paddingRight: 0 }}></th>
                      <th style={{ ...st.th, width: "9%" }}>Date</th>
                      <th style={{ ...st.th, width: "11%" }}>Reference</th>
                      <th style={{ ...st.th, width: "14%" }}>Account Code</th>
                      <th style={{ ...st.th, width: "19%" }}>Account Name</th>
                      <th style={{ ...st.th, width: "24%" }}>Narration / Memo</th>
                      <th style={{ ...st.th, width: "10%", textAlign: "right" }}>Debit (+)</th>
                      <th style={{ ...st.th, width: "10%", textAlign: "right" }}>Credit (-)</th>
                      <th style={{ ...st.th, width: "10%", textAlign: "right" }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerDisplayRows.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={st.emptyCell}>
                          No transaction postings found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      ledgerDisplayRows.flatMap((row) => {
                        const isOpen = expandedEntries.has(row.entry_id);
                        const detail = entryDetails[row.entry_id];
                        
                        return [
                          <tr key={row.id} onClick={() => toggleRow(row.entry_id)} style={{ cursor: "pointer", ...st.tableRow }}>
                            <td style={{ ...st.td, paddingRight: 0, width: "3%", textAlign: "center", color: "var(--text-secondary)" }}>
                              {isOpen ? "▼" : "▶"}
                            </td>
                            <td style={st.td}>{row.date}</td>
                            <td style={{ ...st.td, fontWeight: 600, color: "var(--success)" }}>
                              {row.entry_no}
                            </td>
                            <td style={{ ...st.td, fontFamily: "monospace" }}>{row.account_code}</td>
                            <td style={st.td}>{row.account_name}</td>
                            <td style={st.td}>
                              <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{row.narration}</div>
                              {row.line_memo && (
                                <div style={{ fontSize: 11, color: "var(--text-secondary)", fontStyle: "italic" }}>
                                  Line Memo: {row.line_memo}
                                </div>
                              )}
                            </td>
                            <td style={{ ...st.td, ...st.num, color: "var(--success)" }}>
                              {row.debit > 0 ? fmtPKR(row.debit) : "—"}
                            </td>
                            <td style={{ ...st.td, ...st.num, color: "var(--danger)" }}>
                              {row.credit > 0 ? fmtPKR(row.credit) : "—"}
                            </td>
                            <td style={{ ...st.td, ...st.num, fontWeight: "bold" }}>
                              {fmtPKR(Math.abs(row.runningBalance))} {drcr(row.runningBalance)}
                            </td>
                          </tr>,
                          isOpen && (
                            <tr key={`${row.id}-detail`} style={{ background: "var(--surface-secondary)" }}>
                              <td colSpan="9" style={{ padding: "8px 24px 16px 24px", borderBottom: "1px solid var(--border)" }}>
                                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: 12 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--success)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                      Full Journal Entry Details ({row.entry_no})
                                    </div>
                                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                      Source: <span style={{ fontWeight: 600, textTransform: "uppercase" }}>{detail?.source_type || "—"}</span>
                                    </div>
                                  </div>
                                  {!detail ? (
                                    <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: 8 }}>Loading entry details...</div>
                                  ) : (
                                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                      <thead>
                                        <tr style={{ borderBottom: "1.5px solid var(--success)" }}>
                                          <th style={{ ...st.th, padding: "6px 8px", fontSize: 11, width: "15%" }}>Account Code</th>
                                          <th style={{ ...st.th, padding: "6px 8px", fontSize: 11, width: "35%" }}>Account Name</th>
                                          <th style={{ ...st.th, padding: "6px 8px", fontSize: 11, width: "20%" }}>Memo</th>
                                          <th style={{ ...st.th, padding: "6px 8px", fontSize: 11, width: "15%", textAlign: "right" }}>Debit</th>
                                          <th style={{ ...st.th, padding: "6px 8px", fontSize: 11, width: "15%", textAlign: "right" }}>Credit</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {detail.lines.map((l, idx) => {
                                          const isCurrentRowAccount = l.account_id === row.account_id;
                                          return (
                                            <tr key={idx} style={{ borderBottom: "1px solid var(--border)", background: isCurrentRowAccount ? "rgba(46, 125, 50, 0.15)" : "transparent" }}>
                                              <td style={{ ...st.td, padding: "6px 8px", fontSize: 13, fontFamily: "monospace", fontWeight: isCurrentRowAccount ? 700 : 400 }}>{l.account_code}</td>
                                              <td style={{ ...st.td, padding: "6px 8px", fontSize: 13, fontWeight: isCurrentRowAccount ? 700 : 400 }}>
                                                {l.account_name}
                                                {l.customer_name && <span style={st.subledgerBadge}> (Cust: {l.customer_name})</span>}
                                                {l.supplier_name && <span style={st.subledgerBadge}> (Supp: {l.supplier_name})</span>}
                                              </td>
                                              <td style={{ ...st.td, padding: "6px 8px", fontSize: 13, color: "var(--text-secondary)" }}>{l.line_memo || "—"}</td>
                                              <td style={{ ...st.td, padding: "6px 8px", fontSize: 13, textAlign: "right", fontFamily: "monospace", color: l.debit > 0 ? "var(--success)" : "var(--text-secondary)", fontWeight: isCurrentRowAccount ? 700 : 400 }}>
                                                {l.debit > 0 ? fmtPKR(l.debit) : "—"}
                                              </td>
                                              <td style={{ ...st.td, padding: "6px 8px", fontSize: 13, textAlign: "right", fontFamily: "monospace", color: l.credit > 0 ? "var(--danger)" : "var(--text-secondary)", fontWeight: isCurrentRowAccount ? 700 : 400 }}>
                                                {l.credit > 0 ? fmtPKR(l.credit) : "—"}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        ];
                      })
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
  page: { display: "flex", flexDirection: "column", minHeight: "100%", background: "var(--surface-secondary)", fontFamily: "system-ui, sans-serif" },
  main: { flex: 1, padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 24, paddingBottom: 100 },
  
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  toolbarLeft: { display: "flex", alignItems: "center", gap: 12 },
  pageTitle: { margin: 0, fontSize: 24, fontWeight: "bold", color: "var(--text-primary)" },
  badge: { background: "rgba(46, 125, 50, 0.15)", color: "var(--success)", padding: "4px 10px", borderRadius: 20, fontSize: 13, fontWeight: 600 },
  
  tabBar: { display: "flex", gap: 8, background: "var(--sidebar-bg)", padding: 4, borderRadius: 6 },
  tabBtn: { padding: "8px 16px", border: "none", background: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600, color: "var(--text-secondary)", fontSize: 14 },
  activeTabBtn: { padding: "8px 16px", border: "none", background: "var(--success)", color: "#fff", borderRadius: 4, cursor: "pointer", fontWeight: 600, fontSize: 14 },

  filterBar: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 16 },
  filterGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" },
  select: { padding: "10px 12px", border: "1.5px solid var(--border)", borderRadius: 4, outline: "none", fontSize: 14, color: "var(--text-primary)", background: "var(--input-bg)" },
  input: { padding: "10px 12px", border: "1.5px solid var(--border)", borderRadius: 4, outline: "none", fontSize: 14, color: "var(--text-primary)", background: "var(--input-bg)" },

  metricsRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
  metricCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 20 },
  metricLabel: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 6 },
  metricValue: { fontSize: 22, fontWeight: 700, fontFamily: "monospace" },

  card: { background: "var(--surface)", borderRadius: 8, padding: 24, border: "1px solid var(--border)", display: "flex", flexDirection: "column" },
  cardHeader: { marginBottom: 20 },
  cardTitle: { margin: 0, fontSize: 18, fontWeight: "bold", color: "var(--text-primary)" },
  subText: { margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" },

  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
  tableHeadRow: { borderBottom: "2px solid var(--border)" },
  th: { padding: "12px 8px", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" },
  tableRow: { borderBottom: "1px solid var(--border)", transition: "background 0.15s" },
  td: { padding: "14px 8px", fontSize: 14, color: "var(--text-primary)", verticalAlign: "middle" },
  num: { textAlign: "right", fontFamily: "monospace", fontWeight: 500 },
  emptyCell: { padding: 40, textAlign: "center", color: "var(--text-secondary)", fontStyle: "italic", fontSize: 14 },

  sourceBadge: { padding: "4px 8px", borderRadius: 4, fontSize: 11, fontWeight: "bold" },
  viewBtn: { padding: "6px 12px", background: "var(--surface)", border: "1px solid var(--success)", color: "var(--success)", borderRadius: 4, cursor: "pointer", fontWeight: 600, fontSize: 12 },
  
  // Voucher Form Grid
  voucherForm: { display: "flex", flexDirection: "column", gap: 24 },
  formHeaderRow: { display: "flex", gap: 16, width: "100%" },
  formHeaderField: { display: "flex", flexDirection: "column", gap: 6, flex: 1 },
  
  gridHeader: { display: "flex", background: "var(--sidebar-bg)", padding: "12px 0", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" },
  gridBody: { display: "flex", flexDirection: "column" },
  gridRow: { display: "flex", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)", gap: 8, paddingLeft: 12, paddingRight: 12 },
  removeBtn: { padding: "8px 12px", border: "none", background: "rgba(239, 68, 68, 0.15)", color: "var(--danger)", borderRadius: 4, cursor: "pointer", fontWeight: "bold", fontSize: 14 },
  
  gridFooterActions: { padding: 16, display: "flex" },
  addBtn: { padding: "8px 16px", border: "1.5px dashed var(--success)", background: "var(--surface)", color: "var(--success)", borderRadius: 4, cursor: "pointer", fontWeight: 600, fontSize: 13 },
  
  // Sticky Footer
  stickyFooter: {
    position: "fixed", bottom: 0, left: 0, right: 0,
    background: "var(--surface)", borderTop: "2px solid var(--success)",
    padding: "16px 40px", display: "flex", justifyContent: "space-between",
    alignItems: "center", boxShadow: "0 -4px 12px rgba(0,0,0,0.15)", zIndex: 10
  },
  stickyFooterInfo: { display: "flex", gap: 40 },
  footerMetric: { display: "flex", flexDirection: "column" },
  footerLabel: { fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 },
  footerValue: { fontSize: 18, fontWeight: "bold", fontFamily: "monospace" },
  stickyFooterActions: { display: "flex", gap: 12 },
  balanceBtn: { padding: "12px 20px", background: "var(--sidebar-bg)", color: "var(--success)", border: "1.5px solid var(--success)", borderRadius: 4, cursor: "pointer", fontWeight: 600 },
  saveBtn: { padding: "12px 24px", background: "var(--success)", color: "#fff", border: "none", borderRadius: 4, fontWeight: 600, fontSize: 15 },

  // Modal / Drawer Styling
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" },
  modalContent: { background: "var(--surface)", borderRadius: 8, width: "70%", maxWidth: 900, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid var(--border)" },
  modalTitle: { margin: 0, fontSize: 18, color: "var(--text-primary)", fontWeight: "bold" },
  modalSubText: { fontSize: 12, color: "var(--text-secondary)" },
  closeModalBtn: { border: "none", background: "none", fontSize: 20, color: "var(--text-secondary)", cursor: "pointer" },
  modalBody: { padding: 24 },
  modalTableWrap: { border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 8 },
  miniCard: { background: "var(--surface-secondary)", border: "1px solid var(--border)", borderRadius: 6, padding: "12px 16px" },
  miniLabel: { fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 },
  miniValue: { fontSize: 14, color: "var(--text-primary)", fontWeight: 500 },

  alertBoxWarning: { background: "rgba(245, 158, 11, 0.15)", borderLeft: "4px solid var(--warning)", color: "var(--warning)", padding: 14, borderRadius: 4, fontSize: 13, marginTop: 16 },
  alertBoxInfo: { background: "rgba(30, 144, 255, 0.15)", borderLeft: "4px solid #1e90ff", color: "#1e90ff", padding: 14, borderRadius: 4, fontSize: 13, marginTop: 16 },
  reverseActionBtn: { padding: "10px 18px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid var(--danger)", color: "var(--danger)", borderRadius: 4, cursor: "pointer", fontWeight: 600, fontSize: 13 },

  reversalForm: { border: "1px solid var(--border)", background: "var(--surface-secondary)", borderRadius: 6, padding: 16, marginTop: 24 },
  reversalFormTitle: { margin: "0 0 16px 0", color: "var(--danger)", fontSize: 14, fontWeight: "bold" },
  reversalFormRow: { display: "flex", gap: 16, marginBottom: 16 },
  reversalFormActions: { display: "flex", justifyContent: "flex-end", gap: 12 },
  cancelBtn: { padding: "8px 16px", border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 4, cursor: "pointer", fontSize: 13, color: "var(--text-primary)" },
  postReversalBtn: { padding: "8px 16px", border: "none", background: "var(--danger)", color: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 },

  errorBanner: { background: "rgba(239, 68, 68, 0.15)", borderLeft: "4px solid var(--danger)", color: "var(--danger)", padding: 12, borderRadius: 4, fontSize: 14, marginBottom: 16 },
  successBanner: { background: "rgba(46, 125, 50, 0.15)", borderLeft: "4px solid var(--success)", color: "var(--success)", padding: 12, borderRadius: 4, fontSize: 14, marginBottom: 16 },
  subledgerBadge: { fontSize: 11, color: "var(--text-secondary)", fontStyle: "italic", background: "var(--sidebar-bg)", padding: "2px 6px", borderRadius: 4, marginLeft: 6 }
};
