import React, { useState, useEffect } from "react";
import { Search, PlusCircle, List, FileDown } from "lucide-react";
import { saveExpense, listExpenses } from "../lib/posApi";
import SuccessNotification from "../components/SuccessNotification";
import WarningNotification from "../components/Warningnotification";
import * as XLSX from "xlsx";

const st = {
    page: { display: 'flex', flexDirection: 'column', height: '100%', background: '#f0f6f0', padding: 24, overflowY: 'auto', fontFamily: 'system-ui, sans-serif' },
    pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    title: { margin: 0, fontSize: 24, fontWeight: 'bold', color: '#1b3a1d' },
    subtitle: { margin: '4px 0 0 0', fontSize: 14, color: '#6a8f6c' },
    
    navStrip: { display: "flex", gap: 6, background: "#e4ede4", borderRadius: 4, padding: 4 },
    navBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: "8px 16px", border: "none", borderRadius: 4, background: "transparent", fontSize: 13, fontWeight: 700, color: "#5a755c", cursor: "pointer", transition: "background 0.2s" },
    navBtnActive: { background: "#fff", color: "#1d351f" },

    cardsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 },
    card: { background: '#fff', padding: '20px 24px', borderRadius: 4, border: '1px solid #c8d8c8' },
    cardLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6a8f6c', marginBottom: 8 },
    cardAmount: { fontSize: 28, fontFamily: 'monospace', fontWeight: 700, color: '#1b3a1d', marginBottom: 6 },
    cardHint: { fontSize: 11, color: '#999', fontStyle: 'italic' },
    
    tableWrap: { background: '#fff', borderRadius: 4, border: '1px solid #c8d8c8', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    tableSearch: { padding: '14px 20px', borderBottom: '1px solid #c8d8c8', display: 'flex', alignItems: 'center', gap: 10, background: '#fafdfa' },
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
        borderBottom: '2px solid #c8d8c8', 
        borderTop: '2px solid #c8d8c8', 
        textTransform: 'uppercase' 
    },
    dataRow: { borderBottom: '1px solid #f2f7f2', transition: 'background 0.1s' },
    
    formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
    fieldWrap: { display: "flex", flexDirection: "column", gap: 6 },
    fieldLabel: { fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase" },
    input: { padding: "10px 12px", border: "1px solid #cde0cd", borderRadius: 4, background: "#fafff9", outline: "none", fontSize: 14, color: "#1b3a1d", fontFamily: "system-ui, sans-serif" },
    textarea: { padding: "10px 12px", border: "1px solid #cde0cd", borderRadius: 4, background: "#fafff9", outline: "none", fontSize: 14, color: "#1b3a1d", fontFamily: "system-ui, sans-serif", resize: "vertical" },
    fieldHint: { fontSize: 11, color: "#8aab8c" },
  
    primaryBtn: { padding: "10px 20px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: "pointer" },
    secondaryBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: "8px 14px", background: "#fff", border: "1px solid #cde0cd", borderRadius: 4, color: "#1b3a1d", fontWeight: 600, fontSize: 13, cursor: "pointer" },
    dateInput: { padding: '8px 12px', border: '1px solid #cde0cd', borderRadius: 4, outline: 'none', color: '#1b3a1d', fontSize: 13, fontFamily: 'monospace' },
};

export default function ExpensesPage() {
  const [activeTab, setActiveTab] = useState("log");

  return (
    <div style={st.page}>
      <div style={st.pageHeader}>
        <div>
          <h1 style={st.title}>Expenses Management</h1>
          <p style={st.subtitle}>Track and categorize outgoing business funds</p>
        </div>
        <div style={st.navStrip}>
          <button
            style={{ ...st.navBtn, ...(activeTab === "log" ? st.navBtnActive : {}) }}
            onClick={() => setActiveTab("log")}
          >
            <List size={16} /> Expense Log
          </button>
          <button
            style={{ ...st.navBtn, ...(activeTab === "record" ? st.navBtnActive : {}) }}
            onClick={() => setActiveTab("record")}
          >
            <PlusCircle size={16} /> Record Expense
          </button>
        </div>
      </div>

      <div style={{ flex: 1 }}>
        {activeTab === "log" ? <ExpenseLogTab /> : <RecordExpenseTab onSaved={() => setActiveTab("log")} />}
      </div>
    </div>
  );
}

function RecordExpenseTab({ onSaved }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Utility");
  const [moneyFrom, setMoneyFrom] = useState("Main Cash Drawer");
  const [moneyToOption, setMoneyToOption] = useState("WAPDA (Electricity)");
  const [moneyToCustom, setMoneyToCustom] = useState("");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSave = async () => {
    setErrorMsg("");
    if (!amount || Number(amount) <= 0) return setErrorMsg("Amount is required");
    if (!description.trim()) return setErrorMsg("Description is required");
    
    const moneyTo = moneyToOption === "Other" ? moneyToCustom : moneyToOption;
    if (!moneyTo.trim()) return setErrorMsg("Debit account / vendor is required");

    setSaving(true);
    try {
      await saveExpense({ amount: Number(amount), category, moneyFrom, moneyTo, description, expenseDate });
      onSaved();
    } catch(e) {
      setErrorMsg("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const getMoneyToOptions = (cat) => {
    switch (cat) {
      case "Utility": return ["WAPDA (Electricity)", "Sui Gas", "PTCL/Internet", "Water Supply", "Other"];
      case "Rent": return ["Landlord (Shop Rent)", "Warehouse Rent", "Other"];
      case "Maintenance": return ["Electrician", "Plumber", "IT Support", "Store Maintenance", "Other"];
      case "Salary/Wages": return ["Staff Salary", "Daily Wages", "Advance Salary", "Other"];
      case "Transport": return ["Fuel & Travel", "Delivery Charges", "Freight", "Other"];
      default: return ["General Expense", "Other"];
    }
  };

  useEffect(() => {
    const opts = getMoneyToOptions(category);
    setMoneyToOption(opts[0]);
    setMoneyToCustom("");
  }, [category]);

  return (
    <div style={{ ...st.card, maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: "bold", color: "#1b3a1d" }}>Record New Expense</h2>
        <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#6a8f6c" }}>Log money leaving the business with double-entry precision.</p>
      </div>

      <div style={st.formGrid}>
        <div style={st.fieldWrap}>
          <label style={st.fieldLabel}>Date</label>
          <input style={st.input} type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
        </div>

        <div style={st.fieldWrap}>
          <label style={st.fieldLabel}>Amount (Rs)</label>
          <input style={st.input} type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>

        <div style={st.fieldWrap}>
          <label style={st.fieldLabel}>Category</label>
          <select style={st.input} value={category} onChange={e => setCategory(e.target.value)}>
            <option>Utility</option>
            <option>Rent</option>
            <option>Maintenance</option>
            <option>Salary/Wages</option>
            <option>Transport</option>
            <option>Miscellaneous</option>
          </select>
        </div>
      </div>

      <div style={{ ...st.formGrid, marginTop: 20 }}>
        <div style={st.fieldWrap}>
          <label style={st.fieldLabel}>Credit (Money From)</label>
          <select style={st.input} value={moneyFrom} onChange={e => setMoneyFrom(e.target.value)}>
            <option>Main Cash Drawer</option>
            <option>HBL Bank Account</option>
            <option>Petty Cash</option>
            <option>Owner's Equity</option>
          </select>
          <span style={st.fieldHint}>Asset or liability account decreasing.</span>
        </div>

        <div style={st.fieldWrap}>
          <label style={st.fieldLabel}>Debit (Money To)</label>
          <select style={st.input} value={moneyToOption} onChange={e => setMoneyToOption(e.target.value)}>
            {getMoneyToOptions(category).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {moneyToOption === "Other" && (
            <input 
              style={{...st.input, marginTop: 8}} 
              placeholder="Specify vendor / account..." 
              value={moneyToCustom} 
              onChange={e => setMoneyToCustom(e.target.value)} 
            />
          )}
          <span style={st.fieldHint}>Expense account or vendor receiving the funds.</span>
        </div>
      </div>

      <div style={{ marginTop: 20, ...st.fieldWrap }}>
        <label style={st.fieldLabel}>Description / Notes</label>
        <textarea 
          style={st.textarea} 
          rows={3} 
          placeholder="Detailed description of the expense..." 
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16 }}>
        {errorMsg && <div style={{ color: "#c62828", fontSize: 14, fontWeight: 600 }}>{errorMsg}</div>}
        <button style={st.primaryBtn} onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Expense Entry"}
        </button>
      </div>
    </div>
  );
}

function ExpenseLogTab() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await listExpenses({ from: fromDate, to: toDate });
        if (res?.expenses) setExpenses(res.expenses);
      } catch(e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, [fromDate, toDate]);

  const categories = ["All", "Utility", "Rent", "Maintenance", "Salary/Wages", "Transport", "Miscellaneous"];

  const q = search.toLowerCase();
  const filtered = expenses.filter(e => {
    if (categoryFilter !== "all" && e.category?.toLowerCase() !== categoryFilter.toLowerCase() && categoryFilter.toLowerCase() !== "salary/wages") {
        if(categoryFilter === "Salary" && e.category !== "Salary/Wages") return false;
        if(categoryFilter !== "Salary" && e.category?.toLowerCase() !== categoryFilter.toLowerCase()) return false;
    }
    if (q && !(e.description?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q))) return false;
    return true;
  });

  const totalAmount = filtered.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  
  const currentMonthPrefix = new Date().toISOString().split('T')[0].substring(0, 7);
  const thisMonthExpenses = expenses.filter(e => (e.date || e.expenseDate || '').startsWith(currentMonthPrefix));
  const thisMonthAmount = thisMonthExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  
  const maxExpense = filtered.reduce((max, e) => Number(e.amount || 0) > max ? Number(e.amount || 0) : max, 0);

  const handleExportExcel = () => {
    const headers = [["Date", "Category", "Description", "Debit", "Credit", "Amount"]];
    const data = filtered.map(e => [
      e.date || e.expenseDate, e.category, e.description,
      e.debit || e.moneyTo, e.credit || e.moneyFrom, e.amount
    ]);
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...data]);
    ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, `Expenses_${fromDate}_to_${toDate}.xlsx`);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 16 }}>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={st.dateInput} />
        <span style={{ display: 'flex', alignItems: 'center', color: '#6a8f6c', fontSize: 13 }}>to</span>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={st.dateInput} />
      </div>

      <div style={st.cardsGrid}>
          <div style={{ ...st.card, borderLeft: `4px solid #c62828` }}>
              <div style={st.cardLabel}>Total Expenses</div>
              <div style={st.cardAmount}>Rs {totalAmount.toLocaleString()}</div>
              <div style={st.cardHint}>Money left business in filtered view</div>
          </div>
          <div style={{ ...st.card, borderLeft: `4px solid #1b3a1d` }}>
              <div style={st.cardLabel}>This Month</div>
              <div style={st.cardAmount}>Rs {thisMonthAmount.toLocaleString()}</div>
              <div style={st.cardHint}>Total expenses for current month</div>
          </div>
          <div style={{ ...st.card, borderLeft: `4px solid #e65100` }}>
              <div style={st.cardLabel}>Largest Single Expense</div>
              <div style={st.cardAmount}>Rs {maxExpense.toLocaleString()}</div>
              <div style={st.cardHint}>Highest amount in filtered view</div>
          </div>
      </div>

      <div style={st.tableWrap}>
          <div style={st.tableSearch}>
              <Search size={14} style={{ color: '#708571' }} />
              <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search expenses..."
                  style={st.searchInput}
              />
              <button style={st.secondaryBtn} onClick={handleExportExcel}>
                <FileDown size={14} /> Export
              </button>
          </div>
          
          <div style={{ display: 'flex', gap: 16, padding: '0 20px', borderBottom: '1px solid #c8d8c8', background: '#fafdfa' }}>
            {categories.map(cat => {
              const display = cat === "Salary/Wages" ? "Salary" : cat;
              const isActive = categoryFilter.toLowerCase() === display.toLowerCase() || categoryFilter.toLowerCase() === cat.toLowerCase();
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(display)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '12px 4px',
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? '#1b3a1d' : '#5a755c',
                    borderBottom: isActive ? '2px solid #2e7d32' : '2px solid transparent',
                    cursor: 'pointer'
                  }}
                >
                  {display}
                </button>
              )
            })}
          </div>

          <div style={st.tableContainer}>
              <style>
                  {`
                  .expense-table th { padding: 12px 20px; font-size: 12px; font-weight: 600; color: #6a8f6c; text-transform: uppercase; border-bottom: 2px solid #c8d8c8; }
                  .expense-table td { padding: 14px 20px; }
                  @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 0.3; } 100% { opacity: 0.6; } }
                  `}
              </style>
              <table style={st.table} className="expense-table">
                  <thead>
                      <tr>
                          <th style={{ width: 90 }}>Date</th>
                          <th style={{ width: 140 }}>Category</th>
                          <th>Description</th>
                          <th style={{ width: 180 }}>Debit (To)</th>
                          <th style={{ width: 180 }}>Credit (From)</th>
                          <th style={{ textAlign: 'right', color: '#1b3a1d', width: 120 }}>Amount</th>
                      </tr>
                  </thead>
                  <tbody>
                      {loading ? (
                          [...Array(4)].map((_, i) => (
                            <tr key={i}>
                              {[...Array(6)].map((_, j) => (
                                <td key={j}><div className="skeleton" style={{ height: 14, borderRadius: 2, background: '#e8f0e8', animation: 'pulse 1.5s infinite' }} /></td>
                              ))}
                            </tr>
                          ))
                      ) : filtered.length === 0 ? (
                          <tr><td colSpan={6} style={{ textAlign: 'center', padding: 36, color: '#708571', fontSize: 13 }}>
                              No expenses recorded yet.
                          </td></tr>
                      ) : filtered.map((e, idx) => {
                          const eDate = e.date || e.expenseDate;
                          const prevDate = idx > 0 ? (filtered[idx - 1].date || filtered[idx - 1].expenseDate) : null;
                          const showDateRow = eDate !== prevDate;

                          return (
                              <React.Fragment key={e.id || idx}>
                                  {showDateRow && (
                                      <tr>
                                          <td colSpan={6} style={st.dateSeparator}>
                                              {new Date(eDate + 'T00:00:00').toLocaleDateString('en-PK', {
                                                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                                              })}
                                          </td>
                                      </tr>
                                  )}
                                  <tr style={st.dataRow}>
                                      <td style={{ fontFamily: 'monospace', fontSize: 13, color: '#6a8f6c' }}>
                                          {eDate}
                                      </td>
                                      <td style={{ fontSize: 14, fontWeight: 600, color: '#1b3a1d' }}>
                                          {e.category}
                                      </td>
                                      <td style={{ fontSize: 14, color: '#333' }}>
                                          {e.description}
                                      </td>
                                      <td style={{ fontSize: 13, color: '#555' }}>
                                          {e.debit || e.moneyTo}
                                      </td>
                                      <td style={{ fontSize: 13, color: '#555' }}>
                                          {e.credit || e.moneyFrom}
                                      </td>
                                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#1b3a1d' }}>
                                          Rs {Number(e.amount || 0).toLocaleString()}
                                      </td>
                                  </tr>
                              </React.Fragment>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </div>
    </>
  );
}
