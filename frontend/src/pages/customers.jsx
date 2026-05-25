import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, PlusCircle, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import SuccessNotification from "../components/SuccessNotification";
import WarningNotification from "../components/Warningnotification";
import StatementPrint from "../components/StatementPrint";
import {
  listCustomers,
  saveCustomer,
  getCustomerHistory,
  getSale,
  saveCustomerPayment as recordPayment,
  deleteCustomer,
} from "../lib/posApi";

export default function CustomersPage() {
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listCustomers();
      if (res && res.customers) {
        setCustomers(res.customers);
      }
    } catch (e) {
      console.error("Failed to load customers", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleOpenPanel = () => {
    setIsAddPanelOpen(true);
  };

  const handleSaved = () => {
    setIsAddPanelOpen(false);
    loadCustomers();
  };

  const handleDeleteCustomer = async (id) => {
    try {
      await deleteCustomer(id);
      loadCustomers();
    } catch (e) {
      console.error("Failed to delete customer", e);
      alert("Error deleting customer: " + e.message);
    }
  };

  return (
    <div style={st.page}>
      <div style={st.pageHeader}>
        <div>
          {selectedCustomer ? (
            <button style={st.backBtn} onClick={() => setSelectedCustomer(null)}>
              <ArrowLeft size={16} /> Back to Customers
            </button>
          ) : (
            <>
              <h1 style={st.title}>Customers</h1>
              <p style={st.subtitle}>Client and Debtor Management</p>
            </>
          )}
        </div>
        {!selectedCustomer && (
          <div style={st.headerActions}>
            <button style={st.primaryBtn} onClick={handleOpenPanel}>
              <PlusCircle size={16} /> Add Customer
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
        {selectedCustomer ? (
          <CustomerHistoryView customer={selectedCustomer} />
        ) : (
          <CustomerListView customers={customers} loading={loading} onSelectHistory={setSelectedCustomer} onDelete={handleDeleteCustomer} />
        )}
      </div>

      <AddCustomerPanel isOpen={isAddPanelOpen} onClose={() => setIsAddPanelOpen(false)} onSaved={handleSaved} />
    </div>
  );
}

function AddCustomerPanel({ isOpen, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [balanceType, setBalanceType] = useState("none");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setName(""); setPhone(""); setOpeningBalance(""); setBalanceType("none"); setErrorMsg("");
    }
  }, [isOpen]);

  const handleSave = async () => {
    setErrorMsg("");
    if (!name) return setErrorMsg("Name is required");
    setSaving(true);
    try {
      await saveCustomer({ name, phone, openingBalance, balanceType });
      onSaved();
    } catch (e) {
      setErrorMsg("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            style={st.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            style={st.sidePanel}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <div style={st.panelHeader}>
              <h2 style={st.panelTitle}>Add Customer</h2>
              <button style={st.closeBtn} onClick={onClose}>✕</button>
            </div>

            <div style={st.panelBody}>
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Customer Name *</label>
                <input style={st.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ali Traders" />
              </div>
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Phone Number</label>
                <input
                  style={st.input}
                  placeholder="03XXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                />
              </div>
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Opening Balance (Rs)</label>
                <input style={st.input} type="number" placeholder="0" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} />
              </div>
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Balance Type</label>
                <select
                  style={st.input}
                  value={balanceType}
                  onChange={(e) => setBalanceType(e.target.value)}
                >
                  <option value="none">No Opening Balance</option>
                  <option value="debit">Customer Will Pay</option>
                  <option value="credit">Advance / Store Credit</option>
                </select>
                <span style={st.fieldHint}>
                  Customer Will Pay = pending amount. Advance = prepaid customer balance.
                </span>
              </div>
            </div>

            <div style={st.panelFooter}>
              {errorMsg && <div style={{ color: '#c62828', fontSize: 13, marginRight: 'auto', fontWeight: 500 }}>{errorMsg}</div>}
              <button style={st.secondaryBtn} onClick={onClose}>Cancel</button>
              <button style={st.primaryBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Customer'}</button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}


function timeAgo(dateStr) {
  if (!dateStr) return "-";
  const days = Math.floor((Date.now() - new Date(dateStr + "T00:00:00")) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
function CustomerListView({ customers, loading, onSelectHistory, onDelete }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(1);
  const [warnData, setWarnData] = useState(null);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => -d);
    else { setSortCol(col); setSortDir(1); }
  };

  const q = search.toLowerCase();
  const filtered = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(q) || (c.phone || "").includes(q);
    if (!matchesSearch) return false;

    if (filter === "debit") return c.current_balance > 0;
    if (filter === "credit") return c.current_balance < 0;
    return true;
  });

  if (sortCol === 'balance') filtered.sort((a, b) => sortDir * (a.current_balance - b.current_balance));
  if (sortCol === 'purchase') filtered.sort((a, b) => sortDir * ((a.last_purchase || '').localeCompare(b.last_purchase || '')));

  const totalReceivables = customers.reduce((sum, c) => c.current_balance > 0 ? sum + c.current_balance : sum, 0);
  const totalPayables = customers.reduce((sum, c) => c.current_balance < 0 ? sum + Math.abs(c.current_balance) : sum, 0);

  return (
    <>
      <div style={{ ...st.cardsGrid, gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ ...st.card, borderLeft: `3px solid #c62828` }}>
          <div style={st.cardLabel}>Total Market Receivables</div>
          <div style={{ ...st.cardAmount, color: '#c62828' }}>
            Rs. {totalReceivables.toLocaleString()}
          </div>
          <div style={st.cardHint}>Money customers owe the business (Debits)</div>
        </div>
        <div style={{ ...st.card, borderLeft: `3px solid #2e7d32` }}>
          <div style={st.cardLabel}>Total Market Credits</div>
          <div style={{ ...st.cardAmount, color: '#2e7d32' }}>
            Rs. {totalPayables.toLocaleString()}
          </div>
          <div style={st.cardHint}>Advance payments received (Credits)</div>
        </div>
      </div>

      <div style={st.tableWrap}>
        <div style={st.tableSearch}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <Search size={14} style={{ color: '#708571' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search customers by name or phone..."
              style={st.searchInput}
            />
          </div>
          <div style={st.navStrip}>
            <button
              style={{ ...st.navBtn, ...(filter === "all" ? st.navBtnActive : {}) }}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              style={{ ...st.navBtn, ...(filter === "debit" ? st.navBtnActive : {}) }}
              onClick={() => setFilter("debit")}
            >
              Debits
            </button>
            <button
              style={{ ...st.navBtn, ...(filter === "credit" ? st.navBtnActive : {}) }}
              onClick={() => setFilter("credit")}
            >
              Credits
            </button>
          </div>
        </div>

        <div style={st.tableContainer}>
          <style>
            {`
                  .cust-table th,
                  .cust-table td { vertical-align: middle; }
                  .cust-table th { padding: 12px 20px; font-size: 12px; font-weight: 600; color: #6a8f6c; text-transform: uppercase; border-bottom: 2px solid #e8f0e8; }
                  .cust-table td { padding: 16px 20px; border-bottom: 1px solid #f2f7f2; }
                  .cust-table tbody tr { transition: background 0.15s; }
                  .cust-table tbody tr:hover { background: #f9fcf9; }
                  
                  @keyframes pulse {
                    0% { opacity: 0.6; }
                    50% { opacity: 0.3; }
                    100% { opacity: 0.6; }
                  }
                  .skeleton {
                    background: #e8f0e8;
                    height: 16px;
                    border-radius: 4px;
                    animation: pulse 1.5s infinite ease-in-out;
                  }
                  `}
          </style>
          <table style={st.table} className="cust-table">
            <thead>
              <tr>
                <th style={{ flex: 2 }}>Customer Name</th>
                <th style={{ width: 140 }}>Phone</th>
                <th style={{ width: 140, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('purchase')}>
                  Last Purchase {sortCol === 'purchase' ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}
                </th>
                <th style={{ textAlign: 'right', width: 180, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('balance')}>
                  Current Balance {sortCol === 'balance' ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}
                </th>
                <th style={{ width: 180, textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i}>
                    <td><div className="skeleton" style={{ width: '60%' }}></div></td>
                    <td><div className="skeleton" style={{ width: '80%' }}></div></td>
                    <td><div className="skeleton" style={{ width: '50%' }}></div></td>
                    <td><div className="skeleton" style={{ width: '40%', marginLeft: 'auto' }}></div></td>
                    <td><div className="skeleton" style={{ width: '80%', margin: '0 auto' }}></div></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 48, color: '#708571' }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: '#5a755c' }}>No customers found</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your filters or search query.</div>
                  </td>
                </tr>
              ) : filtered.map((c) => {
                const bal = c.current_balance;
                return (
                  <tr key={c.id}>
                    <td style={{ fontSize: 14, fontWeight: 600, color: '#1b3a1d', cursor: 'pointer' }} onClick={() => onSelectHistory(c)}>
                      <span style={{ textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>{c.name}</span>
                    </td>
                    <td style={{ fontSize: 14, color: '#555' }}>{c.phone || "-"}</td>
                    <td style={{ fontSize: 13, color: '#555' }} title={c.last_purchase || ""}>{timeAgo(c.last_purchase)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#555' }}>
                      {bal === 0 ? 'Rs 0' : bal > 0 ? `(Dr) Rs ${Math.abs(bal).toLocaleString()}` : `(Cr) Rs ${Math.abs(bal).toLocaleString()}`}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button style={st.actionBtn} onClick={() => onSelectHistory(c)}>Statement</button>
                        <button
                          style={{ ...st.actionBtn, background: '#ffebee', color: '#c62828', border: '1px solid #ffcdd2' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const bal = c.current_balance || 0;
                            if (bal !== 0) {
                              const formattedType = bal > 0 ? "Debit/Dues" : "Credit/Advance";
                              const formattedAmount = Math.abs(bal).toLocaleString();
                              setWarnData({
                                title: `Delete Customer: ${c.name}?`,
                                lines: [
                                  { label: "Customer Name", value: c.name },
                                  { label: "Action", value: "This will remove the customer from active dropdown lists." }
                                ],
                                confirmLabel: "Proceed",
                                cancelLabel: "Cancel",
                                onConfirm: () => {
                                  setTimeout(() => {
                                    setWarnData({
                                      title: `WARNING: Outstanding Balance!`,
                                      lines: [
                                        { label: "Customer Name", value: c.name },
                                        { label: "Pending Balance", value: `${formattedType} of Rs ${formattedAmount}`, mono: true },
                                        { label: "Warning", value: "Deleting accounts with open balances is highly discouraged. Are you absolutely sure you want to proceed?" }
                                      ],
                                      confirmLabel: "Yes, Delete Customer",
                                      cancelLabel: "Cancel",
                                      onConfirm: () => {
                                        onDelete(c.id);
                                      }
                                    });
                                  }, 350);
                                }
                              });
                            } else {
                              setWarnData({
                                title: `Delete Customer: ${c.name}?`,
                                lines: [
                                  { label: "Customer Name", value: c.name },
                                  { label: "Action", value: "This will remove the customer from active dropdown lists. Historical data will remain intact." }
                                ],
                                confirmLabel: "Delete Customer",
                                cancelLabel: "Cancel",
                                onConfirm: () => {
                                  onDelete(c.id);
                                }
                              });
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <WarningNotification
        visible={!!warnData}
        title={warnData?.title}
        lines={warnData?.lines}
        onConfirm={warnData?.onConfirm}
        confirmLabel={warnData?.confirmLabel}
        cancelLabel={warnData?.cancelLabel}
        onClose={() => setWarnData(null)}
      />
    </>
  );
}

function renderBalance(balance) {
  if (balance === 0) {
    return (
      <span
        style={{
          padding: '5px 12px',
          borderRadius: 999,
          background: '#eef3ee',
          color: '#607060',
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        Settled
      </span>
    );
  }

  const isDebit = balance > 0;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span
        style={{
          padding: '5px 10px',
          borderRadius: 999,
          background: isDebit ? '#fdecec' : '#e8f5e9',
          color: isDebit ? '#c62828' : '#2e7d32',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        {isDebit ? 'Receivable' : 'Advance'}
      </span>

      <span
        style={{
          fontFamily: 'monospace',
          fontSize: 14,
          fontWeight: 700,
          color: isDebit ? '#c62828' : '#2e7d32',
        }}
      >
        Rs {Math.abs(balance).toLocaleString()}
      </span>
    </div>
  );
}

function CustomerHistoryView({ customer }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState({});
  const [saleItems, setSaleItems] = useState({});
  const [itemsLoading, setItemsLoading] = useState({});
  const [billFilter, setBillFilter] = useState("all");
  const [payModal, setPayModal] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [payNotes, setPayNotes] = useState("");
  const [paying, setPaying] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await getCustomerHistory(customer.id);
        if (res && res.history) {
          // Sort chronologically for statement view (oldest first)
          const sorted = [...res.history].reverse();
          setHistory(sorted);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [customer.id]);

  const bal = customer.current_balance;

  const statementRows = history.map(h => {
    const isSale = h.type === 'Sale';
    const paidAmount = Number(h.paid_amount || 0);
    const totalAmount = Number(h.total_amount || 0);
    const remainingAmount = isSale
      ? (h.remaining_amount ?? Math.max(0, totalAmount - paidAmount))
      : 0;
    return {
      ...h,
      paid_amount: paidAmount,
      remaining_amount: remainingAmount,
      paid_date: h.paid_date || null,
      payment_status: isSale
        ? (h.payment_status || (remainingAmount <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid'))
        : 'Received'
    };
  });

  const visibleRows = [...statementRows].reverse().filter((h) => {
    if (billFilter === "paid") return h.payment_status === "Paid" || h.type !== "Sale";
    if (billFilter === "unpaid") return h.type === "Sale" && h.payment_status !== "Paid";
    if (fromDate && h.date < fromDate) return false;
    if (toDate && h.date > toDate) return false;
    return true;
  });

  const toggleRow = async (rowKey, h) => {
    if (expandedRows[rowKey]) {
      setExpandedRows(prev => ({ ...prev, [rowKey]: false }));
      return;
    }

    setExpandedRows(prev => ({ ...prev, [rowKey]: true }));

    // For sales, fetch sale details (items) if not already loaded
    if (h.type === 'Sale' && !saleItems[rowKey]) {
      setItemsLoading(prev => ({ ...prev, [rowKey]: true }));
      try {
        const res = await getSale(h.ref_id);
        if (res && res.sale) {
          setSaleItems(prev => ({ ...prev, [rowKey]: res.sale.items || [] }));
        }
      } catch (e) {
        console.error("Failed to load sale items", e);
      } finally {
        setItemsLoading(prev => ({ ...prev, [rowKey]: false }));
      }
    }
  };

  const handleRecordPayment = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return;

    if (payModal?.maxAmount && amount > Number(payModal.maxAmount)) {
      alert(`Amount cannot exceed Rs ${Number(payModal.maxAmount).toLocaleString()}`);
      return;
    }

    setPaying(true);

    try {
      await recordPayment({
        customerId: customer.id,
        saleId: payModal?.saleId || null,
        amount,
        method: payMethod,
        notes: payNotes,
        date: new Date().toISOString().split("T")[0],
        type: payModal?.advance ? "advance" : "payment",   // <-- add this line
      });

      setSuccessData({
        title: payModal?.advance ? "Advance Recorded" : payModal?.general ? "Payment Recorded" : "Bill Payment Recorded",
        lines: [
          { label: "Customer", value: customer.name },
          ...(payModal?.invoiceRef ? [{ label: "Invoice", value: payModal.invoiceRef }] : []),
          { label: payModal?.advance ? "Advance Amount" : "Amount Paid", value: `Rs ${amount.toLocaleString()}`, mono: true },
          { label: "Method", value: payMethod },
        ],
      });

      setPayModal(null);
      setPayAmount("");
      setPayNotes("");

      const res = await getCustomerHistory(customer.id);
      if (res?.history) setHistory([...res.history].reverse());
    } catch (e) {
      alert("Failed to record payment: " + e.message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <>
      <div style={st.cardsGrid}>
        <div style={{ ...st.card, borderLeft: `3px solid ${bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#1b3a1d'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={st.cardLabel}>{customer.name} - Account Statement</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{ ...st.secondaryBtn, background: "#eaf5ea", color: "#1b5e20", border: "1px solid #c8e6c9", fontWeight: 700 }}
                onClick={() => {
                  setPayModal({ general: true });
                  setPayAmount("");
                  setPayNotes("");
                }}
              >
                Record Payment
              </button>
              <button
                style={{ ...st.secondaryBtn, background: '#e3f2fd', color: '#1565c0', border: '1px solid #bbdefb', fontWeight: 700 }}
                onClick={() => {
                  setPayModal({ advance: true });
                  setPayAmount("");
                  setPayNotes("");
                }}
              >
                + Add Advance
              </button>
              <button style={st.secondaryBtn} onClick={() => window.print()}>Print Statement</button>
            </div>
          </div>
          <div style={{ ...st.cardAmount, color: bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#1b3a1d', marginTop: 10 }}>
            {renderBalance(bal)}
          </div>
          <div style={st.cardHint}>Phone: {customer.phone || "-"}</div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.07em" }}>From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ height: 36, borderRadius: 8, border: "1px solid #cde0cd", padding: "0 10px", fontSize: 13, outline: "none", background: "#fafff9" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.07em" }}>To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={{ height: 36, borderRadius: 8, border: "1px solid #cde0cd", padding: "0 10px", fontSize: 13, outline: "none", background: "#fafff9" }}
              />
            </div>
            {(fromDate || toDate) && (
              <button
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                }}
                style={{ marginTop: 18, height: 36, padding: "0 14px", borderRadius: 8, border: "1px solid #e0e0e0", background: "#fff", fontSize: 12, fontWeight: 700, color: "#888", cursor: "pointer" }}
              >
                Clear
              </button>
            )}
            <div style={{ marginTop: 18, fontSize: 12, color: "#6a8f6c", fontWeight: 600 }}>
              {visibleRows.length} transaction{visibleRows.length !== 1 ? "s" : ""}
              {(fromDate || toDate) ? " in range" : " total"}
            </div>
          </div>
        </div>
      </div>

      <div style={st.tableWrap}>
        <div style={st.tableContainer}>
          <style>
            {`
                  .cust-bill-list { display: flex; flex-direction: column; gap: 8px; }
                  .cust-bill-header, .cust-bill-row {
                    display: grid;
                    grid-template-columns: 90px minmax(180px, 2fr) 110px 110px 120px 120px 120px 90px;
                    align-items: center;
                  }
                  .cust-bill-header {
                    padding: 12px 16px;
                    background: #fafdfa;
                    border: 1px solid #e8f0e8;
                    border-radius: 10px;
                    font-size: 12px;
                    font-weight: 700;
                    color: #6a8f6c;
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                  }
                  .cust-bill-card {
                    background: #fff;
                    border: 1px solid #e8f0e8;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.04);
                    overflow: hidden;
                  }
                  .cust-bill-row {
                    min-height: 58px;
                    padding: 0 16px;
                  }
                  .cust-bill-row:hover { background: #f9fcf9; }
                  .cust-bill-date {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    color: #5f7a61;
                    font-weight: 600;
                  }
                  .cust-bill-transaction {
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                    line-height: 1.2;
                  }
                  .cust-bill-title { font-size: 13px; font-weight: 700; color: #1b3a1d; }
                  .cust-bill-sub { font-size: 12px; color: #7a8f7b; }
                  .cust-bill-method { font-size: 13px; color: #333; }
                  .cust-bill-pill {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 5px 10px;
                    border-radius: 999px;
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.02em;
                  }
                  .cust-bill-money {
                    text-align: right;
                    font-family: monospace;
                    font-weight: 700;
                    font-size: 13px;
                  }
                  .cust-bill-expanded {
                    padding: 16px;
                    border-top: 1px solid #e8f0e8;
                    background: #fafdfa;
                  }
                  .cust-bill-details {
                    background: #fff;
                    border: 1px solid #e8f0e8;
                    border-radius: 8px;
                    padding: 16px;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.01);
                  }
                  .cust-bill-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 16px;
                  }
                  .cust-bill-field {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                  }
                  .cust-bill-label {
                    font-size: 11px;
                    font-weight: 700;
                    color: #6a8f6c;
                    text-transform: uppercase;
                  }
                  .cust-bill-value {
                    font-size: 14px;
                    font-weight: 600;
                    color: #333;
                  }
                  
                  @keyframes pulse {
                    0% { opacity: 0.6; }
                    50% { opacity: 0.3; }
                    100% { opacity: 0.6; }
                  }
                  .skeleton {
                    background: #e8f0e8;
                    height: 16px;
                    border-radius: 4px;
                    animation: pulse 1.5s infinite ease-in-out;
                  }
                  
                  @media print {
                      body * { visibility: hidden; }
                      .cust-bill-list, .cust-bill-list * { visibility: visible; }
                      .cust-bill-list { position: absolute; left: 0; top: 0; width: 100%; }
                  }
                  `}
          </style>

          <div style={{ display: "flex", gap: 6, padding: "12px 0 16px 0" }}>
            {[["all", "All"], ["unpaid", "Unpaid & Partial"], ["paid", "Paid"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setBillFilter(val)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                  background: billFilter === val ? "#2e7d32" : "#eef3ee",
                  color: billFilter === val ? "#fff" : "#5a755c",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="cust-bill-list">
            <div className="cust-bill-header">
              <div>Date</div>
              <div>Invoice</div>
              <div>Method</div>
              <div>Status</div>
              <div style={{ textAlign: 'right' }}>Bill</div>
              <div style={{ textAlign: 'right' }}>Paid</div>
              <div style={{ textAlign: 'right' }}>Remaining</div>
              <div style={{ textAlign: 'center' }}>Pay</div>
            </div>

            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="cust-bill-card" style={{ padding: 16 }}>
                  <div className="cust-bill-row">
                    <div><div className="skeleton" style={{ width: '70%' }} /></div>
                    <div><div className="skeleton" style={{ width: '90%' }} /></div>
                    <div><div className="skeleton" style={{ width: '40%' }} /></div>
                    <div><div className="skeleton" style={{ width: '50%', marginLeft: 'auto' }} /></div>
                  </div>
                </div>
              ))
            ) : visibleRows.length === 0 ? (
              <div className="cust-bill-card" style={{ textAlign: 'center', padding: 48, color: '#708571' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#5a755c' }}>No transaction history</div>
              </div>
            ) : visibleRows.map((h, idx) => {
              const dateObj = new Date(h.date + 'T00:00:00');
              const currentMonthYear = dateObj.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

              let prevMonthYear = null;
              if (idx > 0) {
                const prevDateObj = new Date(visibleRows[idx - 1].date + 'T00:00:00');
                prevMonthYear = prevDateObj.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
              }

              const showMonthRow = currentMonthYear !== prevMonthYear;
              const displayDate = dateObj.toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });
              const rowKey = `${h.type}-${h.ref_id}-${idx}`;
              const isSale = h.type === 'Sale';

              return (
                <React.Fragment key={idx}>
                  {showMonthRow && (
                    <div className="cust-bill-header" style={{ marginTop: idx === 0 ? 8 : 16 }}>
                      <div style={{ gridColumn: '1 / -1', padding: 0, border: 'none', background: 'transparent', textTransform: 'uppercase' }}>
                        {currentMonthYear}
                      </div>
                    </div>
                  )}

                  <div className="cust-bill-card">
                    <div
                      className="cust-bill-row"
                      style={{
                        background: expandedRows[rowKey] ? '#f7faf7' : '#fff'
                      }}
                    >
                      <div
                        onClick={isSale ? () => toggleRow(rowKey, h) : undefined}
                        className="cust-bill-date"
                        style={{ cursor: isSale ? 'pointer' : 'default' }}
                      >
                        {isSale ? (expandedRows[rowKey] ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <span style={{ width: 14 }} />}
                        {displayDate}
                      </div>

                      <div className="cust-bill-transaction">
                        <span className="cust-bill-title">
                          {isSale ? 'Sale Bill' : 'Payment Received'}
                        </span>
                        {h.reference && <span className="cust-bill-sub">{h.reference}</span>}
                        {isSale && h.payment_status === 'Paid' && h.paid_date && (
                          <span className="cust-bill-sub">
                            Paid on {new Date(h.paid_date + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>

                      <div className="cust-bill-method">{h.method || '-'}</div>

                      <div>
                        <span
                          className="cust-bill-pill"
                          style={{
                            background: isSale
                              ? (h.payment_status === 'Paid' ? '#e8f5e9' : h.payment_status === 'Partial' ? '#fff8e1' : '#fdecec')
                              : '#e8f5e9',
                            color: isSale
                              ? (h.payment_status === 'Paid' ? '#2e7d32' : h.payment_status === 'Partial' ? '#8a6d00' : '#c62828')
                              : '#2e7d32'
                          }}
                        >
                          {isSale ? (h.payment_status || 'Unpaid') : 'Received'}
                        </span>
                      </div>

                      <div className="cust-bill-money" style={{ color: isSale ? '#1b3a1d' : '#888' }}>
                        {isSale ? `Rs ${Math.abs(h.total_amount || 0).toLocaleString()}` : '-'}
                      </div>

                      <div className="cust-bill-money" style={{ color: '#2e7d32' }}>
                        Rs {Number(h.paid_amount || 0).toLocaleString()}
                      </div>

                      <div className="cust-bill-money" style={{ color: isSale ? '#c62828' : '#888' }}>
                        {isSale ? `Rs ${Number(h.remaining_amount || 0).toLocaleString()}` : '-'}
                      </div>

                      {isSale && h.payment_status !== 'Paid' && (
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button
                            style={{
                              padding: "5px 12px",
                              borderRadius: 6,
                              border: "1px solid #c8e6c9",
                              background: "#eaf5ea",
                              color: "#1b5e20",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPayModal({
                                saleId: h.ref_id,
                                invoiceRef: h.reference,
                                maxAmount: h.remaining_amount,
                              });
                              setPayAmount(String(h.remaining_amount || ""));
                              setPayNotes("");
                            }}
                          >
                            Pay
                          </button>
                        </div>
                      )}
                    </div>

                    <AnimatePresence initial={false}>
                      {expandedRows[rowKey] && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div className="cust-bill-expanded">
                            {itemsLoading[rowKey] ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0' }}>
                                <div className="skeleton" style={{ width: '45%', height: 14 }} />
                                <div className="skeleton" style={{ width: '85%', height: 14 }} />
                                <div className="skeleton" style={{ width: '65%', height: 14 }} />
                              </div>
                            ) : (
                              <div className="cust-bill-details">
                                <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#1b3a1d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  Sale Bill Items - Invoice: {h.reference || 'N/A'}
                                </h4>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1.5px solid #e8f0e8', color: '#6a8f6c', fontWeight: 600 }}>
                                      <th style={{ textAlign: 'left', padding: '8px 12px' }}>Product Name</th>
                                      <th style={{ textAlign: 'right', padding: '8px 12px', width: 100 }}>Qty</th>
                                      <th style={{ textAlign: 'right', padding: '8px 12px', width: 140 }}>Unit Price</th>
                                      <th style={{ textAlign: 'right', padding: '8px 12px', width: 160 }}>Line Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(saleItems[rowKey] || []).length === 0 ? (
                                      <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', padding: '12px 0', color: '#999' }}>No items recorded for this sale</td>
                                      </tr>
                                    ) : (
                                      (saleItems[rowKey] || []).map((item, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f4fbf4' }}>
                                          <td style={{ padding: '8px 12px', color: '#333', fontWeight: 500 }}>{item.productName}</td>
                                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#555' }}>{item.quantity}</td>
                                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#555' }}>Rs {(item.unitPrice || item.price || 0).toLocaleString()}</td>
                                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1b3a1d' }}>Rs {item.lineTotal.toLocaleString()}</td>
                                        </tr>
                                      ))
                                    )}
                                    <tr style={{ fontWeight: 'bold', background: '#fafdfa', borderTop: '2px solid #e8f0e8' }}>
                                      <td colSpan={3} style={{ padding: '10px 12px', textAlign: 'right', color: '#555' }}>Bill Total:</td>
                                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#1b3a1d', fontSize: 14 }}>Rs {Math.abs(h.total_amount || 0).toLocaleString()}</td>
                                    </tr>
                                  </tbody>
                                </table>
                                <div className="cust-bill-grid" style={{ marginTop: 16 }}>
                                  <div className="cust-bill-field">
                                    <span className="cust-bill-label">Payment Method</span>
                                    <span className="cust-bill-value">{h.method || 'N/A'}</span>
                                  </div>
                                  <div className="cust-bill-field">
                                    <span className="cust-bill-label">Amount Paid</span>
                                    <span className="cust-bill-value" style={{ color: '#2e7d32' }}>Rs {Number(h.paid_amount || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="cust-bill-field">
                                    <span className="cust-bill-label">Remaining</span>
                                    <span className="cust-bill-value" style={{ color: '#c62828' }}>Rs {Number(h.remaining_amount || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="cust-bill-field">
                                    <span className="cust-bill-label">Status</span>
                                    <span className="cust-bill-value">{h.payment_status || 'Unpaid'}</span>
                                  </div>
                                  <div className="cust-bill-field">
                                    <span className="cust-bill-label">Paid On</span>
                                    <span className="cust-bill-value">
                                      {h.paid_date
                                        ? new Date(h.paid_date + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
                                        : 'Not fully paid'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {payModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 28,
              minWidth: 360,
              maxWidth: 420,
              boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
              border: "1px solid #e0ede0",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {payModal.advance ? "Credit Entry" : payModal.general ? "General Payment" : `Invoice - ${payModal.invoiceRef || ""}`}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#1b3a1d", marginTop: 2 }}>
                  {payModal.advance ? "Add Customer Advance" : "Record Payment"}
                </div>
              </div>
              <button onClick={() => setPayModal(null)} style={{ background: "none", border: "none", fontSize: 18, color: "#999", cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                  Amount (Rs) {payModal.maxAmount ? `- Max: Rs ${Number(payModal.maxAmount).toLocaleString()}` : ""}
                </label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  style={{ width: "100%", height: 44, borderRadius: 8, border: "1.5px solid #cde0cd", padding: "0 14px", fontSize: 16, fontWeight: 700, outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  style={{ width: "100%", height: 44, borderRadius: 8, border: "1.5px solid #cde0cd", padding: "0 12px", fontSize: 14, outline: "none", background: "#fafff9", boxSizing: "border-box" }}
                >
                  <option>Cash</option>
                  <option>HBL Bank</option>
                  <option>UBL Bank</option>
                  <option>Meezan Bank</option>
                  <option>JazzCash</option>
                  <option>EasyPaisa</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Notes (optional)</label>
                <input
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. Cash received in office"
                  style={{ width: "100%", height: 40, borderRadius: 8, border: "1.5px solid #cde0cd", padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <button onClick={() => setPayModal(null)} style={st.secondaryBtn}>Cancel</button>
              <button
                onClick={handleRecordPayment}
                disabled={paying || !payAmount}
                style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: paying ? "#aaa" : "#2e7d32", color: "#fff", fontWeight: 700, fontSize: 14, cursor: paying ? "not-allowed" : "pointer" }}
              >
                {paying ? "Recording..." : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {successData && (
        <SuccessNotification
          visible={!!successData}
          title={successData.title}
          lines={successData.lines}
          onClose={() => setSuccessData(null)}
        />
      )}

      <StatementPrint
        customer={customer}
        rows={visibleRows}
        fromDate={fromDate}
        toDate={toDate}
      />
    </>
  );
}

const st = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', background: '#f0f6f0', padding: 24, overflowY: 'auto', fontFamily: 'system-ui, sans-serif', position: 'relative', maxWidth: 1600, width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { margin: 0, fontSize: 24, fontWeight: 'bold', color: '#1b3a1d' },
  subtitle: { margin: '4px 0 0 0', fontSize: 14, color: '#6a8f6c' },

  headerActions: { display: 'flex', gap: 12, alignItems: 'center' },
  backBtn: { display: 'flex', alignItems: 'center', gap: 8, background: "none", border: "none", color: "#2e7d32", fontSize: 16, fontWeight: 600, cursor: "pointer" },
  primaryBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: "10px 18px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: "bold", cursor: "pointer", transition: "background 0.2s" },
  secondaryBtn: { padding: "10px 18px", background: "#fff", color: "#555", border: "1px solid #cde0cd", borderRadius: 8, fontSize: 14, fontWeight: "bold", cursor: "pointer" },
  actionBtn: { padding: "6px 12px", border: "1px solid #c8e6c9", background: "#e8f5e9", color: "#1b3a1d", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer" },

  navStrip: { display: "flex", gap: 6, background: "#e4ede4", borderRadius: 12, padding: 4, flexWrap: 'wrap' },
  navBtn: { padding: "6px 14px", border: "none", borderRadius: 9, background: "transparent", fontSize: 13, fontWeight: 600, color: "#5a755c", cursor: "pointer", transition: "background 0.2s" },
  navBtnActive: { background: "#fff", color: "#1d351f", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },

  cardsGrid: { display: 'grid', gap: 16, marginBottom: 24 },
  card: { background: '#fff', padding: '24px', borderRadius: 12, border: '1px solid #e8f0e8', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' },
  cardLabel: { fontSize: 12, fontFamily: 'monospace', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6a8f6c', marginBottom: 12 },
  cardAmount: { fontSize: 32, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 10 },
  cardHint: { fontSize: 11, color: '#999', marginTop: 12, fontStyle: 'italic' },

  tableWrap: { background: '#fff', borderRadius: 12, border: '1px solid #e8f0e8', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  tableSearch: { padding: '16px 20px', borderBottom: '1px solid #e8f0e8', display: 'flex', alignItems: 'center', gap: 16, background: '#fafdfa', justifyContent: 'space-between', flexWrap: 'wrap' },
  searchInput: { border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: '#1b3a1d', width: '100%', padding: '4px 0' },

  tableContainer: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  dateSeparator: {
    background: '#e8f5e9',
    padding: '16px 20px',
    fontSize: 12,
    fontFamily: 'system-ui, sans-serif',
    fontWeight: 700,
    color: '#2e7d32',
    letterSpacing: '0.07em',
    borderBottom: '2px solid #c8e6c9',
    borderTop: '2px solid #c8e6c9',
    textTransform: 'uppercase'
  },
  dataRow: { borderBottom: '1px solid #f2f7f2', transition: 'background 0.1s' },

  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", zIndex: 10 },
  sidePanel: { position: "absolute", top: 0, right: 0, bottom: 0, width: 'min(420px, 92vw)', background: "#fff", zIndex: 20, boxShadow: "-4px 0 24px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column" },
  panelHeader: { padding: "20px 24px", borderBottom: "1px solid #e8f0e8", display: "flex", justifyContent: "space-between", alignItems: "center" },
  panelTitle: { margin: 0, fontSize: 18, color: "#1b3a1d", fontWeight: "bold" },
  closeBtn: { background: "none", border: "none", fontSize: 18, color: "#888", cursor: "pointer" },
  panelBody: { flex: 1, padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 },
  panelFooter: { padding: "20px 24px", borderTop: "1px solid #e8f0e8", display: "flex", justifyContent: "flex-end", gap: 12 },

  fieldWrap: { display: "flex", flexDirection: "column", gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase" },
  input: { padding: "12px", border: "1.5px solid #cde0cd", borderRadius: 8, background: "#fafff9", outline: "none", fontSize: 14, color: "#1b3a1d" },
  fieldHint: { fontSize: 11, color: "#8aab8c" },
};
