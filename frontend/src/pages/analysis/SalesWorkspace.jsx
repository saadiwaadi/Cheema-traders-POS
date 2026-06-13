import { useEffect, useState } from "react";
import { st } from "./shared/analysisStyles";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { getSalesSummaryMtd, getWeeklySalesActual, getProductMovementMtd } from "../../lib/posApi";

export default function SalesWorkspace() {
  const [summary, setSummary] = useState({
    dailyAverage: 0,
    mtdCount: 0,
    mtdAverageBill: 0,
    topCategory: "None"
  });
  const [performanceData, setPerformanceData] = useState([]);
  const [salesData, setSalesData] = useState([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    getSalesSummaryMtd().then(setSummary).catch(console.error);
    getWeeklySalesActual().then(setPerformanceData).catch(console.error);
    getProductMovementMtd().then((data) => {
      if (data) {
        const mapped = data.map((item) => {
          const u = item.unitsSold || 0;
          return {
            product: item.product,
            category: item.category,
            unitsSold: u,
            turnover: u > 100 ? "High" : u > 20 ? "Medium" : "Low",
            velocity: u > 100 ? "Fast" : u > 20 ? "Stable" : "Slow"
          };
        });
        setSalesData(mapped);
      }
    }).catch(console.error);
  }, []);

  const salesSummary = [
    { label: "Daily Average", value: `Rs ${summary.dailyAverage.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
    { label: "Invoice Count (MTD)", value: summary.mtdCount.toLocaleString() },
    { label: "Average Bill Value", value: `Rs ${summary.mtdAverageBill.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
    { label: "Top Category", value: summary.topCategory },
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
          {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: "var(--text-secondary)" }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--text-secondary)" }} tickFormatter={(val) => `Rs ${val / 1000}k`} />
                <Tooltip 
                  cursor={{ fill: "var(--surface-secondary)" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
                  itemStyle={{ color: "var(--text-primary)" }}
                  labelStyle={{ color: "var(--text-secondary)", fontWeight: 600 }}
                  formatter={(value) => [`Rs ${value.toLocaleString()}`, ""]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 13, paddingTop: 10 }} />
                <Bar dataKey="actual" name="Actual Sales" fill="#388e3c" radius={[4, 4, 0, 0]} barSize={40} />
                <Bar dataKey="target" name="Target" fill="#a5d6a7" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
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
