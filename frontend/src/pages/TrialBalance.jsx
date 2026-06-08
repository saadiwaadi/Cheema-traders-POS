import React, { useState, useEffect, useRef, useMemo } from "react";
import { fmtPKR } from "../lib/money";
import { getTrialBalance } from "../lib/posApi";

const ipc = typeof window !== "undefined" ? window.ipc : null;

export default function TrialBalancePage() {
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState({ rows: [], totalDebit: 0, totalCredit: 0, balanced: true });
  const [loading, setLoading] = useState(true);
  
  // For the GL Modal
  const [glAccount, setGlAccount] = useState(null);
  const [glLines, setGlLines] = useState([]);
  const [glLoading, setGlLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [asOf]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getTrialBalance({ asOf });
      setData(res || { rows: [], totalDebit: 0, totalCredit: 0, balanced: true });
    } catch (err) {
      console.error("Failed to load trial balance:", err);
    } finally {
      setLoading(false);
    }
  };

  const openGL = async (account) => {
    setGlAccount(account);
    setGlLoading(true);
    setGlLines([]);
    try {
      if (ipc) {
        // Query ledger using existing journal:ledger
        const res = await ipc.invoke("journal:ledger", { accountId: account.id, toDate: asOf });
        setGlLines(res || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGlLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    const csv = [
      ["Code", "Account", "Type", "Debit", "Credit"].join(","),
      ...data.rows.map(r => [
        r.code, 
        `"${r.name}"`, 
        r.type, 
        (r.debit / 100).toFixed(2), 
        (r.credit / 100).toFixed(2)
      ].join(",")),
      ["", '"TOTAL"', "", (data.totalDebit / 100).toFixed(2), (data.totalCredit / 100).toFixed(2)].join(",")
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TrialBalance_${asOf}.csv`;
    a.click();
  };

  // Group by type
  const grouped = useMemo(() => {
    const groups = {};
    for (const r of data.rows) {
      const t = r.type ? r.type.toUpperCase() : "OTHER";
      if (!groups[t]) groups[t] = [];
      groups[t].push(r);
    }
    return groups;
  }, [data.rows]);

  return (
    <div style={s.container}>
      <div style={s.header} className="no-print">
        <div>
          <h1 style={s.title}>Trial Balance</h1>
          <p style={s.subtitle}>General Ledger balances as of {new Date(asOf).toLocaleDateString()}</p>
        </div>
        <div style={s.actions}>
          <input 
            type="date" 
            value={asOf} 
            onChange={e => setAsOf(e.target.value)} 
            style={s.dateInput} 
          />
          <button style={s.btnOutline} onClick={handleExport}>Export CSV</button>
          <button style={s.btnPrimary} onClick={handlePrint}>Print</button>
        </div>
      </div>

      <div style={s.statusBanner(data.balanced)}>
        {data.balanced ? (
          <span style={{ fontWeight: 600 }}>Balanced ✓</span>
        ) : (
          <span style={{ fontWeight: 600 }}>
            OUT OF BALANCE by {fmtPKR(Math.abs(data.totalDebit - data.totalCredit))} ✗
          </span>
        )}
      </div>

      <div style={s.card} className="print-area">
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Code</th>
              <th style={s.th}>Account</th>
              <th style={{ ...s.th, textAlign: "right" }}>Debit</th>
              <th style={{ ...s.th, textAlign: "right" }}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: "#6a8f6c" }}>Loading...</td></tr>
            ) : data.rows.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: "#6a8f6c" }}>No balances found.</td></tr>
            ) : (
              Object.entries(grouped).map(([type, rows]) => (
                <React.Fragment key={type}>
                  <tr style={s.groupRow}>
                    <td colSpan={4} style={s.groupCell}>{type}</td>
                  </tr>
                  {rows.map((row, i) => (
                    <tr key={i} style={s.tr} onClick={() => openGL(row)}>
                      <td style={s.tdCode}>{row.code}</td>
                      <td style={s.tdName}>{row.name}</td>
                      <td style={s.tdMoney}>{row.debit > 0 ? fmtPKR(row.debit) : "-"}</td>
                      <td style={s.tdMoney}>{row.credit > 0 ? fmtPKR(row.credit) : "-"}</td>
                    </tr>
                  ))}
                  <tr style={s.subTotalRow}>
                    <td colSpan={2} style={s.subTotalLabel}>Total {type}</td>
                    <td style={s.tdMoney}>{fmtPKR(rows.reduce((sum, r) => sum + r.debit, 0))}</td>
                    <td style={s.tdMoney}>{fmtPKR(rows.reduce((sum, r) => sum + r.credit, 0))}</td>
                  </tr>
                </React.Fragment>
              ))
            )}
          </tbody>
          {!loading && data.rows.length > 0 && (
            <tfoot>
              <tr style={s.totalRow}>
                <td colSpan={2} style={{ ...s.th, textAlign: "right", color: "#1b3a1d" }}>GRAND TOTAL</td>
                <td style={{ ...s.tdMoney, fontWeight: 800, color: "#1b3a1d" }}>{fmtPKR(data.totalDebit)}</td>
                <td style={{ ...s.tdMoney, fontWeight: 800, color: "#1b3a1d" }}>{fmtPKR(data.totalCredit)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* GL Modal */}
      {glAccount && (
        <div style={s.modalOverlay} onClick={() => setGlAccount(null)} className="no-print">
          <div style={s.modalContent} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 16, color: "#1b3a1d" }}>General Ledger: {glAccount.name} ({glAccount.code})</h2>
              <button onClick={() => setGlAccount(null)} style={s.closeBtn}>×</button>
            </div>
            <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Voucher</th>
                    <th style={s.th}>Particulars</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Debit</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Credit</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {glLoading ? (
                    <tr><td colSpan={6} style={{ padding: 20, textAlign: "center" }}>Loading...</td></tr>
                  ) : glLines.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 20, textAlign: "center" }}>No transactions found.</td></tr>
                  ) : (
                    glLines.map((l, i) => {
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f2f7f2" }}>
                          <td style={s.tdCode}>{l.date ? new Date(l.date).toLocaleDateString() : "-"}</td>
                          <td style={s.tdCode}>{l.entry_no}</td>
                          <td style={s.tdName}>{l.narration}</td>
                          <td style={s.tdMoney}>{l.debit > 0 ? fmtPKR(l.debit) : ""}</td>
                          <td style={s.tdMoney}>{l.credit > 0 ? fmtPKR(l.credit) : ""}</td>
                          <td style={{ ...s.tdMoney, color: "#1b3a1d" }}>{fmtPKR(l.running_balance)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  container: { fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 24, maxWidth: 1000, margin: "0 auto", color: "#333" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 },
  title: { margin: 0, fontSize: 24, fontWeight: 700, color: "#1b3a1d" },
  subtitle: { margin: "4px 0 0", fontSize: 13, color: "#6a8f6c" },
  actions: { display: "flex", gap: 12, alignItems: "center" },
  dateInput: { padding: "6px 12px", borderRadius: 4, border: "1px solid #c8d8c8", outline: "none", color: "#1b3a1d", fontFamily: "inherit" },
  btnOutline: { padding: "6px 16px", borderRadius: 4, border: "1px solid #2e7d32", background: "transparent", color: "#2e7d32", fontWeight: 600, cursor: "pointer" },
  btnPrimary: { padding: "6px 16px", borderRadius: 4, border: "none", background: "#2e7d32", color: "#fff", fontWeight: 600, cursor: "pointer" },
  
  statusBanner: (balanced) => ({
    padding: "10px 16px", borderRadius: 4, marginBottom: 20, fontSize: 13,
    background: balanced ? "#e8f5e9" : "#ffebee",
    color: balanced ? "#2e7d32" : "#c62828",
    border: `1px solid ${balanced ? "#c8e6c9" : "#ffcdd2"}`
  }),

  card: { background: "#fff", border: "1px solid #d4ddd4", borderRadius: 6, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", borderBottom: "2px solid #d4ddd4", textAlign: "left", background: "#fafff9" },
  tr: { borderBottom: "1px solid #f2f7f2", cursor: "pointer" },
  tdCode: { padding: "10px 14px", fontSize: 12, color: "#1b3a1d", fontFamily: "monospace", width: 80 },
  tdName: { padding: "10px 14px", fontSize: 13, color: "#1b3a1d", fontWeight: 500 },
  tdMoney: { padding: "10px 14px", fontSize: 13, color: "#333", fontFamily: "monospace", textAlign: "right" },
  
  groupRow: { background: "#f0f4f0", borderBottom: "1px solid #d4ddd4" },
  groupCell: { padding: "6px 14px", fontSize: 11, fontWeight: 700, color: "#5a755c", textTransform: "uppercase", letterSpacing: "0.05em" },
  subTotalRow: { background: "#fdfdfd", borderBottom: "1px solid #d4ddd4" },
  subTotalLabel: { padding: "8px 14px", fontSize: 11, fontWeight: 600, color: "#6a8f6c", textAlign: "right", fontStyle: "italic" },
  
  totalRow: { background: "#e8f5e9", borderTop: "2px solid #2e7d32" },

  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modalContent: { background: "#fff", width: 800, maxWidth: "90%", maxHeight: "85vh", borderRadius: 8, display: "flex", flexDirection: "column", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" },
  modalHeader: { padding: "12px 16px", borderBottom: "1px solid #d4ddd4", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafff9", borderRadius: "8px 8px 0 0" },
  closeBtn: { background: "none", border: "none", fontSize: 24, lineHeight: 1, cursor: "pointer", color: "#6a8f6c" }
};
