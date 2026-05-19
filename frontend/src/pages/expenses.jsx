import React, { useState } from "react";
import { Search, PlusCircle, List, FileDown } from "lucide-react";

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
  const [moneyTo, setMoneyTo] = useState("WAPDA (Electricity)");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);

  const handleSave = () => {
    console.log("Saving expense...", { amount, category, moneyFrom, moneyTo, description, expenseDate });
    onSaved();
  };

  return (
    <div style={st.card}>
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
          <input style={st.input} placeholder="e.g. WAPDA, Vendor Name" value={moneyTo} onChange={e => setMoneyTo(e.target.value)} />
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

      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
        <button style={st.primaryBtn} onClick={handleSave}>Save Expense Entry</button>
      </div>
    </div>
  );
}

function ExpenseLogTab() {
  const [search, setSearch] = useState("");
  const [expenses] = useState([
    { id: 1, date: "2026-05-18", category: "Utility", amount: 14500, description: "Electricity bill for the month", debit: "WAPDA (Utility Expense)", credit: "HBL Bank Account" },
    { id: 2, date: "2026-05-18", category: "Transport", amount: 1200, description: "Delivery fuel", debit: "Fuel & Travel", credit: "Petty Cash" },
    { id: 3, date: "2026-05-17", category: "Maintenance", amount: 2500, description: "AC filter cleaning and gas check", debit: "Store Maintenance", credit: "Petty Cash" },
    { id: 4, date: "2026-05-15", category: "Transport", amount: 800, description: "Delivery fuel for urgent order", debit: "Fuel & Travel", credit: "Main Cash Drawer" },
  ]);

  const q = search.toLowerCase();
  const filtered = q
      ? expenses.filter(e => e.description?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q))
      : expenses;

  const totalAmount = filtered.reduce((sum, e) => sum + e.amount, 0);

  return (
    <>
      <div style={st.cardsGrid}>
          <div style={{ ...st.card, borderLeft: `3px solid #1b3a1d` }}>
              <div style={st.cardLabel}>Total Expenses (Filtered)</div>
              <div style={{ ...st.cardAmount, color: '#1b3a1d' }}>
                  Rs. {totalAmount.toLocaleString()}
              </div>
              <div style={st.cardHint}>Total money leaving the business in this view</div>
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
          </div>

          <div style={st.tableContainer}>
              <style>
                  {`
                  .expense-table th { padding: 12px 20px; font-size: 12px; font-weight: 600; color: #6a8f6c; text-transform: uppercase; border-bottom: 2px solid #e8f0e8; }
                  .expense-table td { padding: 14px 20px; }
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
                      {filtered.length === 0 ? (
                          <tr><td colSpan={6} style={{ textAlign: 'center', padding: 36, color: '#708571', fontSize: 13 }}>
                              No expenses recorded yet.
                          </td></tr>
                      ) : filtered.map((e, idx) => {
                          const prevDate = idx > 0 ? filtered[idx - 1].date : null;
                          const showDateRow = e.date !== prevDate;

                          return (
                              <React.Fragment key={e.id}>
                                  {showDateRow && (
                                      <tr>
                                          <td colSpan={6} style={st.dateSeparator}>
                                              {new Date(e.date + 'T00:00:00').toLocaleDateString('en-PK', {
                                                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                                              })}
                                          </td>
                                      </tr>
                                  )}
                                  <tr style={st.dataRow}>
                                      <td style={{ fontFamily: 'monospace', fontSize: 13, color: '#6a8f6c' }}>
                                          {e.date}
                                      </td>
                                      <td style={{ fontSize: 14, fontWeight: 600, color: '#1b3a1d' }}>
                                          {e.category}
                                      </td>
                                      <td style={{ fontSize: 14, color: '#333' }}>
                                          {e.description}
                                      </td>
                                      <td style={{ fontSize: 13, color: '#555' }}>
                                          {e.debit}
                                      </td>
                                      <td style={{ fontSize: 13, color: '#555' }}>
                                          {e.credit}
                                      </td>
                                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#1b3a1d' }}>
                                          Rs {e.amount.toLocaleString()}
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

const st = {
    page: { display: 'flex', flexDirection: 'column', height: '100%', background: '#f0f6f0', padding: 24, overflowY: 'auto', fontFamily: 'system-ui, sans-serif' },
    pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    title: { margin: 0, fontSize: 24, fontWeight: 'bold', color: '#1b3a1d' },
    subtitle: { margin: '4px 0 0 0', fontSize: 14, color: '#6a8f6c' },
    
    navStrip: { display: "flex", gap: 6, background: "#e4ede4", borderRadius: 12, padding: 4 },
    navBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: "10px 18px", border: "none", borderRadius: 9, background: "transparent", fontSize: 14, fontWeight: 600, color: "#5a755c", cursor: "pointer", transition: "background 0.2s" },
    navBtnActive: { background: "#fff", color: "#1d351f", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },

    cardsGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 24, maxWidth: 400 },
    card: { background: '#fff', padding: '24px', borderRadius: 12, border: '1px solid #e8f0e8', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' },
    cardLabel: { fontSize: 12, fontFamily: 'monospace', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6a8f6c', marginBottom: 12 },
    cardAmount: { fontSize: 32, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 10 },
    cardHint: { fontSize: 11, color: '#999', marginTop: 12, fontStyle: 'italic' },
    
    tableWrap: { background: '#fff', borderRadius: 12, border: '1px solid #e8f0e8', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    tableSearch: { padding: '12px 20px', borderBottom: '1px solid #e8f0e8', display: 'flex', alignItems: 'center', gap: 10, background: '#fafdfa' },
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
    
    formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
    fieldWrap: { display: "flex", flexDirection: "column", gap: 6 },
    fieldLabel: { fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase" },
    input: { padding: "12px", border: "1.5px solid #cde0cd", borderRadius: 8, background: "#fafff9", outline: "none", fontSize: 14, color: "#1b3a1d" },
    textarea: { padding: "12px", border: "1.5px solid #cde0cd", borderRadius: 8, background: "#fafff9", outline: "none", fontSize: 14, resize: "vertical", color: "#1b3a1d" },
    fieldHint: { fontSize: 11, color: "#8aab8c" },
  
    primaryBtn: { padding: "12px 24px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: "bold", cursor: "pointer", transition: "background 0.2s" },
};
