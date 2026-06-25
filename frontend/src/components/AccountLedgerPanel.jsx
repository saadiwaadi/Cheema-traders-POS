import React, { useState, useEffect, useCallback } from "react";
import { X, FileDown, Printer } from "lucide-react";
import { getAccountLedger, getSettings } from "../lib/posApi";
import * as XLSX from "xlsx";

export default function AccountLedgerPanel({ account, onClose }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  
  const initialStart = `${year}-${month}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const initialEnd = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAccountLedger(account.id, startDate, endDate);
      setEntries(data || []);
    } catch (e) {
      console.error("Failed to load account ledger", e);
    } finally {
      setLoading(false);
    }
  }, [account.id, startDate, endDate]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const formatPaisa = (paisa) => {
    return (Number(paisa || 0) / 100).toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const totalDebit = entries.reduce((s, e) => s + (e.debit || 0), 0);
  const totalCredit = entries.reduce((s, e) => s + (e.credit || 0), 0);
  const closingBalance = entries.length > 0 ? entries[entries.length - 1].running_balance : 0;

  const handleExportExcel = () => {
    const titleRow = [`Ledger for: ${account.name} (${account.code})`, `Period: ${startDate} to ${endDate}`];
    const headers = ["Date", "Description", "Source Type", "Debit", "Credit", "Running Balance"];
    
    const rows = entries.map(e => [
      e.entry_date,
      e.description || "",
      e.source_type || "",
      e.debit > 0 ? e.debit / 100 : 0,
      e.credit > 0 ? e.credit / 100 : 0,
      e.running_balance / 100
    ]);

    const wsData = [
      titleRow,
      [],
      headers,
      ...rows
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 35 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 18 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Account Ledger");
    XLSX.writeFile(wb, `Ledger_${account.name.replace(/\s+/g, "_")}_${startDate}_to_${endDate}.xlsx`);
  };

  const handlePrintPDF = async () => {
    let settings = {};
    try {
      settings = await getSettings();
    } catch (e) {
      console.error("Failed to load settings for print", e);
    }
    const businessName = settings.business_name || "Cheema Traders";
    const businessTagline = settings.business_tagline || "Agro Inputs & Fertilizer Distributors";
    const businessAddress = settings.business_address || "Main Bazar, Sahiwal, Pakistan";
    const businessPhone = settings.business_phone || "+92 300 7890123";
    const businessEmail = settings.business_email || "info@cheematraders.com";

    const rowsHtml = entries.map((e) => {
      return `
        <tr>
          <td>${e.entry_date}</td>
          <td><strong>${e.description || ""}</strong></td>
          <td class="center"><span class="badge">${e.source_type || ""}</span></td>
          <td class="num">${e.debit > 0 ? formatPaisa(e.debit) : "—"}</td>
          <td class="num">${e.credit > 0 ? formatPaisa(e.credit) : "—"}</td>
          <td class="num bold">${formatPaisa(e.running_balance)}</td>
        </tr>
      `;
    }).join("");

    const html = `
<html>
<head>
<title>Account Ledger - ${account.name}</title>
<style>
@page { size: A4; margin: 12mm 15mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; padding: 0; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #000; padding-bottom: 12px; margin-bottom: 14px; }
.brand { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; color: #000; }
.tagline { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #444; margin-top: 2px; }
.contact { font-size: 9px; color: #555; margin-top: 6px; line-height: 1.6; }
.doc-title { font-size: 17px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1.5px solid #000; padding-bottom: 4px; margin-bottom: 6px; text-align: right; }
.doc-meta { font-size: 9px; color: #444; line-height: 1.7; text-align: right; }
.party-row { display: flex; border: 1px solid #000; margin-bottom: 10px; }
.party-cell { padding: 8px 12px; flex: 1; }
.party-cell + .party-cell { border-left: 1px solid #000; flex: 0 0 220px; text-align: right; }
.cell-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; font-weight: 700; margin-bottom: 3px; }
.cell-value { font-size: 13px; font-weight: 700; }
.cell-sub { font-size: 9px; color: #444; margin-top: 2px; }

table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead tr { background: #000; color: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
th { padding: 7px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; border: 1px solid #000; text-align: left; }
th.num { text-align: right; }
th.center { text-align: center; }
td { padding: 6px 8px; border: 1px solid #ccc; font-size: 10px; vertical-align: top; }
td.num { text-align: right; font-family: 'Courier New', monospace; }
td.center { text-align: center; }
tr:nth-child(even) td { background: #f5f5f5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.totals-row td { background: #e8e8e8 !important; color: #000; font-weight: 700; font-size: 10px; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.totals-row td.num { font-family: 'Courier New', monospace; }
.closing-row td { background: #000 !important; color: #fff !important; font-weight: 700; font-size: 11px; border-color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.closing-row td.num { font-family: 'Courier New', monospace; }
.badge { font-size: 8px; font-weight: 700; text-transform: uppercase; padding: 1px 4px; border: 1px solid #000; display: inline-block; letter-spacing: 0.04em; }
.footer { margin-top: 28px; border-top: 1.5px solid #000; padding-top: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
.footer-note { font-size: 8px; color: #555; line-height: 1.6; max-width: 340px; }
.sig-block { text-align: center; border-top: 1px solid #000; padding-top: 6px; font-size: 9px; font-weight: 700; min-width: 180px; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="brand">${businessName}</div>
    <div class="tagline">${businessTagline}</div>
    <div class="contact">${businessAddress}<br>Tel: ${businessPhone} &nbsp;|&nbsp; ${businessEmail}</div>
  </div>
  <div>
    <div class="doc-title">Account Ledger</div>
    <div class="doc-meta">
      Generated: ${new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}<br>
      Period: ${startDate} &mdash; ${endDate}
    </div>
  </div>
</div>

<div class="party-row">
  <div class="party-cell">
    <div class="cell-label">Account Name</div>
    <div class="cell-value">${account.name}</div>
    <div class="cell-sub">Account Code: ${account.code} &nbsp;|&nbsp; Type: ${account.type}</div>
  </div>
  <div class="party-cell">
    <div class="cell-label">Period Closing Balance</div>
    <div class="cell-value">Rs. ${formatPaisa(closingBalance)}</div>
    <div class="cell-sub">Normal side balance for this period</div>
  </div>
</div>

<table>
  <colgroup>
    <col style="width:75px">
    <col>
    <col style="width:75px">
    <col style="width:90px">
    <col style="width:90px">
    <col style="width:110px">
  </colgroup>
  <thead>
    <tr>
      <th>Date</th>
      <th>Description</th>
      <th class="center">Ref / Type</th>
      <th class="num">Debit</th>
      <th class="num">Credit</th>
      <th class="num">Running Balance</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml || '<tr><td colspan="6" style="text-align:center;">No entries found for this period</td></tr>'}
    <tr class="totals-row">
      <td colspan="3"><strong>TOTALS</strong></td>
      <td class="num">${formatPaisa(totalDebit)}</td>
      <td class="num">${formatPaisa(totalCredit)}</td>
      <td class="num">—</td>
    </tr>
    <tr class="closing-row">
      <td colspan="3"><strong>CLOSING BALANCE</strong></td>
      <td colspan="3" class="num">Rs. ${formatPaisa(closingBalance)}</td>
    </tr>
  </tbody>
</table>

<div class="footer">
  <div class="footer-note">
    <strong>${businessName} POS System</strong><br>
    Computer-generated ledger report — no physical stamp required.
  </div>
  <div class="sig-block">
    Authorized Signature<br>
    <span style="font-weight:400;">${businessName}</span>
  </div>
</div>

</body>
</html>
    `;

    if (window.ipc) {
      await window.ipc.invoke("db:print-html-report", html);
    } else {
      const win = window.open("", "_blank", "width=800,height=600");
      win.document.write(html);
      win.document.close();
    }
  };

  return (
    <div style={st.container}>
      {/* Top row */}
      <div style={st.headerRow}>
        <div>
          <div style={st.accountTitle}>{account.name}</div>
          <div style={st.accountSub}>
            Code: <span style={st.monoText}>{account.code}</span> &bull; Type: <span style={st.typeText}>{account.type}</span>
          </div>
        </div>
        <div style={st.controls}>
          <div style={st.dateGroup}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={st.dateInput}
            />
            <span style={st.dateSeparator}>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={st.dateInput}
            />
          </div>
          <button style={st.closeBtn} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={st.tableWrapper}>
        {loading ? (
          <div style={st.infoText}>Loading ledger entries...</div>
        ) : entries.length === 0 ? (
          <div style={st.infoText}>No entries found for this period</div>
        ) : (
          <table style={st.table}>
            <thead>
              <tr style={st.thRow}>
                <th style={{ ...st.th, width: "100px" }}>Date</th>
                <th style={st.th}>Description</th>
                <th style={{ ...st.th, width: "110px", textAlign: "center" }}>Ref / Type</th>
                <th style={{ ...st.th, width: "120px", textAlign: "right" }}>Debit</th>
                <th style={{ ...st.th, width: "120px", textAlign: "right" }}>Credit</th>
                <th style={{ ...st.th, width: "140px", textAlign: "right" }}>Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => {
                const isPositive = entry.running_balance > 0;
                const isNegative = entry.running_balance < 0;
                const balColor = isPositive ? "#15803d" : isNegative ? "#b91c1c" : "inherit";

                return (
                  <tr key={idx} style={st.tr}>
                    <td style={st.td}>{entry.entry_date}</td>
                    <td style={st.td}>{entry.description || "—"}</td>
                    <td style={{ ...st.td, textAlign: "center" }}>
                      <span style={st.badge}>{entry.source_type || "manual"}</span>
                    </td>
                    <td style={{ ...st.td, textAlign: "right", fontFamily: "monospace" }}>
                      {entry.debit > 0 ? formatPaisa(entry.debit) : "—"}
                    </td>
                    <td style={{ ...st.td, textAlign: "right", fontFamily: "monospace" }}>
                      {entry.credit > 0 ? formatPaisa(entry.credit) : "—"}
                    </td>
                    <td style={{ ...st.td, textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: balColor }}>
                      {formatPaisa(entry.running_balance)}
                    </td>
                  </tr>
                );
              })}
              {/* Totals Row */}
              <tr style={st.totalsRow}>
                <td colSpan={3} style={st.totalsLabel}>TOTALS</td>
                <td style={st.totalsNum}>{formatPaisa(totalDebit)}</td>
                <td style={st.totalsNum}>{formatPaisa(totalCredit)}</td>
                <td style={st.totalsNum}>—</td>
              </tr>
              {/* Closing Balance Row */}
              <tr style={st.closingRow}>
                <td colSpan={3} style={st.closingLabel}>CLOSING BALANCE</td>
                <td colSpan={3} style={st.closingNum}>Rs. {formatPaisa(closingBalance)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Actions footer */}
      {!loading && entries.length > 0 && (
        <div style={st.actionsRow}>
          <button style={st.actionBtn} onClick={handleExportExcel}>
            <FileDown size={14} /> Export Excel
          </button>
          <button style={st.actionBtn} onClick={handlePrintPDF}>
            <Printer size={14} /> Print PDF
          </button>
        </div>
      )}
    </div>
  );
}

const st = {
  container: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    padding: "16px",
    marginTop: "8px",
    marginBottom: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  accountTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#0f172a",
  },
  accountSub: {
    fontSize: "12px",
    color: "#64748b",
    marginTop: "2px",
  },
  monoText: {
    fontFamily: "monospace",
    fontWeight: "600",
  },
  typeText: {
    textTransform: "uppercase",
    fontWeight: "600",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  dateGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  dateInput: {
    padding: "6px 8px",
    border: "1px solid #cbd5e1",
    borderRadius: "4px",
    fontSize: "12px",
    outline: "none",
  },
  dateSeparator: {
    fontSize: "12px",
    color: "#64748b",
  },
  closeBtn: {
    background: "#f1f5f9",
    border: "none",
    borderRadius: "4px",
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "#64748b",
  },
  tableWrapper: {
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    overflow: "hidden",
    background: "#f8fafc",
  },
  infoText: {
    padding: "32px",
    textAlign: "center",
    color: "#64748b",
    fontSize: "13px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "12px",
  },
  thRow: {
    background: "#0f172a",
  },
  th: {
    padding: "8px 12px",
    color: "#fff",
    fontWeight: "600",
    textAlign: "left",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  tr: {
    borderBottom: "1px solid #e2e8f0",
    background: "#fff",
  },
  td: {
    padding: "8px 12px",
    color: "#334155",
    verticalAlign: "middle",
  },
  badge: {
    fontSize: "9px",
    fontWeight: "700",
    textTransform: "uppercase",
    border: "1px solid #e2e8f0",
    padding: "1px 5px",
    borderRadius: "4px",
    color: "#475569",
    background: "#f1f5f9",
    display: "inline-block",
  },
  totalsRow: {
    background: "#f1f5f9",
    borderTop: "1.5px solid #cbd5e1",
    fontWeight: "700",
  },
  totalsLabel: {
    padding: "8px 12px",
    color: "#1e293b",
  },
  totalsNum: {
    padding: "8px 12px",
    textAlign: "right",
    fontFamily: "monospace",
    color: "#1e293b",
  },
  closingRow: {
    background: "#0f172a",
    color: "#fff",
    fontWeight: "700",
  },
  closingLabel: {
    padding: "10px 12px",
    color: "#fff",
  },
  closingNum: {
    padding: "10px 12px",
    textAlign: "right",
    fontFamily: "monospace",
    color: "#fff",
  },
  actionsRow: {
    display: "flex",
    gap: "8px",
    marginTop: "12px",
  },
  actionBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "#fff",
    border: "1px solid #cbd5e1",
    padding: "6px 12px",
    borderRadius: "4px",
    fontSize: "12px",
    color: "#334155",
    fontWeight: "500",
    cursor: "pointer",
  },
};
