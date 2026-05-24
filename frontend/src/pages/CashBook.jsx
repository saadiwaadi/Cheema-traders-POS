import { useState, useEffect, useCallback } from 'react';
import { Search, Printer, FileDown } from 'lucide-react';

function fmt(n) { return (n || 0).toLocaleString(); }

function printCashBook(entries, startDate, endDate) {
    const withBalance = computeRunning(entries);

    const totalCashIn = entries.reduce((s, e) => s + (e.cash_in || 0), 0);
    const totalCashOut = entries.reduce((s, e) => s + (e.cash_out || 0), 0);
    const totalBankIn = entries.reduce((s, e) => s + (e.bank_in || 0), 0);
    const totalBankOut = entries.reduce((s, e) => s + (e.bank_out || 0), 0);
    const closingCash = totalCashIn - totalCashOut;
    const closingBank = totalBankIn - totalBankOut;

    const rows = withBalance.map((e) => `
        <tr>
            <td>${e.entry_date || ''}</td>
            <td>${e.description || ''}${e.receipt_number ? ` <span class="muted">#${e.receipt_number}</span>` : ''}</td>
            <td class="num in">${e.cash_in > 0 ? fmt(e.cash_in) : '—'}</td>
            <td class="num out">${e.cash_out > 0 ? fmt(e.cash_out) : '—'}</td>
            <td class="num in">${e.bank_in > 0 ? fmt(e.bank_in) : '—'}</td>
            <td class="num out">${e.bank_out > 0 ? fmt(e.bank_out) : '—'}</td>
            <td class="num">${fmt(e.cash_balance)}</td>
            <td class="num">${fmt(e.bank_balance)}</td>
        </tr>
    `).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cash Book</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 16px; }
        h2 { font-size: 15px; text-align: center; margin-bottom: 2px; color: #1a2e5a; }
        .sub { text-align: center; font-size: 10px; color: #555; margin-bottom: 10px; }
        .meta { display: flex; justify-content: space-between; font-size: 10px; color: #666; margin-bottom: 10px; padding: 4px 0; border-bottom: 1px solid #ddd; }
        table { width: 100%; border-collapse: collapse; }
        thead th {
            background: #1a4a7a; color: #fff; padding: 5px 7px;
            font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
            border: 1px solid #0e3060;
        }
        tbody td { border-bottom: 1px dotted #d8e0ec; padding: 4px 7px; font-size: 10.5px; }
        td.num { text-align: right; font-family: 'Courier New', monospace; }
        td.in { color: #15803d; }
        td.out { color: #b91c1c; }
        .muted { color: #777; font-size: 10px; font-family: 'Courier New', monospace; }
        tfoot td { background: #1a4a7a; color: #fff; font-weight: 700; padding: 6px 7px; border-top: 2px solid #0e3060; }
        .numf { text-align: right; font-family: 'Courier New', monospace; }
        @media print { body { padding: 0; } }
    </style>
    </head><body>
    <h2>Store Name POS</h2>
    <div class="sub">Cash Book — ${startDate} to ${endDate}</div>
    <div class="meta"><span>${entries.length} entries</span><span>Printed: ${new Date().toLocaleDateString()}</span></div>
    <table>
      <thead><tr>
        <th style="width:92px">Date</th>
        <th>Description</th>
        <th style="width:84px">Cash In</th>
        <th style="width:84px">Cash Out</th>
        <th style="width:84px">Bank In</th>
        <th style="width:84px">Bank Out</th>
        <th style="width:90px">Cash Bal.</th>
        <th style="width:90px">Bank Bal.</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="2" style="letter-spacing:0.05em;font-size:10px;">TOTALS / CLOSING</td>
        <td class="numf">${fmt(totalCashIn)}</td>
        <td class="numf">${fmt(totalCashOut)}</td>
        <td class="numf">${fmt(totalBankIn)}</td>
        <td class="numf">${fmt(totalBankOut)}</td>
        <td class="numf">${fmt(closingCash)}</td>
        <td class="numf">${fmt(closingBank)}</td>
      </tr></tfoot>
    </table>
    <script>window.onload = () => { window.print(); }<\/script>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
}

// Running cash and bank totals from a list of entries
function computeRunning(entries) {
    let cashBal = 0, bankBal = 0;
    return entries.map(e => {
        cashBal += (e.cash_in || 0) - (e.cash_out || 0);
        bankBal += (e.bank_in || 0) - (e.bank_out || 0);
        return { ...e, cash_balance: cashBal, bank_balance: bankBal };
    });
}

const MOCK_ENTRIES = [
    { id: 1, entry_date: '2026-05-18', description: 'Opening Balance', receipt_number: '', cash_in: 50000, cash_out: 0, bank_in: 150000, bank_out: 0 },
    { id: 2, entry_date: '2026-05-18', description: 'Sale: INV-1042 (Walk-in)', receipt_number: 'INV-1042', cash_in: 15400, cash_out: 0, bank_in: 0, bank_out: 0 },
    { id: 3, entry_date: '2026-05-18', description: 'WAPDA Electricity Bill', receipt_number: '', cash_in: 0, cash_out: 4500, bank_in: 0, bank_out: 0 },
    { id: 4, entry_date: '2026-05-19', description: 'Sale: INV-1043 (Ali Traders)', receipt_number: 'INV-1043', cash_in: 0, cash_out: 0, bank_in: 42000, bank_out: 0 },
    { id: 5, entry_date: '2026-05-19', description: 'Office Supplies', receipt_number: '', cash_in: 0, cash_out: 1200, bank_in: 0, bank_out: 0 },
    { id: 6, entry_date: '2026-05-20', description: 'Supplier Payment (Bayer)', receipt_number: 'BILL-55', cash_in: 0, cash_out: 0, bank_in: 0, bank_out: 12000 },
    { id: 7, entry_date: '2026-05-20', description: 'Transfer to Bank', receipt_number: '', cash_in: 0, cash_out: 20000, bank_in: 20000, bank_out: 0 },
];

export default function CashBookPage() {
    const now = new Date();
    const [startDate, setStartDate] = useState(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    );
    const [endDate, setEndDate] = useState(
        now.toISOString().split('T')[0]
    );
    const [entries, setEntries] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        // Simulating API load for the frontend design preview
        setTimeout(() => {
            setEntries(MOCK_ENTRIES);
            setLoading(false);
        }, 400);
    }, []);

    useEffect(() => { load(); }, [load]);

    const q = search.toLowerCase();
    const filtered = q
        ? entries.filter(e => e.description?.toLowerCase().includes(q) || e.receipt_number?.toLowerCase().includes(q))
        : entries;

    const withBalance = computeRunning(filtered);

    const totalCashIn = filtered.reduce((s, e) => s + (e.cash_in || 0), 0);
    const totalCashOut = filtered.reduce((s, e) => s + (e.cash_out || 0), 0);
    const totalBankIn = filtered.reduce((s, e) => s + (e.bank_in || 0), 0);
    const totalBankOut = filtered.reduce((s, e) => s + (e.bank_out || 0), 0);
    const closingCash = totalCashIn - totalCashOut;
    const closingBank = totalBankIn - totalBankOut;

    return (
        <div style={st.page}>
            <div style={st.pageHeader}>
                <div>
                    <h1 style={st.title}>Cash Book</h1>
                    <p style={st.subtitle}>Daily record of all cash and bank movements</p>
                </div>
                <div style={st.headerActions}>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={st.dateInput} />
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={st.dateInput} />
                    {filtered.length > 0 && (
                        <>
                        <button style={st.btnGhost} onClick={() => alert('Excel export will be wired up with backend!')}>
                            <FileDown size={15} /> Export Excel
                        </button>
                        <button style={st.btnGhost} onClick={() => printCashBook(filtered, startDate, endDate)}>
                            <Printer size={15} /> Print
                        </button>
                        </>
                    )}
                </div>
            </div>

            <div style={st.cardsGrid}>
                {/* Cash balance */}
                <div style={{ ...st.card, borderLeft: `3px solid ${closingCash >= 0 ? '#388e3c' : '#d32f2f'}` }}>
                    <div style={st.cardLabel}>Cash in Hand</div>
                    <div style={{ ...st.cardAmount, color: closingCash >= 0 ? '#1b3a1d' : '#d32f2f' }}>
                        Rs. {fmt(closingCash)}
                    </div>
                    <div style={st.cardMetrics}>
                        <span style={{ color: '#388e3c' }}>In Rs. {fmt(totalCashIn)}</span>
                        <span style={{ color: '#d32f2f' }}>Out Rs. {fmt(totalCashOut)}</span>
                    </div>
                    <div style={st.cardHint}>Count physical cash — should match this number</div>
                </div>

                {/* Bank balance */}
                <div style={{ ...st.card, borderLeft: `3px solid ${closingBank >= 0 ? '#1976d2' : '#d32f2f'}` }}>
                    <div style={st.cardLabel}>Bank Balance</div>
                    <div style={{ ...st.cardAmount, color: closingBank >= 0 ? '#1b3a1d' : '#d32f2f' }}>
                        Rs. {fmt(closingBank)}
                    </div>
                    <div style={st.cardMetrics}>
                        <span style={{ color: '#388e3c' }}>In Rs. {fmt(totalBankIn)}</span>
                        <span style={{ color: '#d32f2f' }}>Out Rs. {fmt(totalBankOut)}</span>
                    </div>
                    <div style={st.cardHint}>Compare against bank statement</div>
                </div>
            </div>

            <div style={st.tableWrap}>
                <div style={st.tableSearch}>
                    <Search size={14} style={{ color: '#708571' }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search transactions..."
                        style={st.searchInput}
                    />
                </div>

                <div style={st.tableContainer}>
                    <style>
                        {`
                        .cashbook-table th { padding: 12px 20px; font-size: 12px; font-weight: 600; color: #6a8f6c; text-transform: uppercase; border-bottom: 2px solid #e8f0e8; }
                        .cashbook-table td { padding: 14px 20px; }
                        `}
                    </style>
                    <table style={st.table} className="cashbook-table">
                        <thead>
                            <tr>
                                <th style={{ width: 90 }}>Date</th>
                                <th>Description</th>
                                <th style={{ textAlign: 'right', color: '#388e3c', width: 110 }}>Cash In</th>
                                <th style={{ textAlign: 'right', color: '#d32f2f', width: 110 }}>Cash Out</th>
                                <th style={{ textAlign: 'right', color: '#388e3c', width: 110 }}>Bank In</th>
                                <th style={{ textAlign: 'right', color: '#d32f2f', width: 110 }}>Bank Out</th>
                                <th style={{ textAlign: 'right', width: 110 }}>Cash Bal.</th>
                                <th style={{ textAlign: 'right', width: 110 }}>Bank Bal.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#708571', fontSize: 13 }}>
                                    Loading...
                                </td></tr>
                            ) : withBalance.length === 0 ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 36, color: '#708571', fontSize: 13 }}>
                                    No transactions in this period
                                </td></tr>
                            ) : withBalance.map((e, idx) => {
                                const prevDate = idx > 0 ? withBalance[idx - 1].entry_date : null;
                                const showDateRow = e.entry_date !== prevDate;

                                return (
                                    <React.Fragment key={e.id}>
                                        {showDateRow && (
                                            <tr>
                                                <td colSpan={8} style={st.dateSeparator}>
                                                    {new Date(e.entry_date + 'T00:00:00').toLocaleDateString('en-PK', {
                                                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                                                    })}
                                                </td>
                                            </tr>
                                        )}
                                        <tr style={st.dataRow}>
                                            <td style={{ fontFamily: 'monospace', fontSize: 13, color: '#6a8f6c' }}>
                                                {e.entry_date}
                                            </td>
                                            <td style={{ fontSize: 14, color: '#333' }}>
                                                {e.description}
                                                {e.receipt_number && (
                                                    <span style={{ marginLeft: 6, fontSize: 12, color: '#888', fontFamily: 'monospace' }}>
                                                        #{e.receipt_number}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: e.cash_in > 0 ? '#388e3c' : '#bbb' }}>
                                                {e.cash_in > 0 ? fmt(e.cash_in) : '—'}
                                            </td>
                                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: e.cash_out > 0 ? '#d32f2f' : '#bbb' }}>
                                                {e.cash_out > 0 ? fmt(e.cash_out) : '—'}
                                            </td>
                                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: e.bank_in > 0 ? '#388e3c' : '#bbb' }}>
                                                {e.bank_in > 0 ? fmt(e.bank_in) : '—'}
                                            </td>
                                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: e.bank_out > 0 ? '#d32f2f' : '#bbb' }}>
                                                {e.bank_out > 0 ? fmt(e.bank_out) : '—'}
                                            </td>
                                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: e.cash_balance >= 0 ? '#1b3a1d' : '#d32f2f' }}>
                                                {fmt(e.cash_balance)}
                                            </td>
                                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: e.bank_balance >= 0 ? '#1b3a1d' : '#d32f2f' }}>
                                                {fmt(e.bank_balance)}
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                        {withBalance.length > 0 && (
                            <tfoot>
                                <tr style={{ borderTop: '2px solid #cde0cd', background: '#f9fcf9' }}>
                                    <td colSpan={2} style={{ padding: '12px 16px', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', color: '#6a8f6c' }}>
                                        Period Total
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#388e3c', padding: '12px 16px' }}>
                                        {fmt(totalCashIn)}
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#d32f2f', padding: '12px 16px' }}>
                                        {fmt(totalCashOut)}
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#388e3c', padding: '12px 16px' }}>
                                        {fmt(totalBankIn)}
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#d32f2f', padding: '12px 16px' }}>
                                        {fmt(totalBankOut)}
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 14, padding: '12px 16px', color: closingCash >= 0 ? '#1b3a1d' : '#d32f2f' }}>
                                        {fmt(closingCash)}
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 14, padding: '12px 16px', color: closingBank >= 0 ? '#1b3a1d' : '#d32f2f' }}>
                                        {fmt(closingBank)}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}

import React from 'react';

const st = {
    page: { display: 'flex', flexDirection: 'column', height: '100%', background: '#f0f6f0', padding: 24, overflowY: 'auto' },
    pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    title: { margin: 0, fontSize: 24, fontWeight: 'bold', color: '#1b3a1d' },
    subtitle: { margin: '4px 0 0 0', fontSize: 14, color: '#6a8f6c' },
    headerActions: { display: 'flex', gap: 12, alignItems: 'center' },
    dateInput: { padding: '8px 12px', border: '1px solid #d3e5d3', borderRadius: 8, outline: 'none', color: '#1b3a1d', fontFamily: 'monospace' },
    btnGhost: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#fff', border: '1px solid #d3e5d3', borderRadius: 8, color: '#1b3a1d', fontWeight: 500, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' },
    
    cardsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 },
    card: { background: '#fff', padding: '24px', borderRadius: 12, border: '1px solid #e8f0e8', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' },
    cardLabel: { fontSize: 12, fontFamily: 'monospace', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6a8f6c', marginBottom: 12 },
    cardAmount: { fontSize: 32, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 10 },
    cardMetrics: { display: 'flex', gap: 24, fontSize: 13, fontFamily: 'monospace', fontWeight: 500 },
    cardHint: { fontSize: 11, color: '#999', marginTop: 12, fontStyle: 'italic' },
    
    tableWrap: { background: '#fff', borderRadius: 12, border: '1px solid #e8f0e8', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    tableSearch: { padding: '12px 20px', borderBottom: '1px solid #e8f0e8', display: 'flex', alignItems: 'center', gap: 10, background: '#fafdfa' },
    searchInput: { border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: '#1b3a1d', width: '100%', padding: '4px 0' },
    
    tableContainer: { overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
    dateSeparator: { 
        background: '#e8f5e9', /* Color coding: subtle green highlight */
        padding: '16px 20px',  /* Less congested */
        fontSize: 12, 
        fontFamily: 'system-ui, sans-serif', 
        fontWeight: 700, 
        color: '#1b3a1d',      /* Higher contrast */
        letterSpacing: '0.07em', 
        borderBottom: '2px solid #c8e6c9', 
        borderTop: '2px solid #c8e6c9', 
        textTransform: 'uppercase' /* Capitalization */
    },
    dataRow: { borderBottom: '1px solid #f2f7f2' },
};
// Table headers/cells are styled inline above to mimic the requested specific table CSS.
