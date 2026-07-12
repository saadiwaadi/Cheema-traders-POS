import { st } from "./shared/analysisStyles";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function SalesWorkspace({ analysis }) {
  const ov = analysis?.overview || {};
  const salesByDay = analysis?.salesByDay || [];
  const topProducts = analysis?.topProducts || [];
  const categorySales = analysis?.categorySales || [];

  const rs = (n) => `Rs ${Math.round(Number(n || 0)).toLocaleString()}`;
  const dayCount = salesByDay.length || 1;
  const dailyAverage = (ov.revenue || 0) / dayCount;
  const avgBill = ov.salesCount ? (ov.revenue || 0) / ov.salesCount : 0;

  const salesSummary = [
    { label: "Total Revenue", value: rs(ov.revenue) },
    { label: "Invoice Count", value: String(ov.salesCount || 0) },
    { label: "Average Bill Value", value: rs(avgBill) },
    { label: "Top Category", value: categorySales[0]?.category || "—" },
  ];

  // Real product movement from sale items; velocity classed by quantity rank.
  const maxQty = topProducts.reduce((m, p) => Math.max(m, Number(p.qty || 0)), 0) || 1;
  const salesData = topProducts.map((p) => {
    const qty = Number(p.qty || 0);
    const ratio = qty / maxQty;
    const velocity = ratio >= 0.66 ? "Fast" : ratio >= 0.33 ? "Stable" : "Slow";
    const turnover = ratio >= 0.66 ? "High" : ratio >= 0.33 ? "Medium" : "Low";
    return { product: p.name, category: rs(p.revenue), unitsSold: qty, turnover, velocity };
  });

  // Actual revenue per day (last 8 days present); no target data, so target omitted.
  const performanceData = salesByDay.slice(-8).map((d) => ({ week: d.date, actual: Number(d.total || 0), target: 0 }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={st.summaryGrid}>
        {salesSummary.map((item, i) => (
          <div key={i} style={st.summaryCard}>
            <div style={st.summaryLabel}>{item.label}</div>
            <div style={st.summaryValue}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <div>
            <h2 style={st.cardTitle}>Sales Performance vs Target</h2>
            <p style={st.cardSubtext}>Weekly actual revenue compared to projected targets for the current month.</p>
          </div>
        </div>
        <div style={{ height: 260, width: "100%", marginTop: 10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={performanceData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4eee4" />
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: "#708571" }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#708571" }} tickFormatter={(val) => `Rs ${val / 1000}k`} />
              <Tooltip 
                cursor={{ fill: "#f1f6f1" }}
                contentStyle={{ borderRadius: 8, border: "1px solid #dbe8db", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
                formatter={(value) => [`Rs ${value.toLocaleString()}`, ""]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 13, paddingTop: 10 }} />
              <Bar dataKey="actual" name="Actual Sales" fill="#388e3c" radius={[4, 4, 0, 0]} barSize={40} />
              <Bar dataKey="target" name="Target" fill="#a5d6a7" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <div>
            <h2 style={st.cardTitle}>Product Movement & Velocity</h2>
            <p style={st.cardSubtext}>Sales performance focusing on stock turnover and product demand.</p>
          </div>
        </div>

        <div style={st.tableWrap}>
          <div style={st.tableHead}>
            <span style={{ flex: 2 }}>Product</span>
            <span style={{ flex: 1.2 }}>Revenue</span>
            <span style={{ flex: 1, textAlign: "right" }}>Units Sold</span>
            <span style={{ flex: 1, textAlign: "center" }}>Turnover</span>
            <span style={{ width: 100, textAlign: "right" }}>Velocity</span>
          </div>

          {salesData.map((item, index) => (
            <div key={index} style={st.tableRow}>
              <span style={{ flex: 2, ...st.cellBold }}>{item.product}</span>
              <span style={{ flex: 1.2, ...st.cellMuted }}>{item.category}</span>
              <span style={{ flex: 1, textAlign: "right", fontWeight: 600 }}>{item.unitsSold}</span>
              <span style={{ flex: 1, textAlign: "center", color: "#4a634b" }}>{item.turnover}</span>
              <div style={{ width: 100, display: "flex", justifyContent: "flex-end" }}>
                <div style={{
                  ...st.badge,
                  ...(item.velocity === "Fast" ? st.badgeSuccess : item.velocity === "Slow" ? st.badgeWarning : st.badgeNeutral)
                }}>
                  {item.velocity}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
