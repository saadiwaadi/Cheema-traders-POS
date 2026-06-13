import { useEffect, useState } from "react";
import { st } from "./shared/analysisStyles";
import { getInventoryAnalysis } from "../../lib/posApi";

export default function InventoryWorkspace() {
  const [alerts, setAlerts] = useState([]);
  const [inventoryData, setInventoryData] = useState([]);

  useEffect(() => {
    getInventoryAnalysis()
      .then((data) => {
        if (data) {
          setAlerts(data.alerts || []);
          if (data.valuation) {
            const mapped = data.valuation.map((v) => {
              const s = v.stock || 0;
              return {
                product: v.product,
                category: v.category,
                stock: s,
                value: `Rs ${v.value.toLocaleString()}`,
                expiry: v.expiry,
                trend: s <= 0 ? "Out of Stock" : s <= 10 ? "Low Stock" : "Normal"
              };
            });
            setInventoryData(mapped);
          }
        }
      })
      .catch(console.error);
  }, []);

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

          {alerts.map((item, index) => (
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
