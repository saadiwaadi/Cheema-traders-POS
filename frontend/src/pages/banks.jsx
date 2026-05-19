import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, PlusCircle, ArrowLeft, ArrowRightLeft } from "lucide-react";
import { listBanks, saveBank, getBankHistory, saveBankTransfer } from "../lib/posApi";

export default function BanksPage() {
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [isTransferPanelOpen, setIsTransferPanelOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState(null);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const loadBanks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listBanks();
      if (res && res.banks) {
        setBanks(res.banks);
      }
    } catch (e) {
      console.error("Failed to load banks", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBanks();
  }, [loadBanks]);

  const handleSaved = () => {
    setIsAddPanelOpen(false);
    setIsTransferPanelOpen(false);
    loadBanks();
  };

  return (
    <div style={st.page}>
      <div style={st.pageHeader}>
        <div>
          {selectedBank ? (
            <button style={st.backBtn} onClick={() => setSelectedBank(null)}>
              <ArrowLeft size={16} /> Back to Banks
            </button>
          ) : (
            <>
              <h1 style={st.title}>Bank Accounts</h1>
              <p style={st.subtitle}>Manage institutional funds and transfers</p>
            </>
          )}
        </div>
        {!selectedBank && (
          <div style={st.headerActions}>
            <button style={st.secondaryBtn} onClick={() => setIsTransferPanelOpen(true)}>
              <ArrowRightLeft size={16} /> Transfer Funds
            </button>
            <button style={st.primaryBtn} onClick={() => setIsAddPanelOpen(true)}>
              <PlusCircle size={16} /> Add Bank
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
        {selectedBank ? (
          <BankHistoryView bank={selectedBank} />
        ) : (
          <BankListView banks={banks} loading={loading} onSelectHistory={setSelectedBank} />
        )}
      </div>

      <AddBankPanel isOpen={isAddPanelOpen} onClose={() => setIsAddPanelOpen(false)} onSaved={handleSaved} />
      <TransferPanel isOpen={isTransferPanelOpen} onClose={() => setIsTransferPanelOpen(false)} onSaved={handleSaved} banks={banks} />
    </div>
  );
}

function AddBankPanel({ isOpen, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      setName(""); setOpeningBalance(""); setErrorMsg("");
    }
  }, [isOpen]);

  const handleSave = async () => {
    setErrorMsg("");
    if (!name) return setErrorMsg("Bank name is required");
    setSaving(true);
    try {
      await saveBank({ name, openingBalance: Number(openingBalance || 0) });
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
          <motion.div style={st.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div style={st.sidePanel} initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}>
            <div style={st.panelHeader}>
              <h2 style={st.panelTitle}>Add Bank Account</h2>
              <button style={st.closeBtn} onClick={onClose}>✕</button>
            </div>
            <div style={st.panelBody}>
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Bank / Institution Name *</label>
                <input style={st.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Meezan Bank" />
              </div>
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Opening Balance (Rs)</label>
                <input style={st.input} type="number" placeholder="0" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} />
                <span style={st.fieldHint}>Initial funds already present in this account.</span>
              </div>
            </div>
            <div style={st.panelFooter}>
              {errorMsg && <div style={{ color: '#c62828', fontSize: 13, marginRight: 'auto', fontWeight: 500 }}>{errorMsg}</div>}
              <button style={st.secondaryBtn} onClick={onClose}>Cancel</button>
              <button style={st.primaryBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Bank'}</button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function TransferPanel({ isOpen, onClose, onSaved, banks }) {
  const [transferMode, setTransferMode] = useState("cih_to_bank"); // cih_to_bank, bank_to_cih, bank_to_bank
  const [bankId1, setBankId1] = useState("");
  const [bankId2, setBankId2] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTransferMode("cih_to_bank");
      setBankId1(banks.length > 0 ? banks[0].id.toString() : "");
      setBankId2(banks.length > 1 ? banks[1].id.toString() : banks.length > 0 ? banks[0].id.toString() : "");
      setAmount("");
      setReference("");
      setDate(new Date().toISOString().split('T')[0]);
      setErrorMsg("");
    }
  }, [isOpen, banks]);

  const handleSave = async () => {
    setErrorMsg("");
    if (!amount || Number(amount) <= 0) return setErrorMsg("Valid amount is required");
    
    let fromAccount, toAccount;
    
    if (transferMode === 'cih_to_bank') {
        if (!bankId1) return setErrorMsg("Please select a target bank");
        fromAccount = 'cih';
        toAccount = bankId1;
    } else if (transferMode === 'bank_to_cih') {
        if (!bankId1) return setErrorMsg("Please select a source bank");
        fromAccount = bankId1;
        toAccount = 'cih';
    } else {
        if (!bankId1 || !bankId2) return setErrorMsg("Please select both banks");
        if (bankId1 === bankId2) return setErrorMsg("Source and Target banks must be different");
        fromAccount = bankId1;
        toAccount = bankId2;
    }

    setSaving(true);
    try {
      await saveBankTransfer({ fromAccount, toAccount, amount, reference, date });
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
          <motion.div style={st.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div style={st.sidePanel} initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}>
            <div style={st.panelHeader}>
              <h2 style={st.panelTitle}>Transfer Funds</h2>
              <button style={st.closeBtn} onClick={onClose}>✕</button>
            </div>
            <div style={st.panelBody}>
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Transfer Route</label>
                <div style={{ display: 'flex', background: '#f2f7f2', borderRadius: 8, padding: 4 }}>
                    <button style={{ ...st.routeBtn, ...(transferMode === 'cih_to_bank' ? st.routeBtnActive : {}) }} onClick={() => setTransferMode('cih_to_bank')}>Deposit (to Bank)</button>
                    <button style={{ ...st.routeBtn, ...(transferMode === 'bank_to_cih' ? st.routeBtnActive : {}) }} onClick={() => setTransferMode('bank_to_cih')}>Withdraw (to CIH)</button>
                    <button style={{ ...st.routeBtn, ...(transferMode === 'bank_to_bank' ? st.routeBtnActive : {}) }} onClick={() => setTransferMode('bank_to_bank')}>Bank to Bank</button>
                </div>
              </div>

              {transferMode === 'cih_to_bank' && (
                  <div style={st.fieldWrap}>
                      <label style={st.fieldLabel}>Target Bank Account</label>
                      <select style={st.input} value={bankId1} onChange={e => setBankId1(e.target.value)}>
                          {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                  </div>
              )}

              {transferMode === 'bank_to_cih' && (
                  <div style={st.fieldWrap}>
                      <label style={st.fieldLabel}>Source Bank Account</label>
                      <select style={st.input} value={bankId1} onChange={e => setBankId1(e.target.value)}>
                          {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                  </div>
              )}

              {transferMode === 'bank_to_bank' && (
                  <>
                      <div style={st.fieldWrap}>
                          <label style={st.fieldLabel}>From (Source Bank)</label>
                          <select style={st.input} value={bankId1} onChange={e => setBankId1(e.target.value)}>
                              {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                      </div>
                      <div style={st.fieldWrap}>
                          <label style={st.fieldLabel}>To (Target Bank)</label>
                          <select style={st.input} value={bankId2} onChange={e => setBankId2(e.target.value)}>
                              {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                      </div>
                  </>
              )}

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Date</label>
                <input style={st.input} type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Amount (Rs) *</label>
                <input style={st.input} type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Reference / Notes</label>
                <input style={st.input} value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. Check #1024 or ATM" />
              </div>
            </div>
            <div style={st.panelFooter}>
              {errorMsg && <div style={{ color: '#c62828', fontSize: 13, marginRight: 'auto', fontWeight: 500 }}>{errorMsg}</div>}
              <button style={st.secondaryBtn} onClick={onClose}>Cancel</button>
              <button style={st.primaryBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Transfer'}</button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function BankListView({ banks, loading, onSelectHistory }) {
  const [search, setSearch] = useState("");

  const q = search.toLowerCase();
  const filtered = banks.filter(b => b.name.toLowerCase().includes(q));

  const totalBankBalance = banks.reduce((sum, b) => sum + b.current_balance, 0);

  return (
    <>
      <div style={st.cardsGrid}>
          <div style={{ ...st.card, borderLeft: `3px solid #1976d2` }}>
              <div style={st.cardLabel}>Total Bank Balance</div>
              <div style={{ ...st.cardAmount, color: '#1976d2' }}>
                  Rs. {totalBankBalance.toLocaleString()}
              </div>
              <div style={st.cardHint}>Consolidated funds across all institutional accounts</div>
          </div>
      </div>

      <div style={st.tableWrap}>
          <div style={st.tableSearch}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <Search size={14} style={{ color: '#708571' }} />
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search bank accounts..."
                    style={st.searchInput}
                />
              </div>
          </div>

          <div style={st.tableContainer}>
              <style>
                  {`
                  .bank-table th { padding: 12px 20px; font-size: 12px; font-weight: 600; color: #6a8f6c; text-transform: uppercase; border-bottom: 2px solid #e8f0e8; }
                  .bank-table td { padding: 14px 20px; border-bottom: 1px solid #f2f7f2; }
                  .bank-table tbody tr { transition: background 0.15s; }
                  .bank-table tbody tr:hover { background: #f9fcf9; }
                  
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
              <table style={st.table} className="bank-table">
                  <thead>
                      <tr>
                          <th style={{ flex: 1 }}>Bank Name</th>
                          <th style={{ width: 200, textAlign: 'right' }}>Current Balance</th>
                          <th style={{ width: 120, textAlign: 'center' }}>Action</th>
                      </tr>
                  </thead>
                  <tbody>
                      {loading ? (
                          [...Array(3)].map((_, i) => (
                              <tr key={i}>
                                  <td><div className="skeleton" style={{ width: '50%' }}></div></td>
                                  <td><div className="skeleton" style={{ width: '80%', marginLeft: 'auto' }}></div></td>
                                  <td><div className="skeleton" style={{ width: '80%', margin: '0 auto' }}></div></td>
                              </tr>
                          ))
                      ) : filtered.length === 0 ? (
                          <tr>
                              <td colSpan={3} style={{ textAlign: 'center', padding: 48, color: '#708571' }}>
                                  <div style={{ fontSize: 32, marginBottom: 12 }}>🏦</div>
                                  <div style={{ fontSize: 15, fontWeight: 500, color: '#5a755c' }}>No bank accounts found</div>
                                  <div style={{ fontSize: 13, marginTop: 4 }}>Add a bank account to start tracking transfers.</div>
                              </td>
                          </tr>
                      ) : filtered.map((b) => (
                          <tr key={b.id}>
                              <td style={{ fontSize: 14, fontWeight: 600, color: '#1b3a1d' }}>{b.name}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: '#1976d2' }}>
                                  Rs {b.current_balance.toLocaleString()}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button style={st.actionBtn} onClick={() => onSelectHistory(b)}>Statement</button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>
    </>
  );
}

function BankHistoryView({ bank }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await getBankHistory(bank.id);
        if (res && res.history) {
            setHistory(res.history);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bank.id]);

  let runningBal = bank.opening_balance || 0;
  const statementRows = history.map(h => {
      runningBal += (h.balance_change || 0);
      return { ...h, running_balance: runningBal };
  });

  return (
    <>
      <div style={st.cardsGrid}>
          <div style={{ ...st.card, borderLeft: `3px solid #1976d2` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={st.cardLabel}>{bank.name} - Statement</div>
                  <button style={st.secondaryBtn} onClick={() => window.print()}>Print Statement</button>
              </div>
              <div style={{ ...st.cardAmount, color: '#1976d2', marginTop: 10 }}>
                  Rs. {bank.current_balance.toLocaleString()}
              </div>
              <div style={st.cardHint}>Official Ledger</div>
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
                      .bank-hist-table, .bank-hist-table * { visibility: visible; }
                      .bank-hist-table { position: absolute; left: 0; top: 0; width: 100%; }
                  }
                  `}
              </style>
              <table style={st.table} className="hist-table bank-hist-table">
                  <thead>
                      <tr>
                          <th style={{ width: 100 }}>Date</th>
                          <th style={{ width: 120 }}>Type</th>
                          <th style={{ flex: 1 }}>Reference</th>
                          <th style={{ textAlign: 'right', width: 130 }}>Deposit</th>
                          <th style={{ textAlign: 'right', width: 130 }}>Withdrawal</th>
                          <th style={{ textAlign: 'right', width: 150 }}>Balance</th>
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
                                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#1976d2' }}>
                                      Rs {bank.opening_balance.toLocaleString()}
                                  </td>
                              </tr>
                              {statementRows.length === 0 ? (
                                  <tr>
                                      <td colSpan={6} style={{ textAlign: 'center', padding: 48, color: '#708571' }}>
                                          <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
                                          <div style={{ fontSize: 15, fontWeight: 500, color: '#5a755c' }}>No transactions found</div>
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
                                  
                                  const isDeposit = h.type === 'Deposit';
                                  
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
                                              <td style={{ fontSize: 14, color: isDeposit ? '#388e3c' : '#d32f2f', fontWeight: 600 }}>
                                                  {h.type}
                                              </td>
                                              <td style={{ fontSize: 13, color: '#555' }}>
                                                  {h.reference || '-'}
                                              </td>
                                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: '#388e3c' }}>
                                                  {isDeposit ? `Rs ${Math.abs(h.total_amount).toLocaleString()}` : '-'}
                                              </td>
                                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: '#d32f2f' }}>
                                                  {!isDeposit ? `Rs ${Math.abs(h.total_amount).toLocaleString()}` : '-'}
                                              </td>
                                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#1976d2' }}>
                                                  Rs {Math.abs(h.running_balance).toLocaleString()}
                                              </td>
                                          </tr>
                                      </React.Fragment>
                                  )
                              })}
                              {statementRows.length > 0 && (
                                  <tr className="summary-row" style={{ background: '#f0f6f0', borderTop: '2px solid #d5e8d5' }}>
                                      <td colSpan={5} style={{ fontSize: 14, fontWeight: 800, color: '#1b3a1d', textAlign: 'right', textTransform: 'uppercase' }}>Closing Balance</td>
                                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: '#1976d2' }}>
                                          Rs {bank.current_balance.toLocaleString()}
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
    backBtn: { display: 'flex', alignItems: 'center', gap: 8, background: "none", border: "none", color: "#1976d2", fontSize: 16, fontWeight: 600, cursor: "pointer" },
    primaryBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: "10px 18px", background: "#1976d2", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: "bold", cursor: "pointer", transition: "background 0.2s" },
    secondaryBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: "10px 18px", background: "#fff", color: "#1976d2", border: "1px solid #bbdefb", borderRadius: 8, fontSize: 14, fontWeight: "bold", cursor: "pointer" },
    actionBtn: { padding: "6px 12px", border: "1px solid #bbdefb", background: "#e3f2fd", color: "#1976d2", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer" },

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
    dateSeparator: { background: '#e3f2fd', padding: '16px 20px', fontSize: 12, fontFamily: 'system-ui, sans-serif', fontWeight: 700, color: '#1976d2', letterSpacing: '0.07em', borderBottom: '2px solid #bbdefb', borderTop: '2px solid #bbdefb', textTransform: 'uppercase' },

    backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", zIndex: 10 },
    sidePanel: { position: "absolute", top: 0, right: 0, bottom: 0, width: 420, background: "#fff", zIndex: 20, boxShadow: "-4px 0 24px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column" },
    panelHeader: { padding: "20px 24px", borderBottom: "1px solid #e8f0e8", display: "flex", justifyContent: "space-between", alignItems: "center" },
    panelTitle: { margin: 0, fontSize: 18, color: "#1b3a1d", fontWeight: "bold" },
    closeBtn: { background: "none", border: "none", fontSize: 18, color: "#888", cursor: "pointer" },
    panelBody: { flex: 1, padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 },
    panelFooter: { padding: "20px 24px", borderTop: "1px solid #e8f0e8", display: "flex", justifyContent: "flex-end", gap: 12 },
    
    fieldWrap: { display: "flex", flexDirection: "column", gap: 6 },
    fieldLabel: { fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase" },
    input: { padding: "12px", border: "1.5px solid #cde0cd", borderRadius: 8, background: "#fafff9", outline: "none", fontSize: 14, color: "#1b3a1d" },
    fieldHint: { fontSize: 11, color: "#8aab8c" },

    routeBtn: { flex: 1, padding: "8px", border: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: "#5a755c", cursor: "pointer", borderRadius: 6 },
    routeBtnActive: { background: "#fff", color: "#1976d2", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }
};
