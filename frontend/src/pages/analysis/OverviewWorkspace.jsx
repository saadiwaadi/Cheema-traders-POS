import { st } from "./shared/analysisStyles";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";

export default function OverviewWorkspace() {
  const revenueData = [
    { day: "Mon", revenue: 84000 },
    { day: "Tue", revenue: 92000 },
    { day: "Wed", revenue: 78000 },
    { day: "Thu", revenue: 110500 },
    { day: "Fri", revenue: 125000 },
    { day: "Sat", revenue: 148200 },
    { day: "Sun", revenue: 65000 },
  ];

  const categoryData = [
    { name: "Insecticides", sales: 450000 },
    { name: "Herbicides", sales: 320000 },
    { name: "Fungicides", sales: 210000 },
    { name: "Fertilizers", sales: 180000 },
    { name: "Seeds", sales: 95000 },
  ];

  const stockAlerts = [
    { product: "Roundup (1L)", issue: "Expiry Risk", detail: "Expires in 18 days", status: "warning" },
    { product: "Mospilan (50g)", issue: "Low Stock", detail: "Only 8 bottles left", status: "danger" },
    { product: "Coragen (50ml)", issue: "Low Stock", detail: "Only 2 bottles left", status: "danger" },
  ];

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
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4caf50" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#4caf50" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4eee4" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#708571" }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#708571" }} tickFormatter={(val) => `Rs ${val / 1000}k`} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #dbe8db", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
                  formatter={(value) => [`Rs ${value.toLocaleString()}`, "Revenue"]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#388e3c" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e4eee4" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#708571" }} tickFormatter={(val) => `${val / 1000}k`} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#355437", fontWeight: 500 }} />
                <Tooltip
                  cursor={{ fill: "#f1f6f1" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid #dbe8db" }}
                  formatter={(value) => [`Rs ${value.toLocaleString()}`, "Sales"]}
                />
                <Bar dataKey="sales" fill="#6da56f" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
