import { useState, useEffect } from "react";
import * as api from "../lib/posApi";

export default function InventoryManagementPage() {
  const [activeTab, setActiveTab] = useState("view"); // "view" | "entry"

  return (
    <div style={st.page}>
      <div style={st.main}>
        {/* TOOLBAR & NAV BAR */}
        <div style={st.toolbar}>
          <div style={st.toolbarLeft}>
            <h1 style={st.pageTitle}>Inventory Management</h1>
          </div>

          {/* Navigation Bar */}
          <div style={st.navStrip}>
            <button
              style={{ ...st.navBtn, ...(activeTab === "view" ? st.navBtnActive : {}) }}
              onClick={() => setActiveTab("view")}
            >
              Stock View
            </button>
            <button
              style={{ ...st.navBtn, ...(activeTab === "entry" ? st.navBtnActive : {}) }}
              onClick={() => setActiveTab("entry")}
            >
              Stock Entry
            </button>
          </div>
        </div>

        {activeTab === "view" ? <StockViewTab /> : <StockEntryTab onSaved={() => setActiveTab("view")} />}
      </div>
    </div>
  );
}

/* ─── STOCK VIEW TAB ─── */
function StockViewTab() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

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
  }, [search]);

  const totalValue = batches.reduce((sum, b) => sum + (b.quantityRemaining * (b.costPrice || 0)), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Metrics Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={st.metricCard}>
          <div style={st.metricLabel}>Total Active Batches</div>
          <div style={st.metricValue}>{batches.length}</div>
        </div>
        <div style={st.metricCard}>
          <div style={st.metricLabel}>Total Inventory Value (Cost)</div>
          <div style={st.metricValue}>Rs {totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      <div style={st.productCard}>
        <div style={st.productTop}>
          <div>
            <h2 style={st.sectionTitle}>Available Stock</h2>
            <p style={st.subText}>Current inventory across all batches.</p>
          </div>
          <input
            style={st.searchInp}
            placeholder="Search product or batch no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error && <div style={{ color: "red", fontSize: 13, padding: 8 }}>{error}</div>}

        <div style={st.tableWrap}>
          <div style={st.tableHead}>
            <span style={{ flex: 2 }}>Product</span>
            <span style={{ flex: 1.2 }}>Batch No</span>
            <span style={{ flex: 1.5 }}>Supplier</span>
            <span style={{ flex: 1, textAlign: "right" }}>Qty Remaining</span>
            <span style={{ flex: 1, textAlign: "right" }}>Cost Price</span>
            <span style={{ flex: 1, textAlign: "right" }}>Retail Price</span>
            <span style={{ flex: 1.2, textAlign: "center" }}>Expiry Date</span>
            <span style={{ width: 80, textAlign: "center" }}>Status</span>
          </div>

          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "#666" }}>Loading inventory...</div>
          ) : batches.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#666" }}>No batches found.</div>
          ) : (
            batches.map((b) => (
              <div key={b.id} style={st.tableRowView}>
                <span style={{ flex: 2, fontWeight: 600, color: "#1b3a1d" }}>{b.productName}</span>
                <span style={{ flex: 1.2, color: "#555" }}>{b.batchNo}</span>
                <span style={{ flex: 1.5, color: "#555" }}>{b.supplierName || "—"}</span>
                <span style={{ flex: 1, textAlign: "right", fontWeight: 600 }}>{b.quantityRemaining} {b.unit}</span>
                <span style={{ flex: 1, textAlign: "right" }}>Rs {b.costPrice}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#388e3c" }}>Rs {b.salePrice}</span>
                <span style={{ flex: 1.2, textAlign: "center", color: "#555" }}>{b.expiryDate || "—"}</span>
                <div style={{ width: 80, display: "flex", justifyContent: "center" }}>
                  <div style={{ ...st.statusBadge, ...(b.expiryStatus === "expired" ? st.badgeDanger : b.expiryStatus === "expiring" ? st.badgeWarning : st.badgeSuccess) }}>
                    {b.expiryStatus}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── STOCK ENTRY TAB ─── */
function StockEntryTab({ onSaved }) {
  const [showSummary, setShowSummary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [inventory, setInventory] = useState([createEmptyBatch()]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentType, setPaymentType] = useState("Cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [warehouseShelf, setWarehouseShelf] = useState("");

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
      setError("Please enter at least one product name.");
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
        }))
      });
      setSuccess("Inventory saved successfully!");
      setShowSummary(false);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div style={st.alertError}>{error}</div>}
      {success && <div style={st.alertSuccess}>{success}</div>}

      <div style={st.toolbar}>
        <div />
        <button style={st.summaryToggle} onClick={() => setShowSummary(!showSummary)}>
          {showSummary ? "Close Summary" : `Review & Save · Rs ${totalInventoryValue.toFixed(0)}`}
        </button>
      </div>

      <div style={st.productCard}>
        <div style={st.productTop}>
          <div>
            <h2 style={st.sectionTitle}>Quick Stock Entry</h2>
            <p style={st.subText}>Add and manage incoming inventory batches.</p>
          </div>
          <button style={st.addBtn} onClick={addRow}>+ Add Batch</button>
        </div>

        <div style={st.tableWrap}>
          <div style={st.tableHead}>
            <span style={{ width: 36 }}>#</span>
            <span style={{ flex: 2 }}>Product</span>
            <span style={{ flex: 1.2 }}>Batch</span>
            <span style={{ flex: 1.1 }}>Category</span>
            <span style={{ flex: 0.8 }}>Qty</span>
            <span style={{ flex: 0.9 }}>Unit</span>
            <span style={{ flex: 1 }}>Cost</span>
            <span style={{ flex: 1 }}>Retail</span>
            <span style={{ flex: 1.1 }}>Expiry</span>
            <span style={{ width: 40 }}></span>
          </div>

          {inventory.map((item, i) => (
            <div key={item.id} style={st.tableRow}>
              <span style={{ ...st.rowNum, width: 36 }}>{i + 1}</span>

              <input
                style={{ ...st.inp, flex: 2 }}
                placeholder="Product Name"
                value={item.productName}
                onChange={(e) => updateItem(item.id, "productName", e.target.value)}
              />

              <input
                style={{ ...st.inp, flex: 1.2 }}
                placeholder="e.g. BT-1001"
                value={item.batchNo}
                onChange={(e) => updateItem(item.id, "batchNo", e.target.value)}
              />

              <select
                style={{ ...st.inp, flex: 1.1 }}
                value={item.category}
                onChange={(e) => updateItem(item.id, "category", e.target.value)}
              >
                <option>Pesticide</option>
                <option>Insecticide</option>
                <option>Fungicide</option>
                <option>Herbicide</option>
                <option>Seeds</option>
                <option>Fertilizer</option>
              </select>

              <input
                style={{ ...st.inp, flex: 0.8 }}
                type="number"
                value={item.qty}
                onChange={(e) => updateItem(item.id, "qty", e.target.value)}
              />

              <select
                style={{ ...st.inp, flex: 0.9 }}
                value={item.unit}
                onChange={(e) => updateItem(item.id, "unit", e.target.value)}
              >
                <option>Litre</option>
                <option>Kg</option>
                <option>Bottle</option>
                <option>Piece</option>
              </select>

              <input
                style={{ ...st.inp, flex: 1 }}
                type="number"
                placeholder="Cost"
                value={item.costPrice}
                onChange={(e) => updateItem(item.id, "costPrice", e.target.value)}
              />

              <input
                style={{ ...st.inp, flex: 1 }}
                type="number"
                placeholder="Retail"
                value={item.salePrice}
                onChange={(e) => updateItem(item.id, "salePrice", e.target.value)}
              />

              <input
                style={{ ...st.inp, flex: 1.1 }}
                type="date"
                value={item.expiryDate}
                onChange={(e) => updateItem(item.id, "expiryDate", e.target.value)}
              />

              <button style={st.delBtn} onClick={() => removeRow(item.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>

      <div style={st.infoRow}>
        <div style={st.infoCard}>
          <h3 style={st.sectionTitleSm}>Global Batch Details (Optional)</h3>
          <div style={st.grid3}>
            <div style={st.fieldWrap}>
              <label style={st.fieldLabel}>Supplier</label>
              <select
                style={st.fieldInput}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">-- Select Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Field 
              label="Entry Date" 
              type="date" 
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
            <Field 
              label="Warehouse Shelf" 
              placeholder="A-2" 
              value={warehouseShelf}
              onChange={(e) => setWarehouseShelf(e.target.value)}
            />
          </div>
        </div>

        <div style={st.infoCard}>
          <h3 style={st.sectionTitleSm}>Payment Tracking</h3>
          <div style={st.grid3}>
            <FieldSelect 
              label="Payment Type" 
              options={["Cash", "Credit", "Partial"]} 
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
            />
            <Field 
              label="Amount Paid" 
              placeholder="0" 
              type="number"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
            <Field label="Due Date" type="date" />
          </div>
        </div>
      </div>

      {/* SUMMARY PANEL */}
      <div style={{ ...st.summaryPanel, transform: showSummary ? "translateX(0)" : "translateX(100%)", opacity: showSummary ? 1 : 0 }}>
        <div style={st.summaryInner}>
          <div style={st.summaryHeader}>
            <h2 style={st.summaryTitle}>Review Inventory</h2>
            <button style={st.closeBtn} onClick={() => setShowSummary(false)}>✕</button>
          </div>

          <div style={st.summaryBody}>
            <SumRow label="Valid Batches" value={`${totalProducts}`} />
            <SumRow label="Inventory Value" value={`Rs ${totalInventoryValue.toFixed(0)}`} />
            <SumRow label="Pending Payments" value={`Rs ${totalPending.toFixed(0)}`} />

            <div style={st.grandRow}>
              <span>Total Cost</span>
              <span style={st.grandValue}>Rs {totalInventoryValue.toFixed(0)}</span>
            </div>

            <button style={st.generateBtn} onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Inventory Record"}
            </button>
          </div>
        </div>
      </div>

      {showSummary && <div style={st.overlay} onClick={() => setShowSummary(false)} />}
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
      <span>{value}</span>
    </div>
  );
}

const st = {
  page: { display: "flex", flexDirection: "column", minHeight: "100%", background: "#f0f6f0", fontFamily: "system-ui, sans-serif" },
  main: { flex: 1, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  toolbarLeft: { display: "flex", alignItems: "center", gap: 12 },
  pageTitle: { margin: 0, fontSize: 24, fontWeight: "bold", color: "#1b3a1d" },
  
  navStrip: { display: "flex", gap: 4, background: "#e4ede4", borderRadius: 12, padding: 4 },
  navBtn: { padding: "10px 18px", border: "none", borderRadius: 9, background: "transparent", fontSize: 14, fontWeight: 600, color: "#5a755c", cursor: "pointer", transition: "background 0.2s" },
  navBtnActive: { background: "#fff", color: "#1d351f", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },

  metricCard: { background: "#fff", border: "1px solid #dbe8db", borderRadius: 14, padding: "20px" },
  metricLabel: { fontSize: 12, fontWeight: 600, color: "#6a8f6c", textTransform: "uppercase", marginBottom: 6 },
  metricValue: { fontSize: 24, fontWeight: 700, color: "#1b3a1d" },

  summaryToggle: { padding: "10px 18px", border: "none", background: "#2e7d32", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  
  productCard: { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #d5e8d5" },
  productTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  sectionTitle: { margin: 0, fontSize: 18, fontWeight: "bold", color: "#1b3a1d" },
  subText: { margin: "4px 0 0 0", fontSize: 13, color: "#666" },
  addBtn: { padding: "8px 16px", background: "#43a047", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  searchInp: { padding: "8px 14px", border: "1.5px solid #cde0cd", borderRadius: 8, outline: "none", width: 280 },
  
  tableWrap: { display: "flex", flexDirection: "column", gap: 8 },
  tableHead: { display: "flex", padding: "0 4px 8px", borderBottom: "2px solid #e8f0e8", fontSize: 12, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase" },
  tableRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #f2f7f2" },
  tableRowView: { display: "flex", alignItems: "center", gap: 10, padding: "14px 4px", borderBottom: "1px solid #f2f7f2", fontSize: 14 },
  rowNum: { fontSize: 13, fontWeight: 600, color: "#a3bca5", textAlign: "center" },
  inp: { padding: "10px", border: "1.5px solid #cde0cd", borderRadius: 8, background: "#fafff9", outline: "none", boxSizing: "border-box" },
  delBtn: { width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff0f0", color: "#d32f2f", border: "none", borderRadius: 8, cursor: "pointer" },

  infoRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  infoCard: { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #d5e8d5" },
  sectionTitleSm: { margin: "0 0 16px 0", fontSize: 16, fontWeight: 600, color: "#1b3a1d" },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 },
  
  fieldWrap: { display: "flex", flexDirection: "column", gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase" },
  fieldInput: { padding: "10px", border: "1.5px solid #cde0cd", borderRadius: 8, background: "#fafff9", outline: "none" },

  summaryPanel: { position: "fixed", top: 0, right: 0, bottom: 0, width: 360, background: "#fff", boxShadow: "-4px 0 20px rgba(0,0,0,0.1)", zIndex: 100, transition: "transform 0.3s ease, opacity 0.3s ease" },
  summaryInner: { display: "flex", flexDirection: "column", height: "100%" },
  summaryHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottom: "1px solid #e8f0e8" },
  summaryTitle: { margin: 0, fontSize: 18, fontWeight: "bold", color: "#1b3a1d" },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#666" },
  summaryBody: { padding: 20, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 },
  
  sumRow: { display: "flex", justifyContent: "space-between", fontSize: 15, color: "#444" },
  grandRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderTop: "2px solid #e8f0e8", borderBottom: "2px solid #e8f0e8", fontWeight: "bold", fontSize: 16 },
  grandValue: { fontSize: 20, color: "#2e7d32" },
  generateBtn: { marginTop: "auto", padding: 16, background: "#2e7d32", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: "bold", cursor: "pointer" },
  
  overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", zIndex: 90 },

  alertError: { padding: "12px", borderRadius: 8, background: "#fff0f0", border: "1px solid #f5c6c6", color: "#c62828", fontSize: 14, fontWeight: 500 },
  alertSuccess: { padding: "12px", borderRadius: 8, background: "#e8f5e9", border: "1px solid #c8e6c9", color: "#2e7d32", fontSize: 14, fontWeight: 500 },

  statusBadge: { padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: "capitalize", whiteSpace: "nowrap" },
  badgeSuccess: { background: "#e8f5e9", color: "#2e7d32" },
  badgeWarning: { background: "#fff3e0", color: "#e65100" },
  badgeDanger: { background: "#ffebee", color: "#c62828" },
};
