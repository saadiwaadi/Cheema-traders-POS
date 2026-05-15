import { st } from "./shared/analysisStyles";

export default function SalesWorkspace() {
  const salesSummary = [
    { label: "Daily Average", value: "Rs 112,000" },
    { label: "Invoice Count (MTD)", value: "342" },
    { label: "Average Bill Value", value: "Rs 8,400" },
    { label: "Top Category", value: "Insecticides" },
  ];

  const salesData = [
    { product: "Roundup", category: "Herbicide", unitsSold: 142, turnover: "High", velocity: "Fast" },
    { product: "Mospilan", category: "Insecticide", unitsSold: 118, turnover: "High", velocity: "Fast" },
    { product: "Coragen", category: "Pesticide", unitsSold: 74, turnover: "Medium", velocity: "Stable" },
    { product: "Confidor", category: "Insecticide", unitsSold: 52, turnover: "Medium", velocity: "Stable" },
    { product: "Nativo", category: "Fungicide", unitsSold: 12, turnover: "Low", velocity: "Slow" },
  ];

  return (
    <>
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
            <h2 style={st.cardTitle}>Product Movement & Velocity</h2>
            <p style={st.cardSubtext}>Sales performance focusing on stock turnover and product demand.</p>
          </div>
        </div>

        <div style={st.tableWrap}>
          <div style={st.tableHead}>
            <span style={{ flex: 2 }}>Product</span>
            <span style={{ flex: 1.2 }}>Category</span>
            <span style={{ flex: 1 }}>Units Sold (MTD)</span>
            <span style={{ flex: 1 }}>Turnover</span>
            <span style={{ width: 100 }}>Velocity</span>
          </div>

          {salesData.map((item, index) => (
            <div key={index} style={st.tableRow}>
              <span style={{ flex: 2, ...st.cellBold }}>{item.product}</span>
              <span style={{ flex: 1.2 }}>{item.category}</span>
              <span style={{ flex: 1 }}>{item.unitsSold}</span>
              <span style={{ flex: 1 }}>{item.turnover}</span>
              <div style={{ width: 100 }}>
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
    </>
  );
}
