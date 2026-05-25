import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, PlusCircle, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { listSuppliers, saveSupplier, getSupplierHistory, getPurchaseItems, deleteSupplier } from "../lib/posApi";
import WarningNotification from "../components/Warningnotification";

export default function SuppliersPage() {
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const loadSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listSuppliers();
      if (res && res.suppliers) {
        setSuppliers(res.suppliers);
      }
    } catch (e) {
      console.error("Failed to load suppliers", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const handleOpenPanel = () => {
    setIsAddPanelOpen(true);
  };

  const handleSaved = () => {
    setIsAddPanelOpen(false);
    loadSuppliers();
  };

  const handleDeleteSupplier = async (id) => {
    try {
      await deleteSupplier(id);
      loadSuppliers();
    } catch (e) {
      console.error("Failed to delete supplier", e);
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
              <p style={st.subtitle}>Vendor and Payable Management</p>
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
          <SupplierHistoryView supplier={selectedSupplier} />
        ) : (
          <SupplierListView suppliers={suppliers} loading={loading} onSelectHistory={setSelectedSupplier} onDelete={handleDeleteSupplier} />
        )}
      </div>

      <AddSupplierPanel isOpen={isAddPanelOpen} onClose={() => setIsAddPanelOpen(false)} onSaved={handleSaved} />
    </div>
  );
}

function AddSupplierPanel({ isOpen, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [salesOfficerPhone, setSalesOfficerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [balanceType, setBalanceType] = useState("credit");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setName(""); setPhone(""); setSalesOfficerPhone(""); setAddress(""); setOpeningBalance(""); setBalanceType("credit"); setErrorMsg("");
    }
  }, [isOpen]);

  const handleSave = async () => {
    setErrorMsg("");
    if (!name) return setErrorMsg("Name is required");
    setSaving(true);
    try {
      let finalBal = Number(openingBalance || 0);
      if (balanceType === 'none') {
          finalBal = 0;
      } else if (balanceType === 'debit') {
          finalBal = -Math.abs(finalBal);
      } else {
          finalBal = Math.abs(finalBal);
      }
      
      await saveSupplier({ name, phone, salesOfficerPhone, address, openingBalance: finalBal });
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
              <h2 style={st.panelTitle}>Add Supplier</h2>
              <button style={st.closeBtn} onClick={onClose}>✕</button>
            </div>

            <div style={st.panelBody}>
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Supplier Name *</label>
                <input style={st.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. FMC Corporation" />
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
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Opening Balance (Rs)</label>
                <input style={st.input} type="number" placeholder="0" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} />
              </div>
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Balance Type</label>
                <select style={st.input} value={balanceType} onChange={e => setBalanceType(e.target.value)}>
                  <option value="none">Zero Balance</option>
                  <option value="credit">We owe them (Credit)</option>
                  <option value="debit">They owe us (Advance/Debit)</option>
                </select>
                <span style={st.fieldHint}>Credit = you owe them money. Debit = they owe you (advanced payment).</span>
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

function SupplierListView({ suppliers, loading, onSelectHistory, onDelete }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [warnData, setWarnData] = useState(null);

  const q = search.toLowerCase();
  const filtered = suppliers.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(q) || (s.phone || "").includes(q);
    if (!matchesSearch) return false;
    
    // For suppliers, current_balance > 0 means Credit (we owe them). < 0 means Debit (they owe us).
    if (filter === "credit") return s.current_balance > 0;
    if (filter === "debit") return s.current_balance < 0;
    return true;
  });

  const totalPayables = suppliers.reduce((sum, s) => s.current_balance > 0 ? sum + s.current_balance : sum, 0);
  const totalAdvances = suppliers.reduce((sum, s) => s.current_balance < 0 ? sum + Math.abs(s.current_balance) : sum, 0);

  return (
    <>
      <div style={st.inlineStatsRow}>
          <div style={st.inlineStatItem}>
              <span style={{ ...st.inlineStatDot, background: '#c62828' }} />
              <span style={st.inlineStatLabel}>Total Market Payables:</span>
              <strong style={{ ...st.inlineStatValue, color: '#c62828' }}>
                  Rs. {totalPayables.toLocaleString()}
              </strong>
          </div>
          <div style={st.inlineStatDivider} />
          <div style={st.inlineStatItem}>
              <span style={{ ...st.inlineStatDot, background: '#2e7d32' }} />
              <span style={st.inlineStatLabel}>Total Advances Given:</span>
              <strong style={{ ...st.inlineStatValue, color: '#2e7d32' }}>
                  Rs. {totalAdvances.toLocaleString()}
              </strong>
          </div>
      </div>

      <div style={st.tableWrap}>
          <div style={st.tableSearch}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
                <Search size={14} style={{ color: '#708571' }} />
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search suppliers by name or phone..."
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
                  style={{ ...st.navBtn, ...(filter === "credit" ? st.navBtnActive : {}) }}
                  onClick={() => setFilter("credit")}
                >
                  Credits (We owe them)
                </button>
                <button
                  style={{ ...st.navBtn, ...(filter === "debit" ? st.navBtnActive : {}) }}
                  onClick={() => setFilter("debit")}
                >
                  Debits (Advances given)
                </button>
              </div>
          </div>

          <div style={st.tableContainer}>
              <style>
                  {`
                  .supp-table th,
                  .supp-table td { vertical-align: middle; }
                  .supp-table th { padding: 12px 20px; font-size: 12px; font-weight: 600; color: #6a8f6c; text-transform: uppercase; border-bottom: 2px solid #e8f0e8; }
                  .supp-table td { padding: 16px 20px; border-bottom: 1px solid #f2f7f2; }
                  .supp-table tbody tr { transition: background 0.15s; }
                  .supp-table tbody tr:hover { background: #f9fcf9; }
                  
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
              <table style={st.table} className="supp-table">
                  <thead>
                      <tr>
                          <th style={{ flex: 2 }}>Supplier Name</th>
                          <th style={{ width: 140 }}>Phone</th>
                          <th style={{ width: 140 }}>Last Purchase</th>
                          <th style={{ textAlign: 'right', width: 180 }}>Current Balance</th>
                          <th style={{ width: 100, textAlign: 'center' }}>Action</th>
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
                                  <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
                                  <div style={{ fontSize: 15, fontWeight: 500, color: '#5a755c' }}>No suppliers found</div>
                                  <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your filters or search query.</div>
                              </td>
                          </tr>
                      ) : filtered.map((s) => {
                          const bal = s.current_balance;
                          return (
                              <tr key={s.id}>
                                  <td style={{ fontSize: 14, fontWeight: 600, color: '#1b3a1d' }}>{s.name}</td>
                                  <td style={{ fontSize: 14, color: '#555' }}>{s.phone || "-"}</td>
                                  <td style={{ fontSize: 13, color: '#555' }}>{s.last_purchase || "-"}</td>
                                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#555' }}>
                                      {bal === 0 ? 'Rs 0' : bal > 0 ? `Due Rs ${Math.abs(bal).toLocaleString()}` : `Advance Rs ${Math.abs(bal).toLocaleString()}`}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                      <button style={st.actionBtn} onClick={() => onSelectHistory(s)}>Statement</button>
                                      <button
                                         style={{ ...st.actionBtn, background: '#ffebee', color: '#c62828', border: '1px solid #ffcdd2' }}
                                         onClick={(e) => {
                                           e.stopPropagation();
                                           const bal = s.current_balance || 0;
                                           if (bal !== 0) {
                                             const formattedType = bal > 0 ? "Credit (We owe them)" : "Debit (They owe us)";
                                             const formattedAmount = Math.abs(bal).toLocaleString();
                                             setWarnData({
                                               title: `Delete Supplier: ${s.name}?`,
                                               lines: [
                                                 { label: "Supplier Name", value: s.name },
                                                 { label: "Action", value: "This will remove the supplier from dropdown select and active lists." }
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
                                                       { label: "Warning", value: "Deleting active suppliers with outstanding balances is discouraged. Are you absolutely sure you want to proceed?" }
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
                                                 { label: "Action", value: "This will remove the supplier from dropdown select and active lists." }
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

function SupplierHistoryView({ supplier }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState({});
  const [purchaseItems, setPurchaseItems] = useState({});
  const [itemsLoading, setItemsLoading] = useState({});

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

  useEffect(() => {
    async function load() {
      try {
        const res = await getSupplierHistory(supplier.id);
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
  }, [supplier.id]);

  const bal = supplier.current_balance;

    const statementRows = history
      .filter(h => h.type === 'Purchase')
      .map(h => ({
        ...h,
        paid_amount: h.paid_amount || 0,
        remaining_amount:
          h.remaining_amount ??
          Math.max(0, (h.total_amount || 0) - (h.paid_amount || 0))
      }));

  return (
    <>
      <div style={st.cardsGrid}>
          <div style={{ ...st.card, borderLeft: `3px solid ${bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#1b3a1d'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={st.cardLabel}>{supplier.name} - Account Statement</div>
                  <button style={st.secondaryBtn} onClick={() => window.print()}>Print Statement</button>
              </div>
              <div style={{ ...st.cardAmount, color: bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#1b3a1d', marginTop: 10 }}>
                  Rs. {Math.abs(bal).toLocaleString()}
              </div>
              <div style={st.cardHint}>
                  Phone: {supplier.phone || "-"} 
                  {supplier.salesOfficerPhone && <span style={{ marginLeft: 16 }}>Sales Rep: {supplier.salesOfficerPhone}</span>}
              </div>
          </div>
      </div>

      <div style={st.tableWrap}>
          <div style={st.tableContainer}>
              <style>
                  {`
                  .bill-list { display: flex; flex-direction: column; gap: 8px; }
                  .bill-header, .bill-row {
                    display: grid;
                    grid-template-columns: 90px minmax(180px, 2fr) 110px 110px 120px 120px 120px;
                    align-items: center;
                  }
                  .bill-header {
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
                  .bill-card {
                    background: #fff;
                    border: 1px solid #e8f0e8;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.04);
                    overflow: hidden;
                  }
                  .bill-row {
                    min-height: 58px;
                    padding: 0 16px;
                    cursor: default;
                  }
                  .bill-row:hover { background: #f9fcf9; }
                  .bill-date {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    color: #5f7a61;
                    font-weight: 600;
                  }
                  .bill-invoice {
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                    line-height: 1.2;
                  }
                  .bill-invoice-title { font-size: 13px; font-weight: 700; color: #1b3a1d; }
                  .bill-invoice-sub { font-size: 12px; color: #7a8f7b; }
                  .bill-method { font-size: 13px; color: #333; }
                  .bill-pill {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 5px 10px;
                    border-radius: 999px;
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.02em;
                  }
                  .bill-money {
                    text-align: right;
                    font-family: monospace;
                    font-weight: 700;
                    font-size: 13px;
                  }
                  .bill-expanded {
                    padding: 16px;
                    border-top: 1px solid #e8f0e8;
                    background: #fafdfa;
                  }
                  .bill-items {
                    background: #fff;
                    border: 1px solid #e8f0e8;
                    border-radius: 8px;
                    padding: 16px;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.01);
                  }
                  .bill-items-header, .bill-item-row {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) 100px 140px 160px;
                    gap: 12px;
                    align-items: center;
                  }
                  .bill-items-header {
                    padding-bottom: 8px;
                    margin-bottom: 8px;
                    border-bottom: 1px solid #e8f0e8;
                    color: #6a8f6c;
                    font-size: 12px;
                    font-weight: 700;
                    text-transform: uppercase;
                  }
                  .bill-item-row {
                    padding: 8px 0;
                    border-bottom: 1px solid #f4fbf4;
                  }
                  .bill-summary {
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: 12px;
                    padding: 10px 0;
                    border-top: 1px solid #e8f0e8;
                  }
                  .bill-summary-label {
                    text-align: right;
                    color: #555;
                    font-weight: 700;
                  }
                  .bill-summary-value {
                    text-align: right;
                    font-family: monospace;
                    font-weight: 700;
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
                      .supp-bill-list, .supp-bill-list * { visibility: visible; }
                      .supp-bill-list { position: absolute; left: 0; top: 0; width: 100%; }
                  }
                  `}
              </style>
              <div className="bill-list supp-bill-list">
                  <div className="bill-header">
                      <div>Date</div>
                      <div>Invoice</div>
                      <div>Method</div>
                      <div>Status</div>
                      <div style={{ textAlign: 'right' }}>Bill</div>
                      <div style={{ textAlign: 'right' }}>Paid</div>
                      <div style={{ textAlign: 'right' }}>Remaining</div>
                  </div>

                  {loading ? (
                      [...Array(4)].map((_, i) => (
                          <div key={i} className="bill-card" style={{ padding: 16 }}>
                              <div className="bill-row">
                                  <div><div className="skeleton" style={{ width: '70%' }} /></div>
                                  <div><div className="skeleton" style={{ width: '90%' }} /></div>
                                  <div><div className="skeleton" style={{ width: '40%' }} /></div>
                                  <div><div className="skeleton" style={{ width: '50%' }} /></div>
                                  <div><div className="skeleton" style={{ width: '60%', marginLeft: 'auto' }} /></div>
                                  <div><div className="skeleton" style={{ width: '60%', marginLeft: 'auto' }} /></div>
                                  <div><div className="skeleton" style={{ width: '60%', marginLeft: 'auto' }} /></div>
                              </div>
                          </div>
                      ))
                  ) : statementRows.length === 0 ? (
                      <div className="bill-card" style={{ textAlign: 'center', padding: 48, color: '#708571' }}>
                          <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
                          <div style={{ fontSize: 15, fontWeight: 500, color: '#5a755c' }}>No purchase bills found</div>
                      </div>
                  ) : statementRows.map((h, idx) => {
                      const dateObj = new Date(h.date + 'T00:00:00');
                      const currentMonthYear = dateObj.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

                      let prevMonthYear = null;
                      if (idx > 0) {
                          const prevDateObj = new Date(statementRows[idx - 1].date + 'T00:00:00');
                          prevMonthYear = prevDateObj.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
                      }

                      const showMonthRow = currentMonthYear !== prevMonthYear;
                      const displayDate = dateObj.toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });
                      const rowKey = `${h.type}-${h.ref_id}-${idx}`;

                      return (
                          <React.Fragment key={idx}>
                              {showMonthRow && (
                                  <div className="bill-header" style={{ marginTop: idx === 0 ? 8 : 16 }}>
                                      <div style={{ gridColumn: '1 / -1', padding: 0, border: 'none', background: 'transparent', textTransform: 'uppercase' }}>
                                          {currentMonthYear}
                                      </div>
                                  </div>
                              )}

                              <div className="bill-card">
                                  <div
                                    className="bill-row"
                                    style={{
                                      background: expandedRows[rowKey] ? '#f7faf7' : '#fff',
                                      borderRadius: expandedRows[rowKey] ? '10px 10px 0 0' : '10px'
                                    }}
                                  >
                                      <div onClick={() => toggleRow(rowKey, h)} className="bill-date">
                                          {expandedRows[rowKey] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                          {displayDate}
                                      </div>

                                      <div className="bill-invoice">
                                          <span className="bill-invoice-title">{h.reference || 'Purchase Bill'}</span>
                                          <span className="bill-invoice-sub">{purchaseItems[rowKey]?.length || 0} items</span>
                                      </div>

                                      <div className="bill-method">{h.method || '-'}</div>

                                      <div>
                                          <span
                                            className="bill-pill"
                                            style={{
                                              background:
                                                h.payment_status === 'Paid'
                                                  ? '#e8f5e9'
                                                  : h.payment_status === 'Partial'
                                                  ? '#fff3e0'
                                                  : '#ffebee',
                                              color:
                                                h.payment_status === 'Paid'
                                                  ? '#2e7d32'
                                                  : h.payment_status === 'Partial'
                                                  ? '#ef6c00'
                                                  : '#c62828'
                                            }}
                                          >
                                              {h.payment_status || 'Unpaid'}
                                          </span>
                                      </div>

                                      <div className="bill-money">Rs {Number(h.total_amount || 0).toLocaleString()}</div>
                                      <div className="bill-money" style={{ color: '#2e7d32' }}>Rs {Number(h.paid_amount || 0).toLocaleString()}</div>
                                      <div className="bill-money" style={{ color: (h.remaining_amount || 0) > 0 ? '#c62828' : '#2e7d32' }}>Rs {Number(h.remaining_amount || 0).toLocaleString()}</div>
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
                                              <div className="bill-expanded">
                                                  {itemsLoading[rowKey] ? (
                                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0' }}>
                                                          <div className="skeleton" style={{ width: '45%', height: 14 }} />
                                                          <div className="skeleton" style={{ width: '85%', height: 14 }} />
                                                          <div className="skeleton" style={{ width: '65%', height: 14 }} />
                                                      </div>
                                                  ) : (
                                                      <div className="bill-items">
                                                          <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#1b3a1d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                              Purchase Bill Items - Invoice: {h.reference || 'N/A'}
                                                          </h4>

                                                          <div className="bill-items-header">
                                                              <div>Product Name</div>
                                                              <div style={{ textAlign: 'right' }}>Qty</div>
                                                              <div style={{ textAlign: 'right' }}>Unit Cost</div>
                                                              <div style={{ textAlign: 'right' }}>Line Total</div>
                                                          </div>

                                                          {(purchaseItems[rowKey] || []).length === 0 ? (
                                                              <div style={{ textAlign: 'center', padding: '12px 0', color: '#999' }}>No items recorded for this purchase</div>
                                                          ) : (
                                                              (purchaseItems[rowKey] || []).map((item, itemIndex) => (
                                                                  <div key={itemIndex} className="bill-item-row">
                                                                      <div style={{ color: '#333', fontWeight: 500 }}>{item.productName}</div>
                                                                      <div style={{ textAlign: 'right', fontFamily: 'monospace', color: '#555' }}>{item.quantity}</div>
                                                                      <div style={{ textAlign: 'right', fontFamily: 'monospace', color: '#555' }}>Rs {item.unitPrice.toLocaleString()}</div>
                                                                      <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1b3a1d' }}>Rs {item.lineTotal.toLocaleString()}</div>
                                                                  </div>
                                                              ))
                                                          )}

                                                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, marginTop: 16, borderTop: '1.5px solid #e8f0e8', paddingTop: 16 }}>
                                                               {/* Left side: Notes / Memo */}
                                                               <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                   {((h.type === 'Purchase' && h.notes) || (h.type === 'Payment' && h.reference)) ? (
                                                                       <>
                                                                           <span style={{ fontSize: 11, fontWeight: 700, color: '#6a8f6c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes / Memo</span>
                                                                           <div style={{ fontSize: 13, color: '#444', fontStyle: 'italic', background: '#f9fcf9', padding: '12px 16px', borderRadius: 8, border: '1px dashed #cde0cd', lineHeight: '1.5', minHeight: 60 }}>
                                                                               {h.type === 'Purchase' ? h.notes : h.reference}
                                                                           </div>
                                                                       </>
                                                                   ) : (
                                                                       <div style={{ color: '#999', fontSize: 12, fontStyle: 'italic', marginTop: 8 }}>
                                                                           No additional notes or remarks for this transaction.
                                                                       </div>
                                                                   )}
                                                               </div>

                                                               {/* Right side: Totals Summary */}
                                                               <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                   <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid #f0f5f0', paddingBottom: 6 }}>
                                                                       <span style={{ color: '#555', fontWeight: 600 }}>Bill Subtotal:</span>
                                                                       <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#c62828' }}>Rs {Math.abs(h.total_amount || 0).toLocaleString()}</span>
                                                                   </div>
                                                                   <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid #f0f5f0', paddingBottom: 6 }}>
                                                                       <span style={{ color: '#555', fontWeight: 600 }}>Paid Amount:</span>
                                                                       <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2e7d32' }}>Rs {Math.abs(h.paid_amount || 0).toLocaleString()}</span>
                                                                   </div>
                                                                   <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1.5px solid #e8f0e8', paddingBottom: 6 }}>
                                                                       <span style={{ color: '#555', fontWeight: 600 }}>Remaining:</span>
                                                                       <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#c62828' }}>Rs {Math.abs(h.remaining_amount || h.total_amount || 0).toLocaleString()}</span>
                                                                   </div>
                                                                   <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 4 }}>
                                                                       <span style={{ color: '#555', fontWeight: 600 }}>Date:</span>
                                                                       <span style={{ fontWeight: 600, color: '#555' }}>
                                                                           {new Date(h.date + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                                       </span>
                                                                   </div>
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
    inlineStatsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        background: '#fff',
      padding: '14px 20px',
        borderRadius: 12,
        border: '1px solid #e8f0e8',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        marginBottom: 20,
      width: '100%',
      justifyContent: 'space-between',
      flexWrap: 'wrap'
    },
    inlineStatItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
    },
    inlineStatDot: {
        width: 8,
        height: 8,
        borderRadius: '50%'
    },
    inlineStatLabel: {
        fontSize: 13,
        fontWeight: 600,
        color: '#5a755c'
    },
    inlineStatValue: {
        fontSize: 15,
        fontWeight: 700,
        fontFamily: 'monospace'
    },
    inlineStatDivider: {
        width: 1,
        height: 16,
        background: '#e8f0e8'
    },
    
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
        color: '#1b3a1d',      
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