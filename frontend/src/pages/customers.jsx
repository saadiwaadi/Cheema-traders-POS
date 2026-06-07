import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, PlusCircle, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import * as XLSX from "xlsx";
import SuccessNotification from "../components/SuccessNotification";
import WarningNotification from "../components/Warningnotification";
import {
  listCustomers,
  saveCustomer,
  getCustomerHistory,
  getSale,
  saveCustomerPayment as recordPayment,
  saveWithdrawal,
  deleteCustomer,
} from "../lib/posApi";

const BUSINESS_NAME = "Cheema Traders";

export default function CustomersPage() {
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [successData, setSuccessData] = useState(null);

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listCustomers();
      if (res && res.customers) {
        setCustomers(res.customers);
        if (selectedCustomer) {
          const updated = res.customers.find(c => c.id === selectedCustomer.id);
          if (updated) setSelectedCustomer(updated);
        }
      }
    } catch (e) {
      console.error("Failed to load customers", e);
    } finally {
      setLoading(false);
    }
  }, [selectedCustomer]);

  useEffect(() => {
    loadCustomers();
  }, []);

  const handleOpenPanel = () => {
    setCustomerToEdit(null);
    setIsAddPanelOpen(true);
  };

  const handleEditCustomer = (customer) => {
    setCustomerToEdit(customer);
    setIsAddPanelOpen(true);
  };

  const handleSaved = (savedInfo) => {
    setIsAddPanelOpen(false);
    setCustomerToEdit(null);
    setSuccessData({
      title: customerToEdit ? "Customer Updated" : "Customer Created",
      lines: [
        { label: "Name", value: savedInfo.name },
        { label: "Phone", value: savedInfo.phone || "-" },
        {
          label: "Opening Balance",
          value: `Rs ${Math.abs(savedInfo.opening_balance || 0).toLocaleString()} ${
            (savedInfo.opening_balance || 0) > 0 ? "(Dr)" : (savedInfo.opening_balance || 0) < 0 ? "(Cr)" : ""
          }`,
        },
      ],
    });
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
              <p style={st.subtitle}>Customer Record</p>
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
          <CustomerHistoryView customer={selectedCustomer} onRefresh={loadCustomers} />
        ) : (
          <CustomerListView
            customers={customers}
            loading={loading}
            onSelectHistory={setSelectedCustomer}
            onDelete={handleDeleteCustomer}
            onEdit={handleEditCustomer}
            search={search}
            setSearch={setSearch}
          />
        )}
      </div>

      <AddCustomerPanel
        isOpen={isAddPanelOpen}
        customerToEdit={customerToEdit}
        onClose={() => {
          setIsAddPanelOpen(false);
          setCustomerToEdit(null);
        }}
        onSaved={handleSaved}
      />

      {successData && (
        <SuccessNotification
          visible={!!successData}
          title={successData.title}
          lines={successData.lines}
          onClose={() => setSuccessData(null)}
        />
      )}
    </div>
  );
}

function AddCustomerPanel({ isOpen, onClose, onSaved, customerToEdit }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [balanceType, setBalanceType] = useState("none");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (customerToEdit) {
        setName(customerToEdit.name || "");
        setPhone(customerToEdit.phone || "");
        const balVal = customerToEdit.opening_balance || 0;
        setOpeningBalance(String(Math.abs(balVal)));
        setBalanceType(balVal > 0 ? "debit" : balVal < 0 ? "credit" : "none");
      } else {
        setName("");
        setPhone("");
        setOpeningBalance("");
        setBalanceType("none");
      }
      setErrorMsg("");
    }
  }, [isOpen, customerToEdit]);

  const handleSave = async () => {
    setErrorMsg("");
    if (!name) return setErrorMsg("Name is required");
    if (phone && phone.length !== 11) {
      return setErrorMsg("Phone number must be exactly 11 digits");
    }
    setSaving(true);
    try {
      const saved = await saveCustomer({
        id: customerToEdit ? customerToEdit.id : undefined,
        name,
        phone,
        openingBalance,
        balanceType,
      });
      onSaved(saved);
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
              <h2 style={st.panelTitle}>{customerToEdit ? "Edit Customer" : "Add Customer"}</h2>
              <button style={st.closeBtn} onClick={onClose}>✕</button>
            </div>

            <div style={st.panelBody}>
              <div style={st.fieldWrap}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#1b3a1d", textTransform: "uppercase" }}>Customer Name *</label>
                <input style={{ ...st.input, height: 48, fontSize: 15 }} value={name} onChange={e => setName(e.target.value)} placeholder="Customer Name" />
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

              <div style={{ borderTop: "1px solid #c8d8c8", margin: "12px 0 6px 0", paddingTop: 12 }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Financial Details
                </h3>
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

function CustomerListView({ customers, loading, onSelectHistory, onDelete, onEdit, search, setSearch }) {
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

  return (
    <>
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
          <div style={{ display: "flex", gap: 16 }}>
            {[["all", "All"], ["debit", "Debits"], ["credit", "Credits"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                style={{
                  padding: "8px 4px",
                  border: "none",
                  borderBottom: `2px solid ${filter === val ? "#2e7d32" : "transparent"}`,
                  background: "transparent",
                  color: filter === val ? "#1b3a1d" : "#5a755c",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={st.tableContainer}>
          <style>
            {`
              .cust-table th,
              .cust-table td { vertical-align: middle; }
              .cust-table th { padding: 12px 20px; font-size: 11px; font-weight: 700; color: #6a8f6c; text-transform: uppercase; border-bottom: 2px solid #c8d8c8; }
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
                <th style={{ width: 40, textAlign: 'center' }}>
                  <input type="checkbox" disabled style={{ cursor: 'not-allowed' }} />
                </th>
                <th style={{ flex: 2 }}>Customer Name</th>
                <th style={{ width: 140 }}>Phone</th>
                <th style={{ width: 140, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('purchase')}>
                  Last Purchase {sortCol === 'purchase' ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}
                </th>
                <th style={{ textAlign: 'right', width: 180, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('balance')}>
                  Current Balance {sortCol === 'balance' ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}
                </th>
                <th style={{ width: 220, textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'center' }}><input type="checkbox" disabled /></td>
                    <td><div className="skeleton" style={{ width: '60%' }}></div></td>
                    <td><div className="skeleton" style={{ width: '80%' }}></div></td>
                    <td><div className="skeleton" style={{ width: '50%' }}></div></td>
                    <td><div className="skeleton" style={{ width: '40%', marginLeft: 'auto' }}></div></td>
                    <td><div className="skeleton" style={{ width: '80%', margin: '0 auto' }}></div></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 48, color: '#708571' }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: '#5a755c' }}>No customers found</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your filters or search query.</div>
                  </td>
                </tr>
              ) : filtered.map((c) => {
                const bal = c.current_balance;
                return (
                  <tr key={c.id}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" disabled style={{ cursor: 'not-allowed' }} />
                    </td>
                    <td style={{ fontSize: 15, fontWeight: 700, color: '#1b3a1d', cursor: 'pointer' }} onClick={() => onSelectHistory(c)}>
                      <span style={{ textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>{c.name}</span>
                    </td>
                    <td style={{ fontSize: 13, color: '#555' }}>{c.phone || "-"}</td>
                    <td style={{ fontSize: 13, color: '#555' }} title={c.last_purchase || ""}>{timeAgo(c.last_purchase)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#555' }}>
                      {bal === 0 ? 'Rs 0' : bal > 0 ? `(Dr) Rs ${Math.abs(bal).toLocaleString()}` : `(Cr) Rs ${Math.abs(bal).toLocaleString()}`}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button style={st.actionBtn} onClick={() => onSelectHistory(c)}>Statement</button>
                        <button
                          style={{ ...st.actionBtn, background: '#e3f2fd', color: '#1565c0', border: '1px solid #bbdefb' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(c);
                          }}
                        >
                          Edit
                        </button>
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
                                  { label: "Action", value: "This will remove the customer from active dropdown lists." },
                                  { label: "History Integrity", value: `${c.transaction_count || 0} transaction(s) will remain in history.` }
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
                                        { label: "Warning", value: "Deleting accounts with open balances is highly discouraged. Are you absolutely sure you want to proceed?" },
                                        { label: "History Integrity", value: `${c.transaction_count || 0} transaction(s) will remain in history.` }
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
                                  { label: "Action", value: "This will remove the customer from active dropdown lists. Historical data will remain intact." },
                                  { label: "History Integrity", value: `${c.transaction_count || 0} transaction(s) will remain in history.` }
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

function CustomerHistoryView({ customer, onRefresh }) {
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
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [paying, setPaying] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getCustomerHistory(customer.id);
      if (res && res.history) {
        const sorted = [...res.history].reverse();
        setHistory(sorted);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const baseRows = history.map(h => {
    const isSale = h.type === 'Sale';
    const totalAmount = Number(h.total_amount || 0);
    const paidAmount = Number(h.paid_amount || 0);
    const remainingAmount = isSale
      ? (h.remaining_amount ?? Math.max(0, totalAmount - paidAmount))
      : 0;

    const balanceChange = Number(h.balance_change || 0);

    return {
      ...h,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      remaining_amount: remainingAmount,
      balance_change: balanceChange,
      payment_status: isSale
        ? (h.payment_status || (remainingAmount <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid'))
        : 'Received'
    };
  });

  const chronological = baseRows;
  let running = 0;
  const withRunning = chronological.map(row => {
    running += row.balance_change;
    return {
      ...row,
      runningBalance: running
    };
  });

  const statementRows = [...withRunning].reverse();

  const ledgerRows = statementRows.map(h => {
    const change = Number(h.balance_change || 0);
    return {
      ...h,
      debit: change > 0 ? change : 0,
      credit: change < 0 ? -change : 0
    };
  });

  const visible = ledgerRows.filter(h => {
    if (fromDate && h.date < fromDate) return false;
    if (toDate && h.date > toDate) return false;
    if (billFilter === "sales") return h.type === "Sale" || h.type === "Return";
    if (billFilter === "receipts") return h.type === "Payment";
    return true;
  });

  const earliest = visible[visible.length - 1]; // list is newest-first
  const openingBF = earliest ? earliest.runningBalance - earliest.balance_change : (fromDate ? (ledgerRows.find(h => h.date < fromDate)?.runningBalance || Number(customer.opening_balance || 0)) : Number(customer.opening_balance || 0));
  const closing = visible.length ? visible[0].runningBalance : Number(customer.opening_balance || 0);
  const periodDebit = visible.reduce((s, r) => s + r.debit, 0);
  const periodCredit = visible.reduce((s, r) => s + r.credit, 0);

  const currentBalance = statementRows.length > 0 ? statementRows[0].runningBalance : Number(customer.opening_balance || 0);

  const totalBilled = baseRows.filter(h => h.type === 'Sale').reduce((sum, h) => sum + Number(h.total_amount || 0), 0);
  const totalPaid = baseRows.filter(h => h.type !== 'Withdrawal' && h.type !== 'Opening').reduce((sum, h) => sum + Number(h.paid_amount || 0), 0);
  const outstandingBalance = baseRows.filter(h => h.type === 'Sale').reduce((sum, h) => sum + Number(h.remaining_amount || 0), 0);
  const transactionsCount = baseRows.length;
  const lastActivity = baseRows.length > 0 ? baseRows[baseRows.length - 1].date : "-";

  const toggleRow = async (rowKey, h) => {
    if (expandedRows[rowKey]) {
      setExpandedRows(prev => ({ ...prev, [rowKey]: false }));
      return;
    }

    setExpandedRows(prev => ({ ...prev, [rowKey]: true }));

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

  const handleExportExcel = () => {
    const headers = [
      ["CUSTOMER ACCOUNT STATEMENT"],
      [`Customer Name: ${customer.name}`],
      [`Phone: ${customer.phone || "-"}`],
      [`Statement Period: ${fromDate || "Inception"} to ${toDate || "Today"}`],
      [`Current Balance: Rs ${Math.abs(closing).toLocaleString()} ${closing > 0 ? "Dr" : closing < 0 ? "Cr" : ""}`],
      [],
      ["S.No", "Date", "Particulars", "Payment Method", "Debit (Rs)", "Credit (Rs)", "Balance (Rs)"]
    ];

    const data = [];

    // Add Opening B/F if range active
    if (fromDate) {
      data.push([
        "BF",
        fromDate,
        "Balance Brought Forward (B/F)",
        "-",
        openingBF > 0 ? openingBF : 0,
        openingBF < 0 ? -openingBF : 0,
        openingBF
      ]);
    }

    const rowItems = [...visible].reverse().map((h, i) => {
      const desc = h.type === 'Opening' 
        ? 'Opening Balance' 
        : h.type === 'Sale' 
          ? `Sale Bill${h.reference ? ` (${h.reference})` : ""}` 
          : h.type === 'Return'
            ? `Items Returned${h.reference ? ` (${h.reference})` : ""}`
            : h.type === 'Withdrawal'
              ? (h.payment_type === 'loan' ? 'Loan Disbursed' : 'Advance Withdrawal')
              : h.payment_type === 'advance' 
                ? 'Advance Deposit' 
                : 'Payment Received';

      return [
        i + 1,
        h.date,
        desc,
        h.method || '-',
        h.debit,
        h.credit,
        h.runningBalance
      ];
    });

    data.push(...rowItems);

    data.push([]);
    data.push(["TOTALS", "", "", "", periodDebit, periodCredit, closing]);

    const worksheet = XLSX.utils.aoa_to_sheet([...headers, ...data]);
    worksheet["!cols"] = [
      { wch: 6 },  // S.No
      { wch: 12 }, // Date
      { wch: 35 }, // Particulars
      { wch: 18 }, // Method
      { wch: 18 }, // Debit
      { wch: 18 }, // Credit
      { wch: 22 }  // Balance
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Statement");
    XLSX.writeFile(workbook, `Statement_${customer.name.replace(/\s+/g, '_')}.xlsx`);
  };

  const handlePrintStatement = async () => {
    let rowsHtml = "";
    let sNo = 1;

    // Add B/F row in print if range active
    if (fromDate) {
      rowsHtml += `
        <tr style="border-bottom: 1px solid #c8d8c8; background: #fafdfa; font-weight: bold;">
          <td style="padding: 10px; color: #555;">BF</td>
          <td style="padding: 10px;">${new Date(fromDate + "T00:00:00").toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}</td>
          <td style="padding: 10px;">Balance Brought Forward (B/F)</td>
          <td style="padding: 10px; color: #555;">-</td>
          <td style="padding: 10px; text-align: right; font-family: monospace;">${openingBF > 0 ? `Rs ${openingBF.toLocaleString()}` : "-"}</td>
          <td style="padding: 10px; text-align: right; font-family: monospace; color: #2e7d32;">${openingBF < 0 ? `Rs ${Math.abs(openingBF).toLocaleString()}` : "-"}</td>
          <td style="padding: 10px; text-align: right; font-family: monospace; font-weight: 700; color: ${openingBF > 0 ? "#c62828" : openingBF < 0 ? "#1b5e20" : "#555"};">Rs ${Math.abs(openingBF).toLocaleString()} ${openingBF > 0 ? "Dr" : openingBF < 0 ? "Cr" : ""}</td>
        </tr>
      `;
    }

    const tableRowsHtml = [...visible].reverse().map((h) => {
      const isOpening = h.type === "Opening";
      const desc = isOpening 
        ? 'Opening Balance' 
        : h.type === 'Sale' 
          ? `Sale Bill ${h.reference ? `<span style="color:#666; font-size:10px; font-family: monospace;">(${h.reference})</span>` : ""}` 
          : h.type === 'Return'
            ? `Items Returned ${h.reference ? `<span style="color:#666; font-size:10px; font-family: monospace;">(${h.reference})</span>` : ""}`
            : h.type === 'Withdrawal'
              ? (h.payment_type === 'loan' ? 'Loan Disbursed' : 'Advance Withdrawal')
              : h.payment_type === 'advance' 
                ? 'Advance Deposit' 
                : 'Payment Received';

      const row = `
        <tr style="border-bottom: 1px solid #c8d8c8;">
          <td style="padding: 10px; color: #555;">${sNo++}</td>
          <td style="padding: 10px; font-weight: 500;">${new Date(h.date + "T00:00:00").toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}</td>
          <td style="padding: 10px;"><strong>${desc}</strong></td>
          <td style="padding: 10px; color: #555;">${h.method || "-"}</td>
          <td style="padding: 10px; text-align: right; font-family: monospace;">${h.debit > 0 ? `Rs ${h.debit.toLocaleString()}` : "-"}</td>
          <td style="padding: 10px; text-align: right; font-family: monospace; color: #2e7d32;">${h.credit > 0 ? `Rs ${h.credit.toLocaleString()}` : "-"}</td>
          <td style="padding: 10px; text-align: right; font-family: monospace; font-weight: 700; color: ${h.runningBalance > 0 ? "#c62828" : h.runningBalance < 0 ? "#1b5e20" : "#555"};">Rs ${Math.abs(h.runningBalance).toLocaleString()} ${h.runningBalance > 0 ? "Dr" : h.runningBalance < 0 ? "Cr" : ""}</td>
        </tr>
      `;
      return row;
    }).join("");

    rowsHtml += tableRowsHtml;

    const html = `
      <html>
        <head>
          <title>Account Statement - ${customer.name}</title>
          <style>
            body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; padding: 40px; color: #1a1a1a; background: #fff; font-size: 11px; line-height: 1.4; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1b5e20; padding-bottom: 16px; margin-bottom: 20px; }
            .company-name { font-size: 26px; font-weight: 800; color: #1b5e20; text-transform: uppercase; letter-spacing: 0.5px; }
            .company-sub { font-size: 10px; color: #6a8f6c; margin-top: 4px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; }
            .doc-title { text-align: right; }
            .doc-title h2 { margin: 0; font-size: 18px; font-weight: 800; color: #1b3a1d; text-transform: uppercase; letter-spacing: 0.5px; }
            .doc-title p { margin: 4px 0 0 0; color: #555; font-size: 11px; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; background: #f4faf4; border: 1px solid #c8d8c8; border-radius: 4px; padding: 14px 18px; }
            .meta-block { display: flex; flex-direction: column; gap: 4px; }
            .meta-label { font-size: 9px; font-weight: 700; color: #6a8f6c; text-transform: uppercase; letter-spacing: 0.5px; }
            .meta-value { font-size: 13px; font-weight: 700; color: #1b3a1d; }
            .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
            .summary-box { border: 1px solid #c8d8c8; border-radius: 4px; padding: 12px 14px; background: #fff; }
            .summary-box.highlight { background: #f0f9f0; border-color: #2e7d32; border-left: 4px solid #2e7d32; }
            .summary-label { font-size: 9px; font-weight: 700; color: #6a8f6c; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
            .summary-val { font-size: 15px; font-weight: 700; color: #1b3a1d; font-family: monospace; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            thead tr { background: #1b5e20; color: #fff; }
            th { padding: 10px; text-align: left; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border: none; }
            th.num, td.num { text-align: right; }
            td { padding: 10px; color: #222; border-bottom: 1px solid #e8e8e8; }
            tr:nth-child(even) { background: #fafdfa; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="company-name">${BUSINESS_NAME}</div>
              <div class="company-sub">Customer Account Statement</div>
            </div>
            <div class="doc-title">
              <h2>Account Statement</h2>
              <p>Printed: ${new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" })}</p>
              ${(fromDate || toDate) ? `<p>Period: ${fromDate || "Inception"} - ${toDate || "Today"}</p>` : ""}
            </div>
          </div>
          <div class="meta">
            <div class="meta-block">
              <span class="meta-label">Customer Name</span>
              <span class="meta-value">${customer.name}</span>
            </div>
            <div class="meta-block">
              <span class="meta-label">Phone</span>
              <span class="meta-value">${customer.phone || "-"}</span>
            </div>
            <div class="meta-block">
              <span class="meta-label">Current Balance</span>
              <span class="meta-value" style="color: ${closing > 0 ? "#c62828" : closing < 0 ? "#1b5e20" : "#333"}">
                ${closing === 0 ? "Settled - Rs 0" : closing > 0 ? `Dr - Rs ${Math.abs(closing).toLocaleString()}` : `Cr - Rs ${Math.abs(closing).toLocaleString()}`}
              </span>
            </div>
          </div>
          <div class="summary">
            <div class="summary-box"><div class="summary-label">Total Dr</div><div class="summary-val">Rs ${periodDebit.toLocaleString()}</div></div>
            <div class="summary-box"><div class="summary-label">Total Cr</div><div class="summary-val" style="color: #1b5e20;">Rs ${periodCredit.toLocaleString()}</div></div>
            <div class="summary-box highlight"><div class="summary-label">Net Balance</div><div class="summary-val" style="color: ${closing > 0 ? "#c62828" : "#1b5e20"};">${closing === 0 ? "Rs 0" : `Rs ${Math.abs(closing).toLocaleString()}`}</div></div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 28px;">#</th>
                <th style="width: 85px;">Date</th>
                <th>Particulars</th>
                <th>Method</th>
                <th class="num" style="width: 120px;">Dr</th>
                <th class="num" style="width: 120px;">Cr</th>
                <th class="num" style="width: 120px;">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
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

  const handleRecordPayment = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return;

    setPaying(true);

    try {
      await recordPayment({
        customerId: customer.id,
        amount,
        method: payMethod,
        notes: payNotes,
        date: payDate,
        type: payModal?.advance ? "advance" : "payment",
      });

      setSuccessData({
        title: payModal?.advance ? "Cr Recorded" : "Payment Recorded",
        lines: [
          { label: "Customer", value: customer.name },
          { label: payModal?.advance ? "Cr Amount" : "Amount Paid", value: `Rs ${amount.toLocaleString()}`, mono: true },
          { label: "Method", value: payMethod },
          { label: "Date", value: payDate },
        ],
      });

      setPayModal(null);
      setPayAmount("");
      setPayNotes("");
      setPayDate(new Date().toISOString().split("T")[0]);

      await loadHistory();
      if (onRefresh) onRefresh();
    } catch (e) {
      alert("Failed to record payment: " + e.message);
    } finally {
      setPaying(false);
    }
  };

  const handleWithdrawal = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return;

    const available = currentBalance < 0 ? Math.abs(currentBalance) : 0;
    if (amount > available) {
      alert("Amount exceeds available advance balance of Rs " + available.toLocaleString());
      return;
    }

    setPaying(true);

    try {
      await saveWithdrawal({
        customerId: customer.id,
        amount,
        method: payMethod,
        notes: payNotes,
        date: payDate,
        type: "advance_draw",
      });

      setSuccessData({
        title: "Withdrawal Processed",
        lines: [
          { label: "Customer", value: customer.name },
          { label: "Amount", value: `Rs ${amount.toLocaleString()}`, mono: true },
          { label: "Type", value: "Advance Draw" },
          { label: "Method", value: payMethod },
          { label: "Date", value: payDate },
        ],
      });

      setPayModal(null);
      setPayAmount("");
      setPayNotes("");
      setPayDate(new Date().toISOString().split("T")[0]);

      await loadHistory();
      if (onRefresh) onRefresh();
    } catch (e) {
      alert("Failed to record withdrawal: " + e.message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <>
      <div style={st.cardsGrid}>
        <div style={{ ...st.card, borderLeft: `3px solid ${currentBalance > 0 ? '#c62828' : currentBalance < 0 ? '#2e7d32' : '#1b3a1d'}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1b3a1d' }}>{customer.name}</h2>
                {customer.phone && <span style={{ fontSize: 13, color: '#6a8f6c' }}>({customer.phone})</span>}
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#666' }}>Customer Ledger & Statements</p>
            </div>
            
            <div style={{ textalign: 'right' }}>
              <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6a8f6c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                Current Balance
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: currentBalance > 0 ? '#c62828' : currentBalance < 0 ? '#2e7d32' : '#555' }}>
                {currentBalance === 0 ? 'Rs 0' : currentBalance > 0 ? `(Dr) Rs ${Math.abs(currentBalance).toLocaleString()}` : `(Cr) Rs ${Math.abs(currentBalance).toLocaleString()}`}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: '#c8d8c8', border: '1px solid #c8d8c8', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
            {[
              { label: "Total Billed", val: `Rs ${totalBilled.toLocaleString()}` },
              { label: "Total Paid", val: `Rs ${totalPaid.toLocaleString()}`, color: "#2e7d32" },
              { label: "Outstanding Dr", val: `Rs ${outstandingBalance.toLocaleString()}`, color: "#c62828" },
              { label: "Transactions", val: transactionsCount },
              { label: "Last Activity", val: lastActivity }
            ].map((m, idx) => (
              <div key={idx} style={{ background: '#fff', padding: '10px 14px' }}>
                <p style={{ margin: 0, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6a8f6c' }}>{m.label}</p>
                <h4 style={{ margin: '4px 0 0 0', fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: m.color || '#1b3a1d' }}>{m.val}</h4>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.07em" }}>From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ height: 36, borderRadius: 4, border: "1px solid #cde0cd", padding: "0 10px", fontSize: 13, outline: "none", background: "#fafff9" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.07em" }}>To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={{ height: 36, borderRadius: 4, border: "1px solid #cde0cd", padding: "0 10px", fontSize: 13, outline: "none", background: "#fafff9" }}
              />
            </div>
            {(fromDate || toDate) && (
              <button
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                }}
                style={{ marginTop: 18, height: 36, padding: "0 14px", borderRadius: 4, border: "1px solid #e0e0e0", background: "#fff", fontSize: 12, fontWeight: 700, color: "#888", cursor: "pointer" }}
              >
                Clear
              </button>
            )}
            <div style={{ marginTop: 18, fontSize: 12, color: "#6a8f6c", fontWeight: 600 }}>
              {visible.length} transaction{visible.length !== 1 ? "s" : ""}
              {(fromDate || toDate) ? " in range" : " total"}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, background: '#f5f8f5', border: '1px solid #c8d8c8', padding: '8px 12px', borderRadius: 4, marginBottom: 16 }}>
        <button
          style={{ padding: '8px 16px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          onClick={() => {
            setPayModal({ general: true });
            setPayAmount("");
            setPayNotes("");
            setPayDate(new Date().toISOString().split("T")[0]);
          }}
        >
          Record Payment
        </button>
        <button
          style={{ padding: '8px 16px', background: '#fff', color: '#c62828', border: '1px solid #ffcdd2', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          onClick={() => {
            setPayModal({ withdrawal: true });
            setPayAmount("");
            setPayNotes("");
            setPayDate(new Date().toISOString().split("T")[0]);
          }}
        >
          Withdraw
        </button>
        <button
          style={{ padding: '8px 16px', background: '#fff', color: '#555', border: '1px solid #cde0cd', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          onClick={handlePrintStatement}
        >
          Print Statement
        </button>
        <button
          style={{ padding: '8px 16px', background: '#fff', color: '#555', border: '1px solid #cde0cd', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          onClick={handleExportExcel}
        >
          Export Excel
        </button>
      </div>

      <div style={st.tableWrap}>
        <div style={st.tableContainer}>
          <style>
            {`
              .cust-bill-list { display: flex; flex-direction: column; gap: 8px; }
              .cust-bill-header, .cust-bill-row {
                display: grid;
                grid-template-columns: 110px minmax(180px, 2fr) 120px 120px 120px 140px;
                align-items: center;
              }
              .cust-bill-header {
                padding: 12px 16px;
                background: #fafdfa;
                border: 1px solid #c8d8c8;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 700;
                color: #6a8f6c;
                text-transform: uppercase;
                letter-spacing: 0.03em;
              }
              .cust-bill-card {
                background: #fff;
                border: 1px solid #c8d8c8;
                border-radius: 4px;
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
                border-radius: 4px;
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
                border-top: 1px solid #c8d8c8;
                background: #fafdfa;
              }
              .cust-bill-details {
                background: #fff;
                border: 1px solid #c8d8c8;
                border-radius: 4px;
                padding: 16px;
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
            `}
          </style>

          <div style={{ display: "flex", gap: 16, padding: "0 0 16px 0", borderBottom: "1px solid #c8d8c8", marginBottom: 12 }}>
            {[["all", "All Transactions"], ["sales", "Sales"], ["receipts", "Receipts"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setBillFilter(val)}
                style={{
                  padding: "8px 4px",
                  border: "none",
                  borderBottom: `2px solid ${billFilter === val ? "#2e7d32" : "transparent"}`,
                  background: "transparent",
                  color: billFilter === val ? "#1b3a1d" : "#5a755c",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="cust-bill-list">
            <div className="cust-bill-header" style={{ borderBottom: '2px solid #c8d8c8' }}>
              <div>Date</div>
              <div>Particulars</div>
              <div>Method</div>
              <div style={{ textAlign: 'right' }}>Dr</div>
              <div style={{ textAlign: 'right' }}>Cr</div>
              <div style={{ textAlign: 'right' }}>Balance</div>
            </div>

            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="cust-bill-card" style={{ padding: 16 }}>
                  <div className="cust-bill-row">
                    <div><div className="skeleton" style={{ width: '70%' }} /></div>
                    <div><div className="skeleton" style={{ width: '90%' }} /></div>
                    <div><div className="skeleton" style={{ width: '60%' }} /></div>
                    <div><div className="skeleton" style={{ width: '50%', marginLeft: 'auto' }} /></div>
                    <div><div className="skeleton" style={{ width: '50%', marginLeft: 'auto' }} /></div>
                    <div><div className="skeleton" style={{ width: '70%', marginLeft: 'auto' }} /></div>
                  </div>
                </div>
              ))
            ) : visible.length === 0 ? (
              <div className="cust-bill-card" style={{ textAlign: 'center', padding: 48, color: '#708571' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#5a755c' }}>No transaction history found</div>
              </div>
            ) : (
              visible.map((h, idx) => {
                const dateObj = new Date(h.date + 'T00:00:00');
                const currentMonthYear = dateObj.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

                let prevMonthYear = null;
                if (idx > 0) {
                  const prevDateObj = new Date(visible[idx - 1].date + 'T00:00:00');
                  prevMonthYear = prevDateObj.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
                }

                const isOpening = h.type === 'Opening';
                const showMonthRow = currentMonthYear !== prevMonthYear && !isOpening;
                const displayDate = isOpening
                  ? 'Opening'
                  : dateObj.toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });
                const rowKey = `${h.type}-${h.ref_id}-${idx}`;
                const isSale = h.type === 'Sale';
                const isReturn = h.type === 'Return';
                const isWithdrawal = h.type === 'Withdrawal';

                return (
                  <React.Fragment key={idx}>
                    {showMonthRow && (
                      <div style={{ background: '#f5f8f5', borderLeft: '3px solid #2e7d32', padding: '8px 16px', marginTop: idx === 0 ? 8 : 16, display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#2e7d32', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {currentMonthYear}
                        </span>
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
                            {isOpening 
                              ? 'Opening Balance' 
                              : isSale 
                                ? 'Sale Bill' 
                                : isReturn
                                  ? 'Items Returned'
                                  : isWithdrawal
                                    ? (h.payment_type === 'loan' ? 'Loan Disbursed' : 'Advance Withdrawal')
                                    : h.payment_type === 'advance' 
                                      ? 'Advance Deposit' 
                                      : 'Payment Received'
                            }
                          </span>
                          {h.reference && !isOpening && <span className="cust-bill-sub">{h.reference}</span>}
                        </div>

                        <div className="cust-bill-method">{h.method || '-'}</div>

                        <div className="cust-bill-money" style={{ color: h.debit > 0 ? '#c62828' : '#888' }}>
                          {h.debit > 0 ? `Rs ${h.debit.toLocaleString()}` : '-'}
                        </div>

                        <div className="cust-bill-money" style={{ color: h.credit > 0 ? '#2e7d32' : '#888' }}>
                          {h.credit > 0 ? `Rs ${h.credit.toLocaleString()}` : '-'}
                        </div>

                        <div className="cust-bill-money" style={{ 
                          color: h.runningBalance > 0 ? '#c62828' : 
                                 h.runningBalance < 0 ? '#2e7d32' : '#888',
                          textAlign: 'right'
                        }}>
                          {h.runningBalance === 0 ? 'Rs 0' :
                           h.runningBalance > 0 
                             ? `(Dr) Rs ${Math.abs(h.runningBalance).toLocaleString()}`
                             : `(Cr) Rs ${Math.abs(h.runningBalance).toLocaleString()}`
                          }
                        </div>
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
                                    {h.notes && (
                                      <div className="cust-bill-field" style={{ gridColumn: '1 / -1' }}>
                                        <span className="cust-bill-label">Notes</span>
                                        <span className="cust-bill-value" style={{ 
                                          fontStyle: 'italic', 
                                          color: '#555', 
                                          fontSize: 13 
                                        }}>
                                          {h.notes}
                                        </span>
                                      </div>
                                    )}
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
              })
            )}

            {/* Sticky Summary Footer */}
            {!loading && visible.length > 0 && (
              <div
                style={{
                  position: "sticky",
                  bottom: 0,
                  background: "#fafdfa",
                  borderTop: "2px solid #2e7d32",
                  boxShadow: "0 -2px 10px rgba(0,0,0,0.05)",
                  zIndex: 5,
                  borderRadius: "0 0 4px 4px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: "12px 16px"
                }}
              >
                {fromDate && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#555", borderBottom: "1px solid #e8f0e8", paddingBottom: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>Opening Balance Brought Forward (B/F):</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: openingBF > 0 ? "#c62828" : openingBF < 0 ? "#2e7d32" : "#555" }}>
                      Rs {Math.abs(openingBF).toLocaleString()} {openingBF > 0 ? "Dr" : openingBF < 0 ? "Cr" : ""}
                    </span>
                  </div>
                )}
                <div className="cust-bill-row" style={{ minHeight: "auto", padding: 0 }}>
                  <div style={{ fontWeight: 700, color: "#1b3a1d" }}>TOTALS</div>
                  <div style={{ color: "#7a8f7b", fontSize: 12 }}>Period Summary</div>
                  <div></div>
                  <div className="cust-bill-money" style={{ color: "#c62828" }}>
                    Rs {periodDebit.toLocaleString()}
                  </div>
                  <div className="cust-bill-money" style={{ color: "#2e7d32" }}>
                    Rs {periodCredit.toLocaleString()}
                  </div>
                  <div className="cust-bill-money" style={{ color: closing > 0 ? "#c62828" : closing < 0 ? "#2e7d32" : "#555", textAlign: 'right' }}>
                    Rs {Math.abs(closing).toLocaleString()} {closing > 0 ? "Dr" : closing < 0 ? "Cr" : ""}
                  </div>
                </div>
              </div>
            )}
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
              borderRadius: 4,
              padding: 28,
              minWidth: 360,
              maxWidth: 420,
              border: "1px solid #c8d8c8",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {payModal.withdrawal ? "Withdrawal Entry" : "General Payment"}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#1b3a1d", marginTop: 2 }}>
                  {payModal.withdrawal ? "Customer Withdrawal" : "Record Payment"}
                </div>
              </div>
              <button onClick={() => setPayModal(null)} style={{ background: "none", border: "none", fontSize: 18, color: "#999", cursor: "pointer" }}>✕</button>
            </div>

            {payModal.withdrawal && (
              <div style={{ fontSize: 12, fontWeight: 600, color: currentBalance < 0 ? "#2e7d32" : "#c62828", marginBottom: 12, background: "#f5f8f5", padding: "8px 12px", borderLeft: "3px solid #2e7d32" }}>
                Available Cr: {currentBalance < 0 ? `(Cr) Rs ${Math.abs(currentBalance).toLocaleString()}` : `Rs 0 (No Cr)`}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                  {payModal.withdrawal ? "Withdrawal Date" : "Payment Date"}
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  style={{ width: "100%", height: 44, borderRadius: 4, border: "1.5px solid #cde0cd", padding: "0 14px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                  Amount (Rs)
                </label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  style={{ width: "100%", height: 44, borderRadius: 4, border: "1.5px solid #cde0cd", padding: "0 14px", fontSize: 16, fontWeight: 700, outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  style={{ width: "100%", height: 44, borderRadius: 4, border: "1.5px solid #cde0cd", padding: "0 12px", fontSize: 14, outline: "none", background: "#fafff9", boxSizing: "border-box" }}
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
                  placeholder={payModal.withdrawal ? "e.g. Returned extra deposit" : "e.g. Cash received in office"}
                  style={{ width: "100%", height: 40, borderRadius: 4, border: "1.5px solid #cde0cd", padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <button onClick={() => setPayModal(null)} style={st.secondaryBtn}>Cancel</button>
              <button
                onClick={payModal.withdrawal ? handleWithdrawal : handleRecordPayment}
                disabled={paying || !payAmount}
                style={{ padding: "10px 24px", borderRadius: 4, border: "none", background: paying ? "#aaa" : (payModal.withdrawal ? "#c62828" : "#2e7d32"), color: "#fff", fontWeight: 700, fontSize: 14, cursor: paying ? "not-allowed" : "pointer" }}
              >
                {paying ? (payModal.withdrawal ? "Withdrawing..." : "Recording...") : (payModal.withdrawal ? "Confirm Withdrawal" : "Confirm Payment")}
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
  primaryBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: "10px 18px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 4, fontSize: 14, fontWeight: "bold", cursor: "pointer", transition: "background 0.2s" },
  secondaryBtn: { padding: "10px 18px", background: "#fff", color: "#555", border: "1px solid #cde0cd", borderRadius: 4, fontSize: 14, fontWeight: "bold", cursor: "pointer" },
  actionBtn: { padding: "6px 12px", border: "1px solid #cde0cd", background: "#e8f5e9", color: "#1b3a1d", fontSize: 12, fontWeight: 600, borderRadius: 4, cursor: "pointer" },

  navStrip: { display: "flex", gap: 6, background: "#e4ede4", borderRadius: 4, padding: 4, flexWrap: 'wrap' },
  navBtn: { padding: "6px 14px", border: "none", borderRadius: 4, background: "transparent", fontSize: 13, fontWeight: 600, color: "#5a755c", cursor: "pointer", transition: "background 0.2s" },
  navBtnActive: { background: "#fff", color: "#1d351f", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },

  cardsGrid: { display: 'grid', gap: 16, marginBottom: 16 },
  card: { background: '#fff', padding: '24px', borderRadius: 4, border: '1px solid #c8d8c8' },
  cardLabel: { fontSize: 12, fontFamily: 'monospace', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6a8f6c', marginBottom: 12 },
  cardAmount: { fontSize: 16, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 10 },
  cardHint: { fontSize: 11, color: '#999', marginTop: 12, fontStyle: 'italic' },

  tableWrap: { background: '#fff', borderRadius: 4, border: '1px solid #c8d8c8', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  tableSearch: { padding: '16px 20px', borderBottom: '1px solid #c8d8c8', display: 'flex', alignItems: 'center', gap: 16, background: '#fafdfa', justifyContent: 'space-between', flexWrap: 'wrap' },
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
  sidePanel: { position: "absolute", top: 0, right: 0, bottom: 0, width: 'min(420px, 92vw)', background: "#fff", zIndex: 20, boxShadow: "-4px 0 24px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", borderRadius: 0 },
  panelHeader: { padding: "20px 24px", borderBottom: "1px solid #e8f0e8", display: "flex", justifyContent: "space-between", alignItems: "center" },
  panelTitle: { margin: 0, fontSize: 18, color: "#1b3a1d", fontWeight: "bold" },
  closeBtn: { background: "none", border: "none", fontSize: 18, color: "#888", cursor: "pointer" },
  panelBody: { flex: 1, padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 },
  panelFooter: { padding: "20px 24px", borderTop: "1px solid #e8f0e8", display: "flex", justifyContent: "flex-end", gap: 12 },

  fieldWrap: { display: "flex", flexDirection: "column", gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase" },
  input: { padding: "12px", border: "1.5px solid #cde0cd", borderRadius: 4, background: "#fafff9", outline: "none", fontSize: 14, color: "#1b3a1d" },
  fieldHint: { fontSize: 11, color: "#8aab8c" },
};
