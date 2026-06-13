import { useEffect, useState } from "react";
import { st } from "./shared/analysisStyles";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { getRevenueTrend, getCategorySalesMtd } from "../../lib/posApi";

export default function OverviewWorkspace() {
  const [revenueData, setRevenueData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    getRevenueTrend().then(setRevenueData).catch(console.error);
    getCategorySalesMtd().then(setCategoryData).catch(console.error);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* CHARTS ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
        <div style={st.card}>
          <div style={st.cardTop}>
            <div>
              <h2 style={st.cardTitle}>7-Day Revenue Trend</h2>
              <p style={st.cardSubtext}>Gross sales volume over the past week.</p>
            </div>
          </div>
          <div style={{ height: 260, width: "100%", marginTop: 10 }}>
            {mounted && (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4caf50" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#4caf50" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--text-secondary)" }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--text-secondary)" }} tickFormatter={(val) => `Rs ${val / 1000}k`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
                    itemStyle={{ color: "var(--text-primary)" }}
                    labelStyle={{ color: "var(--text-secondary)", fontWeight: 600 }}
                    formatter={(value) => [`Rs ${value.toLocaleString()}`, "Revenue"]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#388e3c" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div style={st.card}>
          <div style={st.cardTop}>
            <div>
              <h2 style={st.cardTitle}>Sales by Category</h2>
              <p style={st.cardSubtext}>Revenue distribution (MTD).</p>
            </div>
          </div>
          <div style={{ height: 260, width: "100%", marginTop: 10 }}>
            {mounted && (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} tickFormatter={(val) => `${val / 1000}k`} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--text-primary)", fontWeight: 500 }} />
                  <Tooltip
                    cursor={{ fill: "var(--surface-secondary)" }}
                    contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
                    itemStyle={{ color: "var(--text-primary)" }}
                    labelStyle={{ color: "var(--text-secondary)", fontWeight: 600 }}
                    formatter={(value) => [`Rs ${value.toLocaleString()}`, "Sales"]}
                  />
                  <Bar dataKey="sales" fill="#6da56f" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
