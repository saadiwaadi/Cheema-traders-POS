import { useState, useEffect, useRef } from "react";
import * as api from "../lib/posApi";
import { useThemeLanguage } from "../context/ThemeLanguageContext";
import { Printer, FileDown, Edit2, Trash2, X, ChevronDown, Check, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import WarningNotification from "../components/Warningnotification";

export default function InventoryManagementPage() {
  const { t } = useThemeLanguage();
  const [activeTab, setActiveTab] = useState("view"); // "view" | "entry" | "history" | "daily" | "bulk-edit"
  const [refreshKey, setRefreshKey] = useState(0);
  const [bulkEditBatches, setBulkEditBatches] = useState([]);

  return (
    <div style={st.page}>
      <style>{`
        .ledger-row {
          transition: background-color 0.1s ease;
        }
        .ledger-row:hover {
          background-color: #f7fbf7 !important;
        }
        .save-record-btn {
          transition: all 0.2s ease;
        }
        .save-record-btn:hover {
          background-color: #1b5e20 !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(46, 125, 50, 0.3) !important;
        }
        .save-record-btn:active {
          transform: translateY(0);
        }
      `}</style>
      <div style={st.main}>
        {/* TOOLBAR & NAV BAR */}
        <div style={st.toolbar}>
          <div style={st.toolbarLeft}>
            <h1 style={st.pageTitle}>{t("inventory.title", "Inventory Management")}</h1>
          </div>

          {/* Navigation Bar */}
          <div style={st.navStrip}>
            <button
              style={{ ...st.navBtn, ...(activeTab === "view" ? st.navBtnActive : {}) }}
              onClick={() => setActiveTab("view")}
            >
              {t("inventory.stock_view", "Stock View")}
            </button>
            <button
              style={{ ...st.navBtn, ...(activeTab === "entry" ? st.navBtnActive : {}) }}
              onClick={() => setActiveTab("entry")}
            >
              {t("inventory.stock_entry", "Stock Entry")}
            </button>
            <button
              style={{ ...st.navBtn, ...(activeTab === "history" ? st.navBtnActive : {}) }}
              onClick={() => setActiveTab("history")}
            >
              {t("inventory.purchase_history", "Purchase History")}
            </button>
            <button
              style={{ ...st.navBtn, ...(activeTab === "daily" ? st.navBtnActive : {}) }}
              onClick={() => setActiveTab("daily")}
            >
              {t("inventory.daily", "Daily")}
            </button>
            {activeTab === "bulk-edit" && (
              <button
                style={{ ...st.navBtn, ...st.navBtnActive }}
                disabled
              >
                {t("inventory.bulk_edit", "Bulk Edit")}
              </button>
            )}
          </div>
        </div>

        {activeTab === "view"    && <StockViewTab refreshKey={refreshKey} />}
        {activeTab === "entry"   && <StockEntryTab onSaved={() => { setRefreshKey(k => k + 1); setActiveTab("view"); }} />}
        {activeTab === "history" && (
          <StockHistoryTab
            onChanged={() => setRefreshKey(k => k + 1)}
            onEditBatches={(batches) => {
              setBulkEditBatches(batches);
              setActiveTab("bulk-edit");
            }}
          />
        )}
        {activeTab === "daily"   && <DailyTab refreshKey={refreshKey} />}
        {activeTab === "bulk-edit" && (
          <BulkEditBatchesTab
            batchesToEdit={bulkEditBatches}
            onCancel={() => setActiveTab("history")}
            onSaved={() => {
              setRefreshKey(k => k + 1);
              setActiveTab("history");
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ─── STOCK VIEW TAB ─── */
function StockViewTab({ refreshKey }) {
  const { t } = useThemeLanguage();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [editingBatch, setEditingBatch] = useState(null);
  const [viewingProduct, setViewingProduct] = useState(null);
  const [warnData, setWarnData] = useState(null);

  // Category and Expiry filter states
  const [selectedCategory, setSelectedCategory] = useState("All");
  const expiryDays = Number(localStorage.getItem("expiryThresholdDays")) || 60;

  const categories = ["All", "Dairy", "Pesticide", "Seeds", "Fertilizer"];

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.listBatches({ search });
      setBatches(data.batches || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, refreshKey]);

  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const res = await api.listSuppliers();
        setSuppliers(res.suppliers || []);
      } catch (err) {
        console.error("Failed to load suppliers:", err);
      }
    };
    loadSuppliers();
  }, []);

  const handleDeleteBatch = async (id) => {
    if (!window.confirm(t("inventory.confirm_delete_batch", "Are you sure you want to delete this batch? Product stock level will be adjusted accordingly."))) return;
    try {
      await api.deleteBatch(id);
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const computeExpiryStatus = (expiryDateStr, thresholdDays) => {
    if (!expiryDateStr) return "healthy";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDateStr + 'T00:00:00');
    expiry.setHours(0, 0, 0, 0);
    
    if (Number.isNaN(expiry.getTime())) return "healthy";
    
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return "expired";
    if (diffDays <= thresholdDays) return "expiring";
    return "healthy";
  };

  // Re-map and filter client-side
  const displayedBatches = batches
    .map(b => {
      const status = computeExpiryStatus(b.expiryDate, expiryDays);
      return { ...b, expiryStatus: status };
    })
    .filter(b => {
      // 1. Category filter
      if (selectedCategory !== "All") {
        const cat = (b.category || "").toLowerCase();
        if (cat !== selectedCategory.toLowerCase()) return false;
      }
      return true;
    });

  // Group batches by product_id for aggregated display
  const productGroups = {};
  displayedBatches.forEach(b => {
    if (!productGroups[b.productId]) {
      productGroups[b.productId] = {
        productId: b.productId,
        productName: b.productName,
        category: b.category || "N/A",
        unit: b.unit,
        lowStockLevel: b.lowStockLevel || 0,
        currentRetailPrice: b.currentRetailPrice || 0,
        totalQty: 0,
        costs: [],
        batches: []
      };
    }
    productGroups[b.productId].totalQty += (b.quantityRemaining || 0);
    if (b.id) {
      if (b.quantityRemaining > 0 && b.costPrice !== undefined) {
        productGroups[b.productId].costs.push(b.costPrice);
      }
      productGroups[b.productId].batches.push(b);
    }
  });

  const aggregatedProducts = Object.values(productGroups).map(group => {
    if (group.costs.length === 0 && group.batches.length > 0) {
      group.costs.push(group.batches[0].costPrice || 0);
    }
    const minCost = group.costs.length > 0 ? Math.min(...group.costs) : 0;
    const maxCost = group.costs.length > 0 ? Math.max(...group.costs) : 0;
    
    if (group.batches.length === 0) {
      group.costPriceRange = "—";
    } else {
      group.costPriceRange = minCost === maxCost ? `Rs ${minCost.toFixed(2)}` : `Rs ${minCost.toFixed(2)} - Rs ${maxCost.toFixed(2)}`;
    }

    const activeExpiries = [...new Set(
      group.batches
        .filter(b => b.quantityRemaining > 0 && b.expiryDate)
        .map(b => b.expiryDate)
    )].sort();

    if (activeExpiries.length === 0) {
      group.expiryDisplay = "—";
    } else if (activeExpiries.length === 1) {
      group.expiryDisplay = activeExpiries[0];
    } else {
      group.expiryDisplay = "Multiple";
    }

    return group;
  });

  const totalValue = displayedBatches.reduce((sum, b) => sum + (b.quantityRemaining * (b.costPrice || 0)), 0);

  const currentViewingProduct = viewingProduct ? aggregatedProducts.find(p => p.productId === viewingProduct.productId) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Metrics Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <div style={st.metricCard}>
          <div style={st.metricLabel}>{t("inventory.total_active_batches", "Total Active Batches")}</div>
          <div style={st.metricValue}>{displayedBatches.length}</div>
        </div>
        <div style={st.metricCard}>
          <div style={st.metricLabel}>{t("inventory.total_value_cost", "Total Inventory Value (Cost)")}</div>
          <div style={st.metricValue}>Rs {totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      <div style={st.productCard}>
        <div style={st.productTop}>
          <div>
            <h2 style={st.sectionTitle}>{t("inventory.available_stock", "Available Stock")}</h2>
            <p style={st.subText}>{t("inventory.current_inventory_sub", "Current inventory grouped by product. Click View Details to manage batches.")}</p>
          </div>
          <input
            style={st.searchInp}
            placeholder={t("inventory.search_placeholder", "Search product or batch no...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Category filter chips */}
        <div style={st.filterStrip}>
          {categories.map(cat => (
            <button
              key={cat}
              style={{
                ...st.filterChip,
                ...(selectedCategory === cat ? st.filterChipActive : {})
              }}
              onClick={() => setSelectedCategory(cat)}
            >
              {t("inventory.category_" + cat.toLowerCase(), cat)}
            </button>
          ))}
        </div>

        {error && <div style={{ color: "red", fontSize: 13, padding: 8 }}>{error}</div>}

        <div style={st.tableWrap}>
          <div style={st.tableHead}>
            <span style={{ flex: 2 }}>{t("inventory.product", "Product")}</span>
            <span style={{ flex: 1 }}>{t("inventory.category", "Category")}</span>
            <span style={{ flex: 1, textAlign: "right" }}>{t("inventory.qty_remaining", "Total Qty")}</span>
            <span style={{ flex: 1.5, textAlign: "right" }}>{t("inventory.cost_price", "Cost Range")}</span>
            <span style={{ flex: 1.2, textAlign: "right" }}>{t("inventory.retail_price", "Retail Checkout Price")}</span>
            <span style={{ flex: 1, textAlign: "center" }}>{t("inventory.expiry_date", "Expiry Date")}</span>
            <span style={{ width: 120, textAlign: "center" }}>{t("inventory.actions", "Batches")}</span>
          </div>

          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "#666" }}>{t("inventory.loading", "Loading inventory...")}</div>
          ) : aggregatedProducts.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#666" }}>{t("inventory.no_products", "No products found.")}</div>
          ) : (
            aggregatedProducts.map((p) => {
              const isLowStock = p.totalQty <= p.lowStockLevel;
              return (
                <div key={p.productId} style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                  {/* Aggregated Row */}
                  <div
                    className="ledger-row"
                    style={{ ...st.tableRowView, borderBottom: "none", cursor: "pointer", userSelect: "none" }}
                    onClick={() => setViewingProduct(p)}
                  >
                    <span style={{ flex: 2, fontWeight: 600, color: "#1b3a1d" }}>
                      {p.productName}
                    </span>
                    <span style={{ flex: 1, color: "#555" }}>{p.category}</span>
                    <span style={{ flex: 1, textAlign: "right", fontWeight: 700, fontFamily: "IBM Plex Mono, monospace" }}>
                      {p.totalQty} {p.unit}
                    </span>
                    <span style={{ flex: 1.5, textAlign: "right", fontFamily: "IBM Plex Mono, monospace" }}>{p.costPriceRange}</span>
                    <span style={{ flex: 1.2, textAlign: "right", color: "#2e7d32", fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>
                      Rs {p.currentRetailPrice.toFixed(2)}
                    </span>
                    <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
                      {p.totalQty === 0 ? (
                        <div style={{ ...st.statusBadge, background: "#ffebee", color: "#c62828", border: "1px solid #ffcdd2" }}>
                          {t("inventory.out_of_stock", "OUT OF STOCK")}
                        </div>
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 600, color: p.expiryDisplay === "—" ? "#999" : (p.expiryDisplay === "Multiple" ? "#d97706" : "#2e7d32") }}>
                          {p.expiryDisplay}
                        </span>
                      )}
                    </div>
                    <div style={{ width: 120, display: "flex", gap: 6, justifyContent: "center" }}>
                      <button
                        style={{
                          padding: "4px 8px",
                          background: "#e8f0ff",
                          color: "#5c35cc",
                          border: "1px solid #cce0ff",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                        onClick={(e) => { e.stopPropagation(); setViewingProduct(p); }}
                      >
                        {t("inventory.view_details", "View Details")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {currentViewingProduct && (
        <ProductBatchesModal
          product={currentViewingProduct}
          suppliers={suppliers}
          onClose={() => setViewingProduct(null)}
          onEditBatch={(b) => setEditingBatch(b)}
          onDeleteBatch={handleDeleteBatch}
          onDeleteProduct={() => {
            setWarnData({
              title: "Confirm Product Deletion",
              lines: [
                { label: "Product", value: currentViewingProduct.productName },
                { label: "Action", value: "Delete completely from inventory", mono: true }
              ],
              confirmLabel: "Yes, Delete Product",
              cancelLabel: "Cancel",
              onConfirm: async () => {
                try {
                  await api.deleteProduct(currentViewingProduct.productId);
                  setViewingProduct(null);
                  loadData();
                } catch (err) {
                  alert("Failed to delete product: " + err.message);
                }
              }
            });
          }}
        />
      )}

      {editingBatch && (
        <EditStockModal
          batch={editingBatch}
          suppliers={suppliers}
          onClose={() => setEditingBatch(null)}
          onSaved={() => {
            setEditingBatch(null);
            loadData();
          }}
        />
      )}

      <WarningNotification
        visible={!!warnData}
        title={warnData?.title}
        lines={warnData?.lines}
        onConfirm={warnData?.onConfirm}
        confirmLabel={warnData?.confirmLabel}
        cancelLabel={warnData?.cancelLabel}
        onClose={() => setWarnData(null)}
      />
    </div>
  );
}

function ProductBatchesModal({ product, suppliers, onClose, onEditBatch, onDeleteBatch, onDeleteProduct }) {
  const { t } = useThemeLanguage();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Filter batches by date range
  const filteredBatches = product.batches ? product.batches.filter((b) => {
    if (fromDate && b.purchaseDate && b.purchaseDate < fromDate) return false;
    if (toDate && b.purchaseDate && b.purchaseDate > toDate) return false;
    return true;
  }) : [];

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    const html = `
      <html>
        <head>
          <title>Batch List - ${product.productName}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #333; }
            h1 { color: #1b3a1d; font-size: 20px; margin-bottom: 5px; }
            h2 { color: #555; font-size: 14px; margin-top: 0; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; font-size: 12px; }
            th { background-color: #f2f2f2; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; background: #f9f9f9; padding: 10px; border-radius: 4px; }
            .meta-item { font-size: 12px; }
            .meta-label { font-weight: bold; color: #666; }
          </style>
        </head>
        <body>
          <h1>Batch List: ${product.productName}</h1>
          <h2>Category: ${product.category}</h2>
          <div class="meta-grid">
            <div class="meta-item"><span class="meta-label">Total Qty:</span> ${product.totalQty} ${product.unit}</div>
            <div class="meta-item"><span class="meta-label">Cost Range:</span> ${product.costPriceRange}</div>
            <div class="meta-item"><span class="meta-label">Retail Price:</span> Rs ${product.currentRetailPrice.toFixed(2)}</div>
            <div class="meta-item"><span class="meta-label">Print Date:</span> ${new Date().toLocaleDateString()}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Batch No</th>
                <th>Supplier</th>
                <th class="text-right">Qty Remaining</th>
                <th class="text-right">Cost Price</th>
                <th class="text-right">Sale Price</th>
                <th class="text-center">Expiry Date</th>
                <th class="text-center">Purchase Date</th>
              </tr>
            </thead>
            <tbody>
              ${filteredBatches.map(b => `
                <tr>
                  <td>${b.batchNo}</td>
                  <td>${b.supplierName || "—"}</td>
                  <td class="text-right">${b.quantityRemaining} ${product.unit}</td>
                  <td class="text-right">Rs ${b.costPrice.toFixed(2)}</td>
                  <td class="text-right">Rs ${b.salePrice.toFixed(2)}</td>
                  <td class="text-center">${b.expiryDate || "—"}</td>
                  <td class="text-center">${b.purchaseDate || "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleExportExcel = () => {
    const wsData = [
      ["Product Name", product.productName, "", "", "", "", "", ""],
      ["Category", product.category, "", "", "", "", "", ""],
      ["Total Qty", `${product.totalQty} ${product.unit}`, "", "", "", "", "", ""],
      ["Cost Range", product.costPriceRange, "", "", "", "", "", ""],
      ["Retail Price", `Rs ${product.currentRetailPrice.toFixed(2)}`, "", "", "", "", "", ""],
      [],
      ["Batch No", "Supplier", "Qty Remaining", "Cost Price", "Sale Price", "Expiry Date", "Purchase Date", "Status"]
    ];

    filteredBatches.forEach((b) => {
      wsData.push([
        b.batchNo,
        b.supplierName || "—",
        b.quantityRemaining,
        b.costPrice,
        b.salePrice,
        b.expiryDate || "—",
        b.purchaseDate || "—",
        b.expiryStatus
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Batches");
    XLSX.writeFile(wb, `Batches_${product.productName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div 
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center",
        alignItems: "center", zIndex: 950, padding: 16
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: "#fff", padding: 24, borderRadius: 8, width: 850,
          maxWidth: "100%", maxHeight: "90vh", overflowY: "auto",
          border: "1px solid #b8c8b8", display: "flex", flexDirection: "column", gap: 16,
          boxShadow: "0 8px 30px rgba(0,0,0,0.15)", boxSizing: "border-box"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e8f0e8", paddingBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1b3a1d", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {product.productName} - Batches Details
            </h3>
            <span style={{ fontSize: 12, color: "#666" }}>Category: {product.category}</span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button 
              onClick={onDeleteProduct}
              title="Delete entire product"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", background: "#ffebee", color: "#c62828",
                border: "1px solid #ffcdd2", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer"
              }}
            >
              <Trash2 size={16} /> Delete Product
            </button>
            <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666", display: "flex", alignItems: "center" }} onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        {/* Product Meta Grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12, background: "#f4faf4", padding: 16, borderRadius: 6, border: "1px solid #e2ece2"
        }}>
          <div>
            <div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>Total Qty Remaining</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1b3a1d" }}>{product.totalQty} {product.unit}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>Cost Price Range</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1b3a1d" }}>{product.costPriceRange}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>Retail Price</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#2e7d32" }}>Rs {product.currentRetailPrice.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>Low Stock Alert Level</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#c62828" }}>{product.lowStockLevel} {product.unit}</div>
          </div>
        </div>

        {/* Filters and Actions Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", borderBottom: "1px solid #e8f0e8", paddingBottom: 16 }}>
          {/* Date range inputs */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Purchase Date:</span>
            <input 
              type="date" 
              style={{ padding: "6px 10px", border: "1px solid #cde0cd", borderRadius: 4, fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <span style={{ fontSize: 12, color: "#888" }}>to</span>
            <input 
              type="date" 
              style={{ padding: "6px 10px", border: "1px solid #cde0cd", borderRadius: 4, fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
            {(fromDate || toDate) && (
              <button 
                style={{ background: "none", border: "none", color: "#d32f2f", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                onClick={() => { setFromDate(""); setToDate(""); }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Print / Export buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <button 
              onClick={handlePrint}
              style={{
                padding: "6px 12px", background: "#e8f0ff", color: "#1976d2",
                border: "1px solid #cce0ff", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Printer size={16} /> Print List</div>
            </button>
            <button 
              onClick={handleExportExcel}
              style={{
                padding: "6px 12px", background: "#e8f5e9", color: "#2e7d32",
                border: "1px solid #c8e6c9", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><FileDown size={16} /> Export to Excel</div>
            </button>
          </div>
        </div>

        {/* Batches Table */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "40vh", overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6a8f6c", display: "flex", borderBottom: "1px solid #e8f0e8", paddingBottom: 6, position: "sticky", top: 0, background: "#fff" }}>
            <span style={{ flex: 1.2 }}>Batch No</span>
            <span style={{ flex: 1.5 }}>Supplier</span>
            <span style={{ flex: 1, textAlign: "right" }}>Qty Remaining</span>
            <span style={{ flex: 1, textAlign: "right" }}>Cost Price</span>
            <span style={{ flex: 1, textAlign: "right" }}>Sale Price</span>
            <span style={{ flex: 1.2, textAlign: "center" }}>Expiry Date</span>
            <span style={{ flex: 1.2, textAlign: "center" }}>Purchase Date</span>
            <span style={{ width: 90, textAlign: "center" }}>Actions</span>
          </div>

          {filteredBatches.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#666" }}>No batches matching dates found.</div>
          ) : (
            filteredBatches.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #f4faf4" }}>
                <span style={{ flex: 1.2, fontFamily: "IBM Plex Mono, monospace", color: "#333" }}>{b.batchNo}</span>
                <span style={{ flex: 1.5, color: "#555" }}>{b.supplierName || "—"}</span>
                <span style={{ flex: 1, textAlign: "right", fontWeight: 600 }}>{b.quantityRemaining} {product.unit}</span>
                <span style={{ flex: 1, textAlign: "right" }}>Rs {b.costPrice.toFixed(2)}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#666" }}>Rs {b.salePrice.toFixed(2)}</span>
                <span style={{ flex: 1.2, textAlign: "center" }}>{b.expiryDate || "—"}</span>
                <span style={{ flex: 1.2, textAlign: "center" }}>{b.purchaseDate || "—"}</span>
                <div style={{ width: 90, display: "flex", gap: 6, justifyContent: "center" }}>
                  <button
                    title="Edit"
                    style={{ ...st.delBtn, background: "#e8f0ff", color: "#5c35cc", fontWeight: 700, width: 28, height: 28 }}
                    onClick={() => onEditBatch(b)}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    title="Delete"
                    style={{ ...st.delBtn, width: 28, height: 28 }}
                    onClick={() => onDeleteBatch(b.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function EditStockModal({ batch, suppliers, onClose, onSaved }) {
  const { t } = useThemeLanguage();
  const [productName, setProductName] = useState(batch.productName || "");
  const [batchNo, setBatchNo] = useState(batch.batchNo || "");
  const [category, setCategory] = useState(batch.category || "Pesticide");
  const [unit, setUnit] = useState(batch.unit || "Litre");
  const [qtyRemaining, setQtyRemaining] = useState(batch.quantityRemaining || 0);
  const [qtyReceived, setQtyReceived] = useState(batch.quantityReceived || 0);
  const [costPrice, setCostPrice] = useState(batch.costPrice || 0);
  const [salePrice, setSalePrice] = useState(batch.salePrice || 0);
  const [expiryDate, setExpiryDate] = useState(batch.expiryDate || "");
  const [supplierId, setSupplierId] = useState(batch.supplierId || "");
  const [purchaseDate, setPurchaseDate] = useState(batch.purchaseDate || "");
  const [notes, setNotes] = useState(batch.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productName.trim()) {
      setError(t("inventory.error_product_name_required", "Please enter a product name."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.updateBatch(batch.id, {
        productName,
        batchNo,
        category,
        unit,
        quantityRemaining: Number(qtyRemaining),
        quantityReceived: Number(qtyReceived),
        costPrice: Number(costPrice),
        salePrice: Number(salePrice),
        expiryDate: expiryDate || null,
        supplierId: supplierId ? Number(supplierId) : null,
        purchaseDate,
        notes: notes || null
      });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center",
      alignItems: "center", zIndex: 1000, padding: 16
    }}>
      <div style={{
        background: "#fff", padding: 24, borderRadius: 8, width: 680,
        maxWidth: "100%", maxHeight: "95vh", overflowY: "auto",
        border: "1px solid #b8c8b8", display: "flex", flexDirection: "column", gap: 16,
        boxShadow: "0 8px 30px rgba(0,0,0,0.15)", boxSizing: "border-box"
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e8f0e8", paddingBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1b3a1d", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t("inventory.edit_stock_title", "Edit Stock Batch")}
          </h3>
          <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666", display: "flex", alignItems: "center" }} onClick={onClose}><X size={20} /></button>
        </div>

        {error && <div style={st.alertError}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {/* Left Column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>{t("inventory.product", "Product")}</label>
                <input
                  style={st.fieldInput}
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder={t("inventory.placeholder_product_name", "Product Name")}
                />
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>{t("inventory.batch_no", "Batch No")}</label>
                <input
                  style={{ ...st.fieldInput, fontFamily: "IBM Plex Mono, monospace" }}
                  value={batchNo}
                  onChange={(e) => setBatchNo(e.target.value)}
                  placeholder="e.g. BT-1001"
                />
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>{t("inventory.category", "Category")}</label>
                <select
                  style={st.fieldInput}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="Dairy">{t("inventory.category_dairy", "Dairy")}</option>
                  <option value="Pesticide">{t("inventory.category_pesticide", "Pesticide")}</option>
                  <option value="Seeds">{t("inventory.category_seeds", "Seeds")}</option>
                  <option value="Fertilizer">{t("inventory.category_fertilizer", "Fertilizer")}</option>
                </select>
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>{t("inventory.unit", "Unit")}</label>
                <select
                  style={st.fieldInput}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  <option value="Litre">{t("inventory.unit_litre", "Litre")}</option>
                  <option value="Kg">{t("inventory.unit_kg", "Kg")}</option>
                  <option value="Bottle">{t("inventory.unit_bottle", "Bottle")}</option>
                  <option value="Piece">{t("inventory.unit_piece", "Piece")}</option>
                </select>
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>{t("inventory.supplier", "Supplier")}</label>
                <select
                  style={st.fieldInput}
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">{t("inventory.select_supplier", "-- Select Supplier --")}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>{t("inventory.purchase_date", "Purchase Date")}</label>
                <input
                  type="date"
                  style={{ ...st.fieldInput, fontFamily: "IBM Plex Mono, monospace" }}
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>
            </div>

            {/* Right Column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Qty Remaining with +/- and Offset Helpers */}
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>{t("inventory.qty_remaining", "Qty Remaining")}</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    style={{ ...st.delBtn, background: "#e8f0ff", color: "#5c35cc", fontWeight: 700, width: 36, height: 36 }}
                    onClick={() => setQtyRemaining(q => Math.max(0, Number(q) - 1))}>-</button>
                  <input
                    type="number"
                    style={{ ...st.fieldInput, flex: 1, textAlign: "center", fontFamily: "IBM Plex Mono, monospace" }}
                    value={qtyRemaining}
                    onChange={(e) => setQtyRemaining(e.target.value)}
                  />
                  <button
                    type="button"
                    style={{ ...st.delBtn, background: "#e8f0ff", color: "#5c35cc", fontWeight: 700, width: 36, height: 36 }}
                    onClick={() => setQtyRemaining(q => Number(q) + 1)}>+</button>
                </div>
                {/* Quick adjustments */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                  {[-10, -5, -1, 1, 5, 10].map(val => (
                    <button
                      key={val}
                      type="button"
                      style={{
                        padding: "4px 8px",
                        background: val > 0 ? "#e8f5e9" : "#fff0f0",
                        color: val > 0 ? "#2e7d32" : "#d32f2f",
                        border: `1px solid ${val > 0 ? "#c8e6c9" : "#f5c6c6"}`,
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                      onClick={() => setQtyRemaining(q => Math.max(0, Number(q) + val))}
                    >
                      {val > 0 ? `+${val}` : val}
                    </button>
                  ))}
                </div>
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>{t("inventory.qty_received", "Qty Received")}</label>
                <input
                  type="number"
                  style={{ ...st.fieldInput, fontFamily: "IBM Plex Mono, monospace" }}
                  value={qtyReceived}
                  onChange={(e) => setQtyReceived(e.target.value)}
                />
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>{t("inventory.cost_price", "Cost Price")}</label>
                <input
                  type="number"
                  style={{ ...st.fieldInput, fontFamily: "IBM Plex Mono, monospace" }}
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                />
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>{t("inventory.retail_price", "Retail Price")}</label>
                <input
                  type="number"
                  style={{ ...st.fieldInput, fontFamily: "IBM Plex Mono, monospace" }}
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                />
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>{t("inventory.expiry_date", "Expiry Date")}</label>
                <input
                  type="date"
                  style={{ ...st.fieldInput, fontFamily: "IBM Plex Mono, monospace" }}
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>{t("inventory.notes", "Notes / Shelf")}</label>
                <input
                  style={st.fieldInput}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Shelf A-2"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, borderTop: "1px solid #e8f0e8", paddingTop: 16 }}>
            <button
              type="button"
              style={{ ...st.addBtn, background: "#888" }}
              onClick={onClose}
              disabled={saving}
            >
              {t("inventory.cancel", "Cancel")}
            </button>
            <button
              type="submit"
              style={st.addBtn}
              disabled={saving}
            >
              {saving ? t("inventory.saving", "Saving...") : t("inventory.save_changes", "Save Changes")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── STOCK ENTRY TAB ─── */
function StockEntryTab({ onSaved }) {
  const { t } = useThemeLanguage();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [inventory, setInventory] = useState([createEmptyBatch()]);
  const [suppliers, setSuppliers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentType, setPaymentType] = useState("Cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [warehouseShelf, setWarehouseShelf] = useState("");

  useEffect(() => {
    const loadSuppliersAndBanks = async () => {
      try {
        const [resSuppliers, resBanks] = await Promise.all([
          api.listSuppliers(),
          api.listBanks()
        ]);
        setSuppliers(resSuppliers.suppliers || []);
        if (resBanks && resBanks.banks) setBanks(resBanks.banks);
      } catch (err) {
        console.error("Failed to load:", err);
      }
    };
    loadSuppliersAndBanks();
  }, []);

  function createEmptyBatch() {
    return {
      id: Date.now() + Math.random(),
      productId: null,
      isMatched: false,
      productName: "",
      batchNo: "",
      category: "Pesticide",
      qty: 1,
      unit: "Litre",
      costPrice: "",
      salePrice: "",
      expiryDate: "",
      purchaseDate: new Date().toISOString().split("T")[0],
      supplierName: "",
      paymentType: "Cash",
      amountPaid: "",
      remaining: "",
      notes: "",
      suggestions: [],
    };
  }

  const addRow = () => {
    setInventory([...inventory, createEmptyBatch()]);
  };

  const removeRow = (id) => {
    if (inventory.length > 1) {
      setInventory(inventory.filter((item) => item.id !== id));
    }
  };

  const searchTimeouts = useRef({});

  const selectProduct = (rowId, product) => {
    setInventory((prev) =>
      prev.map((item) => {
        if (item.id !== rowId) return item;
        return {
          ...item,
          productId: product.id,
          isMatched: true,
          productName: product.name,
          category: product.categoryName || "Pesticide",
          unit: product.unit || "Litre",
          suggestions: [],
        };
      })
    );
  };

  const revertMatchedProduct = (rowId) => {
    setInventory((prev) =>
      prev.map((item) => {
        if (item.id !== rowId) return item;
        return {
          ...item,
          productId: null,
          isMatched: false,
        };
      })
    );
  };

  const updateItem = (id, field, value) => {
    setInventory((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        const qty = parseFloat(updated.qty) || 0;
        const cost = parseFloat(updated.costPrice) || 0;
        const paid = parseFloat(updated.amountPaid) || 0;
        updated.remaining = Math.max(0, qty * cost - paid).toFixed(0);
        return updated;
      })
    );

    if (field === "productName") {
      if (searchTimeouts.current[id]) {
        clearTimeout(searchTimeouts.current[id]);
      }

      if (!value.trim()) {
        setInventory(prev => prev.map(item => item.id === id ? { ...item, suggestions: [] } : item));
        return;
      }

      searchTimeouts.current[id] = setTimeout(async () => {
        try {
          const res = await api.listProducts({ search: value, limit: 10 });
          const products = res.products || [];
          setInventory(prev => prev.map(item => item.id === id ? { ...item, suggestions: products } : item));
        } catch (err) {
          console.error("Search failed:", err);
        }
      }, 300);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    // Filter out rows without a product name
    const validRows = inventory.filter(i => i.productName.trim() !== "");
    if (validRows.length === 0) {
      setError(t("inventory.error_product_name_required", "Please enter at least one product name."));
      setSaving(false);
      return;
    }

    try {
      await api.createPurchase({
        supplierId: supplierId ? Number(supplierId) : null,
        purchaseDate,
        paymentMethod: paymentType,
        amountPaid: Number(amountPaid || 0),
        notes: warehouseShelf ? `Shelf: ${warehouseShelf}` : null,
        items: validRows.map(row => ({
          productId: row.productId || null,
          productName: row.productName,
          batchNo: row.batchNo,
          qty: Number(row.qty),
          unit: row.unit,
          costPrice: Number(row.costPrice || 0),
          salePrice: Number(row.salePrice || 0),
          expiryDate: row.expiryDate || null,
          notes: row.notes || null,
          category: row.category,
        }))
      });
      setSuccess(t("inventory.success_saved", "Inventory saved successfully!"));
      setTimeout(() => {
        onSaved(); // switch tab to view
      }, 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const totalInventoryValue = inventory.reduce((acc, item) => acc + ((parseFloat(item.qty) || 0) * (parseFloat(item.costPrice) || 0)), 0);
  const totalPending = inventory.reduce((acc, item) => acc + (parseFloat(item.remaining) || 0), 0);
  const totalProducts = inventory.filter((item) => item.productName.trim() !== "").length;
  const validRows = inventory.filter(i => i.productName.trim() !== "");
  const totalDue = Math.max(0, totalInventoryValue - (Number(amountPaid) || 0));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div style={st.alertError}>{error}</div>}
      {success && <div style={st.alertSuccess}>{success}</div>}

      {/* Spacer to replace toolbar */}
      <div style={{ height: 4 }} />

      {/* GLOBAL DETAILS & PAYMENT - MOVED TO TOP */}
      <div style={st.infoRow}>
        <div style={st.infoCard}>
          <h3 style={st.sectionTitleSm}>{t("inventory.global_batch_details", "Global Batch Details (Optional)")}</h3>
          <div style={st.grid3}>
            <div style={st.fieldWrap}>
              <label style={st.fieldLabel}>{t("inventory.supplier", "Supplier")}</label>
              <select
                style={st.fieldInput}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">{t("inventory.select_supplier", "-- Select Supplier --")}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label={t("inventory.entry_date", "Entry Date")}
              type="date"
              style={{ ...st.fieldInput, fontFamily: "IBM Plex Mono, monospace" }}
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
            <Field
              label={t("inventory.warehouse_shelf", "Warehouse Shelf")}
              placeholder="A-2"
              value={warehouseShelf}
              onChange={(e) => setWarehouseShelf(e.target.value)}
            />
          </div>
        </div>

        <div style={st.infoCard}>
          <h3 style={st.sectionTitleSm}>{t("inventory.payment_tracking", "Payment Tracking")}</h3>
          <div style={st.grid3}>
            <FieldSelect
              label={t("inventory.payment_type", "Payment Type")}
              options={["Cash", "Credit", "Partial", ...banks.map(b => b.name)]}
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
            />
            <Field
              label={t("inventory.amount_paid", "Amount Paid")}
              placeholder="0"
              type="number"
              style={{ ...st.fieldInput, fontFamily: "IBM Plex Mono, monospace" }}
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
            <Field label={t("inventory.due_date", "Due Date")} type="date" style={{ ...st.fieldInput, fontFamily: "IBM Plex Mono, monospace" }} />
          </div>
        </div>
      </div>

      {/* QUICK STOCK ENTRY TABLE */}
      <div style={st.productCard}>
        <div style={st.productTop}>
          <div>
            <h2 style={st.sectionTitle}>{t("inventory.quick_stock_entry", "Quick Stock Entry")}</h2>
            <p style={st.subText}>{t("inventory.quick_stock_entry_sub", "Add and manage incoming inventory batches.")}</p>
          </div>
          <button style={st.addBtn} onClick={addRow}>{t("inventory.btn_add_batch", "+ Add Batch")}</button>
        </div>

        <div style={{ ...st.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 350px)" }}>
          <div style={{ 
            ...st.tableHead,
            display: "grid",
            gridTemplateColumns: "36px minmax(200px, 2fr) minmax(130px, 1.2fr) minmax(120px, 1.1fr) minmax(90px, 0.8fr) minmax(100px, 0.9fr) minmax(110px, 1fr) minmax(120px, 1fr) minmax(140px, 1.1fr) 40px",
            gap: "8px",
            minWidth: "max-content",
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "#fff"
          }}>
            <span style={{ width: 36 }}>#</span>
            <span style={{ flex: 2 }}>{t("inventory.product", "Product")}</span>
            <span style={{ flex: 1.2 }}>{t("inventory.batch", "Batch")}</span>
            <span style={{ flex: 1.1 }}>{t("inventory.category", "Category")}</span>
            <span style={{ flex: 0.8 }}>{t("inventory.qty", "Qty")}</span>
            <span style={{ flex: 0.9 }}>{t("inventory.unit", "Unit")}</span>
            <span style={{ flex: 1 }}>{t("inventory.cost", "Cost")}</span>
            <span style={{ flex: 1 }}>{t("inventory.batch_sale_price", "Batch Sale Price")}</span>
            <span style={{ flex: 1.1 }}>{t("inventory.expiry", "Expiry")}</span>
            <span style={{ width: 40 }}></span>
          </div>

          {inventory.map((item, i) => (
            <div key={item.id} style={{ display: "flex", flexDirection: "column", minWidth: "max-content" }}>
              <div style={{ 
                ...st.tableRow, 
                display: "grid",
                gridTemplateColumns: "36px minmax(200px, 2fr) minmax(130px, 1.2fr) minmax(120px, 1.1fr) minmax(90px, 0.8fr) minmax(100px, 0.9fr) minmax(110px, 1fr) minmax(120px, 1fr) minmax(140px, 1.1fr) 40px",
                gap: "8px",
                overflow: "visible", 
                position: "relative" 
              }}>
              <span style={{ ...st.rowNum, width: 36 }}>{i + 1}</span>

              <div style={{ position: "relative", flex: 2, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 4 }}>
                  <input
                    style={{ ...st.inp, flex: 1 }}
                    placeholder={t("inventory.placeholder_product_name", "Product Name")}
                    value={item.productName}
                    onChange={(e) => updateItem(item.id, "productName", e.target.value)}
                    disabled={item.isMatched}
                  />
                  {item.isMatched && (
                    <button
                      type="button"
                      title={t("inventory.add_as_new", "Not this product, add as new")}
                      onClick={() => revertMatchedProduct(item.id)}
                      style={{
                        background: "#fff0f0",
                        color: "#d32f2f",
                        border: "1px solid #f5c6c6",
                        borderRadius: 4,
                        cursor: "pointer",
                        padding: "6px 8px",
                        fontSize: 12,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center"
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {!item.isMatched && item.suggestions && item.suggestions.length > 0 && (
                  <div style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    backgroundColor: "#fff",
                    border: "1px solid #c8e6c9",
                    borderRadius: 4,
                    boxShadow: "0 8px 16px rgba(0,0,0,0.15)",
                    zIndex: 1000,
                    maxHeight: 200,
                    overflowY: "auto",
                    marginTop: 4
                  }}>
                    {item.suggestions.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => selectProduct(item.id, p)}
                        style={{
                          padding: "8px 12px",
                          cursor: "pointer",
                          borderBottom: "1px solid #e8f0e8",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 13
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f1f8e9"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#fff"}
                      >
                        <div>
                          <strong style={{ color: "#2e7d32" }}>{p.name}</strong>
                          <span style={{ fontSize: 11, color: "#666", marginLeft: 8 }}>({p.categoryName || "Uncategorized"})</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: "600", color: "#1b5e20" }}>
                          {p.currentStock} {p.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <input
                style={{ ...st.inp, flex: 1.2, fontFamily: "IBM Plex Mono, monospace" }}
                placeholder="e.g. BT-1001"
                value={item.batchNo}
                onChange={(e) => updateItem(item.id, "batchNo", e.target.value)}
              />

              {/* RESTRICTED CATEGORIES */}
              <select
                style={{ ...st.inp, flex: 1.1 }}
                value={item.category}
                onChange={(e) => updateItem(item.id, "category", e.target.value)}
                disabled={item.isMatched}
              >
                <option value="Dairy">{t("inventory.category_dairy", "Dairy")}</option>
                <option value="Pesticide">{t("inventory.category_pesticide", "Pesticide")}</option>
                <option value="Seeds">{t("inventory.category_seeds", "Seeds")}</option>
                <option value="Fertilizer">{t("inventory.category_fertilizer", "Fertilizer")}</option>
              </select>

              <input
                style={{ ...st.inp, flex: 0.8, fontFamily: "IBM Plex Mono, monospace" }}
                type="number"
                value={item.qty}
                onChange={(e) => updateItem(item.id, "qty", e.target.value)}
              />

              <select
                style={{ ...st.inp, flex: 0.9 }}
                value={item.unit}
                onChange={(e) => updateItem(item.id, "unit", e.target.value)}
                disabled={item.isMatched}
              >
                <option value="Litre">{t("inventory.unit_litre", "Litre")}</option>
                <option value="Kg">{t("inventory.unit_kg", "Kg")}</option>
                <option value="Bottle">{t("inventory.unit_bottle", "Bottle")}</option>
                <option value="Piece">{t("inventory.unit_piece", "Piece")}</option>
              </select>

              <input
                style={{ ...st.inp, flex: 1, fontFamily: "IBM Plex Mono, monospace" }}
                type="number"
                placeholder={t("inventory.cost", "Cost")}
                value={item.costPrice}
                onChange={(e) => updateItem(item.id, "costPrice", e.target.value)}
              />

              <input
                style={{ ...st.inp, flex: 1, fontFamily: "IBM Plex Mono, monospace" }}
                type="number"
                placeholder={t("inventory.batch_sale_price", "Batch Sale Price")}
                value={item.salePrice}
                onChange={(e) => updateItem(item.id, "salePrice", e.target.value)}
              />

              <input
                style={{ ...st.inp, flex: 1.1, fontFamily: "IBM Plex Mono, monospace" }}
                type="date"
                value={item.expiryDate}
                onChange={(e) => updateItem(item.id, "expiryDate", e.target.value)}
              />

              <button style={{ ...st.delBtn, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => removeRow(item.id)}><X size={16} /></button>
              </div>
            </div>
          ))}

          {/* PERSISTENT RUNNING TOTAL LEDGER FOOTER BAR */}
          <div style={st.tableFooter}>
            <span style={{ fontWeight: 600 }}>{t("inventory.rows_entered", "{count} rows entered").replace("{count}", validRows.length)}</span>
            <div style={{ display: "flex", gap: 24 }}>
              <span>{t("inventory.total_cost_label", "Total Cost:")} <strong style={{ fontFamily: "IBM Plex Mono, monospace" }}>Rs {totalInventoryValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
              <span>{t("inventory.paid_label", "Paid:")} <strong style={{ color: "#2e7d32", fontFamily: "IBM Plex Mono, monospace" }}>Rs {(Number(amountPaid) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
              <span>{t("inventory.due_label", "Due:")} <strong style={{ color: totalDue > 0 ? "#c62828" : "#2e7d32", fontFamily: "IBM Plex Mono, monospace" }}>Rs {totalDue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* REVIEW & SAVE SECTION */}
      <div style={st.reviewCard}>
        <div style={st.reviewHeader}>
          <h2 style={st.sectionTitle}>{t("inventory.review_save_record", "Review & Save Record")}</h2>
          <p style={st.subText}>{t("inventory.review_save_record_sub", "Confirm the entered quantities, costs, and payment details before committing to stock.")}</p>
        </div>
        
        <div style={st.reviewBody}>
          <div style={st.reviewMetrics}>
            <div style={st.reviewMetric}>
              <span style={st.reviewMetricLabel}>{t("inventory.total_batches", "Total Batches")}</span>
              <span style={st.reviewMetricValue}>{totalProducts}</span>
            </div>
            <div style={st.reviewMetric}>
              <span style={st.reviewMetricLabel}>{t("inventory.total_cost", "Total Cost")}</span>
              <span style={st.reviewMetricValue}>Rs {totalInventoryValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div style={st.reviewMetric}>
              <span style={st.reviewMetricLabel}>{t("inventory.amount_paid", "Amount Paid")}</span>
              <span style={st.reviewMetricValue}>Rs {(Number(amountPaid) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div style={st.reviewMetric}>
              <span style={st.reviewMetricLabel}>{t("inventory.remaining_due", "Remaining Due")}</span>
              <span style={{ ...st.reviewMetricValue, color: totalDue > 0 ? "#c62828" : "#2e7d32" }}>
                Rs {totalDue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

          <button
            id="btn-save-inventory-record"
            className="save-record-btn"
            style={st.saveRecordBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t("inventory.saving_record", "Saving Record...") : (
              <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                <Check size={18} /> {t("inventory.btn_confirm_save", "Confirm & Save Inventory")}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <div style={st.fieldWrap}>
      <label style={st.fieldLabel}>{label}</label>
      <input style={st.fieldInput} {...props} />
    </div>
  );
}

function FieldSelect({ label, options, ...props }) {
  return (
    <div style={st.fieldWrap}>
      <label style={st.fieldLabel}>{label}</label>
      <select style={st.fieldInput} {...props}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function SumRow({ label, value }) {
  return (
    <div style={st.sumRow}>
      <span>{label}</span>
      <span style={{ fontFamily: "IBM Plex Mono, monospace" }}>{value}</span>
    </div>
  );
}

function PurchaseBatchesModal({ purchase, onClose, onRefresh }) {
  const { t } = useThemeLanguage();

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleDeleteItem = async (batchId) => {
    if (!window.confirm("Are you sure you want to delete this purchase item? This will reverse the GL entry and adjust inventory/supplier balances.")) return;
    try {
      await api.deleteBatch(batchId);
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      alert("Failed to delete item: " + err.message);
    }
  };

  return (
    <div 
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center",
        alignItems: "center", zIndex: 950, padding: 16
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: "#fff", padding: 24, borderRadius: 8, width: 600,
          maxWidth: "100%", maxHeight: "80vh", overflowY: "auto",
          border: "1px solid #b8c8b8", display: "flex", flexDirection: "column", gap: 16,
          boxShadow: "0 8px 30px rgba(0,0,0,0.15)", boxSizing: "border-box"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e8f0e8", paddingBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1b3a1d" }}>
              {t("inventory.purchase_batches", "Purchase Batches")} - {purchase.invoiceNo || "Invoice"}
            </h3>
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              {purchase.purchaseDate} | {purchase.supplierName || "—"}
            </div>
          </div>
          <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666", display: "flex", alignItems: "center" }} onClick={onClose}><X size={20} /></button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6a8f6c", display: "flex", borderBottom: "1px solid #e8f0e8", paddingBottom: 6 }}>
            <span style={{ flex: 2 }}>Product Name</span>
            <span style={{ flex: 1, textAlign: "right" }}>Qty</span>
            <span style={{ width: 40, textAlign: "center" }}>Act</span>
          </div>
          
          {(!purchase.items || purchase.items.length === 0) ? (
            <div style={{ padding: 20, textAlign: "center", color: "#666", fontSize: 13 }}>No batches found.</div>
          ) : (
            purchase.items.map((item, i) => (
              <div key={i} style={{ display: "flex", fontSize: 13, borderBottom: "1px solid #f0f0f0", paddingBottom: 8, paddingTop: 4, alignItems: "center" }}>
                <span style={{ flex: 2, color: "#333", fontWeight: 500 }}>{item.productName}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#2e7d32", fontWeight: 600 }}>{item.qty} {item.unit || ""}</span>
                <div style={{ width: 40, display: "flex", justifyContent: "center" }}>
                  <button
                    title="Delete item"
                    style={{ background: "#ffebee", border: "none", color: "#c62828", borderRadius: 4, padding: "4px", cursor: "pointer", display: "flex" }}
                    onClick={() => handleDeleteItem(item.batchId)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StockHistoryTab({ onChanged, onEditBatches }) {
  const { t } = useThemeLanguage();
  const [purchases, setPurchases] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState(new Set());
  const [viewPurchaseBatches, setViewPurchaseBatches] = useState(null);
  const handleEditBatches = async () => {
    if (selectedPurchaseIds.size === 0) return;
    setError("");
    try {
      const targetPurchases = filtered.filter(p => selectedPurchaseIds.has(p.id));
      if (targetPurchases.length === 0) return;

      const targetInvoices = new Set(targetPurchases.map(p => p.invoiceNo).filter(Boolean));
      
      const batchRes = await api.listBatches();
      const allBatches = batchRes.batches || [];

      const batchesToEdit = allBatches.filter(b => targetInvoices.has(b.purchaseReference));

      if (batchesToEdit.length === 0) {
        setError("No batches found for the selected purchase records.");
        return;
      }

      onEditBatches(batchesToEdit);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleEditSinglePurchase = async (p) => {
    setError("");
    try {
      if (!p.invoiceNo) {
        setError("This purchase record has no invoice number.");
        return;
      }
      const batchRes = await api.listBatches();
      const allBatches = batchRes.batches || [];

      const batchesToEdit = allBatches.filter(b => b.purchaseReference === p.invoiceNo);

      if (batchesToEdit.length === 0) {
        setError("No batches found for this purchase record.");
        return;
      }

      onEditBatches(batchesToEdit);
    } catch (e) {
      setError(e.message);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [resPurchases, resBanks] = await Promise.all([
        api.listPurchases(),
        api.listBanks()
      ]);
      setPurchases(resPurchases.purchases || []);
      if (resBanks && resBanks.banks) setBanks(resBanks.banks);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = purchases.filter(p => {
    if (search && !(p.supplierName || "").toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (fromDate && p.purchaseDate && p.purchaseDate < fromDate) {
      return false;
    }
    if (toDate && p.purchaseDate && p.purchaseDate > toDate) {
      return false;
    }
    return true;
  });

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditValues({
      purchaseDate: p.purchaseDate || "",
      paymentMethod: p.paymentMethod || "Cash",
      amountPaid: p.amountPaid || 0,
      notes: p.notes || "",
    });
  };

  const saveEdit = async (id) => {
    try {
      await api.updatePurchase(id, editValues);
      setEditingId(null);
      await loadData();
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("inventory.confirm_delete_purchase", "Delete this purchase record? Stock quantities will be reversed on the backend."))) return;
    try {
      await api.deletePurchase(id);
      await loadData();
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  };

  const totalSpend = filtered.reduce((sum, p) => sum + (parseFloat(p.totalCost) || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div style={st.alertError}>{error}</div>}

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <div style={st.metricCard}>
          <div style={st.metricLabel}>{t("inventory.total_purchases", "Total Purchases")}</div>
          <div style={st.metricValue}>{filtered.length}</div>
        </div>
        <div style={st.metricCard}>
          <div style={st.metricLabel}>{t("inventory.total_spend_filtered", "Total Spend (filtered)")}</div>
          <div style={st.metricValue}>Rs {totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div style={st.metricCard}>
          <div style={st.metricLabel}>{t("inventory.unique_suppliers", "Unique Suppliers")}</div>
          <div style={st.metricValue}>
            {new Set(filtered.map(p => p.supplierName).filter(Boolean)).size}
          </div>
        </div>
      </div>

      <div style={st.productCard}>
        <div style={st.productTop}>
          <div>
            <h2 style={st.sectionTitle}>{t("inventory.purchase_history", "Purchase History")}</h2>
            <p style={st.subText}>{t("inventory.purchase_history_sub", "Every stock purchase logged via Stock Entry. Edit header info or delete a record entirely.")}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#666" }}>{t("inventory.from", "From")}</span>
              <input
                type="date"
                style={{ ...st.inp, width: 140, fontFamily: "IBM Plex Mono, monospace", padding: "6px 8px" }}
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#666" }}>{t("inventory.to", "To")}</span>
              <input
                type="date"
                style={{ ...st.inp, width: 140, fontFamily: "IBM Plex Mono, monospace", padding: "6px 8px" }}
                value={toDate}
                onChange={e => setToDate(e.target.value)}
              />
            </div>
            <input
              style={{ ...st.searchInp, width: 220 }}
              placeholder={t("inventory.search_supplier", "Search supplier...")}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button
              style={{
                ...st.addBtn,
                background: selectedPurchaseIds.size > 0 ? "#2e7d32" : "#cde0cd",
                color: selectedPurchaseIds.size > 0 ? "#fff" : "#888",
                border: "none",
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 4,
                cursor: selectedPurchaseIds.size > 0 ? "pointer" : "not-allowed",
              }}
              onClick={handleEditBatches}
              disabled={selectedPurchaseIds.size === 0 || loading}
            >
              {t("inventory.edit_batches", "Edit Batches")}
            </button>
          </div>
        </div>

        <div style={st.tableWrap}>
          {/* Header */}
          <div style={st.tableHead}>
            <span style={{ width: 40, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={filtered.length > 0 && filtered.every(p => selectedPurchaseIds.has(p.id))}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedPurchaseIds(new Set(filtered.map(p => p.id)));
                  } else {
                    setSelectedPurchaseIds(new Set());
                  }
                }}
              />
            </span>
            <span style={{ flex: 1.2 }}>{t("inventory.date", "Date")}</span>
            <span style={{ flex: 1.5 }}>{t("inventory.supplier", "Supplier")}</span>
            <span style={{ flex: 0.8, textAlign: "center" }}>{t("inventory.batches", "Batches")}</span>
            <span style={{ flex: 1, textAlign: "right" }}>{t("inventory.total_cost", "Total Cost")}</span>
            <span style={{ flex: 1, textAlign: "right" }}>{t("inventory.amount_paid", "Amount Paid")}</span>
            <span style={{ flex: 1, textAlign: "right" }}>{t("inventory.remaining", "Remaining")}</span>
            <span style={{ flex: 1 }}>{t("inventory.payment", "Payment")}</span>
            <span style={{ flex: 1.4 }}>{t("inventory.notes", "Notes")}</span>
            <span style={{ width: 90, textAlign: "center" }}>{t("inventory.actions", "Actions")}</span>
          </div>

          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "#666" }}>{t("inventory.loading_history", "Loading purchase history...")}</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#666" }}>{t("inventory.no_purchase_records", "No purchase records found.")}</div>
          ) : (
            filtered.map(p => {
              const isEditing = editingId === p.id;
              const remaining = (parseFloat(p.totalCost) || 0) - (parseFloat(p.amountPaid) || 0);

              return (
                <div key={p.id} className="ledger-row" style={{
                  ...st.tableRowView,
                  background: isEditing ? "#f5fdf5" : "transparent",
                  outline: isEditing ? "1px solid #c8e6c9" : "none",
                  borderRadius: isEditing ? 2 : 0,
                  padding: "12px 8px",
                  alignItems: "flex-start",
                }}>
                  <span style={{ width: 40, display: "flex", justifyContent: "center", alignItems: "flex-start", marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={selectedPurchaseIds.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(selectedPurchaseIds);
                        if (e.target.checked) {
                          next.add(p.id);
                        } else {
                          next.delete(p.id);
                        }
                        setSelectedPurchaseIds(next);
                      }}
                    />
                  </span>
                  {/* Date */}
                  <span style={{ flex: 1.2, color: "#333", fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>{p.purchaseDate}</span>

                  {/* Supplier */}
                  <span style={{ flex: 1.5, color: "#555" }}>{p.supplierName || "—"}</span>

                  {/* Batch count — compact button */}
                  <div style={{ flex: 0.8, display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <button
                      onClick={() => setViewPurchaseBatches(p)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: "#f4faf4", color: "#2e7d32", border: "1px solid #c8e6c9",
                        borderRadius: 12, padding: "4px 10px", fontSize: 11, fontWeight: 600,
                        cursor: "pointer", height: 26, whiteSpace: "nowrap"
                      }}
                    >
                      {(p.items || []).length} {t("inventory.batches_count_label", "batches")}
                      <ChevronDown size={14} />
                    </button>
                  </div>

                  {/* Total cost */}
                  <span style={{ flex: 1, textAlign: "right", fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>
                    Rs {(parseFloat(p.totalCost) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>

                  {/* Amount paid */}
                  <span style={{ flex: 1, textAlign: "right", color: "#2e7d32", fontFamily: "IBM Plex Mono, monospace" }}>
                    Rs {(parseFloat(p.amountPaid) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>

                  {/* Remaining */}
                  <span style={{
                    flex: 1, textAlign: "right",
                    color: remaining > 0 ? "#c62828" : "#2e7d32", fontWeight: 600, fontFamily: "IBM Plex Mono, monospace"
                  }}>
                    Rs {Math.max(0, remaining).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>

                  {/* Payment method */}
                  <span style={{ flex: 1, color: "#555" }}>{p.paymentMethod || "—"}</span>

                  {/* Notes */}
                  <span style={{ flex: 1.4, color: "#888", fontSize: 12 }}>{p.notes || "—"}</span>

                  {/* Actions */}
                  <div style={{ width: 90, display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
                    <button
                      title={t("inventory.edit_batches", "Edit Batches")}
                      style={{ ...st.delBtn, background: "#e8f5e9", color: "#2e7d32", display: "flex", alignItems: "center", justifyContent: "center" }}
                      onClick={() => handleEditSinglePurchase(p)}><Edit2 size={16} /></button>
                    <button
                      title={t("inventory.delete", "Delete")}
                      style={{ ...st.delBtn, display: "flex", alignItems: "center", justifyContent: "center" }}
                      onClick={() => handleDelete(p.id)}><Trash2 size={16} /></button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      {viewPurchaseBatches && (
        <PurchaseBatchesModal
          purchase={viewPurchaseBatches}
          onClose={() => setViewPurchaseBatches(null)}
          onRefresh={() => {
            loadHistory();
            if (onChanged) onChanged();
          }}
        />
      )}
    </div>
  );
}

/* ─── DAILY INVENTORY & PRICING TAB ─── */
function DailyTab({ refreshKey }) {
  const { t } = useThemeLanguage();
  const [products, setProducts] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [refreshLocal, setRefreshLocal] = useState(0);

  // Price Editing state
  const [priceInputs, setPriceInputs] = useState({});
  const [savingPrices, setSavingPrices] = useState({});

  // Adjustment Modal state
  const [adjustingProduct, setAdjustingProduct] = useState(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustType, setAdjustType] = useState("+"); // "+" or "-"
  const [adjustReason, setAdjustReason] = useState("Miscount/Recount");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [submittingAdj, setSubmittingAdj] = useState(false);

  const loadProducts = async () => {
    try {
      const res = await api.listProducts({ search, limit: 100 });
      setProducts(res.products || []);
      
      const inputs = {};
      (res.products || []).forEach(p => {
        inputs[p.id] = p.currentRetailPrice !== undefined ? String(p.currentRetailPrice) : "0";
      });
      setPriceInputs(inputs);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadAdjustments = async () => {
    try {
      const res = await api.listStockAdjustments({ limit: 15 });
      setAdjustments(res.adjustments || []);
    } catch (err) {
      console.error("Failed to load adjustments:", err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadProducts(), loadAdjustments()]).finally(() => {
      setLoading(false);
    });
  }, [search, refreshKey, refreshLocal]);

  const handlePriceChange = (productId, val) => {
    setPriceInputs(prev => ({ ...prev, [productId]: val }));
  };

  const handleSavePrice = async (productId) => {
    const rawVal = priceInputs[productId];
    const price = Number(rawVal);
    if (isNaN(price) || price < 0) {
      alert("Please enter a valid positive number for retail price.");
      return;
    }
    setSavingPrices(prev => ({ ...prev, [productId]: true }));
    try {
      await api.updateProductRetailPrice(productId, price);
      await loadProducts();
    } catch (err) {
      alert("Failed to save price: " + err.message);
    } finally {
      setSavingPrices(prev => ({ ...prev, [productId]: false }));
    }
  };

  const handleOpenAdjustModal = (product) => {
    setAdjustingProduct(product);
    setAdjustQty("");
    setAdjustType("+");
    setAdjustReason("Miscount/Recount");
    setAdjustNotes("");
  };

  const handleCloseAdjustModal = () => {
    setAdjustingProduct(null);
  };

  const submitAdjustment = async (e) => {
    e.preventDefault();
    const qty = Number(adjustQty);
    if (isNaN(qty) || qty <= 0) {
      alert("Please enter a valid quantity greater than zero.");
      return;
    }
    if (!adjustReason) {
      alert("Please select a reason for the adjustment.");
      return;
    }

    setSubmittingAdj(true);
    try {
      const quantityChange = adjustType === "+" ? qty : -qty;
      const userJSON = localStorage.getItem("user");
      let adjustedBy = "Admin";
      if (userJSON) {
        try {
          const u = JSON.parse(userJSON);
          if (u && u.username) adjustedBy = u.username;
        } catch {}
      }

      await api.adjustStock({
        productId: adjustingProduct.id,
        quantityChange,
        reason: adjustReason,
        notes: adjustNotes,
        adjustedBy
      });

      handleCloseAdjustModal();
      setRefreshLocal(k => k + 1);
    } catch (err) {
      alert("Adjustment failed: " + err.message);
    } finally {
      setSubmittingAdj(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {error && <div style={st.alertError}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        <div style={st.productCard}>
          <div style={st.productTop}>
            <div>
              <h2 style={st.sectionTitle}>{t("inventory.daily_pricing_title", "Daily Pricing & Stock Adjustments")}</h2>
              <p style={st.subText}>{t("inventory.daily_pricing_sub", "Set current retail checkout prices and perform auditable inventory adjustments.")}</p>
            </div>
            <input
              style={st.searchInp}
              placeholder={t("inventory.search_placeholder", "Search product...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#666" }}>Loading Daily Stock list...</div>
          ) : products.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#666" }}>No products found.</div>
          ) : (
            <div style={st.tableWrap}>
              <div style={st.tableHead}>
                <span style={{ flex: 2 }}>{t("inventory.product_name", "Product")}</span>
                <span style={{ flex: 1 }}>{t("inventory.category", "Category")}</span>
                <span style={{ flex: 1, textAlign: "center" }}>{t("inventory.stock", "Current Stock")}</span>
                <span style={{ flex: 1.5, textAlign: "center" }}>{t("inventory.cost_basis", "Cost Basis")}</span>
                <span style={{ flex: 2, textAlign: "center" }}>{t("inventory.retail_price", "Retail Checkout Price")}</span>
                <span style={{ flex: 1, textAlign: "center" }}>{t("inventory.actions", "Actions")}</span>
              </div>

              {products.map(p => {
                const costBasis = p.weightedAverageCost !== undefined ? p.weightedAverageCost : p.costPrice;
                const enteredPrice = Number(priceInputs[p.id]);
                const isLowMargin = enteredPrice > 0 && enteredPrice < costBasis;

                return (
                  <div key={p.id} className="ledger-row" style={st.tableRowView}>
                    <div style={{ flex: 2, fontWeight: 600, color: "#1b3a1d" }}>
                      {p.name}
                      {p.sku && <span style={{ display: "block", fontSize: 11, color: "#777", fontWeight: 400 }}>SKU: {p.sku}</span>}
                    </div>
                    <div style={{ flex: 1, color: "#555" }}>{p.categoryName || "N/A"}</div>
                    <div style={{ flex: 1, textAlign: "center", fontWeight: 700, color: p.currentStock <= p.lowStockLevel ? "#d32f2f" : "#2e7d32" }}>
                      {p.currentStock} <span style={{ fontSize: 11, fontWeight: 400, color: "#777" }}>{p.unit}</span>
                      {p.currentStock <= p.lowStockLevel && (
                        <span style={{ display: "block", fontSize: 9, color: "#d32f2f", textTransform: "uppercase", fontWeight: 700 }}>Low Stock</span>
                      )}
                    </div>
                    <div style={{ flex: 1.5, textAlign: "center", color: "#555" }}>
                      Rs {costBasis.toFixed(2)}
                      <span style={{ display: "block", fontSize: 10, color: "#888" }}>Weighted Avg</span>
                    </div>
                    
                    <div style={{ flex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, color: "#666" }}>Rs</span>
                        <input
                          type="number"
                          step="0.01"
                          style={{
                            ...st.inp,
                            width: 90,
                            padding: "6px 8px",
                            textAlign: "right",
                            border: isLowMargin ? "1px solid #e65100" : "1px solid #cde0cd",
                            backgroundColor: isLowMargin ? "#fffde7" : "#fcfdfc"
                          }}
                          value={priceInputs[p.id] || ""}
                          onChange={(e) => handlePriceChange(p.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSavePrice(p.id);
                          }}
                        />
                        <button
                          style={{
                            padding: "6px 10px",
                            background: "#2e7d32",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 12,
                            opacity: savingPrices[p.id] ? 0.6 : 1
                          }}
                          onClick={() => handleSavePrice(p.id)}
                          disabled={savingPrices[p.id]}
                        >
                          {savingPrices[p.id] ? "..." : <Check size={16} />}
                        </button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#666", fontWeight: 500 }}>
                          Break-even: Rs {costBasis.toFixed(2)}
                        </span>
                        {isLowMargin && (
                          <div style={{ fontSize: 10, color: "#e65100", fontWeight: 600, display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={14} /> Below Break-even</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ flex: 1, textAlign: "center" }}>
                      <button
                        style={{
                          padding: "6px 12px",
                          background: "#e8f5e9",
                          color: "#2e7d32",
                          border: "1px solid #c8e6c9",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontWeight: 600,
                          fontSize: 12
                        }}
                        onClick={() => handleOpenAdjustModal(p)}
                      >
                        Adjust +/-
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={st.reviewCard}>
          <div style={{ borderBottom: "1px solid #e8f0e8", paddingBottom: 12, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1b3a1d" }}>Recent Adjustments Log</h3>
            <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "#777" }}>Traceability log of recent manual stock changes.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 600, overflowY: "auto", paddingRight: 4 }}>
            {adjustments.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 12.5 }}>No recent adjustments found.</div>
            ) : (
              adjustments.map(adj => {
                const isPositive = adj.quantityChange > 0;
                return (
                  <div
                    key={adj.id}
                    style={{
                      padding: 10,
                      borderRadius: 4,
                      background: "#fcfdfc",
                      border: "1px solid #e2ece2",
                      borderLeft: isPositive ? "4px solid #2e7d32" : "4px solid #c62828",
                      fontSize: 12.5
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                      <span style={{ color: "#1b3a1d" }}>{adj.productName}</span>
                      <span style={{ color: isPositive ? "#2e7d32" : "#c62828" }}>
                        {isPositive ? "+" : ""}{adj.quantityChange} {adj.unit}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#666", fontSize: 11, marginTop: 4 }}>
                      <span>Batch: {adj.batchNo || "Shortage"}</span>
                      <span>By: {adj.adjustedBy || "System"}</span>
                    </div>
                    <div style={{ color: "#555", fontSize: 11.5, marginTop: 6, fontStyle: "italic" }}>
                      Reason: <strong style={{ color: "#333" }}>{adj.reason}</strong>
                      {adj.notes && ` - ${adj.notes}`}
                    </div>
                    <div style={{ color: "#999", fontSize: 10, marginTop: 4, textAlign: "right" }}>
                      {new Date(adj.createdAt).toLocaleString()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {adjustingProduct && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
        >
          <div style={{ background: "#fff", borderRadius: 6, padding: 24, width: 440, border: "1px solid #b8c8b8", boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 12, marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "#1b3a1d" }}>Adjust Stock: {adjustingProduct.name}</h3>
              <button style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#888" }} onClick={handleCloseAdjustModal}>×</button>
            </div>

            <form onSubmit={submitAdjustment} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Adjustment Type</label>
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      background: adjustType === "+" ? "#e8f5e9" : "#fcfdfc",
                      border: adjustType === "+" ? "2px solid #2e7d32" : "1px solid #cde0cd",
                      borderRadius: 4,
                      color: adjustType === "+" ? "#2e7d32" : "#555",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                    onClick={() => setAdjustType("+")}
                  >
                    + Add Stock (Found/Recount)
                  </button>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      background: adjustType === "-" ? "#ffebee" : "#fcfdfc",
                      border: adjustType === "-" ? "2px solid #c62828" : "1px solid #cde0cd",
                      borderRadius: 4,
                      color: adjustType === "-" ? "#c62828" : "#555",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                    onClick={() => setAdjustType("-")}
                  >
                    - Remove Stock (Loss/Theft/Spill)
                  </button>
                </div>
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Quantity ({adjustingProduct.unit})</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  style={st.fieldInput}
                  placeholder={`e.g. 5`}
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                />
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Reason for Adjustment</label>
                <select
                  required
                  style={st.fieldInput}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                >
                  <option value="Miscount/Recount">Miscount / Stock Recount</option>
                  <option value="Theft">Theft / Pilferage</option>
                  <option value="Damage/Breakage">Damage / Breakage</option>
                  <option value="Spillage">Spillage / Waste</option>
                  <option value="Expired">Expired Stock</option>
                  <option value="Gift/Promotion">Gift / Promotional Sample</option>
                  <option value="Other">Other (Specify in Notes)</option>
                </select>
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Optional Notes</label>
                <textarea
                  style={{ ...st.fieldInput, height: 70, resize: "none" }}
                  placeholder="Provide additional details..."
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  type="button"
                  style={{ padding: "8px 16px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer" }}
                  onClick={handleCloseAdjustModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdj}
                  style={{
                    padding: "8px 20px",
                    background: adjustType === "+" ? "#2e7d32" : "#c62828",
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontWeight: 700,
                    opacity: submittingAdj ? 0.7 : 1
                  }}
                >
                  {submittingAdj ? "Submitting..." : "Confirm & Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BulkEditBatchesTab({ batchesToEdit, onCancel, onSaved }) {
  const { t } = useThemeLanguage();
  const [batches, setBatches] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modifiedIds, setModifiedIds] = useState(new Set());
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    const initialized = batchesToEdit.map(b => ({
      id: b.id,
      productId: b.productId,
      productName: b.productName,
      batchNo: b.batchNo || "",
      category: b.category || "Uncategorized",
      quantityRemaining: b.quantityRemaining ?? 0,
      quantityReceived: b.quantityReceived ?? 0,
      unit: b.unit || "Piece",
      costPrice: b.costPrice ?? 0,
      salePrice: b.salePrice ?? 0,
      expiryDate: b.expiryDate ? b.expiryDate.slice(0, 10) : "",
      supplierId: b.supplierId || "",
      purchaseDate: b.purchaseDate ? b.purchaseDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      notes: b.notes || "",
      originalQuantityRemaining: b.quantityRemaining ?? 0,
      originalQuantityReceived: b.quantityReceived ?? 0,
    }));
    setBatches(initialized);

    const loadSuppliers = async () => {
      try {
        const res = await api.listSuppliers();
        setSuppliers(res.suppliers || []);
      } catch (err) {
        console.error("Failed to load suppliers:", err);
      }
    };
    loadSuppliers();
  }, [batchesToEdit]);

  const updateBatchRow = (id, field, value) => {
    setBatches(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: value };
      validateRow(updated);
      return updated;
    }));
    setModifiedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const validateRow = (row) => {
    const errors = { ...validationErrors };
    const rowErrors = [];

    if (!String(row.batchNo).trim()) {
      rowErrors.push(t("inventory.err_batch_no_req", "Batch number is required."));
    }

    const qty = parseFloat(row.quantityRemaining);
    if (isNaN(qty)) {
      rowErrors.push(t("inventory.err_qty_nan", "Quantity must be a valid number."));
    } else {
      const alreadyConsumed = row.originalQuantityReceived - row.originalQuantityRemaining;
      const newConsumed = row.originalQuantityReceived - qty;

      if (qty < 0) {
        rowErrors.push(t("inventory.err_qty_neg", "Quantity cannot be negative."));
      } else if (newConsumed < alreadyConsumed) {
        const msg = t(
          "inventory.err_qty_contradict",
          "This batch has already sold/dispensed {already_consumed} units — remaining quantity can't be set below a value that contradicts that history."
        ).replace("{already_consumed}", alreadyConsumed.toFixed(2).replace(/\.00$/, ""));
        rowErrors.push(msg);
      }
    }

    if (parseFloat(row.costPrice) < 0) {
      rowErrors.push(t("inventory.err_cost_neg", "Cost price cannot be negative."));
    }
    if (parseFloat(row.salePrice) < 0) {
      rowErrors.push(t("inventory.err_sale_neg", "Batch sale price cannot be negative."));
    }

    if (rowErrors.length > 0) {
      errors[row.id] = rowErrors;
    } else {
      delete errors[row.id];
    }
    setValidationErrors(errors);
  };

  const handleSaveAll = async () => {
    setError("");
    setSuccess("");

    const currentErrors = { ...validationErrors };
    batches.forEach(b => {
      validateRow(b);
    });

    // Recheck validationErrors after update
    if (batches.some(b => {
      const alreadyConsumed = b.originalQuantityReceived - b.originalQuantityRemaining;
      const newConsumed = b.originalQuantityReceived - parseFloat(b.quantityRemaining);
      return !String(b.batchNo).trim() ||
             isNaN(parseFloat(b.quantityRemaining)) ||
             parseFloat(b.quantityRemaining) < 0 ||
             newConsumed < alreadyConsumed ||
             parseFloat(b.costPrice) < 0 ||
             parseFloat(b.salePrice) < 0;
    })) {
      setError(t("inventory.err_fix_validation", "Please resolve all validation errors before saving."));
      return;
    }

    const modifiedBatches = batches.filter(b => modifiedIds.has(b.id));
    if (modifiedBatches.length === 0) {
      setSuccess(t("inventory.no_changes", "No changes detected."));
      setTimeout(() => onSaved(), 1000);
      return;
    }

    setLoading(true);
    try {
      for (const b of modifiedBatches) {
        await api.updateBatch(b.id, {
          batchNo: b.batchNo,
          quantityRemaining: parseFloat(b.quantityRemaining),
          unit: b.unit,
          costPrice: parseFloat(b.costPrice) || 0,
          salePrice: parseFloat(b.salePrice) || 0,
          expiryDate: b.expiryDate || null,
          supplierId: b.supplierId ? Number(b.supplierId) : null,
          purchaseDate: b.purchaseDate,
          notes: b.notes || null,
        });
      }
      setSuccess(t("inventory.success_bulk_saved", "All batch changes successfully committed."));
      setTimeout(() => onSaved(), 1000);
    } catch (err) {
      setError(err.message || "Failed to save some batches.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div style={st.alertError}>{error}</div>}
      {success && <div style={st.alertSuccess}>{success}</div>}

      <div style={st.productCard}>
        <div style={st.productTop}>
          <div>
            <h2 style={st.sectionTitle}>{t("inventory.bulk_edit_batches", "Bulk Edit Batches")}</h2>
            <p style={st.subText}>{t("inventory.bulk_edit_batches_sub", "Modify properties of existing batches inline. Green dots indicate unsaved changes.")}</p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={onCancel}
              style={{ ...st.addBtn, background: "#f5f5f5", color: "#333", border: "1px solid #ddd" }}
              disabled={loading}
            >
              {t("inventory.cancel", "Cancel")}
            </button>
            <button
              onClick={handleSaveAll}
              style={{ ...st.addBtn, background: "#2e7d32", color: "#fff", border: "none" }}
              disabled={loading}
            >
              {loading ? t("inventory.saving", "Saving...") : t("inventory.save_all", "Save All Changes")}
            </button>
          </div>
        </div>

        <div style={{ ...st.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 280px)" }}>
          <div style={{ 
            ...st.tableHead, 
            display: "grid",
            gridTemplateColumns: "40px minmax(200px, 2fr) minmax(130px, 1.2fr) minmax(120px, 1.1fr) minmax(90px, 0.9fr) minmax(100px, 0.9fr) minmax(110px, 1fr) minmax(130px, 1.2fr) minmax(140px, 1.1fr) minmax(140px, 1.3fr) minmax(140px, 1.1fr)",
            gap: "8px",
            minWidth: "max-content",
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "#fff"
          }}>
            <span style={{ width: 44, textAlign: "center" }}>#</span>
            <span style={{ flex: 2 }}>{t("inventory.product", "Product")}</span>
            <span style={{ flex: 1.2 }}>{t("inventory.batch", "Batch No")}</span>
            <span style={{ flex: 1.1 }}>{t("inventory.category", "Category")}</span>
            <span style={{ flex: 0.9 }}>{t("inventory.qty_remaining", "Qty Rem.")}</span>
            <span style={{ flex: 0.9 }}>{t("inventory.unit", "Unit")}</span>
            <span style={{ flex: 1 }}>{t("inventory.cost", "Cost")}</span>
            <span style={{ flex: 1.2 }}>{t("inventory.batch_sale_price", "Sale Price (at purchase)")}</span>
            <span style={{ flex: 1.1 }}>{t("inventory.expiry", "Expiry")}</span>
            <span style={{ flex: 1.3 }}>{t("inventory.supplier", "Supplier")}</span>
            <span style={{ flex: 1.1 }}>{t("inventory.date", "Date")}</span>
          </div>

          {batches.map((item, i) => {
            const hasChanged = modifiedIds.has(item.id);
            const rowErrors = validationErrors[item.id] || [];

            return (
              <div key={item.id} style={{ display: "flex", flexDirection: "column", minWidth: "max-content" }}>
                <div
                  style={{
                    ...st.tableRow,
                    display: "grid",
                    gridTemplateColumns: "40px minmax(200px, 2fr) minmax(130px, 1.2fr) minmax(120px, 1.1fr) minmax(90px, 0.9fr) minmax(100px, 0.9fr) minmax(110px, 1fr) minmax(130px, 1.2fr) minmax(140px, 1.1fr) minmax(140px, 1.3fr) minmax(140px, 1.1fr)",
                    gap: "8px",
                    overflow: "visible",
                    position: "relative",
                    background: hasChanged ? "#f4fcf4" : "transparent",
                    borderLeft: rowErrors.length > 0 ? "4px solid #c62828" : "none",
                  }}
                >
                  <span style={{ ...st.rowNum, width: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    {hasChanged && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "#2e7d32",
                          display: "inline-block",
                        }}
                      />
                    )}
                    <span>{i + 1}</span>
                  </span>

                  <input
                    style={{ ...st.inp, flex: 2, background: "#f9f9f9", color: "#666" }}
                    value={item.productName}
                    disabled
                  />

                  <input
                    style={{ ...st.inp, flex: 1.2 }}
                    value={item.batchNo}
                    onChange={(e) => updateBatchRow(item.id, "batchNo", e.target.value)}
                  />

                  <input
                    style={{ ...st.inp, flex: 1.1, background: "#f9f9f9", color: "#666" }}
                    value={item.category}
                    disabled
                  />

                  <input
                    style={{ ...st.inp, flex: 0.9, fontFamily: "IBM Plex Mono, monospace" }}
                    type="number"
                    step="any"
                    value={item.quantityRemaining}
                    onChange={(e) => updateBatchRow(item.id, "quantityRemaining", e.target.value)}
                  />

                  <select
                    style={{ ...st.inp, flex: 0.9 }}
                    value={item.unit}
                    onChange={(e) => updateBatchRow(item.id, "unit", e.target.value)}
                  >
                    <option value="Litre">{t("inventory.unit_litre", "Litre")}</option>
                    <option value="Kg">{t("inventory.unit_kg", "Kg")}</option>
                    <option value="Bottle">{t("inventory.unit_bottle", "Bottle")}</option>
                    <option value="Piece">{t("inventory.unit_piece", "Piece")}</option>
                  </select>

                  <input
                    style={{ ...st.inp, flex: 1, fontFamily: "IBM Plex Mono, monospace" }}
                    type="number"
                    step="any"
                    value={item.costPrice}
                    onChange={(e) => updateBatchRow(item.id, "costPrice", e.target.value)}
                  />

                  <input
                    style={{ ...st.inp, flex: 1.2, fontFamily: "IBM Plex Mono, monospace" }}
                    type="number"
                    step="any"
                    value={item.salePrice}
                    onChange={(e) => updateBatchRow(item.id, "salePrice", e.target.value)}
                  />

                  <input
                    style={{ ...st.inp, flex: 1.1, fontFamily: "IBM Plex Mono, monospace" }}
                    type="date"
                    value={item.expiryDate}
                    onChange={(e) => updateBatchRow(item.id, "expiryDate", e.target.value)}
                  />

                  <select
                    style={{ ...st.inp, flex: 1.3 }}
                    value={item.supplierId}
                    onChange={(e) => updateBatchRow(item.id, "supplierId", e.target.value)}
                  >
                    <option value="">{t("inventory.no_supplier", "— None —")}</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  <input
                    style={{ ...st.inp, flex: 1.1, fontFamily: "IBM Plex Mono, monospace" }}
                    type="date"
                    value={item.purchaseDate}
                    onChange={(e) => updateBatchRow(item.id, "purchaseDate", e.target.value)}
                  />
                </div>

                {rowErrors.length > 0 && (
                  <div
                    style={{
                      padding: "4px 12px 8px 48px",
                      background: "#fff5f5",
                      color: "#c62828",
                      fontSize: 12,
                      fontWeight: 500,
                      borderBottom: "1px solid #ffdcd6",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {rowErrors.map((err, errIdx) => (
                      <div key={errIdx} style={{ display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={14} /> {err}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const st = {
  page: { display: "flex", flexDirection: "column", minHeight: "100%", background: "#f5f8f5", fontFamily: "Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif" },
  main: { flex: 1, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #c8d8c8", paddingBottom: 12, marginBottom: 4, flexWrap: "wrap", gap: 12 },
  toolbarLeft: { display: "flex", alignItems: "center", gap: 12 },
  pageTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: "#1b3a1d", textTransform: "uppercase", letterSpacing: "0.08em", paddingLeft: 12, borderLeft: "3px solid #2e7d32" },

  navStrip: { display: "flex", gap: 20, padding: "0 4px" },
  navBtn: { padding: "10px 4px", border: "none", borderBottom: "2px solid transparent", background: "transparent", fontSize: 14, fontWeight: 600, color: "#5a755c", cursor: "pointer", borderRadius: 0, transition: "all 0.2s" },
  navBtnActive: { color: "#1d351f", borderBottom: "2px solid #2e7d32", fontWeight: 700 },

  metricCard: { background: "#fff", border: "1px solid #c8d8c8", borderRadius: 2, padding: "16px 20px" },
  metricLabel: { fontSize: 10, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 },
  metricValue: { fontSize: 24, fontWeight: 700, color: "#1b3a1d", fontFamily: "IBM Plex Mono, monospace" },

  summaryToggle: { padding: "10px 18px", border: "none", background: "#2e7d32", color: "#fff", borderRadius: 4, cursor: "pointer", fontWeight: 600, transition: "background 0.2s" },

  productCard: { background: "#fff", borderRadius: 2, padding: 20, border: "1px solid #b8c8b8" },
  productTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 },
  sectionTitle: { margin: 0, fontSize: 15, fontWeight: 700, color: "#1b3a1d", textTransform: "uppercase", letterSpacing: "0.03em" },
  subText: { margin: "4px 0 0 0", fontSize: 12, color: "#666" },
  addBtn: { padding: "8px 16px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600, transition: "background 0.2s" },
  searchInp: { padding: "8px 14px", border: "1px solid #cde0cd", borderRadius: 4, outline: "none", width: 280, fontSize: 13, background: "#fcfdfc" },

  tableWrap: { display: "flex", flexDirection: "column", overflowX: "auto", width: "100%" },
  tableHead: { display: "flex", padding: "10px 12px", borderBottom: "2px solid #c8d8c8", fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.05em", minWidth: 980 },
  tableRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: "1px solid rgba(0,0,0,0.08)", minWidth: 980 },
  tableRowView: { display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderBottom: "1px solid rgba(0,0,0,0.08)", fontSize: 13.5, minWidth: 980 },
  rowNum: { fontSize: 13, fontWeight: 600, color: "#a3bca5", textAlign: "center" },
  inp: { padding: "8px 10px", border: "1px solid #cde0cd", borderRadius: 4, background: "#fcfdfc", outline: "none", boxSizing: "border-box", fontSize: 13, minWidth: 0, width: "100%" },
  delBtn: { width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff0f0", color: "#d32f2f", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 },

  infoRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 },
  infoCard: { background: "#fff", borderRadius: 2, padding: 20, border: "1px solid #b8c8b8" },
  sectionTitleSm: { margin: "0 0 16px 0", fontSize: 13.5, fontWeight: 700, color: "#1b3a1d", textTransform: "uppercase", letterSpacing: "0.03em" },
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 },

  fieldWrap: { display: "flex", flexDirection: "column", gap: 6 },
  fieldLabel: { fontSize: 10, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.05em" },
  fieldInput: { padding: "8px 10px", border: "1px solid #cde0cd", borderRadius: 4, background: "#fcfdfc", outline: "none", fontSize: 13 },

  reviewCard: { background: "#fff", borderRadius: 2, padding: 20, border: "1px solid #b8c8b8", display: "flex", flexDirection: "column", gap: 16 },
  reviewHeader: { display: "flex", flexDirection: "column", gap: 4, borderBottom: "1px solid #e8f0e8", paddingBottom: 12 },
  reviewBody: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 },
  reviewMetrics: { display: "flex", gap: 32, flexWrap: "wrap" },
  reviewMetric: { display: "flex", flexDirection: "column", gap: 4 },
  reviewMetricLabel: { fontSize: 10, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.08em" },
  reviewMetricValue: { fontSize: 18, fontWeight: 700, color: "#1b3a1d", fontFamily: "IBM Plex Mono, monospace" },
  saveRecordBtn: { padding: "12px 28px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", boxShadow: "0 2px 4px rgba(46, 125, 50, 0.2)" },

  alertError: { padding: "12px", borderRadius: 4, background: "#fff0f0", border: "1px solid #f5c6c6", color: "#c62828", fontSize: 13.5, fontWeight: 500 },
  alertSuccess: { padding: "12px", borderRadius: 4, background: "#e8f5e9", border: "1px solid #c8e6c9", color: "#2e7d32", fontSize: 13.5, fontWeight: 500 },

  statusBadge: { padding: "4px 8px", borderRadius: 2, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" },
  badgeSuccess: { background: "#2e7d3218", color: "#2e7d32", borderLeft: "3px solid #2e7d32" },
  badgeWarning: { background: "#e6510018", color: "#e65100", borderLeft: "3px solid #e65100" },
  badgeDanger: { background: "#c6282818", color: "#c62828", borderLeft: "3px solid #c62828" },

  // New custom flat chip elements
  filterStrip: { display: "flex", gap: 12, borderBottom: "1px solid rgba(0,0,0,0.08)", paddingBottom: 10, marginBottom: 16, flexWrap: "wrap" },
  filterChip: { background: "none", border: "none", borderBottom: "2px solid transparent", padding: "6px 2px", fontSize: 13, fontWeight: 600, color: "#666", cursor: "pointer", borderRadius: 0, transition: "all 0.2s" },
  filterChipActive: { color: "#2e7d32", borderBottom: "2px solid #2e7d32" },

  settingsRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8faf8", border: "1px solid #c8d8c8", borderRadius: 2, padding: "8px 12px", marginBottom: 12, gap: 12, flexWrap: "wrap" },
  checkboxLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: "#1b3a1d", cursor: "pointer" },
  checkbox: { width: 14, height: 14, cursor: "pointer" },
  settingsText: { fontSize: 13, color: "#555" },
  thresholdInp: { width: 50, padding: "4px 6px", border: "1px solid #cde0cd", borderRadius: 4, outline: "none", textAlign: "center", fontSize: 13, fontFamily: "IBM Plex Mono, monospace" },

  tableFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f8faf8", borderTop: "2px solid #c8d8c8", borderBottom: "1px solid #c8d8c8", fontSize: 13.5, color: "#1b3a1d", minWidth: 980 },
};
