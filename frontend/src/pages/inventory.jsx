import { useState } from "react";

export default function InventoryManagementPage() {
  const [showSummary, setShowSummary] = useState(false);

  const [inventory, setInventory] = useState([
    createEmptyBatch(),
  ]);

  function createEmptyBatch() {
    return {
      id: Date.now() + Math.random(),
      product: "",
      company: "",
      category: "Pesticide",
      batch: "",
      qty: 1,
      unit: "Litre",
      cost: "",
      retail: "",
      wholesale: "",
      expiry: "",
      entryDate: new Date().toISOString().split("T")[0],
      supplier: "",
      paymentType: "Cash",
      amountPaid: "",
      remaining: "",
      status: "Healthy",
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

        const updated = {
          ...item,
          [field]: value,
        };

        const qty = parseFloat(updated.qty) || 0;
        const cost = parseFloat(updated.cost) || 0;
        const paid = parseFloat(updated.amountPaid) || 0;

        updated.remaining = Math.max(0, qty * cost - paid).toFixed(0);

        return updated;
      })
    );
  };

  const totalInventoryValue = inventory.reduce((acc, item) => {
    const qty = parseFloat(item.qty) || 0;
    const cost = parseFloat(item.cost) || 0;
    return acc + qty * cost;
  }, 0);

  const totalPending = inventory.reduce((acc, item) => {
    return acc + (parseFloat(item.remaining) || 0);
  }, 0);

  const totalProducts = inventory.filter(
    (item) => item.product.trim() !== ""
  ).length;

  return (
    <div style={st.page}>
      <div style={st.main}>
        {/* TOOLBAR */}
        <div style={st.toolbar}>
          <div style={st.toolbarLeft}>
            <h1 style={st.pageTitle}>Inventory Management</h1>
            <span style={st.badge}>
              {totalProducts} batch{totalProducts !== 1 ? "es" : ""}
            </span>
          </div>

          <div style={st.toolbarRight}>
            <button style={st.toolBtn}>Export</button>

            <button
              style={st.summaryToggle}
              onClick={() => setShowSummary(!showSummary)}
            >
              {showSummary
                ? "Close"
                : `Summary · Rs ${totalInventoryValue.toFixed(0)}`}
            </button>
          </div>
        </div>

        {/* PRIMARY STOCK ENTRY */}
        <div style={st.productCard}>
          <div style={st.productTop}>
            <div>
              <h2 style={st.sectionTitle}>Quick Stock Entry</h2>
              <p style={st.subText}>
                Add and manage incoming inventory batches.
              </p>
            </div>

            <button style={st.addBtn} onClick={addRow}>
              + Add Batch
            </button>
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
                <span style={{ ...st.rowNum, width: 36 }}>
                  {i + 1}
                </span>

                <input
                  style={{ ...st.inp, flex: 2 }}
                  placeholder="Product Name"
                  value={item.product}
                  onChange={(e) =>
                    updateItem(item.id, "product", e.target.value)
                  }
                />

                <input
                  style={{ ...st.inp, flex: 1.2 }}
                  placeholder="BT-1001"
                  value={item.batch}
                  onChange={(e) =>
                    updateItem(item.id, "batch", e.target.value)
                  }
                />

                <select
                  style={{ ...st.inp, flex: 1.1 }}
                  value={item.category}
                  onChange={(e) =>
                    updateItem(item.id, "category", e.target.value)
                  }
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
                  onChange={(e) =>
                    updateItem(item.id, "qty", e.target.value)
                  }
                />

                <select
                  style={{ ...st.inp, flex: 0.9 }}
                  value={item.unit}
                  onChange={(e) =>
                    updateItem(item.id, "unit", e.target.value)
                  }
                >
                  <option>Litre</option>
                  <option>Kg</option>
                  <option>Bottle</option>
                  <option>Packet</option>
                </select>

                <input
                  style={{ ...st.inp, flex: 1 }}
                  type="number"
                  placeholder="0"
                  value={item.cost}
                  onChange={(e) =>
                    updateItem(item.id, "cost", e.target.value)
                  }
                />

                <input
                  style={{ ...st.inp, flex: 1 }}
                  type="number"
                  placeholder="0"
                  value={item.retail}
                  onChange={(e) =>
                    updateItem(item.id, "retail", e.target.value)
                  }
                />

                <input
                  style={{ ...st.inp, flex: 1.1 }}
                  type="date"
                  value={item.expiry}
                  onChange={(e) =>
                    updateItem(item.id, "expiry", e.target.value)
                  }
                />

                <button
                  style={st.delBtn}
                  onClick={() => removeRow(item.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div style={st.hint}>
            Tip: Batch payments and remaining balances auto-track below.
          </div>
        </div>

        {/* SECONDARY DETAILS */}
        <div style={st.infoRow}>
          <div style={st.infoCard}>
            <h3 style={st.sectionTitleSm}>Batch Details</h3>

            <div style={st.grid3}>
              <Field label="Company" placeholder="Bayer" />
              <Field label="Supplier" placeholder="Supplier name" />
              <Field label="Entry Date" type="date" />

              <Field label="Wholesale Price" placeholder="0" />
              <Field label="MRP" placeholder="0" />
              <Field label="Warehouse Shelf" placeholder="A-2" />
            </div>
          </div>

          <div style={st.infoCard}>
            <h3 style={st.sectionTitleSm}>Payment Tracking</h3>

            <div style={st.grid3}>
              <FieldSelect
                label="Payment Type"
                options={["Cash", "Credit", "Partial"]}
              />

              <Field label="Amount Paid" placeholder="0" />

              <Field label="Due Date" type="date" />

              <FieldSelect
                label="Method"
                options={[
                  "Cash",
                  "Bank Transfer",
                  "Cheque",
                  "JazzCash",
                ]}
              />

              <Field label="Invoice Ref" placeholder="INV-1002" />

              <FieldSelect
                label="Status"
                options={["Paid", "Pending", "Overdue"]}
              />
            </div>
          </div>
        </div>

        {/* NOTES */}
        <div style={st.notesCard}>
          <textarea
            style={st.notesInput}
            placeholder="Notes, damaged stock details or storage instructions..."
            rows={2}
          />
        </div>
      </div>

      {/* SUMMARY PANEL */}
      <div
        style={{
          ...st.summaryPanel,
          transform: showSummary
            ? "translateX(0)"
            : "translateX(100%)",
          opacity: showSummary ? 1 : 0,
        }}
      >
        <div style={st.summaryInner}>
          <div style={st.summaryHeader}>
            <h2 style={st.summaryTitle}>Inventory Summary</h2>

            <button
              style={st.closeBtn}
              onClick={() => setShowSummary(false)}
            >
              ✕
            </button>
          </div>

          <div style={st.summaryBody}>
            <SumRow
              label="Inventory Batches"
              value={`${totalProducts}`}
            />

            <SumRow
              label="Inventory Value"
              value={`Rs ${totalInventoryValue.toFixed(0)}`}
            />

            <SumRow
              label="Pending Payments"
              value={`Rs ${totalPending.toFixed(0)}`}
            />

            <div style={st.grandRow}>
              <span>Total Stock Value</span>
              <span style={st.grandValue}>
                Rs {totalInventoryValue.toFixed(0)}
              </span>
            </div>

            <div style={st.summaryMeta}>
              <div>
                Healthy Stock: <strong>1240 Units</strong>
              </div>
              <div>
                Expiring Soon: <strong>7 Products</strong>
              </div>
              <div>
                Pending Suppliers: <strong>12</strong>
              </div>
            </div>

            <button style={st.generateBtn}>
              Save Inventory Record
            </button>
          </div>
        </div>
      </div>

      {showSummary && (
        <div
          style={st.overlay}
          onClick={() => setShowSummary(false)}
        />
      )}
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
  badge: { background: "#dcf5dc", color: "#2e7d32", padding: "4px 10px", borderRadius: 20, fontSize: 13, fontWeight: 600 },
  toolbarRight: { display: "flex", gap: 10 },
  toolBtn: { padding: "8px 14px", border: "1px solid #d3e5d3", background: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 500, color: "#555" },
  summaryToggle: { padding: "8px 14px", border: "none", background: "#2e7d32", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  
  productCard: { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #d5e8d5" },
  productTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  sectionTitle: { margin: 0, fontSize: 18, fontWeight: "bold", color: "#1b3a1d" },
  subText: { margin: "4px 0 0 0", fontSize: 13, color: "#666" },
  addBtn: { padding: "8px 16px", background: "#43a047", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  
  tableWrap: { display: "flex", flexDirection: "column", gap: 8 },
  tableHead: { display: "flex", padding: "0 4px 8px", borderBottom: "2px solid #e8f0e8", fontSize: 12, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase" },
  tableRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #f2f7f2" },
  rowNum: { fontSize: 13, fontWeight: 600, color: "#a3bca5", textAlign: "center" },
  inp: { padding: "10px", border: "1.5px solid #cde0cd", borderRadius: 8, background: "#fafff9", outline: "none", boxSizing: "border-box" },
  delBtn: { width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff0f0", color: "#d32f2f", border: "none", borderRadius: 8, cursor: "pointer" },
  hint: { marginTop: 12, fontSize: 12, color: "#8aab8c", fontStyle: "italic" },

  infoRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  infoCard: { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #d5e8d5" },
  sectionTitleSm: { margin: "0 0 16px 0", fontSize: 16, fontWeight: 600, color: "#1b3a1d" },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 },
  
  fieldWrap: { display: "flex", flexDirection: "column", gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase" },
  fieldInput: { padding: "10px", border: "1.5px solid #cde0cd", borderRadius: 8, background: "#fafff9", outline: "none" },

  notesCard: { background: "#fff", borderRadius: 14, padding: 16, border: "1px solid #d5e8d5" },
  notesInput: { width: "100%", padding: 12, border: "1px dashed #cde0cd", borderRadius: 8, background: "#fafff9", outline: "none", resize: "vertical", boxSizing: "border-box" },

  summaryPanel: { position: "fixed", top: 0, right: 0, bottom: 0, width: 360, background: "#fff", boxShadow: "-4px 0 20px rgba(0,0,0,0.1)", zIndex: 100, transition: "transform 0.3s ease, opacity 0.3s ease" },
  summaryInner: { display: "flex", flexDirection: "column", height: "100%" },
  summaryHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottom: "1px solid #e8f0e8" },
  summaryTitle: { margin: 0, fontSize: 18, fontWeight: "bold", color: "#1b3a1d" },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#666" },
  summaryBody: { padding: 20, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 },
  
  sumRow: { display: "flex", justifyContent: "space-between", fontSize: 15, color: "#444" },
  grandRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderTop: "2px solid #e8f0e8", borderBottom: "2px solid #e8f0e8", fontWeight: "bold", fontSize: 16 },
  grandValue: { fontSize: 20, color: "#2e7d32" },
  summaryMeta: { display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "#666", marginTop: 8 },
  generateBtn: { marginTop: "auto", padding: 16, background: "#2e7d32", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: "bold", cursor: "pointer" },
  
  overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", zIndex: 90 },
};
