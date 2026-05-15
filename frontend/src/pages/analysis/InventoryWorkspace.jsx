import { st } from "./shared/analysisStyles";

export default function InventoryWorkspace() {
  const stockAlerts = [
    { product: "Roundup", issue: "Expiry Risk", detail: "Expires in 18 days", status: "warning" },
    { product: "Mospilan", issue: "Low Stock", detail: "Only 8 bottles left", status: "danger" },
    { product: "Coragen", issue: "Slow Movement", detail: "No sales in 22 days", status: "neutral" },
  ];

  const inventoryData = [
    { product: "Roundup", category: "Herbicide", stock: 88, value: "Rs 124,000", expiry: "12 Aug 2026", trend: "Fast" },
    { product: "Mospilan", category: "Insecticide", stock: 14, value: "Rs 45,000", expiry: "08 Jul 2026", trend: "Low Stock" },
    { product: "Coragen", category: "Pesticide", stock: 42, value: "Rs 210,000", expiry: "18 Sep 2026", trend: "Stable" },
    { product: "Confidor", category: "Insecticide", stock: 20, value: "Rs 60,000", expiry: "22 Nov 2026", trend: "Normal" },
    { product: "Nativo", category: "Fungicide", stock: 5, value: "Rs 15,000", expiry: "01 Dec 2026", trend: "Low Stock" },
    { product: "Belt", category: "Insecticide", stock: 0, value: "Rs 0", expiry: "-", trend: "Out of Stock" },
  ];

  return (
    <>
      <div style={st.card}>
        <div style={st.cardTop}>
          <div>
            <h2 style={st.cardTitle}>Attention Required</h2>
            <p style={st.cardSubtext}>Products and operations needing review.</p>
          </div>
        </div>

        <div style={st.tableWrap}>
          <div style={st.tableHead}>
            <span style={{ flex: 2 }}>Product</span>
            <span style={{ flex: 1.2 }}>Issue</span>
            <span style={{ flex: 2 }}>Details</span>
            <span style={{ width: 90 }}>Status</span>
          </div>

          {stockAlerts.map((item, index) => (
            <div key={index} style={st.tableRow}>
              <span style={{ flex: 2, ...st.cellBold }}>{item.product}</span>
              <span style={{ flex: 1.2 }}>{item.issue}</span>
              <span style={{ flex: 2 }}>{item.detail}</span>
              <div style={{ width: 90 }}>
                <div style={{
                  ...st.badge,
                  ...(item.status === "warning" ? st.badgeWarning : item.status === "danger" ? st.badgeDanger : st.badgeNeutral)
                }}>
                  {item.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <div>
            <h2 style={st.cardTitle}>Inventory Movement & Valuation</h2>
            <p style={st.cardSubtext}>Complete view of active stock, valuation, and movement trends.</p>
          </div>
        </div>

        <div style={st.tableWrap}>
          <div style={st.tableHead}>
            <span style={{ flex: 2 }}>Product</span>
            <span style={{ flex: 1.2 }}>Category</span>
            <span style={{ flex: 1 }}>Current Stock</span>
            <span style={{ flex: 1.2 }}>Stock Value</span>
            <span style={{ flex: 1.2 }}>Expiry</span>
            <span style={{ width: 100 }}>Trend</span>
          </div>

          {inventoryData.map((item, index) => (
            <div key={index} style={st.tableRow}>
              <span style={{ flex: 2, ...st.cellBold }}>{item.product}</span>
              <span style={{ flex: 1.2 }}>{item.category}</span>
              <span style={{ flex: 1 }}>{item.stock}</span>
              <span style={{ flex: 1.2 }}>{item.value}</span>
              <span style={{ flex: 1.2 }}>{item.expiry}</span>
              <div style={{ width: 100 }}>
                <div style={st.badgeNeutral}>{item.trend}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
