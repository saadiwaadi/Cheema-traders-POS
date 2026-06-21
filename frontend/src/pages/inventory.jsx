import { useState, useEffect } from "react";
import * as api from "../lib/posApi";
import { useThemeLanguage } from "../context/ThemeLanguageContext";

export default function InventoryManagementPage() {
  const { t } = useThemeLanguage();
  const [activeTab, setActiveTab] = useState("view"); // "view" | "entry" | "history"
  const [refreshKey, setRefreshKey] = useState(0);

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
          </div>
        </div>

        {activeTab === "view"    && <StockViewTab refreshKey={refreshKey} />}
        {activeTab === "entry"   && <StockEntryTab onSaved={() => { setRefreshKey(k => k + 1); setActiveTab("view"); }} />}
        {activeTab === "history" && <StockHistoryTab onChanged={() => setRefreshKey(k => k + 1)} />}
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

  const totalValue = displayedBatches.reduce((sum, b) => sum + (b.quantityRemaining * (b.costPrice || 0)), 0);

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
            <p style={st.subText}>{t("inventory.current_inventory_sub", "Current inventory across all batches.")}</p>
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
            <span style={{ flex: 1.2 }}>{t("inventory.batch_no", "Batch No")}</span>
            <span style={{ flex: 1.5 }}>{t("inventory.supplier", "Supplier")}</span>
            <span style={{ flex: 1, textAlign: "right" }}>{t("inventory.qty_remaining", "Qty Remaining")}</span>
            <span style={{ flex: 1, textAlign: "right" }}>{t("inventory.cost_price", "Cost Price")}</span>
            <span style={{ flex: 1, textAlign: "right" }}>{t("inventory.retail_price", "Retail Price")}</span>
            <span style={{ flex: 1.2, textAlign: "center" }}>{t("inventory.expiry_date", "Expiry Date")}</span>
            <span style={{ width: 80, textAlign: "center" }}>{t("inventory.status", "Status")}</span>
            <span style={{ width: 90, textAlign: "center" }}>{t("inventory.actions", "Actions")}</span>
          </div>

          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "#666" }}>{t("inventory.loading", "Loading inventory...")}</div>
          ) : displayedBatches.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#666" }}>{t("inventory.no_batches", "No batches found.")}</div>
          ) : (
            displayedBatches.map((b) => (
              <div key={b.id} className="ledger-row" style={st.tableRowView}>
                <span style={{ flex: 2, fontWeight: 600, color: "#1b3a1d" }}>{b.productName}</span>
                <span style={{ flex: 1.2, color: "#555", fontFamily: "IBM Plex Mono, monospace" }}>{b.batchNo}</span>
                <span style={{ flex: 1.5, color: "#555" }}>{b.supplierName || "—"}</span>
                <span style={{ flex: 1, textAlign: "right", fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>
                  {b.quantityRemaining} {b.unit}
                  {b.quantityRemaining <= (b.lowStockLevel || 0) && (
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3, fontSize: 10, color: "#c62828", fontWeight: 700, marginTop: 2 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                      </svg>
                      {t("inventory.low_stock", "Low Stock")} ({b.lowStockLevel})
                    </span>
                  )}
                </span>
                <span style={{ flex: 1, textAlign: "right", fontFamily: "IBM Plex Mono, monospace" }}>Rs {b.costPrice}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#2e7d32", fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>Rs {b.salePrice}</span>
                <span style={{ flex: 1.2, textAlign: "center", color: "#555", fontFamily: "IBM Plex Mono, monospace" }}>{b.expiryDate || "—"}</span>
                <div style={{ width: 80, display: "flex", justifyContent: "center" }}>
                  <div style={{ ...st.statusBadge, ...(b.expiryStatus === "expired" ? st.badgeDanger : b.expiryStatus === "expiring" ? st.badgeWarning : st.badgeSuccess) }}>
                    {t("inventory.expiry_status_" + b.expiryStatus, b.expiryStatus)}
                  </div>
                </div>
                <div style={{ width: 90, display: "flex", gap: 6, justifyContent: "center" }}>
                  <button
                    title={t("inventory.edit", "Edit")}
                    style={{ ...st.delBtn, background: "#e8f0ff", color: "#5c35cc", fontWeight: 700, width: 32, height: 32 }}
                    onClick={() => setEditingBatch(b)}>✎</button>
                  <button
                    title={t("inventory.delete", "Delete")}
                    style={{ ...st.delBtn, width: 32, height: 32 }}
                    onClick={() => handleDeleteBatch(b.id)}>🗑</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

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
          <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666" }} onClick={onClose}>✕</button>
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

        <div style={st.tableWrap}>
          <div style={st.tableHead}>
            <span style={{ width: 36 }}>#</span>
            <span style={{ flex: 2 }}>{t("inventory.product", "Product")}</span>
            <span style={{ flex: 1.2 }}>{t("inventory.batch", "Batch")}</span>
            <span style={{ flex: 1.1 }}>{t("inventory.category", "Category")}</span>
            <span style={{ flex: 0.8 }}>{t("inventory.qty", "Qty")}</span>
            <span style={{ flex: 0.9 }}>{t("inventory.unit", "Unit")}</span>
            <span style={{ flex: 1 }}>{t("inventory.cost", "Cost")}</span>
            <span style={{ flex: 1 }}>{t("inventory.retail", "Retail")}</span>
            <span style={{ flex: 1.1 }}>{t("inventory.expiry", "Expiry")}</span>
            <span style={{ width: 40 }}></span>
          </div>

          {inventory.map((item, i) => (
            <div key={item.id} style={st.tableRow}>
              <span style={{ ...st.rowNum, width: 36 }}>{i + 1}</span>

              <input
                style={{ ...st.inp, flex: 2 }}
                placeholder={t("inventory.placeholder_product_name", "Product Name")}
                value={item.productName}
                onChange={(e) => updateItem(item.id, "productName", e.target.value)}
              />

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
                placeholder={t("inventory.retail", "Retail")}
                value={item.salePrice}
                onChange={(e) => updateItem(item.id, "salePrice", e.target.value)}
              />

              <input
                style={{ ...st.inp, flex: 1.1, fontFamily: "IBM Plex Mono, monospace" }}
                type="date"
                value={item.expiryDate}
                onChange={(e) => updateItem(item.id, "expiryDate", e.target.value)}
              />

              <button style={st.delBtn} onClick={() => removeRow(item.id)}>✕</button>
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
            {saving ? t("inventory.saving_record", "Saving Record...") : t("inventory.btn_confirm_save", "✓ Confirm & Save Inventory")}
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

function StockHistoryTab({ onChanged }) {
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
          </div>
        </div>

        <div style={st.tableWrap}>
          {/* Header */}
          <div style={st.tableHead}>
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
                  {/* Date */}
                  {isEditing ? (
                    <input type="date" style={{ ...st.inp, flex: 1.2, fontFamily: "IBM Plex Mono, monospace" }}
                      value={editValues.purchaseDate}
                      onChange={e => setEditValues(v => ({ ...v, purchaseDate: e.target.value }))} />
                  ) : (
                    <span style={{ flex: 1.2, color: "#333", fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>{p.purchaseDate}</span>
                  )}

                  {/* Supplier */}
                  <span style={{ flex: 1.5, color: "#555" }}>{p.supplierName || "—"}</span>

                  {/* Batch count — expand on click */}
                  <div style={{ flex: 0.8, textAlign: "center" }}>
                    <span style={{
                      display: "inline-block", background: "#2e7d3218", color: "#2e7d32", borderLeft: "2px solid #2e7d32",
                      borderRadius: 2, padding: "2px 8px", fontSize: 11, fontWeight: 700
                    }}>
                      {(p.items || []).length}
                    </span>
                    {(p.items || []).length > 0 && (
                      <div style={{ marginTop: 4, fontSize: 11, color: "#777", lineHeight: 1.5 }}>
                        {(p.items || []).map((item, i) => (
                          <div key={i}>{item.productName} × {item.qty}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Total cost */}
                  <span style={{ flex: 1, textAlign: "right", fontWeight: 600, fontFamily: "IBM Plex Mono, monospace" }}>
                    Rs {(parseFloat(p.totalCost) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>

                  {/* Amount paid */}
                  {isEditing ? (
                    <input type="number" style={{ ...st.inp, flex: 1, textAlign: "right", fontFamily: "IBM Plex Mono, monospace" }}
                      value={editValues.amountPaid}
                      onChange={e => setEditValues(v => ({ ...v, amountPaid: e.target.value }))} />
                  ) : (
                    <span style={{ flex: 1, textAlign: "right", color: "#2e7d32", fontFamily: "IBM Plex Mono, monospace" }}>
                      Rs {(parseFloat(p.amountPaid) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  )}

                  {/* Remaining */}
                  <span style={{
                    flex: 1, textAlign: "right",
                    color: remaining > 0 ? "#c62828" : "#2e7d32", fontWeight: 600, fontFamily: "IBM Plex Mono, monospace"
                  }}>
                    Rs {Math.max(0, remaining).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>

                  {/* Payment method */}
                  {isEditing ? (
                    <select style={{ ...st.inp, flex: 1 }}
                      value={editValues.paymentMethod}
                      onChange={e => setEditValues(v => ({ ...v, paymentMethod: e.target.value }))}>
                      {["Cash", "Credit", "Partial", ...banks.map(b => b.name)].map(m => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ flex: 1, color: "#555" }}>{p.paymentMethod || "—"}</span>
                  )}

                  {/* Notes */}
                  {isEditing ? (
                    <input style={{ ...st.inp, flex: 1.4 }}
                      value={editValues.notes}
                      placeholder={t("inventory.notes", "Notes...")}
                      onChange={e => setEditValues(v => ({ ...v, notes: e.target.value }))} />
                  ) : (
                    <span style={{ flex: 1.4, color: "#888", fontSize: 12 }}>{p.notes || "—"}</span>
                  )}

                  {/* Actions */}
                  <div style={{ width: 90, display: "flex", gap: 6, justifyContent: "center" }}>
                    {isEditing ? (
                      <>
                        <button
                          title={t("inventory.save", "Save")}
                          style={{ ...st.delBtn, background: "#e8f5e9", color: "#2e7d32", fontWeight: 700 }}
                          onClick={() => saveEdit(p.id)}>✓</button>
                        <button
                          title={t("inventory.cancel", "Cancel")}
                          style={st.delBtn}
                          onClick={() => setEditingId(null)}>✕</button>
                      </>
                    ) : (
                      <>
                        <button
                          title={t("inventory.edit", "Edit")}
                          style={{ ...st.delBtn, background: "#e8f0ff", color: "#5c35cc", fontWeight: 700 }}
                          onClick={() => startEdit(p)}>✎</button>
                        <button
                          title={t("inventory.delete", "Delete")}
                          style={st.delBtn}
                          onClick={() => handleDelete(p.id)}>🗑</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
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
  inp: { padding: "8px 10px", border: "1px solid #cde0cd", borderRadius: 4, background: "#fcfdfc", outline: "none", boxSizing: "border-box", fontSize: 13 },
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
