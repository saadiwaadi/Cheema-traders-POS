import { useState, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { fmtPKR, drcr } from "../lib/money";

const ipc = typeof window !== "undefined" ? window.ipc : null;

export default function JournalPage() {
  const [activeTab, setActiveTab] = useState("vouchers"); // "ledger" | "vouchers" | "new-voucher"

  // Master Data
  const [accounts, setAccounts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  
  // Ledger Tab State
  
  // Journal Vouchers Tab State
  const [vouchers, setVouchers] = useState([]);
  const [voucherFrom, setVoucherFrom] = useState("");
  const [voucherTo, setVoucherTo] = useState("");
  const [voucherSourceType, setVoucherSourceType] = useState("All");
  const [voucherAccountId, setVoucherAccountId] = useState("All");
  const [viewingVoucher, setViewingVoucher] = useState(null); // Detail view modal/drawer

  // New Journal Voucher Form State
  const [jvDate, setJvDate] = useState(new Date().toISOString().split("T")[0]);
  const [jvNarration, setJvNarration] = useState("");
  const [jvEntryNoPreview, setJvEntryNoPreview] = useState("");
  const [jvLines, setJvLines] = useState([
    { accountId: "", debit: "", credit: "", memo: "", customerId: "", supplierId: "" },
    { accountId: "", debit: "", credit: "", memo: "", customerId: "", supplierId: "" }
  ]);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // Direct Subledger Transfer Mode State
  const [entryMode, setEntryMode] = useState("standard"); // "standard" | "transfer"
  const [transferType, setTransferType] = useState("receive_payment"); 
  const [transferHeaderAccountId, setTransferHeaderAccountId] = useState("");
  const [transferSubledgerId, setTransferSubledgerId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [transferNarration, setTransferNarration] = useState("");

  // Reversal Prompt State (inside Detail view)
  const [isReversing, setIsReversing] = useState(false);
  const [reversalDate, setReversalDate] = useState(new Date().toISOString().split("T")[0]);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalError, setReversalError] = useState("");

  // Refs for focusing next inputs
  const inputRefs = useRef([]);

  // Fetch accounts list on mount
  useEffect(() => {
    loadAccounts();
    loadSubledgers();
  }, []);

  // Reload data when active tab changes
  useEffect(() => {
    if (activeTab === "vouchers") {
      loadVouchers();
    } else if (activeTab === "new-voucher") {
      loadNextJVNo();
    }
  }, [activeTab, voucherFrom, voucherTo, voucherSourceType, voucherAccountId]);

  // Fetch next JV number when date changes
  useEffect(() => {
    if (activeTab === "new-voucher" && jvDate) {
      loadNextJVNo();
    }
  }, [jvDate]);

  const loadAccounts = async () => {
    if (!ipc) return;
    try {
      const list = await ipc.invoke("coa:list");
      setAccounts(list || []);
    } catch (err) {
      console.error("Failed to load accounts:", err);
    }
  };

  const loadSubledgers = async () => {
    if (!ipc) return;
    try {
      const custRes = await ipc.invoke("pos:customers:list", "");
      setCustomers(custRes.customers || []);
      const suppRes = await ipc.invoke("pos:suppliers:list", "");
      setSuppliers(suppRes.suppliers || []);
    } catch (err) {
      console.error("Failed to load subledgers:", err);
    }
  };

  
  const loadVouchers = async () => {
    if (!ipc) return;
    try {
      const list = await ipc.invoke("journal:list", {
        from: voucherFrom || null,
        to: voucherTo || null,
        sourceType: voucherSourceType === "All" ? null : voucherSourceType,
        accountId: voucherAccountId === "All" ? null : Number(voucherAccountId)
      });
      setVouchers(list || []);
    } catch (err) {
      console.error("Failed to load vouchers:", err);
    }
  };

  const handleDeleteVoucher = async (id) => {
    if (window.confirm("Are you sure you want to delete this journal entry? This action will permanently delete the entry, its transaction lines, and revert all debits/credits. If this entry originated from an Expense, the expense record will also be deleted.")) {
      try {
        await ipc.invoke("journal:delete", id);
        setViewingVoucher(null);
        loadVouchers();
      } catch (err) {
        alert("Failed to delete journal entry: " + err.message);
      }
    }
  };

  const loadNextJVNo = async () => {
    if (!ipc) return;
    try {
      const no = await ipc.invoke("journal:next-no", jvDate);
      setJvEntryNoPreview(no);
    } catch (err) {
      console.error("Failed to fetch next entry no:", err);
    }
  };

  // JV calculation helpers (amounts are string Rupees in state)
  const getTotals = () => {
    let totalDr = 0;
    let totalCr = 0;
    jvLines.forEach(l => {
      const d = Math.round(Number(l.debit || 0) * 100);
      const c = Math.round(Number(l.credit || 0) * 100);
      totalDr += d;
      totalCr += c;
    });
    const difference = totalDr - totalCr;
    return { totalDr, totalCr, difference };
  };

  const { totalDr, totalCr, difference } = getTotals();

  // Auto fill the balancing amount into the last empty or partially filled line
  const handleAutoFill = () => {
    if (difference === 0) return;
    
    // Find the last line where both debit and credit are empty or 0
    let targetIndex = -1;
    for (let i = jvLines.length - 1; i >= 0; i--) {
      const l = jvLines[i];
      if (!l.debit && !l.credit) {
        targetIndex = i;
        break;
      }
    }
    
    // If no fully empty line, use the very last line
    if (targetIndex === -1) {
      targetIndex = jvLines.length - 1;
    }

    const updated = [...jvLines];
    if (difference > 0) {
      // Dr > Cr, so we need Cr
      updated[targetIndex].credit = (difference / 100).toFixed(2);
      updated[targetIndex].debit = "";
    } else {
      // Dr < Cr, so we need Dr
      updated[targetIndex].debit = (Math.abs(difference) / 100).toFixed(2);
      updated[targetIndex].credit = "";
    }
    setJvLines(updated);
  };

  const handleLineChange = (index, field, val) => {
    const updated = [...jvLines];
    updated[index][field] = val;

    // A line cannot be both debit and credit
    if (field === "debit" && val) {
      updated[index].credit = "";
    } else if (field === "credit" && val) {
      updated[index].debit = "";
    }

    setJvLines(updated);
  };

  const addLine = () => {
    setJvLines([...jvLines, { accountId: "", debit: "", credit: "", memo: "", customerId: "", supplierId: "" }]);
  };

  const removeLine = (index) => {
    if (jvLines.length <= 2) return;
    const updated = jvLines.filter((_, i) => i !== index);
    setJvLines(updated);
  };

  const handleSaveJV = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!ipc) {
      setFormError("Electron IPC is not available.");
      return;
    }

    try {
      // Format lines for the IPC handler
      const formattedLines = jvLines.map(l => {
        if (!l.accountId) {
          throw new Error("All lines must have an account selected.");
        }
        const db = Math.round(Number(l.debit || 0) * 100);
        const cr = Math.round(Number(l.credit || 0) * 100);
        if (db === 0 && cr === 0) {
          throw new Error("Each line must have either a debit or credit amount.");
        }

        const acc = accounts.find(a => String(a.id) === String(l.accountId));
        if (acc?.code === "1100" && !l.customerId) {
          throw new Error(`Customer selection is required for Accounts Receivable line.`);
        }
        if (acc?.code === "2000" && !l.supplierId) {
          throw new Error(`Supplier selection is required for Accounts Payable line.`);
        }

        return {
          accountId: Number(l.accountId),
          debit: db,
          credit: cr,
          customerId: l.customerId ? Number(l.customerId) : null,
          supplierId: l.supplierId ? Number(l.supplierId) : null,
          memo: l.memo || null
        };
      });

      const payload = {
        date: jvDate,
        narration: jvNarration || null,
        source_type: "manual",
        source_id: null,
        lines: formattedLines
      };

      await ipc.invoke("journal:create", payload);

      setFormSuccess("Journal Voucher posted successfully!");
      // Reset form
      setJvNarration("");
      setJvLines([
        { accountId: "", debit: "", credit: "", memo: "", customerId: "", supplierId: "" },
        { accountId: "", debit: "", credit: "", memo: "", customerId: "", supplierId: "" }
      ]);
      loadNextJVNo();
      
      // Redirect to list after 1.5s
      setTimeout(() => {
        setFormSuccess("");
        setActiveTab("vouchers");
      }, 1500);

    } catch (err) {
      setFormError(err.message || "Failed to save journal voucher.");
    }
  };

  const handleSaveTransfer = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!ipc) {
      setFormError("Electron IPC is not available.");
      return;
    }

    try {
      const amt = Number(transferAmount);
      if (!amt || amt <= 0) {
        throw new Error("Amount must be greater than 0.");
      }
      if (!transferHeaderAccountId) {
        throw new Error("Please select a Cash/Bank account.");
      }
      if (!transferSubledgerId) {
        throw new Error("Please select a Customer or Supplier.");
      }

      const bankAcc = accounts.find(a => String(a.id) === String(transferHeaderAccountId));
      if (!bankAcc) throw new Error("Cash/Bank account not found.");

      const arAcc = accounts.find(a => a.code === "1100");
      const apAcc = accounts.find(a => a.code === "2000");
      if (!arAcc || !apAcc) throw new Error("Control accounts (AR/AP) not found in COA.");

      let lines = [];
      const amtPaisa = Math.round(amt * 100);

      if (transferType === "receive_payment") {
        lines.push({
          accountId: bankAcc.id,
          debit: amtPaisa,
          credit: 0,
          memo: transferNarration || "Customer payment received"
        });
        lines.push({
          accountId: arAcc.id,
          debit: 0,
          credit: amtPaisa,
          customerId: Number(transferSubledgerId),
          supplierId: null,
          memo: transferNarration || "Customer payment received"
        });
      } else if (transferType === "send_refund") {
        lines.push({
          accountId: arAcc.id,
          debit: amtPaisa,
          credit: 0,
          customerId: Number(transferSubledgerId),
          supplierId: null,
          memo: transferNarration || "Customer refund sent"
        });
        lines.push({
          accountId: bankAcc.id,
          debit: 0,
          credit: amtPaisa,
          memo: transferNarration || "Customer refund sent"
        });
      } else if (transferType === "send_payment") {
        lines.push({
          accountId: apAcc.id,
          debit: amtPaisa,
          credit: 0,
          supplierId: Number(transferSubledgerId),
          customerId: null,
          memo: transferNarration || "Payment to supplier"
        });
        lines.push({
          accountId: bankAcc.id,
          debit: 0,
          credit: amtPaisa,
          memo: transferNarration || "Payment to supplier"
        });
      } else if (transferType === "receive_refund") {
        lines.push({
          accountId: bankAcc.id,
          debit: amtPaisa,
          credit: 0,
          memo: transferNarration || "Refund received from supplier"
        });
        lines.push({
          accountId: apAcc.id,
          debit: 0,
          credit: amtPaisa,
          supplierId: Number(transferSubledgerId),
          customerId: null,
          memo: transferNarration || "Refund received from supplier"
        });
      }

      const payload = {
        date: transferDate,
        narration: transferNarration || null,
        source_type: "manual",
        source_id: null,
        lines
      };

      await ipc.invoke("journal:create", payload);

      setFormSuccess("Direct subledger transfer saved and posted successfully!");
      setTransferAmount("");
      setTransferNarration("");
      setTransferSubledgerId("");

      setTimeout(() => {
        setFormSuccess("");
        setActiveTab("vouchers");
      }, 1500);

    } catch (err) {
      setFormError(err.message || "Failed to post transfer.");
    }
  };

  // Open Details Modal/Drawer
  const handleViewVoucher = async (id) => {
    if (!ipc) return;
    try {
      const entry = await ipc.invoke("journal:get", id);
      setViewingVoucher(entry);
      setIsReversing(false);
      setReversalReason("");
      setReversalError("");
    } catch (err) {
      alert("Failed to load voucher details: " + err.message);
    }
  };

  // Post Reversal
  const handleReverseVoucher = async (e) => {
    e.preventDefault();
    setReversalError("");
    if (!ipc) {
      setReversalError("Electron IPC is not available.");
      return;
    }
    try {
      await ipc.invoke("journal:reverse", {
        id: viewingVoucher.id,
        date: reversalDate,
        reason: reversalReason
      });
      // Refresh
      setViewingVoucher(null);
      loadVouchers();
      alert("Voucher reversed successfully!");
    } catch (err) {
      setReversalError(err.message || "Failed to reverse voucher.");
    }
  };

  
  return (
    <div style={st.page}>
      <div style={st.main}>
        {/* HEADER TOOLBAR */}
        <div style={st.toolbar}>
          <div style={st.toolbarLeft}>
            <h1 style={st.pageTitle}>Journal Entries</h1>
            <span style={st.badge}>Financial Accounting</span>
          </div>

          <div style={st.tabBar}>
            
            <button
              onClick={() => setActiveTab("vouchers")}
              style={activeTab === "vouchers" ? st.activeTabBtn : st.tabBtn}
            >
              Journal Vouchers
            </button>
            <button
              onClick={() => setActiveTab("new-voucher")}
              style={activeTab === "new-voucher" ? st.activeTabBtn : st.tabBtn}
            >
              + New Voucher (JV)
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* TAB 2: JOURNAL VOUCHERS LIST */}
        {/* ======================================================== */}
        {activeTab === "vouchers" && (
          <>
            {/* JV FILTERS */}
            <div style={st.filterBar}>
              <div style={st.filterGroup}>
                <label style={st.label}>Source Type</label>
                <select
                  style={st.select}
                  value={voucherSourceType}
                  onChange={(e) => setVoucherSourceType(e.target.value)}
                >
                  <option value="All">All Types</option>
                  <option value="manual">Manual (JV)</option>
                  <option value="sale">Sales Integration</option>
                  <option value="payment">Payments Integration</option>
                  <option value="return">Sales Returns</option>
                  <option value="opening">Opening Balances</option>
                </select>
              </div>

              <div style={st.filterGroup}>
                <label style={st.label}>Filtered Account</label>
                <select
                  style={st.select}
                  value={voucherAccountId}
                  onChange={(e) => setVoucherAccountId(e.target.value)}
                >
                  <option value="All">All Accounts</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} — {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={st.filterGroup}>
                <label style={st.label}>From Date</label>
                <input
                  type="date"
                  style={st.input}
                  value={voucherFrom}
                  onChange={(e) => setVoucherFrom(e.target.value)}
                />
              </div>

              <div style={st.filterGroup}>
                <label style={st.label}>To Date</label>
                <input
                  type="date"
                  style={st.input}
                  value={voucherTo}
                  onChange={(e) => setVoucherTo(e.target.value)}
                />
              </div>
            </div>

            {/* JV LIST TABLE */}
            <div style={st.card}>
              <div style={st.cardHeader}>
                <h3 style={st.cardTitle}>Posted Vouchers</h3>
                <span style={st.subText}>Double-entry transaction headers. Click to view lines or reverse.</span>
              </div>
              <div style={st.tableWrap}>
                <table style={st.table}>
                  <thead>
                    <tr style={st.tableHeadRow}>
                      <th style={{ ...st.th, width: "12%" }}>Entry No</th>
                      <th style={{ ...st.th, width: "12%" }}>Date</th>
                      <th style={{ ...st.th, width: "15%" }}>Source Type</th>
                      <th style={{ ...st.th, width: "36%" }}>Narration</th>
                      <th style={{ ...st.th, width: "15%", textAlign: "right" }}>Total Amount</th>
                      <th style={{ ...st.th, width: "10%", textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vouchers.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={st.emptyCell}>
                          No journal vouchers found.
                        </td>
                      </tr>
                    ) : (
                      vouchers.map((v) => (
                        <tr key={v.id} style={st.tableRow}>
                          <td style={{ ...st.td, fontWeight: "bold", color: "#2e7d32" }}>
                            {v.entry_no}
                          </td>
                          <td style={st.td}>{v.date}</td>
                          <td style={st.td}>
                            <span style={{
                              ...st.sourceBadge,
                              background: v.source_type === "manual" ? "rgba(46, 125, 50, 0.15)" : "var(--sidebar-bg)",
                              color: v.source_type === "manual" ? "var(--success)" : "var(--text-secondary)"
                            }}>
                              {v.source_type.toUpperCase()}
                            </span>
                          </td>
                          <td style={st.td}>
                            <div>{v.narration || "No Narration"}</div>
                            {v.customer_names && (
                              <div style={{ fontSize: 11, color: "var(--success)", marginTop: 4 }}>
                                <strong>Customer:</strong> {v.customer_names}
                              </div>
                            )}
                            {v.supplier_names && (
                              <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>
                                <strong>Supplier:</strong> {v.supplier_names}
                              </div>
                            )}
                            {v.reversed_by && (
                              <div style={{ color: "var(--danger)", fontSize: 11, marginTop: 4 }}>
                                Reversed by {v.reversed_by}
                              </div>
                            )}
                            {v.reverses && (
                              <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 4 }}>
                                Reverses {v.reverses}
                              </div>
                            )}
                          </td>
                          <td style={{ ...st.td, ...st.num }}>
                            {fmtPKR(v.total_amount)}
                          </td>
                          <td style={{ ...st.td, textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
                            <button
                              onClick={() => handleViewVoucher(v.id)}
                              style={st.viewBtn}
                            >
                              View Detail
                            </button>
                            <button
                              onClick={() => handleDeleteVoucher(v.id)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--danger)",
                                cursor: "pointer",
                                padding: 6,
                                display: "inline-flex",
                                alignItems: "center"
                              }}
                              title="Delete Journal Entry"
                            >
                              <Trash2 size={16} />
                            </button>
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

        {/* ======================================================== */}
        {/* TAB 3: NEW JOURNAL VOUCHER (JV) ENTRY SCREEN */}
        {/* ======================================================== */}
        {activeTab === "new-voucher" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Mode Toggle Tabs */}
            <div style={{ display: "flex", gap: 12, background: "var(--sidebar-bg)", padding: 4, borderRadius: 6, width: "fit-content" }}>
              <button
                type="button"
                onClick={() => { setEntryMode("standard"); setFormError(""); setFormSuccess(""); }}
                style={entryMode === "standard" ? st.activeModeBtn : st.modeBtn}
              >
                Standard JV (Multi-Line Grid)
              </button>
              <button
                type="button"
                onClick={() => { setEntryMode("transfer"); setFormError(""); setFormSuccess(""); }}
                style={entryMode === "transfer" ? st.activeModeBtn : st.modeBtn}
              >
                Direct Subledger Transfer
              </button>
            </div>

            {/* Form status notices */}
            {formError && <div style={st.errorBanner}>{formError}</div>}
            {formSuccess && <div style={st.successBanner}>{formSuccess}</div>}

            {entryMode === "standard" ? (
              <form onSubmit={handleSaveJV} style={st.voucherForm}>
                <div style={st.card}>
                  <div style={st.formHeaderRow}>
                    <div style={st.formHeaderField}>
                      <label style={st.label}>Voucher No (Auto-Preview)</label>
                      <input
                        type="text"
                        style={{ ...st.input, background: "var(--sidebar-bg)", color: "var(--text-secondary)", fontWeight: "bold" }}
                        value={jvEntryNoPreview}
                        readOnly
                      />
                    </div>

                    <div style={st.formHeaderField}>
                      <label style={st.label}>Voucher Date</label>
                      <input
                        type="date"
                        required
                        style={st.input}
                        value={jvDate}
                        onChange={(e) => setJvDate(e.target.value)}
                      />
                    </div>

                    <div style={{ ...st.formHeaderField, flex: 2 }}>
                      <label style={st.label}>Narration / Description</label>
                      <input
                        type="text"
                        placeholder="Enter journal voucher general narration..."
                        style={st.input}
                        value={jvNarration}
                        onChange={(e) => setJvNarration(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* LINES GRID */}
                <div style={{ ...st.card, padding: 0, overflow: "visible" }}>
                  <div style={st.gridHeader}>
                    <span style={{ width: "35%", paddingLeft: 12 }}>Account Selection</span>
                    <span style={{ width: "20%", textAlign: "right" }}>Debit (PKR)</span>
                    <span style={{ width: "20%", textAlign: "right" }}>Credit (PKR)</span>
                    <span style={{ width: "20%", paddingLeft: 12 }}>Line Memo</span>
                    <span style={{ width: "5%", textAlign: "center" }}></span>
                  </div>

                  <div style={st.gridBody}>
                    {jvLines.map((line, idx) => (
                      <div key={idx} style={st.gridRow}>
                        {/* Account Select with unique TabIndex */}
                        <div style={{ width: "35%", display: "flex", flexDirection: "column", gap: 4 }}>
                          <select
                            style={{ ...st.select, width: "100%" }}
                            value={line.accountId}
                            onChange={(e) => {
                              const newAccountId = e.target.value;
                              handleLineChange(idx, "accountId", newAccountId);
                              const acc = accounts.find(a => String(a.id) === String(newAccountId));
                              if (acc?.code === "1100") {
                                handleLineChange(idx, "supplierId", "");
                              } else if (acc?.code === "2000") {
                                handleLineChange(idx, "customerId", "");
                              }
                            }}
                            required
                            ref={(el) => (inputRefs.current[idx * 3] = el)}
                          >
                            <option value="">Choose Account...</option>
                            {accounts.map(acc => (
                              <option key={acc.id} value={acc.id} disabled={!acc.is_active}>
                                {acc.code} — {acc.name} ({acc.type.toUpperCase()})
                              </option>
                            ))}
                          </select>

                          {line.accountId && (
                            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                              {accounts.find(a => String(a.id) === String(line.accountId))?.code === "1100" ? (
                                <select
                                  style={{ ...st.select, width: "100%", borderColor: "var(--success)", background: "rgba(46, 125, 50, 0.05)", padding: "4px 8px", fontSize: 12 }}
                                  value={line.customerId || ""}
                                  onChange={(e) => {
                                    handleLineChange(idx, "customerId", e.target.value);
                                    handleLineChange(idx, "supplierId", "");
                                  }}
                                  required
                                >
                                  <option value="">-- Required Customer --</option>
                                  {customers.map(c => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} {c.phone ? `(${c.phone})` : ""}
                                    </option>
                                  ))}
                                </select>
                              ) : accounts.find(a => String(a.id) === String(line.accountId))?.code === "2000" ? (
                                <select
                                  style={{ ...st.select, width: "100%", borderColor: "var(--danger)", background: "rgba(239, 68, 68, 0.05)", padding: "4px 8px", fontSize: 12 }}
                                  value={line.supplierId || ""}
                                  onChange={(e) => {
                                    handleLineChange(idx, "supplierId", e.target.value);
                                    handleLineChange(idx, "customerId", "");
                                  }}
                                  required
                                >
                                  <option value="">-- Required Supplier --</option>
                                  {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>
                                      {s.name} {s.phone ? `(${s.phone})` : ""}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                            </div>
                          )}
                        </div>

                        {/* Debit Input */}
                        <div style={{ width: "20%" }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            style={{ ...st.input, textAlign: "right", fontFamily: "monospace" }}
                            value={line.debit}
                            onChange={(e) => handleLineChange(idx, "debit", e.target.value)}
                            ref={(el) => (inputRefs.current[idx * 3 + 1] = el)}
                          />
                        </div>

                        {/* Credit Input */}
                        <div style={{ width: "20%" }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            style={{ ...st.input, textAlign: "right", fontFamily: "monospace" }}
                            value={line.credit}
                            onChange={(e) => handleLineChange(idx, "credit", e.target.value)}
                            ref={(el) => (inputRefs.current[idx * 3 + 2] = el)}
                          />
                        </div>

                        {/* Memo */}
                        <div style={{ width: "20%" }}>
                          <input
                            type="text"
                            placeholder="Memo..."
                            style={st.input}
                            value={line.memo}
                            onChange={(e) => handleLineChange(idx, "memo", e.target.value)}
                          />
                        </div>

                        {/* Remove Action */}
                        <div style={{ width: "5%", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            style={st.removeBtn}
                            disabled={jvLines.length <= 2}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add Row Action */}
                  <div style={st.gridFooterActions}>
                    <button
                      type="button"
                      onClick={addLine}
                      style={st.addBtn}
                    >
                      + Add Line
                    </button>
                  </div>
                </div>

                {/* STICKY VOUCHER FOOTER */}
                <div style={st.stickyFooter}>
                  <div style={st.stickyFooterInfo}>
                    <div style={st.footerMetric}>
                      <span style={st.footerLabel}>Total Debit:</span>
                      <span style={{ ...st.footerValue, color: "#2e7d32" }}>
                        {fmtPKR(totalDr)}
                      </span>
                    </div>

                    <div style={st.footerMetric}>
                      <span style={st.footerLabel}>Total Credit:</span>
                      <span style={{ ...st.footerValue, color: "#c62828" }}>
                        {fmtPKR(totalCr)}
                      </span>
                    </div>

                    <div style={st.footerMetric}>
                      <span style={st.footerLabel}>Difference:</span>
                      <span style={{
                        ...st.footerValue,
                        color: difference === 0 ? "#2e7d32" : "#c62828"
                      }}>
                        {fmtPKR(Math.abs(difference))} {difference !== 0 && "Out of Balance"}
                      </span>
                    </div>
                  </div>

                  <div style={st.stickyFooterActions}>
                    {difference !== 0 && (
                      <button
                        type="button"
                        onClick={handleAutoFill}
                        style={st.balanceBtn}
                      >
                        Auto-fill Balance
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={difference !== 0 || jvLines.some(l => !l.accountId)}
                      style={{
                        ...st.saveBtn,
                        opacity: (difference !== 0 || jvLines.some(l => !l.accountId)) ? 0.5 : 1,
                        cursor: (difference !== 0 || jvLines.some(l => !l.accountId)) ? "not-allowed" : "pointer"
                      }}
                    >
                      Save & Post Voucher
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSaveTransfer} style={st.voucherForm}>
                <div style={st.card}>
                  <div style={st.cardHeader}>
                    <h3 style={st.cardTitle}>Direct Subledger Fund Transfer</h3>
                    <span style={st.subText}>Transfer money directly between cash/bank and customer/supplier subledger accounts.</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                    {/* Transfer Type */}
                    <div style={st.filterGroup}>
                      <label style={st.label}>Transfer Type</label>
                      <select
                        style={st.select}
                        value={transferType}
                        onChange={(e) => {
                          setTransferType(e.target.value);
                          setTransferSubledgerId("");
                        }}
                        required
                      >
                        <option value="receive_payment">Receive Payment from Customer</option>
                        <option value="send_refund">Send Refund to Customer</option>
                        <option value="send_payment">Send Payment to Supplier</option>
                        <option value="receive_refund">Receive Refund from Supplier</option>
                      </select>
                    </div>

                    {/* Date */}
                    <div style={st.filterGroup}>
                      <label style={st.label}>Date</label>
                      <input
                        type="date"
                        required
                        style={st.input}
                        value={transferDate}
                        onChange={(e) => setTransferDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
                    {/* Header Account (Cash/Bank) */}
                    <div style={st.filterGroup}>
                      <label style={st.label}>Cash / Bank Account</label>
                      <select
                        style={st.select}
                        value={transferHeaderAccountId}
                        onChange={(e) => setTransferHeaderAccountId(e.target.value)}
                        required
                      >
                        <option value="">Choose Cash/Bank Account...</option>
                        {accounts
                          .filter(a => a.code.startsWith("10") && a.type === "asset")
                          .map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.code} — {acc.name}
                            </option>
                          ))
                        }
                      </select>
                    </div>

                    {/* Subledger Entity (Customer or Supplier) */}
                    <div style={st.filterGroup}>
                      <label style={st.label}>
                        {transferType.includes("customer") || ["receive_payment", "send_refund"].includes(transferType) ? "Customer" : "Supplier"}
                      </label>
                      {transferType.includes("customer") || ["receive_payment", "send_refund"].includes(transferType) ? (
                        <select
                          style={st.select}
                          value={transferSubledgerId}
                          onChange={(e) => setTransferSubledgerId(e.target.value)}
                          required
                        >
                          <option value="">Select Customer...</option>
                          {customers.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.phone ? `(${c.phone})` : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          style={st.select}
                          value={transferSubledgerId}
                          onChange={(e) => setTransferSubledgerId(e.target.value)}
                          required
                        >
                          <option value="">Select Supplier...</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} {s.phone ? `(${s.phone})` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Amount */}
                    <div style={st.filterGroup}>
                      <label style={st.label}>Amount (PKR)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        style={st.input}
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Narration */}
                  <div style={st.filterGroup}>
                    <label style={st.label}>Narration / Memo</label>
                    <textarea
                      placeholder="Describe this transfer transaction..."
                      style={{ ...st.input, height: 80, resize: "none" }}
                      value={transferNarration}
                      onChange={(e) => setTransferNarration(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                  <button
                    type="submit"
                    style={{
                      ...st.saveBtn,
                      background: "var(--success)",
                      cursor: "pointer"
                    }}
                  >
                    Post Transfer Entry
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* VOUCHER DETAILS DRAWER / MODAL */}
      {/* ======================================================== */}
      {viewingVoucher && (
        <div style={st.modalOverlay} onClick={() => setViewingVoucher(null)}>
          <div style={st.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={st.modalHeader}>
              <div>
                <h3 style={st.modalTitle}>Voucher Details: {viewingVoucher.entry_no}</h3>
                <span style={st.modalSubText}>Posted on {viewingVoucher.date}</span>
              </div>
              <button onClick={() => setViewingVoucher(null)} style={st.closeModalBtn}>
                ✕
              </button>
            </div>

            <div style={st.modalBody}>
              {/* Summary Cards */}
              <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
                <div style={{ ...st.miniCard, flex: 1 }}>
                  <div style={st.miniLabel}>Source Type</div>
                  <div style={st.miniValue}>{viewingVoucher.source_type.toUpperCase()}</div>
                </div>
                <div style={{ ...st.miniCard, flex: 2 }}>
                  <div style={st.miniLabel}>Narration / Description</div>
                  <div style={st.miniValue}>{viewingVoucher.narration || "—"}</div>
                </div>
              </div>

              {/* Lines Table */}
              <h4 style={{ ...st.sectionLabel, marginTop: 20 }}>Journal Entry Lines</h4>
              <div style={st.modalTableWrap}>
                <table style={st.table}>
                  <thead>
                    <tr style={st.tableHeadRow}>
                      <th style={st.th}>Account Code</th>
                      <th style={st.th}>Account Name</th>
                      <th style={st.th}>Memo</th>
                      <th style={{ ...st.th, textAlign: "right" }}>Debit</th>
                      <th style={{ ...st.th, textAlign: "right" }}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingVoucher.lines.map((line, idx) => (
                      <tr key={line.id || idx} style={st.tableRow}>
                        <td style={{ ...st.td, fontFamily: "monospace" }}>{line.account_code}</td>
                        <td style={st.td}>
                          {line.account_name}
                          {line.customer_name && (
                            <span style={st.subledgerBadge}> (Cust: {line.customer_name})</span>
                          )}
                          {line.supplier_name && (
                            <span style={st.subledgerBadge}> (Supp: {line.supplier_name})</span>
                          )}
                        </td>
                        <td style={st.td}>{line.line_memo || "—"}</td>
                        <td style={{ ...st.td, ...st.num, color: "#2e7d32" }}>
                          {line.debit > 0 ? fmtPKR(line.debit) : "—"}
                        </td>
                        <td style={{ ...st.td, ...st.num, color: "#c62828" }}>
                          {line.credit > 0 ? fmtPKR(line.credit) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Show Reversal References if they exist */}
              {viewingVoucher.reversed_by && (
                <div style={st.alertBoxWarning}>
                  <strong>This entry has been reversed.</strong> Reference: Reversal Entry ID {viewingVoucher.reversed_by}.
                </div>
              )}
              {viewingVoucher.reverses && (
                <div style={st.alertBoxInfo}>
                  <strong>This is a reversal transaction.</strong> Reverses Entry ID {viewingVoucher.reverses}.
                </div>
              )}

              {/* REVERSAL SECTION */}
              {!viewingVoucher.reversed_by && !isReversing && (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
                  <button
                    onClick={() => handleDeleteVoucher(viewingVoucher.id)}
                    style={{
                      padding: "10px 18px",
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid var(--danger)",
                      color: "var(--danger)",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 6
                    }}
                  >
                    <Trash2 size={14} /> Delete Voucher
                  </button>
                  <button
                    onClick={() => setIsReversing(true)}
                    style={st.reverseActionBtn}
                  >
                    Reverse This Voucher
                  </button>
                </div>
              )}

              {isReversing && (
                <form onSubmit={handleReverseVoucher} style={st.reversalForm}>
                  <h4 style={st.reversalFormTitle}>Post Reversal Entry</h4>
                  {reversalError && <div style={st.errorBanner}>{reversalError}</div>}
                  
                  <div style={st.reversalFormRow}>
                    <div style={{ flex: 1 }}>
                      <label style={st.label}>Reversal Date</label>
                      <input
                        type="date"
                        required
                        style={st.input}
                        value={reversalDate}
                        onChange={(e) => setReversalDate(e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 2 }}>
                      <label style={st.label}>Reason for Reversal</label>
                      <input
                        type="text"
                        placeholder="E.g. Correction of invoice reference, refund, entry error..."
                        required
                        style={st.input}
                        value={reversalReason}
                        onChange={(e) => setReversalReason(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={st.reversalFormActions}>
                    <button
                      type="button"
                      onClick={() => setIsReversing(false)}
                      style={st.cancelBtn}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      style={st.postReversalBtn}
                    >
                      Post Reversal (Mirror Entry)
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
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
  subledgerBadge: { fontSize: 11, color: "var(--text-secondary)", fontStyle: "italic", background: "var(--sidebar-bg)", padding: "2px 6px", borderRadius: 4, marginLeft: 6 },
  modeBtn: { padding: "8px 16px", border: "none", background: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600, color: "var(--text-secondary)", fontSize: 13 },
  activeModeBtn: { padding: "8px 16px", border: "none", background: "var(--success)", color: "#fff", borderRadius: 4, cursor: "pointer", fontWeight: 600, fontSize: 13 }
};
