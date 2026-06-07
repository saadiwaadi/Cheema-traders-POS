import { useState, useEffect, useCallback } from "react";
import DropdownSelect from "../components/DropdownSelect";
import SuccessNotification from "../components/SuccessNotification";
import WarningNotification from "../components/Warningnotification";
import {
  listCustomers,
  saveCustomerPayment,
  saveWithdrawal,
  listSuppliers,
  saveSupplierPayment
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
  }
};

const PAYMENT_METHODS = ["Cash", "HBL Bank", "UBL Bank", "Meezan Bank", "JazzCash", "EasyPaisa"];

export default function PaymentsPage() {
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [successData, setSuccessData] = useState(null);
  const [warnData, setWarnData] = useState(null);
  const [selectedParty, setSelectedParty] = useState(null);

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

  useEffect(() => {
    loadCustomers();
    loadSuppliers();
  }, [loadCustomers, loadSuppliers]);

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
        if (updated) setSelectedParty({ ...updated, partyType: "customer", uniqueId: `customer-${updated.id}` });
      }
    } else {
      await loadSuppliers();
      const refreshed = await listSuppliers();
      if (refreshed?.suppliers) {
        const updated = refreshed.suppliers.find(s => s.id === partyId);
        if (updated) setSelectedParty({ ...updated, partyType: "supplier", uniqueId: `supplier-${updated.id}` });
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
          amount: Number(payAmount),
          method: payMethod,
          date: payDate,
          notes: payNotes,
        });
        setSuccessData({
          title: "Payment Recorded",
          lines: [
            { label: "Supplier", value: selectedParty.name },
            { label: "Amount", value: `Rs ${Number(payAmount).toLocaleString()}`, mono: true },
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

    // Check advance balance limit: customer/supplier balance is negative for credit (advance)
    const available = selectedParty.current_balance < 0 ? Math.abs(selectedParty.current_balance) : 0;
    if (amount > available) {
      return setWarnData({
        title: "Insufficient Advance",
        lines: [
          { label: "Requested", value: `Rs ${amount.toLocaleString()}`, mono: true },
          { label: "Available Advance", value: `Rs ${available.toLocaleString()}`, mono: true },
          { label: "Error", value: "Amount exceeds available advance balance." }
        ]
      });
    }

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
          amount: -amount,
          method: drawMethod,
          date: drawDate,
          notes: drawNotes || "Advance Withdrawal",
        });
        setSuccessData({
          title: "Withdrawal Processed",
          lines: [
            { label: "Supplier", value: selectedParty.name },
            { label: "Amount", value: `Rs ${amount.toLocaleString()}`, mono: true },
            { label: "Type", value: "Advance Draw" },
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
              <h2 style={st.cardTitle}>Record Payment</h2>
              <p style={st.cardSubtitle}>
                {selectedParty.partyType === 'customer' ? "Apply customer payment to outstanding balance" : "Record payment made to supplier"}
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
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
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
                {paying ? "Recording..." : "Record Payment"}
              </button>
            </div>

            {/* CARD 2 */}
            <div style={{ ...st.card, ...st.card2 }}>
              <h2 style={st.cardTitle}>Withdrawal</h2>
              <p style={st.cardSubtitle}>
                {selectedParty.partyType === 'customer' ? "Draw from customer advance balance" : "Record refund or withdrawal from supplier advance"}
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
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
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
                {drawing ? "Processing..." : "Withdraw"}
              </button>
            </div>
          </div>
        </>
      )}

      <div style={st.recentSection}>
        <h2 style={st.cardTitle}>Recent Activity</h2>
        <div style={st.recentEmpty}>
          Coming Soon
        </div>
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
