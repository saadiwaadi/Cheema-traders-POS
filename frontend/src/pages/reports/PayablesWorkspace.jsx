import React, { useState, useEffect, useCallback } from "react";
import { CreditCard, RefreshCw, FileDown } from "lucide-react";
import { getPayables } from "../../lib/posApi";
import { st } from "./shared/reportsStyles";
import * as XLSX from "xlsx";

export default function PayablesWorkspace() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [agingFilter, setAgingFilter] = useState('All');

  const [data, setData] = useState({ rows: [], summary: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPayables({ from, to, search, aging: agingFilter });
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, search, agingFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = () => {
    const wsData = [
      ["PO/Bill #", "Date", "Supplier", "Total (Rs.)", "Paid (Rs.)", "Balance Due (Rs.)", "Aging"]
    ];
    data.rows.forEach(r => {
      wsData.push([
        r.invoice_no, r.purchase_date, r.supplier_name, r.total, r.amount_paid, r.balance_due, r.aging_bucket
      ]);
    });
    wsData.push(["", "", "TOTAL", data.summary.total_owed || 0, data.summary.total_paid || 0, data.summary.total_payable || 0, ""]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payables");
    XLSX.writeFile(wb, `Payables_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getAgingBadge = (bucket) => {
    switch (bucket) {
      case 'Current': return st.badgeCurrent;
      case '1-30d': return st.badge1_30;
      case '31-60d': return st.badge31_60;
      case '61-90d': return st.badge61_90;
      case '90+': return st.badge90Plus;
      default: return st.badgeCurrent;
    }
  };

  return (
    <div>
      <div style={{ ...st.pageTitle, marginBottom: 20 }}>
        <CreditCard size={24} /> Payables
      </div>

      <div style={{ ...st.cardWrapper, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div style={{ padding: 20, borderRight: '1px solid #c8d8c8' }}>
          <div style={st.cardLabel}>TOTAL INVOICED</div>
          <div style={{ ...st.cardValue, ...st.valueNeutral }}>Rs. {Number(data.summary.total_owed || 0).toLocaleString()}</div>
        </div>
        <div style={{ padding: 20, borderRight: '1px solid #c8d8c8' }}>
          <div style={st.cardLabel}>TOTAL PAID</div>
          <div style={{ ...st.cardValue, ...st.valueGreen }}>Rs. {Number(data.summary.total_paid || 0).toLocaleString()}</div>
        </div>
        <div style={{ padding: 20, borderRight: '1px solid #c8d8c8' }}>
          <div style={st.cardLabel}>BALANCE DUE</div>
          <div style={{ ...st.cardValue, ...st.valueRed }}>Rs. {Number(data.summary.total_payable || 0).toLocaleString()}</div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={st.cardLabel}>OVERDUE COUNT</div>
          <div style={{ ...st.cardValue, ...st.valueRed }}>{data.summary.overdue_count || 0}</div>
        </div>
      </div>

      <div style={st.cardWrapper}>
        <div style={st.filterBar}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={st.input} />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={st.input} />
          <input type="text" placeholder="Search supplier..." value={search} onChange={e => setSearch(e.target.value)} style={st.input} />
          <select value={agingFilter} onChange={e => setAgingFilter(e.target.value)} style={st.input}>
            <option value="All">All Aging</option>
            <option value="Current">Current</option>
            <option value="1-30d">1-30d</option>
            <option value="31-60d">31-60d</option>
            <option value="61-90d">61-90d</option>
            <option value="90+">90+</option>
          </select>
          <button onClick={loadData} style={st.btnPrimary}><RefreshCw size={14} /> Refresh</button>
          <button onClick={handleExport} style={st.btnSecondary}><FileDown size={14} /> Export</button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={st.emptyState}>Loading...</div>
          ) : error ? (
            <div style={st.errorState}>{error}</div>
          ) : data.rows.length === 0 ? (
            <div style={st.emptyState}>No records found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={st.thStyle}>PO/Bill #</th>
                  <th style={st.thStyle}>Date</th>
                  <th style={st.thStyle}>Supplier</th>
                  <th style={{ ...st.thStyle, textAlign: 'right' }}>Total (Rs.)</th>
                  <th style={{ ...st.thStyle, textAlign: 'right' }}>Paid (Rs.)</th>
                  <th style={{ ...st.thStyle, textAlign: 'right' }}>Balance Due (Rs.)</th>
                  <th style={st.thStyle}>Aging</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={st.tdStyle}>{r.invoice_no}</td>
                    <td style={st.tdStyle}>{r.purchase_date}</td>
                    <td style={st.tdStyle}>{r.supplier_name}</td>
                    <td style={{ ...st.tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{Number(r.total).toLocaleString()}</td>
                    <td style={{ ...st.tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{Number(r.amount_paid).toLocaleString()}</td>
                    <td style={{ ...st.tdStyle, textAlign: 'right', fontFamily: 'monospace', color: '#c62828' }}>{Number(r.balance_due).toLocaleString()}</td>
                    <td style={st.tdStyle}><span style={getAgingBadge(r.aging_bucket)}>{r.aging_bucket}</span></td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} style={{ ...st.tdStyle, ...st.totalsRow, textAlign: 'right' }}>TOTAL</td>
                  <td style={{ ...st.tdStyle, ...st.totalsRow, textAlign: 'right' }}>{Number(data.summary.total_owed || 0).toLocaleString()}</td>
                  <td style={{ ...st.tdStyle, ...st.totalsRow, textAlign: 'right' }}>{Number(data.summary.total_paid || 0).toLocaleString()}</td>
                  <td style={{ ...st.tdStyle, ...st.totalsRow, textAlign: 'right' }}>{Number(data.summary.total_payable || 0).toLocaleString()}</td>
                  <td style={{ ...st.tdStyle, ...st.totalsRow }}></td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
