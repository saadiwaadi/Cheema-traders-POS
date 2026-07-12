import { st } from "./shared/analysisStyles";

export default function CustomerDuesWorkspace({ analysis }) {
  const rs = (n) => `Rs ${Math.round(Number(n || 0)).toLocaleString()}`;
  // Only customers who actually owe us (positive balance).
  const dues = (analysis?.customerDues || []).filter((c) => Number(c.balance || 0) > 0);
  const total = dues.reduce((s, c) => s + Number(c.balance || 0), 0);
  const top = dues.slice().sort((a, b) => b.balance - a.balance);

  // Concentration buckets (per-invoice aging needs invoice dates not yet exposed).
  const agingData = [
    { bucket: "Total Outstanding", value: rs(total), count: `${dues.length} customers` },
    { bucket: "Largest Single Due", value: rs(top[0]?.balance || 0), count: top[0]?.name || "—" },
    { bucket: "Top 3 Concentration", value: rs(top.slice(0, 3).reduce((s, c) => s + Number(c.balance || 0), 0)), count: "of receivables" },
    { bucket: "Average Due", value: rs(dues.length ? total / dues.length : 0), count: "per customer" },
  ];

  const customerData = top.map((c) => ({
    customer: c.name,
    pending: rs(c.balance),
    lastPayment: c.phone || "—",
    overdue: total ? `${Math.round((Number(c.balance || 0) / total) * 100)}%` : "—",
    status: c.balance >= (total / (dues.length || 1)) ? "Warning" : "Normal",
  }));

  return (
    <>
      <div style={st.card}>
        <div style={st.cardTop}>
          <div>
            <h2 style={st.cardTitle}>Credit Risk Aging</h2>
            <p style={st.cardSubtext}>Outstanding balances grouped by days overdue.</p>
          </div>
        </div>

        <div style={st.agingGrid}>
          {agingData.map((item, i) => (
            <div key={i} style={st.agingCard}>
              <div style={st.agingLabel}>{item.bucket}</div>
              <div style={st.agingValue}>{item.value}</div>
              <div style={st.agingCount}>{item.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <div>
            <h2 style={st.cardTitle}>Customer Pending Dues</h2>
            <p style={st.cardSubtext}>Detailed liability list for credit customers.</p>
          </div>
        </div>

        <div style={st.tableWrap}>
          <div style={st.tableHead}>
            <span style={{ flex: 2 }}>Customer Name</span>
            <span style={{ flex: 1 }}>Pending Amount</span>
            <span style={{ flex: 1.2 }}>Contact</span>
            <span style={{ flex: 1 }}>Share</span>
            <span style={{ width: 100 }}>Risk Status</span>
          </div>

          {customerData.map((item, index) => (
            <div key={index} style={st.tableRow}>
              <span style={{ flex: 2, ...st.cellBold }}>{item.customer}</span>
              <span style={{ flex: 1 }}>{item.pending}</span>
              <span style={{ flex: 1.2 }}>{item.lastPayment}</span>
              <span style={{ flex: 1 }}>{item.overdue}</span>
              <div style={{ width: 100 }}>
                <div style={{
                  ...st.badge,
                  ...(item.status === "Critical" ? st.badgeDanger : item.status === "Warning" ? st.badgeWarning : st.badgeNeutral)
                }}>
                  {item.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
