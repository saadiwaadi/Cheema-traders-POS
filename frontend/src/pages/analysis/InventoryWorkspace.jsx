import { st } from "./shared/analysisStyles";

export default function InventoryWorkspace({ analysis }) {
  const inv = analysis?.inventory || {};
  const lowStock = inv.lowStock || [];
  const expiringSoon = inv.expiringSoon || [];

  // Real alerts: low/out of stock + batches nearing expiry.
  const stockAlerts = [
    ...lowStock.map((p) => ({
      product: p.name,
      issue: Number(p.stock || 0) <= 0 ? "Out of Stock" : "Low Stock",
      detail: `${Number(p.stock || 0)} in stock (reorder at ${Number(p.low_stock_level || 0)})`,
      status: Number(p.stock || 0) <= 0 ? "danger" : "warning",
    })),
    ...expiringSoon.map((b) => ({
      product: b.productName,
      issue: "Expiry Risk",
      detail: `Batch ${b.batchNo} expires ${b.expiryDate} (${Number(b.qty || 0)} left)`,
      status: "warning",
    })),
  ];

  // Real batch valuation view.
  const inventoryData = expiringSoon.map((b) => ({
    product: b.productName,
    category: `Batch ${b.batchNo}`,
    stock: Number(b.qty || 0),
    value: "—",
    expiry: b.expiryDate || "—",
    trend: "Expiring",
  })).concat(
    lowStock.map((p) => ({
      product: p.name,
      category: "—",
      stock: Number(p.stock || 0),
      value: "—",
      expiry: "—",
      trend: Number(p.stock || 0) <= 0 ? "Out of Stock" : "Low Stock",
    }))
  );

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
