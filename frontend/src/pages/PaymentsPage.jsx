import { useState, useEffect, useCallback } from "react";
import DropdownSelect from "../components/DropdownSelect";
import SuccessNotification from "../components/SuccessNotification";
import WarningNotification from "../components/Warningnotification";
import {
  listCustomers,
  saveCustomerPayment,
  saveWithdrawal,
  listSuppliers,
  saveSupplierPayment,
  getCustomerHistory,
  getSupplierHistory,
  listBanks,
  deleteCustomerPayment,
  deleteSupplierPayment,
  deleteCustomerWithdrawal
} from "../lib/posApi";

const st = {
  page: {
    padding: 24,
    maxWidth: 1600,
    margin: "0 auto",
    fontFamily: "system-ui, sans-serif",
    background: "#f0f6f0",
    minHeight: "100vh",
  },
  headerTitle: {
    margin: 0,
    color: "#1b3a1d",
    fontSize: 24,
    fontWeight: 700,
  },
  headerSubtitle: {
    margin: "4px 0 20px",
    color: "#6a8f6c",
    fontSize: 14,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 24,
  },
  card: {
    background: "#fff",
    border: "1px solid #c8d8c8",
    borderRadius: 4,
    padding: 24,
  },
  card1: {
    borderLeft: "4px solid #2e7d32",
  },
  card2: {
    borderLeft: "4px solid #c62828",
  },
  cardTitle: {
    margin: "0 0 4px",
    fontSize: 18,
    fontWeight: 700,
    color: "#1b3a1d",
  },
  cardSubtitle: {
    margin: "0 0 20px",
    fontSize: 13,
    color: "#6a8f6c",
  },
  fieldLabel: {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "#6a8f6c",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    height: 40,
    border: "1px solid #cde0cd",
    borderRadius: 4,
    background: "#fafff9",
    padding: "0 12px",
    boxSizing: "border-box",
    fontSize: 14,
    color: "#1b3a1d",
    marginBottom: 16,
  },
  select: {
    width: "100%",
    height: 40,
    border: "1px solid #cde0cd",
    borderRadius: 4,
    background: "#fafff9",
    padding: "0 12px",
    boxSizing: "border-box",
    fontSize: 14,
    color: "#1b3a1d",
    marginBottom: 16,
    cursor: "pointer",
  },
  buttonPrimary: {
    width: "100%",
    height: 44,
    background: "#2e7d32",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 8,
  },
  buttonDanger: {
    width: "100%",
    height: 44,
    background: "#c62828",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 8,
  },
  infoStrip: {
    padding: "16px",
    background: "#fafff9",
    border: "1px solid #cde0cd",
    borderRadius: 4,
    marginBottom: 24,
  },
  infoTitle: {
    margin: "0 0 4px",
    fontSize: 12,
    fontWeight: 700,
    color: "#6a8f6c",
  },
  infoValue: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  infoSubtext: {
    margin: "8px 0 0",
    fontSize: 12,
    color: "#6a8f6c",
    lineHeight: "1.4",
  },
  badgeCustomer: {
    background: "#e8f5e9",
    color: "#2e7d32",
    padding: "4px 10px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  badgeSupplier: {
    background: "#fff3e0",
    color: "#e65100",
    padding: "4px 10px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  emptyState: {
    padding: "80px 24px",
    textAlign: "center",
    background: "#fff",
    border: "1px solid #c8d8c8",
    borderRadius: 4,
    color: "#6a8f6c",
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    margin: "0 0 8px",
    fontSize: 18,
    fontWeight: 700,
    color: "#1b3a1d",
  },
  emptyText: {
    margin: 0,
    fontSize: 14,
    color: "#6a8f6c",
  },
  recentSection: {
    marginTop: 32,
    background: "#fff",
    border: "1px solid #c8d8c8",
    borderRadius: 4,
    padding: 24,
  },
  recentEmpty: {
    padding: 32,
    textAlign: "center",
    background: "#fafdfa",
    border: "1px dashed #c8d8c8",
    borderRadius: 4,
    color: "#6a8f6c",
    fontSize: 14,
    fontWeight: 600,
  },
  recentTable: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 16,
  },
  th: {
    padding: "12px 16px",
    fontSize: 11,
    fontWeight: 700,
    color: "#6a8f6c",
    textTransform: "uppercase",
    borderBottom: "2px solid #c8d8c8",
    textAlign: "left",
    background: "#fafdfa",
  },
  td: {
    padding: "14px 16px",
    borderBottom: "1px solid #f0f6f0",
    fontSize: 14,
    color: "#2e3d30",
  },
  badge: {
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    display: "inline-block",
  },
};

export default function PaymentsPage() {
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [successData, setSuccessData] = useState(null);
  const [warnData, setWarnData] = useState(null);
  const [selectedParty, setSelectedParty] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const loadHistory = useCallback(async (party) => {
    if (!party) {
      setHistory([]);
      return;
    }
    setLoadingHistory(true);
    try {
      if (party.partyType === "customer") {
        const res = await getCustomerHistory(party.id);
        setHistory(res?.history || []);
      } else {
        const res = await getSupplierHistory(party.id);
        setHistory(res?.history || []);
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory(selectedParty);
  }, [selectedParty, loadHistory]);

  const today = new Date().toISOString().split("T")[0];

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const res = await listCustomers();
      if (res?.customers) setCustomers(res.customers);
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  const loadSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    try {
      const res = await listSuppliers();
      if (res?.suppliers) setSuppliers(res.suppliers);
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  const loadBanks = useCallback(async () => {
    try {
      const res = await listBanks();
      if (res?.banks) setBanks(res.banks);
    } catch (e) {
      console.error("Failed to load banks", e);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
    loadSuppliers();
    loadBanks();
  }, [loadCustomers, loadSuppliers, loadBanks]);

  // Card 1: Pay
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [payDate, setPayDate] = useState(today);
  const [payNotes, setPayNotes] = useState("");
  const [paying, setPaying] = useState(false);

  // Card 2: Draw
  const [drawAmount, setDrawAmount] = useState("");
  const [drawMethod, setDrawMethod] = useState("Cash");
  const [drawDate, setDrawDate] = useState(today);
  const [drawNotes, setDrawNotes] = useState("");
  const [drawing, setDrawing] = useState(false);

  // Reset form inputs when selected party changes
  useEffect(() => {
    setPayAmount("");
    setDrawAmount("");
    setPayNotes("");
    setDrawNotes("");
    setPayDate(today);
    setDrawDate(today);
    setPayMethod("Cash");
    setDrawMethod("Cash");
  }, [selectedParty, today]);

  const refreshSelectedParty = async (partyId, type) => {
    if (type === "customer") {
      await loadCustomers();
      const refreshed = await listCustomers();
      if (refreshed?.customers) {
        const updated = refreshed.customers.find(c => c.id === partyId);
        if (updated) {
          const updatedParty = { ...updated, partyType: "customer", uniqueId: `customer-${updated.id}` };
          setSelectedParty(updatedParty);
          loadHistory(updatedParty);
        }
      }
    } else {
      await loadSuppliers();
      const refreshed = await listSuppliers();
      if (refreshed?.suppliers) {
        const updated = refreshed.suppliers.find(s => s.id === partyId);
        if (updated) {
          const updatedParty = { ...updated, partyType: "supplier", uniqueId: `supplier-${updated.id}` };
          setSelectedParty(updatedParty);
          loadHistory(updatedParty);
        }
      }
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedParty) {
      return setWarnData({
        title: "Party Required",
        lines: [{ label: "Error", value: "Please select a customer or supplier." }]
      });
    }
    if (!payAmount || Number(payAmount) <= 0) {
      return setWarnData({
        title: "Invalid Amount",
        lines: [{ label: "Error", value: "Please enter a valid amount." }]
      });
    }

    setPaying(true);
    try {
      if (selectedParty.partyType === "customer") {
        await saveCustomerPayment({
          customerId: selectedParty.id,
          amount: Number(payAmount),
          method: payMethod,
          type: "payment",
          date: payDate,
          notes: payNotes,
        });
        setSuccessData({
          title: "Payment Recorded",
          lines: [
            { label: "Customer", value: selectedParty.name },
            { label: "Amount", value: `Rs ${Number(payAmount).toLocaleString()}`, mono: true },
            { label: "Method", value: payMethod },
            { label: "Date", value: payDate },
          ]
        });
      } else {
        await saveSupplierPayment({
          supplierId: selectedParty.id,
          amount: -Number(payAmount),
          method: payMethod,
          date: payDate,
          notes: payNotes,
        });
        setSuccessData({
          title: "Payment Recorded",
          lines: [
            { label: "Supplier", value: selectedParty.name },
            { label: "Amount", value: `Rs ${Number(payAmount).toLocaleString()}`, mono: true },
            { label: "Type", value: "Received from Supplier" },
            { label: "Method", value: payMethod },
            { label: "Date", value: payDate },
          ]
        });
      }
      setPayAmount("");
      setPayNotes("");
      setPayDate(today);
      await refreshSelectedParty(selectedParty.id, selectedParty.partyType);
    } catch (e) {
      setWarnData({ title: "Error", lines: [{ label: "Details", value: e.message }] });
    } finally {
      setPaying(false);
    }
  };

  const handleWithdrawal = async () => {
    if (!selectedParty) {
      return setWarnData({
        title: "Party Required",
        lines: [{ label: "Error", value: "Please select a customer or supplier." }]
      });
    }
    if (!drawAmount || Number(drawAmount) <= 0) {
      return setWarnData({
        title: "Invalid Amount",
        lines: [{ label: "Error", value: "Please enter a valid amount." }]
      });
    }

    const amount = Number(drawAmount);

    // Check advance balance limit: customer balance is negative for credit (advance)
    // Removed restriction to allow unrestricted running balance withdrawals

    setDrawing(true);
    try {
      if (selectedParty.partyType === "customer") {
        await saveWithdrawal({
          customerId: selectedParty.id,
          amount,
          method: drawMethod,
          type: "advance_draw",
          date: drawDate,
          notes: drawNotes,
        });
        setSuccessData({
          title: "Withdrawal Processed",
          lines: [
            { label: "Customer", value: selectedParty.name },
            { label: "Amount", value: `Rs ${amount.toLocaleString()}`, mono: true },
            { label: "Type", value: "Advance Draw" },
            { label: "Method", value: drawMethod },
            { label: "Date", value: drawDate },
          ]
        });
      } else {
        await saveSupplierPayment({
          supplierId: selectedParty.id,
          amount: amount,
          method: drawMethod,
          date: drawDate,
          notes: drawNotes || "Supplier Payment",
        });
        setSuccessData({
          title: "Payment Recorded",
          lines: [
            { label: "Supplier", value: selectedParty.name },
            { label: "Amount", value: `Rs ${amount.toLocaleString()}`, mono: true },
            { label: "Type", value: "Payment to Supplier" },
            { label: "Method", value: drawMethod },
            { label: "Date", value: drawDate },
          ]
        });
      }
      setDrawAmount("");
      setDrawNotes("");
      setDrawDate(today);
      await refreshSelectedParty(selectedParty.id, selectedParty.partyType);
    } catch (e) {
      setWarnData({ title: "Error", lines: [{ label: "Details", value: e.message }] });
    } finally {
      setDrawing(false);
    }
  };

  const handleDeletePayment = async (paymentId, row) => {
    try {
      if (selectedParty.partyType === "customer") {
        if (row.type === 'Withdrawal') {
          await deleteCustomerWithdrawal(paymentId);
        } else {
          await deleteCustomerPayment(paymentId);
        }
      } else {
        await deleteSupplierPayment(paymentId);
      }
      setSuccessData({
        title: row.type === 'Withdrawal' ? "Withdrawal Deleted" : "Payment Deleted",
        lines: [
          { label: "Amount", value: `Rs ${Number(row.paid_amount || row.total_amount || 0).toLocaleString()}`, mono: true },
          { label: "Method", value: row.method || "-" },
          { label: "Date", value: formatDate(row.date) },
        ]
      });
      setDeleteConfirmId(null);
      await refreshSelectedParty(selectedParty.id, selectedParty.partyType);
    } catch (e) {
      setWarnData({ title: row.type === 'Withdrawal' ? "Error Deleting Withdrawal" : "Error Deleting Payment", lines: [{ label: "Details", value: e.message }] });
    }
  };

  const renderPartyInfo = (party) => {
    if (!party) return null;
    const bal = party.current_balance || 0;

    if (party.partyType === 'customer') {
      const isCredit = bal < 0; // Customer has advance credit
      const isDebit = bal > 0;  // Customer owes us money
      const balColor = isDebit ? "#d32f2f" : isCredit ? "#388e3c" : "#757575";
      const balText = Math.abs(bal).toLocaleString();
      const balSuffix = isDebit ? "(Dr)" : isCredit ? "(Cr)" : "";

      return (
        <div style={st.infoStrip}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={st.infoTitle}>Current Balance</p>
              <p style={{ ...st.infoValue, color: balColor }}>Rs {balText} {balSuffix}</p>
            </div>
            <span style={st.badgeCustomer}>Customer</span>
          </div>
          <p style={st.infoSubtext}>
            {isDebit ? "Will reduce Dr balance." : isCredit ? `Available Cr to draw: Rs ${balText}.` : "Settled balance."}
          </p>
        </div>
      );
    } else {
      const isCredit = bal > 0; // We owe them money (payable)
      const isDebit = bal < 0;  // They owe us (advance paid)
      const balColor = isCredit ? "#d32f2f" : isDebit ? "#388e3c" : "#757575";
      const balText = Math.abs(bal).toLocaleString();
      const balSuffix = isCredit ? "(Cr)" : isDebit ? "(Dr)" : "";

      return (
        <div style={st.infoStrip}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={st.infoTitle}>Current Balance</p>
              <p style={{ ...st.infoValue, color: balColor }}>Rs {balText} {balSuffix}</p>
            </div>
            <span style={st.badgeSupplier}>Supplier</span>
          </div>
          <p style={st.infoSubtext}>
            {isCredit ? "Will reduce Cr balance." : isDebit ? `Available Dr to draw: Rs ${balText}.` : "Settled balance."}
          </p>
        </div>
      );
    }
  };

  const getTypeBadge = (type) => {
    switch (type?.toLowerCase()) {
      case "sale":
        return { text: "Sale", bg: "#e8f5e9", color: "#2e7d32" };
      case "purchase":
        return { text: "Purchase", bg: "#e3f2fd", color: "#1565c0" };
      case "payment":
        return { text: "Payment", bg: "#f3e5f5", color: "#7b1fa2" };
      case "refund":
        return { text: "Refund", bg: "#fff3e0", color: "#e65100" };
      case "withdrawal":
        return { text: "Withdrawal", bg: "#ffebee", color: "#c62828" };
      case "opening":
        return { text: "Opening", bg: "#efebe9", color: "#5d4037" };
      case "journal":
        return { text: "Journal", bg: "#eceff1", color: "#37474f" };
      default:
        return { text: type || "Other", bg: "#f5f5f5", color: "#616161" };
    }
  };

  const getLedgerAmounts = (row) => {
    const change = Number(row.balance_change || 0);
    if (selectedParty?.partyType === "customer") {
      return {
        debit: change > 0 ? change : 0,
        credit: change < 0 ? Math.abs(change) : 0,
      };
    } else {
      // Supplier
      return {
        debit: change < 0 ? Math.abs(change) : 0,
        credit: change > 0 ? change : 0,
      };
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === "0000-00-00") return "-";
    try {
      return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PK", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
    } catch {
      return dateStr;
    }
  };

  const getDisplayedHistory = () => {
    const chronological = [...history].reverse();
    let running = 0;
    const withRunning = chronological.map(row => {
      running += Number(row.balance_change || 0);
      return {
        ...row,
        runningBalance: running
      };
    });
    return [...withRunning].reverse();
  };

  const combinedOptions = [
    ...customers.map(c => ({ ...c, partyType: "customer", uniqueId: `customer-${c.id}` })),
    ...suppliers.map(s => ({ ...s, partyType: "supplier", uniqueId: `supplier-${s.id}` }))
  ];

  return (
    <div style={st.page}>
      <h1 style={st.headerTitle}>Receipts & Payments</h1>


      <div style={{ ...st.card, marginBottom: 24 }}>
        <label style={st.fieldLabel}>Search Customer or Supplier</label>
        <DropdownSelect
          value={selectedParty ? selectedParty.uniqueId : null}
          options={combinedOptions}
          onChange={(val, opt) => setSelectedParty(opt)}
          getOptionLabel={(o) => `${o.name} (${o.partyType === 'customer' ? 'Customer' : 'Supplier'})`}
          getOptionValue={(o) => o.uniqueId}
          placeholder={
            customersLoading || suppliersLoading
              ? "Loading..."
              : "Type to search customer or supplier..."
          }
        />
      </div>

      {!selectedParty ? (
        <div style={st.emptyState}>
          <div style={st.emptyIcon}>👤</div>
          <h3 style={st.emptyTitle}>No Account Selected</h3>
          <p style={st.emptyText}>Please select a customer or supplier above to view balances and record entries.</p>
        </div>
      ) : (
        <>
          {renderPartyInfo(selectedParty)}

          <div style={st.grid}>
            {/* CARD 1 */}
            <div style={{ ...st.card, ...st.card1 }}>
              <h2 style={st.cardTitle}>Receive</h2>
              <p style={st.cardSubtitle}>
                {selectedParty.partyType === 'customer' ? "Apply customer payment to outstanding balance" : "Record refund or return payment received from supplier"}
              </p>

              <label style={st.fieldLabel}>Amount (Rs)</label>
              <input
                type="number"
                style={st.input}
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                placeholder="0"
              />

              <label style={st.fieldLabel}>Payment Method</label>
              <select style={st.select} value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                <option value="Cash">Cash</option>
                {banks.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>

              <label style={st.fieldLabel}>Date</label>
              <input
                type="date"
                style={st.input}
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
              />

              <label style={st.fieldLabel}>Notes (Optional)</label>
              <input
                type="text"
                style={st.input}
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                placeholder="e.g. Cleared past dues"
              />

              <button
                style={st.buttonPrimary}
                onClick={handleRecordPayment}
                disabled={paying}
              >
                {paying ? "Processing..." : "Receive"}
              </button>
            </div>

            {/* CARD 2 */}
            <div style={{ ...st.card, ...st.card2 }}>
              <h2 style={st.cardTitle}>Payment</h2>
              <p style={st.cardSubtitle}>
                {selectedParty.partyType === 'customer' ? "Draw from customer advance balance / return cash" : "Record payment made to supplier"}
              </p>

              <label style={st.fieldLabel}>Amount (Rs)</label>
              <input
                type="number"
                style={st.input}
                value={drawAmount}
                onChange={e => setDrawAmount(e.target.value)}
                placeholder="0"
              />

              <label style={st.fieldLabel}>Payment Method</label>
              <select style={st.select} value={drawMethod} onChange={e => setDrawMethod(e.target.value)}>
                <option value="Cash">Cash</option>
                {banks.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>

              <label style={st.fieldLabel}>Date</label>
              <input
                type="date"
                style={st.input}
                value={drawDate}
                onChange={e => setDrawDate(e.target.value)}
              />

              <label style={st.fieldLabel}>Notes (Optional)</label>
              <input
                type="text"
                style={st.input}
                value={drawNotes}
                onChange={e => setDrawNotes(e.target.value)}
                placeholder="e.g. Returning extra deposit"
              />

              <button
                style={st.buttonDanger}
                onClick={handleWithdrawal}
                disabled={drawing}
              >
                {drawing ? "Processing..." : "Payment"}
              </button>
            </div>
          </div>
        </>
      )}

      <div style={st.recentSection}>
        <h2 style={st.cardTitle}>Recent Activity</h2>
        {!selectedParty ? (
          <div style={st.recentEmpty}>
            Select a customer or supplier to view recent activity.
          </div>
        ) : loadingHistory ? (
          <div style={st.recentEmpty}>
            Loading transaction history...
          </div>
        ) : history.length === 0 ? (
          <div style={st.recentEmpty}>
            No recent activity found for this party.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={st.recentTable}>
              <thead>
                <tr>
                  <th style={st.th}>Date</th>
                  <th style={st.th}>Type</th>
                  <th style={st.th}>Reference/Description</th>
                  <th style={{ ...st.th, textAlign: "right" }}>Debit (Dr)</th>
                  <th style={{ ...st.th, textAlign: "right" }}>Credit (Cr)</th>
                  <th style={{ ...st.th, textAlign: "right" }}>Balance</th>
                  <th style={{ ...st.th, textAlign: "center", width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {getDisplayedHistory().map((row, idx) => {
                  const badge = getTypeBadge(row.type);
                  const { debit, credit } = getLedgerAmounts(row);
                  const runBal = row.runningBalance || 0;
                  const suffix = selectedParty.partyType === "customer"
                    ? (runBal > 0 ? "Dr" : runBal < 0 ? "Cr" : "")
                    : (runBal > 0 ? "Cr" : runBal < 0 ? "Dr" : "");

                  return (
                    <tr key={idx} style={{ transition: "background 0.15s" }}>
                      <td style={st.td}>{formatDate(row.date)}</td>
                      <td style={st.td}>
                        <span style={{
                          ...st.badge,
                          background: badge.bg,
                          color: badge.color
                        }}>
                          {badge.text}
                        </span>
                      </td>
                      <td style={st.td}>
                        <strong>{row.reference || "-"}</strong>
                        {row.notes && <div style={{ fontSize: 12, color: "#6a8f6c", marginTop: 2 }}>{row.notes}</div>}
                      </td>
                      <td style={{ ...st.td, textAlign: "right", fontFamily: "monospace" }}>
                        {debit > 0 ? `Rs ${debit.toLocaleString()}` : "-"}
                      </td>
                      <td style={{ ...st.td, textAlign: "right", fontFamily: "monospace", color: "#2e7d32" }}>
                        {credit > 0 ? `Rs ${credit.toLocaleString()}` : "-"}
                      </td>
                      <td style={{
                        ...st.td,
                        textAlign: "right",
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: runBal === 0 ? "#2e3d30" : (selectedParty.partyType === "customer" ? (runBal > 0 ? "#c62828" : "#2e7d32") : (runBal > 0 ? "#2e7d32" : "#c62828"))
                      }}>
                        Rs {Math.abs(runBal).toLocaleString()} {suffix}
                      </td>
                      <td style={{ ...st.td, textAlign: "center" }}>
                        {((selectedParty.partyType === "customer" &&
                           ((row.type === 'Payment' && ['payment', 'advance', 'advance_draw'].includes(row.payment_type)) ||
                            (row.type === 'Withdrawal' && row.payment_type === 'advance_draw'))) ||
                          (selectedParty.partyType === "supplier" && row.type === 'Payment')) ? (
                          deleteConfirmId === row.ref_id ? (
                            <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "#c62828", fontWeight: "bold" }}>Sure?</span>
                              <button
                                onClick={() => handleDeletePayment(row.ref_id, row)}
                                style={{
                                  padding: "2px 6px",
                                  background: "#c62828",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 3,
                                  cursor: "pointer",
                                  fontSize: 11,
                                  fontWeight: "bold",
                                }}
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                style={{
                                  padding: "2px 6px",
                                  background: "#fff",
                                  color: "#555",
                                  border: "1px solid #ccc",
                                  borderRadius: 3,
                                  cursor: "pointer",
                                  fontSize: 11,
                                  fontWeight: "bold",
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(row.ref_id)}
                              style={{
                                padding: "2px 8px",
                                background: "none",
                                color: "#c62828",
                                border: "1px solid #ffbbbb",
                                borderRadius: 4,
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: "600",
                              }}
                            >
                              Delete
                            </button>
                          )
                        ) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SuccessNotification
        visible={!!successData}
        title={successData?.title}
        lines={successData?.lines}
        onClose={() => setSuccessData(null)}
      />

      <WarningNotification
        visible={!!warnData}
        title={warnData?.title}
        lines={warnData?.lines}
        onConfirm={warnData?.onConfirm}
        confirmLabel={warnData?.confirmLabel}
        cancelLabel={warnData?.cancelLabel}
        onClose={() => setWarnData(null)}
      />
    </div>
  );
}
