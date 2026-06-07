import React, { useState, useEffect, useCallback } from "react";
import { TrendingUp, RefreshCw, FileDown } from "lucide-react";
import { getCashFlow } from "../../lib/posApi";
import { st } from "./shared/reportsStyles";
import * as XLSX from "xlsx";

export default function CashFlowWorkspace() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(today);
  const [period, setPeriod] = useState('monthly');

  const [data, setData] = useState({ rows: [], summary: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCashFlow({ from, to, period });
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = () => {
    const wsData = [
      ["Period", "Inflow (Rs.)", "Outflow (Rs.)", "Net (Rs.)", "Running Balance (Rs.)"]
    ];
    data.rows.forEach(r => {
      wsData.push([
        r.period, r.total_inflow, r.total_outflow, r.net, r.running_balance
      ]);
    });
    wsData.push(["TOTAL", data.summary.total_inflow || 0, data.summary.total_outflow || 0, data.summary.net_cashflow || 0, ""]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CashFlow");
    XLSX.writeFile(wb, `CashFlow_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getNetColor = (val) => val >= 0 ? '#2e7d32' : '#c62828';

  return (
    <div>
      <div style={{ ...st.pageTitle, marginBottom: 20 }}>
        <TrendingUp size={24} /> Cash Flow
      </div>

      <div style={{ ...st.cardWrapper, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div style={{ padding: 20, borderRight: '1px solid #c8d8c8' }}>
          <div style={st.cardLabel}>TOTAL INFLOW</div>
          <div style={{ ...st.cardValue, ...st.valueGreen }}>Rs. {Number(data.summary.total_inflow || 0).toLocaleString()}</div>
        </div>
        <div style={{ padding: 20, borderRight: '1px solid #c8d8c8' }}>
          <div style={st.cardLabel}>TOTAL OUTFLOW</div>
          <div style={{ ...st.cardValue, ...st.valueRed }}>Rs. {Number(data.summary.total_outflow || 0).toLocaleString()}</div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={st.cardLabel}>NET CASH FLOW</div>
          <div style={{ ...st.cardValue, color: getNetColor(data.summary.net_cashflow || 0) }}>Rs. {Number(data.summary.net_cashflow || 0).toLocaleString()}</div>
        </div>
      </div>

      <div style={st.cardWrapper}>
        <div style={st.filterBar}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={st.input} />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={st.input} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => setPeriod('daily')} 
              style={period === 'daily' ? st.btnPrimary : st.btnSecondary}
            >Daily</button>
            <button 
              onClick={() => setPeriod('monthly')} 
              style={period === 'monthly' ? st.btnPrimary : st.btnSecondary}
            >Monthly</button>
          </div>
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
                  <th style={st.thStyle}>Period</th>
                  <th style={{ ...st.thStyle, textAlign: 'right' }}>Inflow (Rs.)</th>
                  <th style={{ ...st.thStyle, textAlign: 'right' }}>Outflow (Rs.)</th>
                  <th style={{ ...st.thStyle, textAlign: 'right' }}>Net (Rs.)</th>
                  <th style={{ ...st.thStyle, textAlign: 'right' }}>Running Balance (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={st.tdStyle}>{r.period}</td>
                    <td style={{ ...st.tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{Number(r.total_inflow).toLocaleString()}</td>
                    <td style={{ ...st.tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{Number(r.total_outflow).toLocaleString()}</td>
                    <td style={{ ...st.tdStyle, textAlign: 'right', fontFamily: 'monospace', color: getNetColor(r.net) }}>{Number(r.net).toLocaleString()}</td>
                    <td style={{ ...st.tdStyle, textAlign: 'right', fontFamily: 'monospace', color: getNetColor(r.running_balance) }}>{Number(r.running_balance).toLocaleString()}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...st.tdStyle, ...st.totalsRow, textAlign: 'right' }}>TOTAL</td>
                  <td style={{ ...st.tdStyle, ...st.totalsRow, textAlign: 'right' }}>{Number(data.summary.total_inflow || 0).toLocaleString()}</td>
                  <td style={{ ...st.tdStyle, ...st.totalsRow, textAlign: 'right' }}>{Number(data.summary.total_outflow || 0).toLocaleString()}</td>
                  <td style={{ ...st.tdStyle, ...st.totalsRow, textAlign: 'right', color: getNetColor(data.summary.net_cashflow || 0) }}>{Number(data.summary.net_cashflow || 0).toLocaleString()}</td>
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
