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
  getSettings,
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
  const [businessProfile, setBusinessProfile] = useState({
    business_name: "Cheema Traders",
    business_tagline: "Agro Inputs & Fertilizer Distributors",
    business_address: "Main Bazar, Sahiwal, Pakistan",
    business_phone: "+92 300 7890123",
    business_email: "info@cheematraders.com",
    business_whatsapp: "",
    business_ntn: "",
    business_strn: ""
  });

  useEffect(() => {
    getSettings().then(res => {
      if (res) {
        setBusinessProfile({
          business_name: res.business_name || "Cheema Traders",
          business_tagline: res.business_tagline || "Agro Inputs & Fertilizer Distributors",
          business_address: res.business_address || "Main Bazar, Sahiwal, Pakistan",
          business_phone: res.business_phone || "+92 300 7890123",
          business_email: res.business_email || "info@cheematraders.com",
          business_whatsapp: res.business_whatsapp || "",
          business_ntn: res.business_ntn || "",
          business_strn: res.business_strn || ""
        });
      }
    }).catch(e => console.error("Failed to load business profile settings", e));
  }, []);
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
    writeCell(r, 0, businessProfile.business_name, 's', sTitle);
    r++;
    writeCell(r, 0, businessProfile.business_tagline || "", 's', sSub);
    r++;
    writeCell(r, 0, `${businessProfile.business_address} | Tel: ${businessProfile.business_phone} | Email: ${businessProfile.business_email}`, 's', sContact);
    r++;
    r++; // Empty row

    const earliest = visibleRows[visibleRows.length - 1];
    const openingBF = earliest 
      ? earliest.runningBalance - earliest.balance_change 
      : (fromDate 
          ? (statementRows.find(h => h.date < fromDate)?.runningBalance || Number(supplier.openingBalance || supplier.opening_balance || 0)) 
          : Number(supplier.openingBalance || supplier.opening_balance || 0)
        );
    const closing = visibleRows.length ? visibleRows[0].runningBalance : Number(supplier.openingBalance || supplier.opening_balance || 0);

    // Meta Info Block
    writeCell(r, 0, "Supplier Name:", 's', sMetaLabel);
    writeCell(r, 1, supplier.name, 's', sMetaVal);
    writeCell(r, 2, "", 's', sMetaVal);
    writeCell(r, 3, "", 's', sMetaVal);
    writeCell(r, 4, "Statement Period:", 's', sMetaLabel);
    writeCell(r, 5, `${fromDate || "Inception"} to ${toDate || "Today"}`, 's', sMetaVal);
    writeCell(r, 6, "", 's', sMetaVal);
    r++;

    writeCell(r, 0, "Phone Number:", 's', sMetaLabel);
    writeCell(r, 1, supplier.phone || "-", 's', sMetaVal);
    writeCell(r, 2, "", 's', sMetaVal);
    writeCell(r, 3, "", 's', sMetaVal);
    writeCell(r, 4, "Current Balance:", 's', sMetaLabel);
    const balanceStr = `PKR ${Math.abs(closing).toLocaleString("en-PK", { minimumFractionDigits: 2 })} ${closing > 0 ? "(Cr)" : closing < 0 ? "(Dr)" : ""}`;
    writeCell(r, 5, balanceStr, 's', closing > 0 ? { ...sMetaVal, font: { ...sMetaVal.font, color: { rgb: colors.danger }, bold: true } } : closing < 0 ? { ...sMetaVal, font: { ...sMetaVal.font, color: { rgb: colors.success }, bold: true } } : sMetaVal);
    writeCell(r, 6, "", 's', sMetaVal);
    r++;
    r++; // Empty row

    // Table Headers
    const tableHeaders = ["#", "Date", "Particulars", "Items", "Method", "Products", "Total", "Debit", "Credit", "Balance"];
    tableHeaders.forEach((h, c) => {
      let st = sTableHeader;
      if (c === 0 || c === 1 || c === 3) st = sTableHeaderCenter;
      else if (c >= 6) st = sTableHeaderRight;
      writeCell(r, c, h, 's', st);
    });
    r++;

    const rs = (v) => Number(v || 0).toLocaleString("en-PK");
    const formatProductsExcel = (items) => {
      if (!items || items.length === 0) return "-";
      return items.map(i => `${i.product_name || i.name} (${rs(i.price || i.unit_price || i.rate)}) ×${i.quantity || i.qty}`).join(", ");
    };

    // Table Data
    let sNo = 1;
    if (fromDate) {
      writeCell(r, 0, "BF", 's', sDataCenter);
      writeCell(r, 1, fromDate, 's', sDataCenter);
      writeCell(r, 2, "Balance Brought Forward (B/F)", 's', sData);
      writeCell(r, 3, "-", 's', sDataCenter);
      writeCell(r, 4, "-", 's', sData);
      writeCell(r, 5, "-", 's', sData);
      writeCell(r, 6, "-", 's', sDataCenter);
      writeCell(r, 7, openingBF < 0 ? Math.abs(openingBF) : 0, 'n', sDataNum);
      writeCell(r, 8, openingBF > 0 ? openingBF : 0, 'n', sDataNum);
      writeCell(r, 9, openingBF, 'n', openingBF > 0 ? sDataCr : openingBF < 0 ? sDataDr : sDataNum);
      r++;
    }

    const currentBilled = visibleRows.reduce((sum, h) => sum + Number(h.credit || 0), 0);
    const currentPaid = visibleRows.reduce((sum, h) => sum + Number(h.debit || 0), 0);

    [...visibleRows].reverse().forEach((h) => {
      const isPurchase = h.type === 'Purchase';
      const isOpening = h.type === 'Opening';
      const desc = isOpening 
        ? 'Opening Balance' 
        : isPurchase 
          ? `Purchase Bill${h.reference ? ` (${h.reference})` : ""}` 
          : h.type === 'Journal'
            ? `Journal Entry${h.reference ? ` (${h.reference})` : ""}`
            : h.isWithdrawal
              ? `Refund/Withdrawal${h.reference ? ` (${h.reference})` : ""}`
              : `Payment Made${h.reference ? ` (${h.reference})` : ""}`;

      const itemsCount = isPurchase && h.item_count > 0 ? h.item_count : "-";
      const productsStr = isPurchase ? formatProductsExcel(h.items) : "-";
      
      writeCell(r, 0, sNo++, 'n', sDataCenter);
      writeCell(r, 1, h.date, 's', sDataCenter);
      writeCell(r, 2, desc, 's', sData);
      writeCell(r, 3, itemsCount, 's', sDataCenter);
      writeCell(r, 4, h.method || "-", 's', sData);
      writeCell(r, 5, productsStr, 's', sData);
      writeCell(r, 6, isPurchase ? h.total_amount : "-", isPurchase ? 'n' : 's', isPurchase ? sDataNum : sDataCenter);
      writeCell(r, 7, h.debit, 'n', sDataNum);
      writeCell(r, 8, h.credit, 'n', sDataNum);
      writeCell(r, 9, h.runningBalance, 'n', h.runningBalance > 0 ? sDataCr : h.runningBalance < 0 ? sDataDr : sDataNum);
      r++;
    });

    // Totals Row
    writeCell(r, 0, "", 's', sTotalLabel);
    writeCell(r, 1, "", 's', sTotalLabel);
    writeCell(r, 2, "", 's', sTotalLabel);
    writeCell(r, 3, "", 's', sTotalLabel);
    writeCell(r, 4, "", 's', sTotalLabel);
    writeCell(r, 5, "", 's', sTotalLabel);
    writeCell(r, 6, "TOTAL PERIOD TRANSACTIONS", 's', sTotalLabel);
    writeCell(r, 7, currentPaid, 'n', sTotalNum);
    writeCell(r, 8, currentBilled, 'n', sTotalNum);
    writeCell(r, 9, closing, 'n', sTotalNum);
    r++;

    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } },
      { s: { r: 4, c: 1 }, e: { r: 4, c: 4 } },
      { s: { r: 4, c: 8 }, e: { r: 4, c: 9 } },
      { s: { r: 5, c: 1 }, e: { r: 5, c: 4 } },
      { s: { r: 5, c: 8 }, e: { r: 5, c: 9 } },
      { s: { r: r - 1, c: 0 }, e: { r: r - 1, c: 6 } }
    ];

    ws["!cols"] = [
      { wch: 8 },
      { wch: 12 },
      { wch: 30 },
      { wch: 8 },
      { wch: 15 },
      { wch: 45 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 18 }
    ];

    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: 9 } });

    XLSX.utils.book_append_sheet(wb, ws, "Account Statement");
    XLSX.writeFile(wb, `Supplier_Statement_${supplier.name.replace(/\s+/g, '_')}.xlsx`);
  };

  const handlePrintStatement = async () => {
    let activeProfile = { ...businessProfile };
    try {
      const freshSettings = await getSettings();
      if (freshSettings) {
        activeProfile = {
          business_name: freshSettings.business_name || "Cheema Traders",
          business_tagline: freshSettings.business_tagline || "Agro Inputs & Fertilizer Distributors",
          business_address: freshSettings.business_address || "Main Bazar, Sahiwal, Pakistan",
          business_phone: freshSettings.business_phone || "+92 300 7890123",
          business_email: freshSettings.business_email || "info@cheematraders.com",
          business_whatsapp: freshSettings.business_whatsapp || "",
          business_ntn: freshSettings.business_ntn || "",
          business_strn: freshSettings.business_strn || ""
        };
      }
    } catch (e) {
      console.error("Failed to load fresh settings", e);
    }

    const rs = (v) => Number(v || 0).toLocaleString("en-PK");

    const formatProducts = (items) => {
      if (!items || items.length === 0) return "&mdash;";
      return items.map(i => 
        `${i.product_name || i.name} (${rs(i.price || i.unit_price || i.rate)}) &times;${i.quantity || i.qty}`
      ).join(", ");
    };

    const currentBilled = visibleRows.reduce((s, h) => s + Number(h.credit || 0), 0);
    const currentPaid = visibleRows.reduce((s, h) => s + Number(h.debit || 0), 0);

    const earliest = visibleRows[visibleRows.length - 1];
    const openingBF = earliest 
      ? earliest.runningBalance - earliest.balance_change 
      : (fromDate 
          ? (statementRows.find(h => h.date < fromDate)?.runningBalance || Number(supplier.openingBalance || supplier.opening_balance || 0)) 
          : Number(supplier.openingBalance || supplier.opening_balance || 0)
        );
    const closing = visibleRows.length ? visibleRows[0].runningBalance : Number(supplier.openingBalance || supplier.opening_balance || 0);

    let rowNum = 0;
    
    let rowsHtml = "";
    if (fromDate) {
      rowsHtml += `
        <tr>
          <td class="c"></td>
          <td>${new Date(fromDate + "T00:00:00").toLocaleDateString("en-PK", { day: "2-digit", month: "short" })}</td>
          <td><strong>Balance Brought Forward (B/F)</strong></td>
          <td class="c">&mdash;</td>
          <td>&mdash;</td>
          <td class="products">&mdash;</td>
          <td class="r">&mdash;</td>
          <td class="r mono">${openingBF < 0 ? rs(Math.abs(openingBF)) : "&mdash;"}</td>
          <td class="r mono">${openingBF > 0 ? rs(openingBF) : "&mdash;"}</td>
          <td class="r mono">${openingBF > 0 ? "(Cr)" : openingBF < 0 ? "(Dr)" : ""} ${rs(Math.abs(openingBF || 0))}</td>
        </tr>
      `;
    }

    rowsHtml += [...visibleRows].reverse().map((h, idx) => {
      const isOpening = h.type === 'Opening' || h.reference === 'opening';
      if (!isOpening) rowNum++;

      const isPurchase = h.type === 'Purchase';
      const evenClass = idx % 2 === 1 ? ' class="even"' : '';
      const drVal = h.debit > 0 ? rs(h.debit) : "&mdash;";
      const crVal = h.credit > 0 ? rs(h.credit) : "&mdash;";
      const balSign = h.runningBalance > 0 ? "(Cr)" : h.runningBalance < 0 ? "(Dr)" : "";
      const balVal = `${balSign} ${rs(Math.abs(h.runningBalance || 0))}`;

      const d = new Date(h.date + "T00:00:00");
      const shortDate = isNaN(d.getTime()) ? h.date : 
        `${String(d.getDate()).padStart(2,'0')} ${d.toLocaleString('en-US',{month:'short'})}`;

      const subLine = h.reference && h.reference !== 'opening' 
        ? h.reference 
        : (h.notes || h.type || '');

      const descTitle = isOpening 
        ? 'Opening Balance' 
        : (isPurchase ? 'Purchase Bill' : h.type === 'Journal' ? 'Journal Entry' : h.isWithdrawal ? 'Refund/Withdrawal' : 'Payment Made');

      return `
        <tr${evenClass}>
          <td class="c">${isOpening ? '' : rowNum}</td>
          <td>${shortDate}</td>
          <td><strong>${descTitle}</strong><br>
              <span style="font-size:7.5px;color:#555;">${isOpening ? '' : subLine}</span></td>
          <td class="c">${isPurchase && h.item_count > 0 ? h.item_count : '&mdash;'}</td>
          <td>${isOpening ? '&mdash;' : (h.method || '&mdash;')}</td>
          <td class="products">${isPurchase ? formatProducts(h.items) : '&mdash;'}</td>
          <td class="r mono">${isPurchase ? rs(h.total_amount) : '&mdash;'}</td>
          <td class="r mono">${drVal}</td>
          <td class="r mono">${crVal}</td>
          <td class="r mono">${balVal}</td>
        </tr>
      `;
    }).join("");

    const html = `
<html>
<head>
<title>Supplier Statement - ${supplier.name}</title>
<style>
@page { size: A4 landscape; margin: 10mm 12mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 10px; color: #000; background: #fff; padding: 0; }

.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 12px; }
.brand { font-size: 18px; font-weight: 700; color: #000; }
.tagline { font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; color: #444; margin-top: 1px; }
.contact { font-size: 8px; color: #555; margin-top: 5px; line-height: 1.5; }
.doc-title { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; text-align: right; }
.doc-meta { font-size: 8px; color: #444; line-height: 1.6; text-align: right; margin-top: 4px; }

.info-row { display: flex; border: 1px solid #000; margin-bottom: 8px; }
.info-cell { padding: 6px 10px; flex: 1; border-right: 1px solid #000; }
.info-cell:last-child { border-right: none; }
.info-label { font-size: 7px; text-transform: uppercase; letter-spacing: 0.06em; color: #555; font-weight: 700; margin-bottom: 2px; }
.info-value { font-size: 11px; font-weight: 700; }
.info-sub { font-size: 8px; color: #444; margin-top: 1px; }

.summary-row { display: flex; gap: 0; border: 1px solid #000; margin-bottom: 10px; }
.summary-cell { flex: 1; padding: 6px 10px; border-right: 1px solid #000; }
.summary-cell:last-child { border-right: none; }
.summary-label { font-size: 7px; text-transform: uppercase; letter-spacing: 0.06em; color: #555; font-weight: 700; }
.summary-value { font-size: 12px; font-weight: 700; margin-top: 2px; }

table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead tr { background: #000; color: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
th { padding: 5px 6px; font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; border: 1px solid #000; text-align: left; white-space: nowrap; }
th.r { text-align: right; }
th.c { text-align: center; }
td { padding: 4px 6px; border: 1px solid #ccc; font-size: 9px; vertical-align: top; }
td.r { text-align: right; }
td.c { text-align: center; }
td.mono { font-family: 'Courier New', monospace; font-size: 8.5px; }
td.products { font-size: 8px; color: #333; line-height: 1.3; }

tr.even td { background: #f5f5f5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
tr.month-header td { background: #e8e8e8; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; border-top: 1.5px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 4px 6px; }
tr.totals td { background: #e0e0e0 !important; font-weight: 700; font-size: 9px; border-top: 1.5px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
tr.closing td { background: #000 !important; color: #fff !important; font-weight: 700; font-size: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

.footer { margin-top: 16px; border-top: 1.5px solid #000; padding-top: 10px; display: flex; justify-content: space-between; align-items: flex-end; }
.footer-note { font-size: 7px; color: #555; line-height: 1.5; max-width: 340px; }
.sig-block { text-align: center; border-top: 1px solid #000; padding-top: 5px; font-size: 8px; font-weight: 700; min-width: 160px; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="brand">${activeProfile.business_name}</div>
    <div class="tagline">${activeProfile.business_tagline}</div>
    <div class="contact">${activeProfile.business_address}<br>Tel: ${activeProfile.business_phone} &nbsp;|&nbsp; ${activeProfile.business_email}</div>
  </div>
  <div>
    <div class="doc-title">Supplier Statement</div>
    <div class="doc-meta">
      Generated: ${new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}<br>
      Period: ${fromDate ? new Date(fromDate).toLocaleDateString("en-PK", {day:"2-digit", month:"long", year:"numeric"}) : "Inception"} &mdash; ${toDate ? new Date(toDate).toLocaleDateString("en-PK", {day:"2-digit", month:"long", year:"numeric"}) : "Today"}
    </div>
  </div>
</div>

<div class="info-row">
  <div class="info-cell">
    <div class="info-label">Statement For</div>
    <div class="info-value">${supplier.name}</div>
    <div class="info-sub">Supplier Account &nbsp;|&nbsp; A/P Subledger${supplier.phone ? " &nbsp;|&nbsp; " + supplier.phone : ""}</div>
  </div>
  <div class="info-cell">
    <div class="info-label">Current Balance</div>
    <div class="info-value">${closing === 0 ? "Rs. 0.00 — Settled" : closing > 0 ? "Cr Rs. " + rs(Math.abs(closing)) : "Dr Rs. " + rs(Math.abs(closing))}</div>
    <div class="info-sub">${closing > 0 ? "Payable — amount we owe to supplier" : closing < 0 ? "Advance paid to supplier" : "Account fully settled"}</div>
  </div>
</div>

<div class="summary-row">
  <div class="summary-cell">
    <div class="summary-label">Opening Balance</div>
    <div class="summary-value">${rs(Math.abs(openingBF))} ${openingBF > 0 ? "Cr" : openingBF < 0 ? "Dr" : ""}</div>
  </div>
  <div class="summary-cell">
    <div class="summary-label">Total Debits (Dr)</div>
    <div class="summary-value">${rs(currentPaid)}</div>
  </div>
  <div class="summary-cell">
    <div class="summary-label">Total Credits (Cr)</div>
    <div class="summary-value">${rs(currentBilled)}</div>
  </div>
  <div class="summary-cell" style="background:#000; color:#fff;">
    <div class="summary-label" style="color:#bbb;">Closing Balance</div>
    <div class="summary-value">${rs(Math.abs(closing))} ${closing > 0 ? "Cr" : closing < 0 ? "Dr" : ""}</div>
  </div>
</div>

<table>
<colgroup>
  <col style="width: 28px;">
  <col style="width: 62px;">
  <col style="width: 120px;">
  <col style="width: 38px;">
  <col style="width: 70px;">
  <col>
  <col style="width: 72px;">
  <col style="width: 72px;">
  <col style="width: 72px;">
  <col style="width: 82px;">
</colgroup>
<thead>
  <tr>
    <th class="c">#</th>
    <th>Date</th>
    <th>Particulars</th>
    <th class="c">Items</th>
    <th>Method</th>
    <th>Products</th>
    <th class="r">Total</th>
    <th class="r">DR</th>
    <th class="r">CR</th>
    <th class="r">Balance</th>
  </tr>
</thead>
<tbody>
  ${rowsHtml}
  <tr class="totals">
    <td colspan="7" class="r">TOTALS FOR PERIOD</td>
    <td class="r mono">${rs(currentPaid)}</td>
    <td class="r mono">${rs(currentBilled)}</td>
    <td></td>
  </tr>
  <tr class="closing">
    <td colspan="7" class="r">CLOSING BALANCE</td>
    <td colspan="3" class="c mono">${rs(Math.abs(closing))} ${closing > 0 ? "Cr" : closing < 0 ? "Dr" : ""}</td>
  </tr>
</tbody>
</table>

<div class="footer">
  <div class="footer-note">
    <strong>${activeProfile.business_name} POS System</strong><br>
    Computer-generated statement — no physical stamp required.<br>
    For discrepancies contact us within 7 days of statement receipt.
  </div>
  <div class="sig-block">
    Authorized Signature<br>
    <span style="font-weight:400;">${activeProfile.business_name}</span>
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