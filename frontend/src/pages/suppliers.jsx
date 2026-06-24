import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, PlusCircle, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import XLSX from "xlsx-js-style";
import SuccessNotification from "../components/SuccessNotification";
import WarningNotification from "../components/Warningnotification";
import {
  listSuppliers,
  saveSupplier,
  getSupplierHistory,
  getPurchaseItems,
  saveSupplierPayment as recordPayment,
  deleteSupplier,
} from "../lib/posApi";

const BUSINESS_NAME = "Cheema Traders";

const formatMoney = (num) =>
  `Rs. ${(Number(num) || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function SuppliersPage() {
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [supplierToEdit, setSupplierToEdit] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [successData, setSuccessData] = useState(null);

  const loadSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listSuppliers();
      if (res && res.suppliers) {
        setSuppliers(res.suppliers);
        if (selectedSupplier) {
          const updated = res.suppliers.find(s => s.id === selectedSupplier.id);
          if (updated) setSelectedSupplier(updated);
        }
      }
    } catch (e) {
      console.error("Failed to load suppliers", e);
    } finally {
      setLoading(false);
    }
  }, [selectedSupplier]);

  useEffect(() => {
    loadSuppliers();
  }, []);

  const handleOpenPanel = () => {
    setSupplierToEdit(null);
    setIsAddPanelOpen(true);
  };

  const handleEditSupplier = (supplier) => {
    setSupplierToEdit(supplier);
    setIsAddPanelOpen(true);
  };

  const handleSaved = (savedInfo) => {
    setIsAddPanelOpen(false);
    setSupplierToEdit(null);
    setSuccessData({
      title: supplierToEdit ? "Supplier Updated" : "Supplier Created",
      lines: [
        { label: "Name", value: savedInfo.name },
        { label: "Phone", value: savedInfo.phone || "-" },
        {
          label: "Opening Balance",
          value: `Rs ${Math.abs(savedInfo.openingBalance || 0).toLocaleString()} ${(savedInfo.openingBalance || 0) > 0 ? "(Cr)" : (savedInfo.openingBalance || 0) < 0 ? "(Dr)" : ""
            }`,
        },
      ],
    });
    loadSuppliers();
  };

  const handleDeleteSupplier = async (id) => {
    try {
      await deleteSupplier(id);
      loadSuppliers();
    } catch (e) {
      console.error("Failed to delete supplier", e);
      alert("Error deleting supplier: " + e.message);
    }
  };

  return (
    <div style={st.page}>
      <div style={st.pageHeader}>
        <div>
          {selectedSupplier ? (
            <button style={st.backBtn} onClick={() => setSelectedSupplier(null)}>
              <ArrowLeft size={16} /> Back to Suppliers
            </button>
          ) : (
            <>
              <h1 style={st.title}>Suppliers</h1>
              <p style={st.subtitle}>Vendor & Purchase Management</p>
            </>
          )}
        </div>
        {!selectedSupplier && (
          <div style={st.headerActions}>
            <button style={st.primaryBtn} onClick={handleOpenPanel}>
              <PlusCircle size={16} /> Add Supplier
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
        {selectedSupplier ? (
          <SupplierHistoryView supplier={selectedSupplier} onRefresh={loadSuppliers} />
        ) : (
          <SupplierListView
            suppliers={suppliers}
            loading={loading}
            onSelectHistory={setSelectedSupplier}
            onDelete={handleDeleteSupplier}
            onEdit={handleEditSupplier}
            search={search}
            setSearch={setSearch}
          />
        )}
      </div>

      <AddSupplierPanel
        isOpen={isAddPanelOpen}
        supplierToEdit={supplierToEdit}
        onClose={() => {
          setIsAddPanelOpen(false);
          setSupplierToEdit(null);
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

function AddSupplierPanel({ isOpen, onClose, onSaved, supplierToEdit }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [salesOfficerPhone, setSalesOfficerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (supplierToEdit) {
        setName(supplierToEdit.name || "");
        setPhone(supplierToEdit.phone || "");
        setSalesOfficerPhone(supplierToEdit.salesOfficerPhone || "");
        setAddress(supplierToEdit.address || "");
        const balVal = supplierToEdit.openingBalance || supplierToEdit.opening_balance || 0;
        setOpeningBalance(balVal === 0 ? "" : String(balVal));
      } else {
        setName("");
        setPhone("");
        setSalesOfficerPhone("");
        setAddress("");
        setOpeningBalance("");
      }
      setErrorMsg("");
    }
  }, [isOpen, supplierToEdit]);

  const handleSave = async () => {
    setErrorMsg("");
    if (!name) return setErrorMsg("Name is required");
    if (phone && phone.length !== 11) {
      return setErrorMsg("Phone number must be exactly 11 digits");
    }
    if (salesOfficerPhone && salesOfficerPhone.length !== 11) {
      return setErrorMsg("Sales Officer phone number must be exactly 11 digits");
    }
    setSaving(true);
    try {
      const saved = await saveSupplier({
        id: supplierToEdit ? supplierToEdit.id : undefined,
        name,
        phone,
        salesOfficerPhone,
        address,
        openingBalance: Number(openingBalance || 0),
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
              <h2 style={st.panelTitle}>{supplierToEdit ? "Edit Supplier" : "Add Supplier"}</h2>
              <button style={st.closeBtn} onClick={onClose}>✕</button>
            </div>

            <div style={st.panelBody}>
              <div style={st.fieldWrap}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#1b3a1d", textTransform: "uppercase" }}>Supplier Name *</label>
                <input style={{ ...st.input, height: 48, fontSize: 15 }} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. FMC Corporation" />
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
                <label style={st.fieldLabel}>Sales Officer Phone</label>
                <input
                  style={st.input}
                  placeholder="03XXXXXXXXX"
                  value={salesOfficerPhone}
                  onChange={(e) => setSalesOfficerPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                />
              </div>
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Address</label>
                <input style={st.input} value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. Lahore, Punjab" />
              </div>

              <div style={{ borderTop: "1px solid #c8d8c8", margin: "12px 0 6px 0", paddingTop: 12 }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Financial Details
                </h3>
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Opening Balance (Rs)</label>
                <input style={st.input} type="number" placeholder="0" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} />
                <span style={st.fieldHint}>
                  Enter a negative value (e.g., -100) if the supplier has to pay (we paid in advance). Enter a positive value (e.g., 1000) if we have to pay them.
                </span>
              </div>
            </div>

            <div style={st.panelFooter}>
              {errorMsg && <div style={{ color: '#c62828', fontSize: 13, marginRight: 'auto', fontWeight: 500 }}>{errorMsg}</div>}
              <button style={st.secondaryBtn} onClick={onClose}>Cancel</button>
              <button style={st.primaryBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Supplier'}</button>
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

function SupplierListView({ suppliers, loading, onSelectHistory, onDelete, onEdit, search, setSearch }) {
  const [filter, setFilter] = useState("all");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(1);
  const [warnData, setWarnData] = useState(null);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => -d);
    else { setSortCol(col); setSortDir(1); }
  };

  const q = search.toLowerCase();
  const filtered = suppliers.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(q) || (s.phone || "").includes(q);
    if (!matchesSearch) return false;

    if (filter === "credit") return s.current_balance > 0;
    if (filter === "debit") return s.current_balance < 0;
    return true;
  });

  if (sortCol === 'balance') filtered.sort((a, b) => sortDir * (a.current_balance - b.current_balance));
  if (sortCol === 'purchase') filtered.sort((a, b) => sortDir * ((a.last_purchase || '').localeCompare(b.last_purchase || '')));

  const totalPayables = suppliers.reduce((sum, s) => s.current_balance > 0 ? sum + s.current_balance : sum, 0);
  const totalAdvances = suppliers.reduce((sum, s) => s.current_balance < 0 ? sum + Math.abs(s.current_balance) : sum, 0);

  return (
    <>


      <div style={st.tableWrap}>
        <div style={st.tableSearch}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <Search size={14} style={{ color: '#708571' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search suppliers by name or phone..."
              style={st.searchInput}
            />
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {[["all", "All"], ["credit", "Cr"], ["debit", "Dr"]].map(([val, label]) => (
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
              .supp-table th,
              .supp-table td { vertical-align: middle; }
              .supp-table th { padding: 12px 20px; font-size: 11px; font-weight: 700; color: #6a8f6c; text-transform: uppercase; border-bottom: 2px solid #c8d8c8; }
              .supp-table td { padding: 16px 20px; border-bottom: 1px solid #f2f7f2; }
              .supp-table tbody tr { transition: background 0.15s; }
              .supp-table tbody tr:hover { background: #f9fcf9; }
            `}
          </style>
          <table style={st.table} className="supp-table">
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: 'center' }}>
                  <input type="checkbox" disabled style={{ cursor: 'not-allowed' }} />
                </th>
                <th style={{ flex: 2 }}>Supplier Name</th>
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
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: '#5a755c' }}>No suppliers found</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your filters or search query.</div>
                  </td>
                </tr>
              ) : filtered.map((s) => {
                const bal = s.current_balance;
                return (
                  <tr key={s.id}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" disabled style={{ cursor: 'not-allowed' }} />
                    </td>
                    <td style={{ fontSize: 15, fontWeight: 700, color: '#1b3a1d', cursor: 'pointer' }} onClick={() => onSelectHistory(s)}>
                      <span style={{ textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>{s.name}</span>
                    </td>
                    <td style={{ fontSize: 13, color: '#555' }}>{s.phone || "-"}</td>
                    <td style={{ fontSize: 13, color: '#555' }} title={s.last_purchase || ""}>{timeAgo(s.last_purchase)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#555' }}>
                      {bal === 0 ? 'Rs 0' : bal > 0 ? `Cr Rs ${Math.abs(bal).toLocaleString()}` : `Dr Rs ${Math.abs(bal).toLocaleString()}`}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button style={st.actionBtn} onClick={() => onSelectHistory(s)}>Statement</button>
                        <button
                          style={{ ...st.actionBtn, background: '#e3f2fd', color: '#1565c0', border: '1px solid #bbdefb' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(s);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          style={{ ...st.actionBtn, background: '#ffebee', color: '#c62828', border: '1px solid #ffcdd2' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const bal = s.current_balance || 0;
                            if (bal !== 0) {
                              const formattedType = bal > 0 ? "Cr" : "Dr";
                              const formattedAmount = Math.abs(bal).toLocaleString();
                              setWarnData({
                                title: `Delete Supplier: ${s.name}?`,
                                lines: [
                                  { label: "Supplier Name", value: s.name },
                                  { label: "Action", value: "This will remove the supplier from active lists." },
                                  { label: "History Integrity", value: `${s.transaction_count || 0} purchase(s) will remain in history.` }
                                ],
                                confirmLabel: "Proceed",
                                cancelLabel: "Cancel",
                                onConfirm: () => {
                                  setTimeout(() => {
                                    setWarnData({
                                      title: `WARNING: Outstanding Balance!`,
                                      lines: [
                                        { label: "Supplier Name", value: s.name },
                                        { label: "Pending Balance", value: `${formattedType} of Rs ${formattedAmount}`, mono: true },
                                        { label: "Warning", value: "Deleting active suppliers with outstanding balances is discouraged. Are you absolutely sure you want to proceed?" },
                                        { label: "History Integrity", value: `${s.transaction_count || 0} purchase(s) will remain in history.` }
                                      ],
                                      confirmLabel: "Yes, Delete Supplier",
                                      cancelLabel: "Cancel",
                                      onConfirm: () => {
                                        onDelete(s.id);
                                      }
                                    });
                                  }, 350);
                                }
                              });
                            } else {
                              setWarnData({
                                title: `Delete Supplier: ${s.name}?`,
                                lines: [
                                  { label: "Supplier Name", value: s.name },
                                  { label: "Action", value: "This will remove the supplier from active lists." },
                                  { label: "History Integrity", value: `${s.transaction_count || 0} purchase(s) will remain in history.` }
                                ],
                                confirmLabel: "Delete Supplier",
                                cancelLabel: "Cancel",
                                onConfirm: () => {
                                  onDelete(s.id);
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

function SupplierHistoryView({ supplier, onRefresh }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState({});
  const [purchaseItems, setPurchaseItems] = useState({});
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
      const res = await getSupplierHistory(supplier.id);
      if (res && res.history) {
        const sorted = [...res.history].reverse();
        setHistory(sorted);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [supplier.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const baseRows = history.map(h => {
    const isPurchase = h.type === 'Purchase';
    const isOpening = h.type === 'Opening';
    const isJournal = h.type === 'Journal';
    const isWithdrawal = h.payment_type === 'refund';
    
    const totalAmount = Number(h.total_amount || 0);
    const balanceChange = Number(h.balance_change || 0);

    let debit = 0;
    let credit = 0;

    if (isOpening) {
      if (balanceChange > 0) credit = balanceChange;
      else debit = Math.abs(balanceChange);
    } else if (isJournal) {
      if (balanceChange > 0) credit = balanceChange;
      else debit = Math.abs(balanceChange);
    } else if (isPurchase) {
      credit = totalAmount;
      debit = Math.max(0, totalAmount - balanceChange);
    } else {
      if (isWithdrawal) {
        credit = totalAmount;
      } else {
        debit = totalAmount;
      }
    }

    const remainingAmount = isPurchase ? Math.max(0, balanceChange) : 0;
    const paidAmount = isPurchase ? debit : totalAmount;

    return {
      ...h,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      remaining_amount: remainingAmount,
      balance_change: balanceChange,
      debit,
      credit,
      isWithdrawal,
      payment_status: isPurchase
        ? (remainingAmount <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid')
        : (isWithdrawal ? 'Withdrawal' : 'Paid')
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

  const statementRows = withRunning.slice().reverse();

  const visibleRows = statementRows.filter((h) => {
    if (fromDate && h.date < fromDate) return false;
    if (toDate && h.date > toDate) return false;

    if (billFilter === "paid") return h.payment_status === "Paid" || h.type !== "Purchase";
    if (billFilter === "unpaid") return h.type === "Purchase" && h.payment_status !== "Paid";
    return true;
  });

  const visibleRowsWithBalance = useMemo(() => {
    return visibleRows;
  }, [visibleRows]);

  const currentBalance = statementRows.length > 0 ? statementRows[0].runningBalance : Number(supplier.openingBalance || supplier.opening_balance || 0);

  const totalPurchased = baseRows.filter(h => h.type === 'Purchase').reduce((sum, h) => sum + Number(h.total_amount || 0), 0);
  const totalPaid = baseRows.filter(h => h.type === 'Payment' && !h.isWithdrawal).reduce((sum, h) => sum + Number(h.paid_amount || 0), 0);
  const outstandingPayables = baseRows.filter(h => h.type === 'Purchase').reduce((sum, h) => sum + Number(h.remaining_amount || 0), 0);
  const transactionsCount = baseRows.length;
  const lastActivity = baseRows.length > 0 ? baseRows[baseRows.length - 1].date : "-";

  const toggleRow = async (rowKey, h) => {
    if (expandedRows[rowKey]) {
      setExpandedRows(prev => ({ ...prev, [rowKey]: false }));
      return;
    }

    setExpandedRows(prev => ({ ...prev, [rowKey]: true }));

    if (h.type === 'Purchase' && !purchaseItems[rowKey]) {
      setItemsLoading(prev => ({ ...prev, [rowKey]: true }));
      try {
        const res = await getPurchaseItems(h.ref_id);
        if (res && res.items) {
          setPurchaseItems(prev => ({ ...prev, [rowKey]: res.items }));
        }
      } catch (e) {
        console.error("Failed to load purchase items", e);
      } finally {
        setItemsLoading(prev => ({ ...prev, [rowKey]: false }));
      }
    }
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws = {};

    const colors = {
      primary: "1B5E20",
      primaryLight: "E8F5E9",
      border: "D3D3D3",
      textDark: "1A1A1A",
      textMuted: "555555",
      danger: "C62828",
      success: "2E7D32"
    };

    const fontName = "Segoe UI";

    const sTitle = {
      font: { name: fontName, sz: 16, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: colors.primary } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const sSub = {
      font: { name: fontName, sz: 10, italic: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: colors.primary } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const sContact = {
      font: { name: fontName, sz: 9, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: colors.primary } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const sMetaLabel = {
      font: { name: fontName, sz: 10, bold: true, color: { rgb: colors.primary } },
      fill: { fgColor: { rgb: "F4FAF4" } },
      border: {
        top: { style: "thin", color: { rgb: colors.border } },
        bottom: { style: "thin", color: { rgb: colors.border } },
        left: { style: "thin", color: { rgb: colors.border } },
        right: { style: "thin", color: { rgb: colors.border } }
      },
      alignment: { horizontal: "left", vertical: "center" }
    };

    const sMetaVal = {
      font: { name: fontName, sz: 10, color: { rgb: colors.textDark } },
      fill: { fgColor: { rgb: "F4FAF4" } },
      border: {
        top: { style: "thin", color: { rgb: colors.border } },
        bottom: { style: "thin", color: { rgb: colors.border } },
        left: { style: "thin", color: { rgb: colors.border } },
        right: { style: "thin", color: { rgb: colors.border } }
      },
      alignment: { horizontal: "left", vertical: "center" }
    };

    const sTableHeader = {
      font: { name: fontName, sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "2E7D32" } },
      border: {
        top: { style: "thin", color: { rgb: colors.border } },
        bottom: { style: "medium", color: { rgb: colors.primary } },
        left: { style: "thin", color: { rgb: colors.border } },
        right: { style: "thin", color: { rgb: colors.border } }
      },
      alignment: { horizontal: "left", vertical: "center" }
    };

    const sTableHeaderRight = {
      ...sTableHeader,
      alignment: { horizontal: "right", vertical: "center" }
    };

    const sTableHeaderCenter = {
      ...sTableHeader,
      alignment: { horizontal: "center", vertical: "center" }
    };

    const sData = {
      font: { name: fontName, sz: 9.5, color: { rgb: colors.textDark } },
      border: {
        bottom: { style: "thin", color: { rgb: "EAEAEA" } },
        left: { style: "thin", color: { rgb: "EAEAEA" } },
        right: { style: "thin", color: { rgb: "EAEAEA" } }
      },
      alignment: { horizontal: "left", vertical: "center" }
    };

    const sDataCenter = {
      ...sData,
      alignment: { horizontal: "center", vertical: "center" }
    };

    const sDataRight = {
      ...sData,
      alignment: { horizontal: "right", vertical: "center" }
    };

    const sDataNum = {
      ...sDataRight,
      numFmt: "#,##0.00"
    };

    const sDataDr = {
      ...sDataNum,
      font: { name: fontName, sz: 9.5, color: { rgb: colors.success }, bold: true }
    };

    const sDataCr = {
      ...sDataNum,
      font: { name: fontName, sz: 9.5, color: { rgb: colors.danger }, bold: true }
    };

    const sTotalLabel = {
      font: { name: fontName, sz: 10, bold: true, color: { rgb: colors.primary } },
      fill: { fgColor: { rgb: colors.primaryLight } },
      border: {
        top: { style: "thin", color: { rgb: colors.primary } },
        bottom: { style: "double", color: { rgb: colors.primary } },
        left: { style: "thin", color: { rgb: colors.border } },
        right: { style: "thin", color: { rgb: colors.border } }
      },
      alignment: { horizontal: "right", vertical: "center" }
    };

    const sTotalNum = {
      font: { name: fontName, sz: 10, bold: true, color: { rgb: colors.textDark } },
      fill: { fgColor: { rgb: colors.primaryLight } },
      border: {
        top: { style: "thin", color: { rgb: colors.primary } },
        bottom: { style: "double", color: { rgb: colors.primary } },
        left: { style: "thin", color: { rgb: colors.border } },
        right: { style: "thin", color: { rgb: colors.border } }
      },
      alignment: { horizontal: "right", vertical: "center" },
      numFmt: "#,##0.00"
    };

    let r = 0;
    
    const writeCell = (row, col, val, type = 's', style = {}) => {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      ws[cellRef] = { v: val, t: type, s: style };
    };

    // Header Letterhead
    writeCell(r, 0, BUSINESS_NAME, 's', sTitle);
    r++;
    writeCell(r, 0, "AGRO INPUTS & FERTILIZER DISTRIBUTORS", 's', sSub);
    r++;
    writeCell(r, 0, "Main Bazar, Sahiwal, Pakistan | Tel: +92 300 7890123 | Email: info@cheematraders.com", 's', sContact);
    r++;
    r++; // Empty row

    // Meta Info Block
    writeCell(r, 0, "Supplier Name:", 's', sMetaLabel);
    writeCell(r, 1, supplier.name, 's', sMetaVal);
    writeCell(r, 2, "", 's', sMetaVal);
    writeCell(r, 3, "", 's', sMetaVal);
    writeCell(r, 4, "Statement Period:", 's', sMetaLabel);
    writeCell(r, 5, `${fromDate || "Inception"} to ${toDate || "Today"}`, 's', sMetaVal);
    writeCell(r, 6, "", 's', sMetaVal);
    writeCell(r, 7, "", 's', sMetaVal);
    r++;

    writeCell(r, 0, "Phone Number:", 's', sMetaLabel);
    writeCell(r, 1, supplier.phone || "-", 's', sMetaVal);
    writeCell(r, 2, "", 's', sMetaVal);
    writeCell(r, 3, "", 's', sMetaVal);
    writeCell(r, 4, "Current Balance:", 's', sMetaLabel);
    const balanceStr = `PKR ${Math.abs(currentBalance).toLocaleString("en-PK", { minimumFractionDigits: 2 })} ${currentBalance > 0 ? "(Cr)" : currentBalance < 0 ? "(Dr)" : ""}`;
    writeCell(r, 5, balanceStr, 's', currentBalance > 0 ? { ...sMetaVal, font: { ...sMetaVal.font, color: { rgb: colors.danger }, bold: true } } : currentBalance < 0 ? { ...sMetaVal, font: { ...sMetaVal.font, color: { rgb: colors.success }, bold: true } } : sMetaVal);
    writeCell(r, 6, "", 's', sMetaVal);
    writeCell(r, 7, "", 's', sMetaVal);
    r++;
    r++; // Empty row

    // Table Headers
    const tableHeaders = ["S.No", "Date", "Description/Reference", "Payment Method", "Status", "Debit (PKR)", "Credit (PKR)", "Running Balance (PKR)"];
    tableHeaders.forEach((h, c) => {
      let st = sTableHeader;
      if (c === 0 || c === 1 || c === 4) st = sTableHeaderCenter;
      else if (c >= 5) st = sTableHeaderRight;
      writeCell(r, c, h, 's', st);
    });
    r++;

    // Table Data
    let sNo = 1;
    const currentBilled = visibleRows.reduce((sum, h) => sum + Number(h.credit || 0), 0);
    const currentPaid = visibleRows.reduce((sum, h) => sum + Number(h.debit || 0), 0);

    [...visibleRows].reverse().forEach((h) => {
      const isPurchase = h.type === 'Purchase';
      const isOpening = h.type === 'Opening';
      const desc = isOpening 
        ? 'Opening Balance' 
        : h.type === 'Purchase' 
          ? `Purchase Invoice${h.reference ? ` (${h.reference})` : ""}` 
          : h.type === 'Journal'
            ? `Journal Entry${h.reference ? ` (${h.reference})` : ""}`
            : h.isWithdrawal
              ? `Refund/Withdrawal${h.reference ? ` (${h.reference})` : ""}`
              : `Payment Made${h.reference ? ` (${h.reference})` : ""}`;

      const status = isOpening ? "-" : h.type === 'Purchase' ? h.payment_status || "Unpaid" : h.type === 'Journal' ? "-" : h.payment_status || "Paid";
      
      const debit = h.debit;
      const credit = h.credit;

      writeCell(r, 0, sNo++, 'n', sDataCenter);
      writeCell(r, 1, h.date, 's', sDataCenter);
      writeCell(r, 2, desc, 's', sData);
      writeCell(r, 3, h.method || "-", 's', sData);
      writeCell(r, 4, status, 's', sDataCenter);
      writeCell(r, 5, debit, 'n', sDataNum);
      writeCell(r, 6, credit, 'n', sDataNum);
      writeCell(r, 7, h.runningBalance, 'n', h.runningBalance > 0 ? sDataCr : h.runningBalance < 0 ? sDataDr : sDataNum);
      r++;
    });

    // Totals Row
    writeCell(r, 0, "", 's', sTotalLabel);
    writeCell(r, 1, "", 's', sTotalLabel);
    writeCell(r, 2, "", 's', sTotalLabel);
    writeCell(r, 3, "", 's', sTotalLabel);
    writeCell(r, 4, "TOTALS", 's', sTotalLabel);
    writeCell(r, 5, currentPaid, 'n', sTotalNum);
    writeCell(r, 6, currentBilled, 'n', sTotalNum);
    writeCell(r, 7, currentBalance, 'n', sTotalNum);
    r++;

    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
      { s: { r: 4, c: 1 }, e: { r: 4, c: 3 } },
      { s: { r: 4, c: 5 }, e: { r: 4, c: 7 } },
      { s: { r: 5, c: 1 }, e: { r: 5, c: 3 } },
      { s: { r: 5, c: 5 }, e: { r: 5, c: 7 } },
      { s: { r: r - 1, c: 0 }, e: { r: r - 1, c: 4 } }
    ];

    ws["!cols"] = [
      { wch: 8 },
      { wch: 12 },
      { wch: 35 },
      { wch: 18 },
      { wch: 12 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 }
    ];

    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: 7 } });

    XLSX.utils.book_append_sheet(wb, ws, "Account Statement");
    XLSX.writeFile(wb, `Statement_${supplier.name.replace(/\s+/g, '_')}.xlsx`);
  };

  const handlePrintStatement = async () => {
    const currentBilled = visibleRowsWithBalance.reduce((s, h) => s + Number(h.credit || 0), 0);
    const currentReceived = visibleRowsWithBalance.reduce((s, h) => s + Number(h.debit || 0), 0);

    const earliest = visibleRows[visibleRows.length - 1]; // visibleRows is newest-first
    const openingBF = earliest 
      ? earliest.runningBalance - earliest.balance_change 
      : (fromDate 
          ? (statementRows.find(h => h.date < fromDate)?.runningBalance || Number(supplier.openingBalance || supplier.opening_balance || 0)) 
          : Number(supplier.openingBalance || supplier.opening_balance || 0)
        );
    const closing = visibleRows.length ? visibleRows[0].runningBalance : Number(supplier.openingBalance || supplier.opening_balance || 0);

    let rowsHtml = "";
    let sNo = 1;

    if (fromDate) {
      rowsHtml += `
        <tr class="bf-row">
          <td>BF</td>
          <td>${new Date(fromDate + "T00:00:00").toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}</td>
          <td colspan="3"><strong>Balance Brought Forward (B/F)</strong></td>
          <td class="num">${openingBF < 0 ? formatMoney(Math.abs(openingBF)) : "-"}</td>
          <td class="num">${openingBF > 0 ? formatMoney(openingBF) : "-"}</td>
          <td class="num bold">${formatMoney(Math.abs(openingBF))} ${openingBF > 0 ? "Cr" : openingBF < 0 ? "Dr" : ""}</td>
        </tr>
      `;
    }

    const tableRowsHtml = [...visibleRowsWithBalance].reverse().map((h) => {
      const isPurchase = h.type === "Purchase";
      const isOpening = h.type === "Opening";
      const status = isOpening ? "-" : h.type === 'Purchase' ? h.payment_status || "Unpaid" : h.type === 'Journal' ? "-" : h.payment_status || "Paid";
      const statusColor = status === "Paid" ? "#16a34a" : status === "Partial" ? "#d97706" : status === "-" ? "#64748b" : "#dc2626";
      const statusBg = status === "Paid" ? "#f0fdf4" : status === "Partial" ? "#fef3c7" : status === "-" ? "#f1f5f9" : "#fef2f2";

      const debit = h.debit;
      const credit = h.credit;

      const desc = isOpening 
        ? "Opening Balance" 
        : h.type === 'Purchase' 
          ? `Purchase Invoice ${h.reference ? `<span class="ref-no">(${h.reference})</span>` : ""}` 
          : h.type === 'Journal'
            ? `Journal Entry ${h.reference ? `<span class="ref-no">(${h.reference})</span>` : ""}`
            : h.isWithdrawal
              ? `Refund/Withdrawal ${h.reference ? `<span class="ref-no">(${h.reference})</span>` : ""}`
              : `Payment Made ${h.reference ? `<span class="ref-no">(${h.reference})</span>` : ""}`;

      const runningBalFormatted = formatMoney(Math.abs(h.runningBalance));
      const runningIndicator = h.runningBalance > 0 ? "Cr" : h.runningBalance < 0 ? "Dr" : "";

      return `
        <tr>
          <td class="muted">${sNo++}</td>
          <td>${new Date(h.date + "T00:00:00").toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}</td>
          <td><strong>${desc}</strong></td>
          <td>${h.method || "-"}</td>
          <td><span style="padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusColor}40;">${status}</span></td>
          <td class="num">${debit > 0 ? formatMoney(debit) : "-"}</td>
          <td class="num text-success">${credit > 0 ? formatMoney(credit) : "-"}</td>
          <td class="num bold ${h.runningBalance > 0 ? 'text-danger' : h.runningBalance < 0 ? 'text-success' : ''}">${runningBalFormatted} ${runningIndicator}</td>
        </tr>
      `;
    }).join("");

    rowsHtml += tableRowsHtml;

    const html = `
      <html>
        <head>
          <title>Supplier Statement - ${supplier.name}</title>
          <style>
            @page {
              size: A4;
              margin: 15mm;
            }
            @media print {
              body { padding: 0; color: #1e293b; background: #fff; }
              thead { display: table-header-group; }
              tfoot { display: table-footer-group; }
              .no-print { display: none; }
              .page-break { page-break-before: always; }
              .summary-box { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .summary-box.highlight { background: #f0fdf4 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              thead tr { background: #1b5e20 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              tr.bf-row { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            body {
              font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
              color: #1e293b;
              background: #fff;
              font-size: 11px;
              line-height: 1.5;
              margin: 0;
              padding: 20px;
            }
            .header-container {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 20px;
              margin-bottom: 25px;
            }
            .brand-section {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .logo-mark {
              width: 42px;
              height: 42px;
              border-radius: 8px;
              background: linear-gradient(135deg, #1b5e20, #2e7d32);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 18px;
              font-weight: 800;
              color: #fff;
              letter-spacing: 0.5px;
            }
            .company-title-block {
              display: flex;
              flex-direction: column;
            }
            .company-name {
              font-size: 24px;
              font-weight: 800;
              color: #1b5e20;
              line-height: 1.1;
              letter-spacing: -0.5px;
            }
            .company-sub {
              font-size: 9.5px;
              color: #64748b;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-top: 3px;
            }
            .company-details {
              font-size: 9px;
              color: #64748b;
              margin-top: 5px;
              line-height: 1.4;
            }
            .doc-title-section {
              text-align: right;
            }
            .doc-title {
              margin: 0;
              font-size: 20px;
              font-weight: 800;
              color: #0f172a;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .doc-sub {
              margin: 4px 0 0 0;
              color: #64748b;
              font-size: 11px;
              font-weight: 500;
            }
            .doc-period {
              margin: 4px 0 0 0;
              font-size: 10.5px;
              font-weight: 600;
              color: #1b5e20;
              background: #f0fdf4;
              padding: 2px 8px;
              border-radius: 4px;
              display: inline-block;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: 1.5fr 1fr;
              gap: 20px;
              margin-bottom: 25px;
            }
            .party-card {
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 12px 16px;
              background: #fff;
            }
            .card-title {
              font-size: 9px;
              font-weight: 700;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 6px;
              border-bottom: 1px solid #f1f5f9;
              padding-bottom: 4px;
            }
            .party-name {
              font-size: 14px;
              font-weight: 700;
              color: #0f172a;
              margin-bottom: 4px;
            }
            .party-info {
              font-size: 10px;
              color: #475569;
              margin: 2px 0;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              margin-bottom: 25px;
            }
            .summary-box {
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 12px 14px;
              background: #f8fafc;
              border-left: 3.5px solid #64748b;
            }
            .summary-box.debit-accent { border-left-color: #ef4444; }
            .summary-box.credit-accent { border-left-color: #22c55e; }
            .summary-box.highlight {
              background: #f0fdf4;
              border-color: #1b5e20;
              border-left-width: 4px;
              border-left-color: #1b5e20;
            }
            .summary-label {
              font-size: 9px;
              font-weight: 700;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 4px;
            }
            .summary-val {
              font-size: 14px;
              font-weight: 800;
              color: #0f172a;
              font-family: 'Consolas', 'Courier New', monospace;
            }
            .summary-box.highlight .summary-val {
              font-size: 15px;
              color: #1b5e20;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }
            thead tr {
              background: #1b5e20;
              color: #fff;
            }
            th {
              padding: 9px 10px;
              text-align: left;
              font-weight: 700;
              font-size: 9.5px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            th.num, td.num {
              text-align: right;
            }
            td {
              padding: 9px 10px;
              color: #334155;
              border-bottom: 1px solid #e2e8f0;
              font-size: 10.5px;
            }
            tr:nth-child(even) {
              background: #f8fafc;
            }
            tr.bf-row {
              background: #f1f5f9;
              font-weight: 600;
            }
            .bold { font-weight: 700; }
            .muted { color: #64748b; }
            .text-success { color: #16a34a; }
            .text-danger { color: #dc2626; }
            .ref-no {
              color: #64748b;
              font-size: 9px;
              font-family: 'Consolas', monospace;
              margin-left: 4px;
            }
            .footer-container {
              margin-top: 50px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              border-top: 1px solid #e2e8f0;
              padding-top: 20px;
              font-size: 9px;
              color: #64748b;
              page-break-inside: avoid;
            }
            .sig-block {
              text-align: center;
              width: 180px;
            }
            .sig-line {
              border-top: 1.5px solid #475569;
              margin-bottom: 5px;
              padding-top: 6px;
              font-weight: 700;
              color: #334155;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .footer-stamp {
              max-width: 320px;
              line-height: 1.4;
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div>
              <div class="brand-section">
                <div class="logo-mark">CT</div>
                <div class="company-title-block">
                  <div class="company-name">${BUSINESS_NAME}</div>
                  <div class="company-sub">Agro Inputs & Fertilizer Distributors</div>
                </div>
              </div>
              <div class="company-details">
                Main Bazar, Sahiwal, Pakistan<br>
                Tel: +92 300 7890123 | Email: info@cheematraders.com
              </div>
            </div>
            <div class="doc-title-section">
              <h1 class="doc-title">Account Statement</h1>
              <div class="doc-sub">Generated: ${new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              <div class="doc-period">Period: ${fromDate || "Inception"} &mdash; ${toDate || "Today"}</div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="party-card">
              <div class="card-title">Statement For Supplier</div>
              <div class="party-name">${supplier.name}</div>
              ${supplier.phone ? `<div class="party-info"><strong>Phone:</strong> ${supplier.phone}</div>` : ""}
              ${supplier.address ? `<div class="party-info"><strong>Address:</strong> ${supplier.address}</div>` : ""}
            </div>
            <div class="party-card">
              <div class="card-title">Account Summary</div>
              <div class="party-info">
                <strong>Status:</strong> 
                ${closing === 0 ? "Settled" : closing > 0 ? '<span class="text-danger bold">Outstanding Payable (Cr)</span>' : '<span class="text-success bold">Debit Balance (Dr)</span>'}
              </div>
              <div class="party-info">
                <strong>Final Balance:</strong> 
                <span class="bold ${closing > 0 ? 'text-danger' : closing < 0 ? 'text-success' : ''}">
                  ${formatMoney(Math.abs(closing))} ${closing > 0 ? "Cr" : closing < 0 ? "Dr" : ""}
                </span>
              </div>
            </div>
          </div>

          <div class="summary-grid">
            <div class="summary-box">
              <div class="summary-label">Opening Balance</div>
              <div class="summary-val">${formatMoney(Math.abs(openingBF))} ${openingBF > 0 ? "Cr" : openingBF < 0 ? "Dr" : ""}</div>
            </div>
            <div class="summary-box debit-accent">
              <div class="summary-label">Total Payments (Dr)</div>
              <div class="summary-val">${formatMoney(currentReceived)}</div>
            </div>
            <div class="summary-box credit-accent">
              <div class="summary-label">Total Purchased (Cr)</div>
              <div class="summary-val text-success">${formatMoney(currentBilled)}</div>
            </div>
            <div class="summary-box highlight">
              <div class="summary-label">Closing Balance</div>
              <div class="summary-val">${formatMoney(Math.abs(closing))} ${closing > 0 ? "Cr" : closing < 0 ? "Dr" : ""}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 25px;">#</th>
                <th style="width: 80px;">Date</th>
                <th>Description</th>
                <th style="width: 80px;">Method</th>
                <th style="width: 75px;">Status</th>
                <th class="num" style="width: 100px;">Debit (Dr)</th>
                <th class="num" style="width: 100px;">Credit (Cr)</th>
                <th class="num" style="width: 120px;">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer-container">
            <div class="footer-stamp">
              <strong>Cheema Traders POS System</strong><br>
              This is a computer-generated statement and does not require a physical stamp. For any discrepancies, contact us within 7 days of statement receipt.
            </div>
            <div class="sig-block">
              <div class="sig-line">Authorized Signature</div>
              <span class="muted">Cheema Traders</span>
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
        supplierId: supplier.id,
        purchaseId: payModal?.purchaseId || null,
        amount,
        method: payMethod,
        notes: payNotes,
        date: payDate,
        type: payModal?.advance ? "advance" : "payment",
      });

      setSuccessData({
        title: payModal?.advance ? "Dr Recorded" : payModal?.general ? "Payment Recorded" : "Purchase Bill Payment Recorded",
        lines: [
          { label: "Supplier", value: supplier.name },
          ...(payModal?.invoiceRef ? [{ label: "Bill Ref", value: payModal.invoiceRef }] : []),
          { label: payModal?.advance ? "Dr Paid" : "Amount Paid", value: `Rs ${amount.toLocaleString()}`, mono: true },
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
      alert("Amount exceeds available supplier advance balance of Rs " + available.toLocaleString());
      return;
    }

    setPaying(true);

    try {
      await recordPayment({
        supplierId: supplier.id,
        purchaseId: null,
        amount: -amount,
        method: payMethod,
        notes: payNotes || "Advance Withdrawal",
        date: payDate,
        type: "payment",
      });

      setSuccessData({
        title: "Withdrawal Processed",
        lines: [
          { label: "Supplier", value: supplier.name },
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
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1b3a1d' }}>{supplier.name}</h2>
                {supplier.phone && <span style={{ fontSize: 13, color: '#6a8f6c' }}>({supplier.phone})</span>}
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#666' }}>Supplier Ledger & Statements</p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6a8f6c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                Current Balance
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: currentBalance > 0 ? '#c62828' : currentBalance < 0 ? '#2e7d32' : '#555' }}>
                {currentBalance === 0 ? 'Rs 0' : currentBalance > 0 ? `Cr Rs ${Math.abs(currentBalance).toLocaleString()}` : `Dr Rs ${Math.abs(currentBalance).toLocaleString()}`}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: '#c8d8c8', border: '1px solid #c8d8c8', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
            {[
              { label: "Total Purchased", val: `Rs ${totalPurchased.toLocaleString()}` },
              { label: "Total Paid", val: `Rs ${totalPaid.toLocaleString()}`, color: "#2e7d32" },
              { label: "Outstanding Cr", val: `Rs ${outstandingPayables.toLocaleString()}`, color: "#c62828" },
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
              {visibleRows.length} transaction{visibleRows.length !== 1 ? "s" : ""}
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
              .supp-bill-list { display: flex; flex-direction: column; gap: 8px; }
              .supp-bill-header, .supp-bill-row {
                display: grid;
                grid-template-columns: 90px minmax(160px, 2fr) 100px 100px 110px 110px 110px 120px 80px;
                align-items: center;
              }
              .supp-bill-header {
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
              .supp-bill-card {
                background: #fff;
                border: 1px solid #c8d8c8;
                border-radius: 4px;
                overflow: hidden;
              }
              .supp-bill-row {
                min-height: 58px;
                padding: 0 16px;
              }
              .supp-bill-row:hover { background: #f9fcf9; }
              .supp-bill-date {
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                font-size: 13px;
                color: #5f7a61;
                font-weight: 600;
              }
              .supp-bill-transaction {
                display: flex;
                flex-direction: column;
                gap: 1px;
                line-height: 1.2;
              }
              .supp-bill-title { font-size: 13px; font-weight: 700; color: #1b3a1d; }
              .supp-bill-sub { font-size: 12px; color: #7a8f7b; }
              .supp-bill-method { font-size: 13px; color: #333; }
              .supp-bill-pill {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.02em;
              }
              .supp-bill-money {
                text-align: right;
                font-family: monospace;
                font-weight: 700;
                font-size: 13px;
              }
              .supp-bill-expanded {
                padding: 16px;
                border-top: 1px solid #c8d8c8;
                background: #fafdfa;
              }
              .supp-bill-details {
                background: #fff;
                border: 1px solid #c8d8c8;
                border-radius: 4px;
                padding: 16px;
              }
            `}
          </style>

          <div style={{ display: "flex", gap: 16, padding: "0 0 16px 0", borderBottom: "1px solid #c8d8c8", marginBottom: 12 }}>
            {[["all", "All Transactions"], ["unpaid", "Unpaid & Partial Bills"], ["paid", "Paid Bills"]].map(([val, label]) => (
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

          <div className="supp-bill-list">
            <div className="supp-bill-header" style={{ borderBottom: '2px solid #c8d8c8' }}>
              <div>Date</div>
              <div>Invoice</div>
              <div>Method</div>
              <div>Status</div>
              <div style={{ textAlign: 'right' }}>Bill</div>
              <div style={{ textAlign: 'right' }}>Paid</div>
              <div style={{ textAlign: 'right' }}>Remaining</div>
              <div style={{ textAlign: 'right' }}>Balance</div>
              <div style={{ textAlign: 'center' }}>Pay</div>
            </div>

            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="supp-bill-card" style={{ padding: 16 }}>
                  <div className="supp-bill-row">
                    <div><div className="skeleton" style={{ width: '70%' }} /></div>
                    <div><div className="skeleton" style={{ width: '90%' }} /></div>
                    <div><div className="skeleton" style={{ width: '40%' }} /></div>
                    <div><div className="skeleton" style={{ width: '50%', marginLeft: 'auto' }} /></div>
                  </div>
                </div>
              ))
            ) : visibleRowsWithBalance.length === 0 ? (
              <div className="supp-bill-card" style={{ textAlign: 'center', padding: 48, color: '#708571' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#5a755c' }}>No transaction history found</div>
              </div>
            ) : visibleRowsWithBalance.map((h, idx) => {
              const dateObj = new Date(h.date + 'T00:00:00');
              const currentMonthYear = dateObj.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

              let prevMonthYear = null;
              if (idx > 0) {
                const prevDateObj = new Date(visibleRowsWithBalance[idx - 1].date + 'T00:00:00');
                prevMonthYear = prevDateObj.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
              }

              const showMonthRow = currentMonthYear !== prevMonthYear;
              const displayDate = dateObj.toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });
              const rowKey = `${h.type}-${h.ref_id}-${idx}`;
              const isPurchase = h.type === 'Purchase';
              const isOpening = h.type === 'Opening';

              return (
                <React.Fragment key={idx}>
                  {showMonthRow && !isOpening && (
                    <div style={{ background: '#f5f8f5', borderLeft: '3px solid #2e7d32', padding: '8px 16px', marginTop: idx === 0 ? 8 : 16, display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#2e7d32', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {currentMonthYear}
                      </span>
                    </div>
                  )}

                  <div className="supp-bill-card">
                    <div
                      className="supp-bill-row"
                      style={{
                        background: expandedRows[rowKey] ? '#f7faf7' : '#fff'
                      }}
                    >
                      <div
                        onClick={isPurchase ? () => toggleRow(rowKey, h) : undefined}
                        className="supp-bill-date"
                        style={{ cursor: isPurchase ? 'pointer' : 'default' }}
                      >
                        {isPurchase ? (expandedRows[rowKey] ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <span style={{ width: 14 }} />}
                        {displayDate}
                      </div>

                      <div className="supp-bill-transaction">
                        <span className="supp-bill-title">
                          {isOpening ? 'Opening Balance' : isPurchase ? 'Purchase Invoice' : h.isWithdrawal ? 'Withdrawal' : 'Payment Made'}
                        </span>
                        {h.reference && !isOpening && <span className="supp-bill-sub">{h.reference}</span>}
                      </div>

                      <div className="supp-bill-method">{h.method || '-'}</div>

                      <div>
                        {!isOpening ? (
                          <span
                            className="supp-bill-pill"
                            style={{
                              background: isPurchase
                                ? (h.payment_status === 'Paid' ? '#eaf3de' : h.payment_status === 'Partial' ? '#faeeda' : '#fcebeb')
                                : h.isWithdrawal ? '#fcebeb' : '#eaf3de',
                              color: isPurchase
                                ? (h.payment_status === 'Paid' ? '#3B6D11' : h.payment_status === 'Partial' ? '#854F0B' : '#A32D2D')
                                : h.isWithdrawal ? '#A32D2D' : '#3B6D11',
                              borderLeft: isPurchase
                                ? (h.payment_status === 'Paid' ? '3px solid #3B6D11' : h.payment_status === 'Partial' ? '3px solid #854F0B' : '3px solid #A32D2D')
                                : h.isWithdrawal ? '3px solid #A32D2D' : '3px solid #3B6D11'
                            }}
                          >
                            {isPurchase ? (h.payment_status || 'Unpaid') : h.isWithdrawal ? 'Withdrawal' : 'Paid'}
                          </span>
                        ) : (
                          <span style={{ fontSize: 13, color: '#888' }}>-</span>
                        )}
                      </div>

                      <div className="supp-bill-money" style={{ color: h.credit > 0 ? '#1b3a1d' : '#888' }}>
                        {h.credit > 0 ? `Rs ${h.credit.toLocaleString()}` : '-'}
                      </div>

                      <div className="supp-bill-money" style={{ color: h.debit > 0 ? '#2e7d32' : '#888' }}>
                        {h.debit > 0 ? `Rs ${h.debit.toLocaleString()}` : '-'}
                      </div>

                      <div className="supp-bill-money" style={{ color: isPurchase ? '#c62828' : '#888' }}>
                        {isPurchase ? `Rs ${Number(h.remaining_amount || 0).toLocaleString()}` : '-'}
                      </div>

                      <div className="supp-bill-money" style={{ fontWeight: 700, color: h.runningBalance > 0 ? '#c62828' : h.runningBalance < 0 ? '#2e7d32' : '#555' }}>
                        Rs {Math.abs(h.runningBalance).toLocaleString()} {h.runningBalance > 0 ? 'Cr' : h.runningBalance < 0 ? 'Dr' : ''}
                      </div>

                      {isPurchase && h.payment_status !== 'Paid' ? (
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button
                            style={{
                              padding: "5px 12px",
                              borderRadius: 4,
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
                                purchaseId: h.ref_id,
                                invoiceRef: h.reference,
                                maxAmount: h.remaining_amount,
                              });
                              setPayAmount(String(h.remaining_amount || ""));
                              setPayNotes("");
                              setPayDate(new Date().toISOString().split("T")[0]);
                            }}
                          >
                            Pay
                          </button>
                        </div>
                      ) : (
                        <div />
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
                          <div className="supp-bill-expanded">
                            {itemsLoading[rowKey] ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0' }}>
                                <div className="skeleton" style={{ width: '45%', height: 14 }} />
                                <div className="skeleton" style={{ width: '85%', height: 14 }} />
                                <div className="skeleton" style={{ width: '65%', height: 14 }} />
                              </div>
                            ) : (
                              <div className="supp-bill-details">
                                <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#1b3a1d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  Purchase Bill Items - Invoice: {h.reference || 'N/A'}
                                </h4>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1.5px solid #e8f0e8', color: '#6a8f6c', fontWeight: 600 }}>
                                      <th style={{ textAlign: 'left', padding: '8px 12px' }}>Product Name</th>
                                      <th style={{ textAlign: 'right', padding: '8px 12px', width: 100 }}>Qty</th>
                                      <th style={{ textAlign: 'right', padding: '8px 12px', width: 140 }}>Unit Cost</th>
                                      <th style={{ textAlign: 'right', padding: '8px 12px', width: 160 }}>Line Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(purchaseItems[rowKey] || []).length === 0 ? (
                                      <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', padding: '12px 0', color: '#999' }}>No items recorded for this purchase</td>
                                      </tr>
                                    ) : (
                                      (purchaseItems[rowKey] || []).map((item, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f4fbf4' }}>
                                          <td style={{ padding: '8px 12px', color: '#333', fontWeight: 500 }}>{item.productName}</td>
                                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#555' }}>{item.quantity}</td>
                                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#555' }}>Rs {item.unitPrice.toLocaleString()}</td>
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
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 16 }}>
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
                  {payModal.withdrawal ? "Withdrawal Entry" : payModal.advance ? "Dr Entry" : payModal.general ? "General Payment" : `Purchase - ${payModal.invoiceRef || ""}`}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#1b3a1d", marginTop: 2 }}>
                  {payModal.withdrawal ? "Supplier Withdrawal" : "Record Payment"}
                </div>
              </div>
              <button onClick={() => setPayModal(null)} style={{ background: "none", border: "none", fontSize: 18, color: "#999", cursor: "pointer" }}>✕</button>
            </div>

            {payModal.withdrawal && (
              <div style={{ fontSize: 12, fontWeight: 600, color: currentBalance < 0 ? "#2e7d32" : "#c62828", marginBottom: 12, background: "#f5f8f5", padding: "8px 12px", borderLeft: "3px solid #2e7d32" }}>
                Available Dr: {currentBalance < 0 ? `(Dr) Rs ${Math.abs(currentBalance).toLocaleString()}` : `Rs 0 (No Dr)`}
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
                  Amount (Rs) {payModal.maxAmount ? `- Max: Rs ${Number(payModal.maxAmount).toLocaleString()}` : ""}
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
                  placeholder={payModal.withdrawal ? "e.g. Return of extra advance payment" : "e.g. Paid via mobile app"}
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