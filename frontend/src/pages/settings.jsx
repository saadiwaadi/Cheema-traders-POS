import { useState, useEffect } from "react";
import * as api from "../lib/posApi";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general"); // "general" | "stock"
  const [expiryDays, setExpiryDays] = useState(() => {
    return Number(localStorage.getItem("expiryThresholdDays")) || 60;
  });

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [saveStatus, setSaveStatus] = useState({}); // productId -> "saved" | "error"

  const handleExpiryThresholdChange = (val) => {
    const days = Number(val) || 0;
    setExpiryDays(days);
    localStorage.setItem("expiryThresholdDays", days);
  };

  useEffect(() => {
    if (activeTab === "stock") {
      const fetchProducts = async () => {
        setLoading(true);
        try {
          const res = await api.listProducts({ limit: 1000 });
          const list = Array.isArray(res) ? res : (res && Array.isArray(res.products) ? res.products : []);
          setProducts(list);
        } catch (err) {
          console.error("Failed to load products:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchProducts();
    }
  }, [activeTab]);

  const handleUpdateStockThreshold = async (product, val) => {
    const newVal = parseInt(val, 10);
    if (Number.isNaN(newVal) || newVal < 0) return;
    setSavingId(product.id);
    try {
      await api.saveProduct({
        ...product,
        lowStockLevel: newVal,
      });
      setSaveStatus(prev => ({ ...prev, [product.id]: "saved" }));
      setTimeout(() => {
        setSaveStatus(prev => ({ ...prev, [product.id]: null }));
      }, 1500);
    } catch (err) {
      setSaveStatus(prev => ({ ...prev, [product.id]: "error" }));
    } finally {
      setSavingId(null);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())) ||
    (p.categoryName && p.categoryName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={st.container}>
      {/* Settings Navigation */}
      <div style={st.navRow}>
        <button
          onClick={() => setActiveTab("general")}
          style={{ ...st.navTab, ...(activeTab === "general" ? st.navTabActive : {}) }}
        >
          General Alerts
        </button>
        <button
          onClick={() => setActiveTab("stock")}
          style={{ ...st.navTab, ...(activeTab === "stock" ? st.navTabActive : {}) }}
        >
          Low-Stock Thresholds
        </button>
      </div>

      <div style={st.card}>
        {activeTab === "general" ? (
          <div>
            <h3 style={st.sectionTitle}>General Alert Preferences</h3>
            <p style={st.subText}>Configure generic alerts and warning parameters across the system.</p>

            <div style={st.settingGroup}>
              <label style={st.label}>Batch Expiry Threshold (Days)</label>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                <input
                  type="number"
                  value={expiryDays}
                  onChange={(e) => handleExpiryThresholdChange(e.target.value)}
                  style={st.inputNumber}
                />
                <span style={st.helperText}>
                  Batches with expiration dates within these days will trigger an **"expiring"** status.
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <h3 style={st.sectionTitle}>Low-Stock Product Thresholds</h3>
            <p style={st.subText}>Specify minimum quantity limits to trigger low-stock warning labels.</p>

            {/* Search Bar */}
            <div style={{ margin: "16px 0" }}>
              <input
                placeholder="Search products by name, SKU or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={st.searchInput}
              />
            </div>

            {/* List */}
            {loading ? (
              <div style={st.loadingText}>Loading product list...</div>
            ) : filteredProducts.length === 0 ? (
              <div style={st.loadingText}>No products found matching query.</div>
            ) : (
              <div style={st.tableContainer}>
                <div style={st.tableHeader}>
                  <span style={{ flex: 3 }}>Product Details</span>
                  <span style={{ flex: 1.5, textAlign: "center" }}>Unit</span>
                  <span style={{ flex: 2, textAlign: "right", paddingRight: 40 }}>Min Stock Limit</span>
                </div>
                <div style={st.tableBody}>
                  {filteredProducts.map(p => (
                    <div key={p.id} style={st.tableRow}>
                      <div style={{ flex: 3 }}>
                        <div style={{ fontWeight: 600, color: "#1b3a1d" }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: "#6a8f6c", marginTop: 2 }}>
                          SKU: {p.sku || "N/A"} | Category: {p.categoryName || "Uncategorized"}
                        </div>
                      </div>
                      <span style={{ flex: 1.5, textAlign: "center", color: "#555", fontSize: 13 }}>{p.unit}</span>
                      <div style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
                        <input
                          type="number"
                          defaultValue={p.lowStockLevel || 0}
                          disabled={savingId === p.id}
                          onBlur={(e) => handleUpdateStockThreshold(p, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleUpdateStockThreshold(p, e.target.value);
                              e.target.blur();
                            }
                          }}
                          style={st.thresholdInput}
                        />
                        <div style={{ width: 60, fontSize: 11, fontWeight: 700, textAlign: "center" }}>
                          {savingId === p.id && <span style={{ color: "#666" }}>Saving...</span>}
                          {saveStatus[p.id] === "saved" && <span style={{ color: "#2e7d32" }}>✓ Saved</span>}
                          {saveStatus[p.id] === "error" && <span style={{ color: "#c62828" }}>✕ Fail</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const st = {
  container: {
    padding: "4px 0",
  },
  navRow: {
    display: "flex",
    gap: 16,
    borderBottom: "1px solid #c8d8c8",
    marginBottom: 20,
    paddingBottom: 4,
  },
  navTab: {
    background: "none",
    border: "none",
    borderBottom: "3px solid transparent",
    padding: "8px 12px",
    fontSize: 14,
    fontWeight: 700,
    color: "#5a755c",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  navTabActive: {
    color: "#1b3a1d",
    borderBottomColor: "#2e7d32",
  },
  card: {
    background: "#fff",
    border: "1px solid #c8d8c8",
    borderRadius: 6,
    padding: 24,
    boxShadow: "0 2px 8px rgba(46, 125, 50, 0.04)",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "#1b3a1d",
  },
  subText: {
    margin: "4px 0 16px 0",
    fontSize: 13,
    color: "#6a8f6c",
  },
  settingGroup: {
    marginTop: 24,
    borderTop: "1px solid #e8f0e8",
    paddingTop: 20,
    maxWidth: 600,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1b3a1d",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  inputNumber: {
    width: 90,
    padding: "8px 12px",
    border: "1px solid #cde0cd",
    borderRadius: 4,
    outline: "none",
    fontSize: 14,
    fontWeight: 600,
    textAlign: "center",
    fontFamily: "IBM Plex Mono, monospace",
  },
  helperText: {
    fontSize: 13,
    color: "#555",
  },
  searchInput: {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid #cde0cd",
    borderRadius: 4,
    outline: "none",
    fontSize: 13.5,
  },
  loadingText: {
    textAlign: "center",
    padding: "40px 0",
    color: "#666",
    fontSize: 14,
  },
  tableContainer: {
    border: "1px solid #c8d8c8",
    borderRadius: 4,
    overflow: "hidden",
  },
  tableHeader: {
    display: "flex",
    padding: "12px 16px",
    background: "#f4faf4",
    borderBottom: "1px solid #c8d8c8",
    fontWeight: 700,
    fontSize: 12,
    color: "#1b3a1d",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  tableBody: {
    display: "flex",
    flexDirection: "column",
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid #e8f0e8",
    background: "#fff",
    transition: "background-color 0.1s",
  },
  thresholdInput: {
    width: 80,
    padding: "6px 10px",
    border: "1px solid #cde0cd",
    borderRadius: 4,
    textAlign: "center",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "IBM Plex Mono, monospace",
    outline: "none",
  },
};
