import { st } from "./shared/analysisStyles";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function SalesWorkspace() {
  const salesSummary = [
    { label: "Daily Average", value: "Rs 112,000" },
    { label: "Invoice Count (MTD)", value: "342" },
    { label: "Average Bill Value", value: "Rs 8,400" },
    { label: "Top Category", value: "Insecticides" },
  ];

  const salesData = [
    { product: "Roundup (1L)", category: "Herbicide", unitsSold: 142, turnover: "High", velocity: "Fast" },
    { product: "Mospilan (50g)", category: "Insecticide", unitsSold: 118, turnover: "High", velocity: "Fast" },
    { product: "Coragen (50ml)", category: "Pesticide", unitsSold: 74, turnover: "Medium", velocity: "Stable" },
    { product: "Confidor (250ml)", category: "Insecticide", unitsSold: 52, turnover: "Medium", velocity: "Stable" },
    { product: "Nativo (65g)", category: "Fungicide", unitsSold: 12, turnover: "Low", velocity: "Slow" },
    { product: "Aliette (250g)", category: "Fungicide", unitsSold: 9, turnover: "Low", velocity: "Slow" },
    { product: "DAP Fertilizer (50kg)", category: "Fertilizer", unitsSold: 85, turnover: "High", velocity: "Fast" },
  ];

  const performanceData = [
    { week: "Week 1", actual: 420000, target: 400000 },
    { week: "Week 2", actual: 480000, target: 420000 },
    { week: "Week 3", actual: 390000, target: 450000 },
    { week: "Week 4", actual: 510000, target: 450000 },
  ];

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
            <span style={{ flex: 1.2 }}>Category</span>
            <span style={{ flex: 1, textAlign: "right" }}>Units Sold (MTD)</span>
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
