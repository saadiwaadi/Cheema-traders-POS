import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, PlusCircle, ArrowLeft } from "lucide-react";
import { listSuppliers, saveSupplier, getSupplierHistory } from "../lib/posApi";

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
          <SupplierListView suppliers={suppliers} loading={loading} onSelectHistory={setSelectedSupplier} />
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

function SupplierListView({ suppliers, loading, onSelectHistory }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

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
      <div style={{ ...st.cardsGrid, gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ ...st.card, borderLeft: `3px solid #c62828` }}>
              <div style={st.cardLabel}>Total Market Payables</div>
              <div style={{ ...st.cardAmount, color: '#c62828' }}>
                  Rs. {totalPayables.toLocaleString()}
              </div>
              <div style={st.cardHint}>Money we owe to suppliers (Credits)</div>
          </div>
          <div style={{ ...st.card, borderLeft: `3px solid #2e7d32` }}>
              <div style={st.cardLabel}>Total Advances Given</div>
              <div style={{ ...st.cardAmount, color: '#2e7d32' }}>
                  Rs. {totalAdvances.toLocaleString()}
              </div>
              <div style={st.cardHint}>Advance payments we've made (Debits)</div>
          </div>
      </div>

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
                  .supp-table th { padding: 12px 20px; font-size: 12px; font-weight: 600; color: #6a8f6c; text-transform: uppercase; border-bottom: 2px solid #e8f0e8; }
                  .supp-table td { padding: 14px 20px; border-bottom: 1px solid #f2f7f2; }
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
                                      {bal === 0 ? 'Rs 0' : bal > 0 ? `(Cr) Rs ${Math.abs(bal).toLocaleString()}` : `(Dr) Rs ${Math.abs(bal).toLocaleString()}`}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button style={st.actionBtn} onClick={() => onSelectHistory(s)}>Statement</button>
                                  </td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </div>
    </>
  );
}

function SupplierHistoryView({ supplier }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

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

  // Pre-calculate running balances for the statement
  let runningBal = supplier.opening_balance || 0;
  const statementRows = history.map(h => {
      runningBal += (h.balance_change || 0);
      return { ...h, running_balance: runningBal };
  });

  return (
    <>
      <div style={st.cardsGrid}>
          <div style={{ ...st.card, borderLeft: `3px solid ${bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#1b3a1d'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={st.cardLabel}>{supplier.name} - Account Statement</div>
                  <button style={st.secondaryBtn} onClick={() => window.print()}>Print Statement</button>
              </div>
              <div style={{ ...st.cardAmount, color: bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#1b3a1d', marginTop: 10 }}>
                  Rs. {Math.abs(bal).toLocaleString()} {bal > 0 ? '(Cr)' : bal < 0 ? '(Dr)' : ''}
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
                  .hist-table th { padding: 12px 20px; font-size: 12px; font-weight: 600; color: #6a8f6c; text-transform: uppercase; border-bottom: 2px solid #e8f0e8; }
                  .hist-table td { padding: 14px 20px; border-bottom: 1px solid #f2f7f2; }
                  .hist-table tbody tr:not(.separator):not(.summary-row):hover { background: #f9fcf9; transition: background 0.15s; }
                  
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
                      .supp-hist-table, .supp-hist-table * { visibility: visible; }
                      .supp-hist-table { position: absolute; left: 0; top: 0; width: 100%; }
                  }
                  `}
              </style>
              <table style={st.table} className="hist-table supp-hist-table">
                  <thead>
                      <tr>
                          <th style={{ width: 100 }}>Date</th>
                          <th style={{ flex: 1 }}>Transaction</th>
                          <th style={{ width: 130 }}>Method</th>
                          <th style={{ textAlign: 'right', width: 130 }}>Debit (Dr)</th>
                          <th style={{ textAlign: 'right', width: 130 }}>Credit (Cr)</th>
                          <th style={{ textAlign: 'right', width: 140 }}>Outstanding</th>
                      </tr>
                  </thead>
                  <tbody>
                      {loading ? (
                          [...Array(4)].map((_, i) => (
                              <tr key={i}>
                                  <td><div className="skeleton" style={{ width: '70%' }}></div></td>
                                  <td><div className="skeleton" style={{ width: '90%' }}></div></td>
                                  <td><div className="skeleton" style={{ width: '40%' }}></div></td>
                                  <td><div className="skeleton" style={{ width: '50%', marginLeft: 'auto' }}></div></td>
                                  <td><div className="skeleton" style={{ width: '50%', marginLeft: 'auto' }}></div></td>
                                  <td><div className="skeleton" style={{ width: '60%', marginLeft: 'auto' }}></div></td>
                              </tr>
                          ))
                      ) : (
                          <>
                              <tr className="summary-row" style={{ background: '#fafdfa' }}>
                                  <td colSpan={5} style={{ fontSize: 13, fontWeight: 700, color: '#555', textAlign: 'right' }}>Opening Balance</td>
                                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: supplier.opening_balance > 0 ? '#c62828' : '#2e7d32' }}>
                                      Rs {Math.abs(supplier.opening_balance || 0).toLocaleString()} {supplier.opening_balance > 0 ? '(Cr)' : supplier.opening_balance < 0 ? '(Dr)' : ''}
                                  </td>
                              </tr>
                              {statementRows.length === 0 ? (
                                  <tr>
                                      <td colSpan={6} style={{ textAlign: 'center', padding: 48, color: '#708571' }}>
                                          <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
                                          <div style={{ fontSize: 15, fontWeight: 500, color: '#5a755c' }}>No transaction history</div>
                                      </td>
                                  </tr>
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
                                  
                                  // For suppliers, Purchases increase the credit balance (we owe them more). Payments decrease it.
                                  // In store.js: Purchase balance_change is positive, Payment balance_change is negative.
                                  // Standard accounting for Payables: Purchases = Credit (Cr), Payments = Debit (Dr).
                                  const isPurchase = h.type === 'Purchase';
                                  
                                  return (
                                      <React.Fragment key={idx}>
                                          {showMonthRow && (
                                              <tr className="separator">
                                                  <td colSpan={6} style={st.dateSeparator}>
                                                      {currentMonthYear}
                                                  </td>
                                              </tr>
                                          )}
                                          <tr>
                                              <td style={{ fontFamily: 'monospace', fontSize: 13, color: '#6a8f6c' }}>{displayDate}</td>
                                              <td style={{ fontSize: 14, color: '#333' }}>
                                                  <strong style={{ color: isPurchase ? '#c62828' : '#2e7d32' }}>{h.type}</strong>
                                                  {h.reference ? ` - ${h.reference}` : ''}
                                              </td>
                                              <td style={{ fontSize: 13, color: '#555' }}>
                                                  {h.method}
                                              </td>
                                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: '#2e7d32' }}>
                                                  {!isPurchase ? `Rs ${Math.abs(h.total_amount).toLocaleString()}` : '-'}
                                              </td>
                                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: '#c62828' }}>
                                                  {isPurchase ? `Rs ${Math.abs(h.total_amount).toLocaleString()}` : '-'}
                                              </td>
                                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: h.running_balance > 0 ? '#c62828' : '#2e7d32' }}>
                                                  Rs {Math.abs(h.running_balance).toLocaleString()} {h.running_balance > 0 ? '(Cr)' : h.running_balance < 0 ? '(Dr)' : ''}
                                              </td>
                                          </tr>
                                      </React.Fragment>
                                  )
                              })}
                              {statementRows.length > 0 && (
                                  <tr className="summary-row" style={{ background: '#f0f6f0', borderTop: '2px solid #d5e8d5' }}>
                                      <td colSpan={5} style={{ fontSize: 14, fontWeight: 800, color: '#1b3a1d', textAlign: 'right', textTransform: 'uppercase' }}>Closing Balance</td>
                                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#1b3a1d' }}>
                                          Rs {Math.abs(bal).toLocaleString()} {bal > 0 ? '(Cr)' : bal < 0 ? '(Dr)' : ''}
                                      </td>
                                  </tr>
                              )}
                          </>
                      )}
                  </tbody>
              </table>
          </div>
      </div>
    </>
  );
}

const st = {
    page: { display: 'flex', flexDirection: 'column', height: '100%', background: '#f0f6f0', padding: 24, overflowY: 'auto', fontFamily: 'system-ui, sans-serif', position: 'relative' },
    pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    title: { margin: 0, fontSize: 24, fontWeight: 'bold', color: '#1b3a1d' },
    subtitle: { margin: '4px 0 0 0', fontSize: 14, color: '#6a8f6c' },
    
    headerActions: { display: 'flex', gap: 12, alignItems: 'center' },
    backBtn: { display: 'flex', alignItems: 'center', gap: 8, background: "none", border: "none", color: "#2e7d32", fontSize: 16, fontWeight: 600, cursor: "pointer" },
    primaryBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: "10px 18px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: "bold", cursor: "pointer", transition: "background 0.2s" },
    secondaryBtn: { padding: "10px 18px", background: "#fff", color: "#555", border: "1px solid #cde0cd", borderRadius: 8, fontSize: 14, fontWeight: "bold", cursor: "pointer" },
    actionBtn: { padding: "6px 12px", border: "1px solid #c8e6c9", background: "#e8f5e9", color: "#1b3a1d", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer" },

    navStrip: { display: "flex", gap: 6, background: "#e4ede4", borderRadius: 12, padding: 4 },
    navBtn: { padding: "6px 14px", border: "none", borderRadius: 9, background: "transparent", fontSize: 13, fontWeight: 600, color: "#5a755c", cursor: "pointer", transition: "background 0.2s" },
    navBtnActive: { background: "#fff", color: "#1d351f", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },

    cardsGrid: { display: 'grid', gap: 16, marginBottom: 24 },
    card: { background: '#fff', padding: '24px', borderRadius: 12, border: '1px solid #e8f0e8', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' },
    cardLabel: { fontSize: 12, fontFamily: 'monospace', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6a8f6c', marginBottom: 12 },
    cardAmount: { fontSize: 32, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 10 },
    cardHint: { fontSize: 11, color: '#999', marginTop: 12, fontStyle: 'italic' },
    
    tableWrap: { background: '#fff', borderRadius: 12, border: '1px solid #e8f0e8', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    tableSearch: { padding: '12px 20px', borderBottom: '1px solid #e8f0e8', display: 'flex', alignItems: 'center', gap: 16, background: '#fafdfa', justifyContent: 'space-between' },
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
    sidePanel: { position: "absolute", top: 0, right: 0, bottom: 0, width: 400, background: "#fff", zIndex: 20, boxShadow: "-4px 0 24px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column" },
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
