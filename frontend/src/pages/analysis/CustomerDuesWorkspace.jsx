import { st } from "./shared/analysisStyles";

export default function CustomerDuesWorkspace() {
  const agingData = [
    { bucket: "0-30 Days", value: "Rs 45,000", count: "12 Invoices" },
    { bucket: "31-60 Days", value: "Rs 82,400", count: "8 Invoices" },
    { bucket: "61-90 Days", value: "Rs 35,000", count: "3 Invoices" },
    { bucket: "90+ Days", value: "Rs 50,000", count: "4 Invoices" },
  ];

  const customerData = [
    { customer: "Ali Traders", pending: "Rs 50,000", lastPayment: "12 May 2026", overdue: 95, status: "Critical" },
    { customer: "Raza Farms", pending: "Rs 35,000", lastPayment: "01 Jul 2026", overdue: 62, status: "Warning" },
    { customer: "Hassan Agrochemicals", pending: "Rs 82,400", lastPayment: "20 Jul 2026", overdue: 45, status: "Watch" },
    { customer: "Usman Ali", pending: "Rs 45,000", lastPayment: "10 Aug 2026", overdue: 15, status: "Normal" },
  ];

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
            <span style={{ flex: 1.2 }}>Last Payment</span>
            <span style={{ flex: 1 }}>Days Overdue</span>
            <span style={{ width: 100 }}>Risk Status</span>
          </div>

          {customerData.map((item, index) => (
            <div key={index} style={st.tableRow}>
              <span style={{ flex: 2, ...st.cellBold }}>{item.customer}</span>
              <span style={{ flex: 1 }}>{item.pending}</span>
              <span style={{ flex: 1.2 }}>{item.lastPayment}</span>
              <span style={{ flex: 1 }}>{item.overdue} Days</span>
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
