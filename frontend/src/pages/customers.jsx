import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, PlusCircle, ArrowLeft } from "lucide-react";
import { listCustomers, saveCustomer, getCustomerHistory } from "../lib/posApi";

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
          <CustomerListView customers={customers} loading={loading} onSelectHistory={setSelectedCustomer} />
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
                <select style={st.input} value={balanceType} onChange={e => setBalanceType(e.target.value)}>
                  <option value="none">Zero Balance</option>
                  <option value="debit">They owe us (Debit)</option>
                  <option value="credit">We owe them (Credit)</option>
                </select>
                <span style={st.fieldHint}>Debit = they already owe you money. Credit = you owe them.</span>
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

function CustomerListView({ customers, loading, onSelectHistory }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const q = search.toLowerCase();
  const filtered = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(q) || (c.phone || "").includes(q);
    if (!matchesSearch) return false;
    
    if (filter === "debit") return c.current_balance > 0;
    if (filter === "credit") return c.current_balance < 0;
    return true;
  });

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
                  Debits (They owe us)
                </button>
                <button
                  style={{ ...st.navBtn, ...(filter === "credit" ? st.navBtnActive : {}) }}
                  onClick={() => setFilter("credit")}
                >
                  Credits (We owe them)
                </button>
              </div>
          </div>

          <div style={st.tableContainer}>
              <style>
                  {`
                  .cust-table th { padding: 12px 20px; font-size: 12px; font-weight: 600; color: #6a8f6c; text-transform: uppercase; border-bottom: 2px solid #e8f0e8; }
                  .cust-table td { padding: 14px 20px; border-bottom: 1px solid #f2f7f2; }
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
                                  <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
                                  <div style={{ fontSize: 15, fontWeight: 500, color: '#5a755c' }}>No customers found</div>
                                  <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your filters or search query.</div>
                              </td>
                          </tr>
                      ) : filtered.map((c) => {
                          const bal = c.current_balance;
                          return (
                              <tr key={c.id}>
                                  <td style={{ fontSize: 14, fontWeight: 600, color: '#1b3a1d' }}>{c.name}</td>
                                  <td style={{ fontSize: 14, color: '#555' }}>{c.phone || "-"}</td>
                                  <td style={{ fontSize: 13, color: '#555' }}>{c.last_purchase || "-"}</td>
                                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#555' }}>
                                      {bal === 0 ? 'Rs 0' : bal > 0 ? `(Dr) Rs ${Math.abs(bal).toLocaleString()}` : `(Cr) Rs ${Math.abs(bal).toLocaleString()}`}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button style={st.actionBtn} onClick={() => onSelectHistory(c)}>Statement</button>
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

function CustomerHistoryView({ customer }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

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

  // Pre-calculate running balances for the statement
  let runningBal = customer.opening_balance || 0;
  const statementRows = history.map(h => {
      runningBal += (h.balance_change || 0);
      return { ...h, running_balance: runningBal };
  });

  return (
    <>
      <div style={st.cardsGrid}>
          <div style={{ ...st.card, borderLeft: `3px solid ${bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#1b3a1d'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={st.cardLabel}>{customer.name} - Account Statement</div>
                  <button style={st.secondaryBtn} onClick={() => window.print()}>Print Statement</button>
              </div>
              <div style={{ ...st.cardAmount, color: bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#1b3a1d', marginTop: 10 }}>
                  Rs. {Math.abs(bal).toLocaleString()} {bal > 0 ? '(Dr)' : bal < 0 ? '(Cr)' : ''}
              </div>
              <div style={st.cardHint}>Phone: {customer.phone || "-"}</div>
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
                      .cust-hist-table, .cust-hist-table * { visibility: visible; }
                      .cust-hist-table { position: absolute; left: 0; top: 0; width: 100%; }
                  }
                  `}
              </style>
              <table style={st.table} className="hist-table cust-hist-table">
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
                                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: customer.opening_balance > 0 ? '#c62828' : '#2e7d32' }}>
                                      Rs {Math.abs(customer.opening_balance || 0).toLocaleString()} {customer.opening_balance > 0 ? '(Dr)' : customer.opening_balance < 0 ? '(Cr)' : ''}
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
                                                  <strong style={{ color: h.type === 'Sale' ? '#c62828' : '#2e7d32' }}>{h.type}</strong>
                                                  {h.reference ? ` - ${h.reference}` : ''}
                                              </td>
                                              <td style={{ fontSize: 13, color: '#555' }}>
                                                  {h.method}
                                              </td>
                                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: '#c62828' }}>
                                                  {h.balance_change > 0 ? `Rs ${Math.abs(h.total_amount).toLocaleString()}` : '-'}
                                              </td>
                                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: '#2e7d32' }}>
                                                  {h.balance_change < 0 ? `Rs ${Math.abs(h.total_amount).toLocaleString()}` : '-'}
                                              </td>
                                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: h.running_balance > 0 ? '#c62828' : '#2e7d32' }}>
                                                  Rs {Math.abs(h.running_balance).toLocaleString()} {h.running_balance > 0 ? '(Dr)' : h.running_balance < 0 ? '(Cr)' : ''}
                                              </td>
                                          </tr>
                                      </React.Fragment>
                                  )
                              })}
                              {statementRows.length > 0 && (
                                  <tr className="summary-row" style={{ background: '#f0f6f0', borderTop: '2px solid #d5e8d5' }}>
                                      <td colSpan={5} style={{ fontSize: 14, fontWeight: 800, color: '#1b3a1d', textAlign: 'right', textTransform: 'uppercase' }}>Closing Balance</td>
                                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: bal > 0 ? '#c62828' : bal < 0 ? '#2e7d32' : '#1b3a1d' }}>
                                          Rs {Math.abs(bal).toLocaleString()} {bal > 0 ? '(Dr)' : bal < 0 ? '(Cr)' : ''}
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
        color: '#2e7d32',      
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
