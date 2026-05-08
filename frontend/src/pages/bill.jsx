import { useState } from "react";

export default function BillingPage() {
  // Billing Info State
  const [invoiceNo, setInvoiceNo] = useState("");
  const [billingDate, setBillingDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [customerType, setCustomerType] = useState("Walk-in");
  const [paymentType, setPaymentType] = useState("Cash");
  const [notes, setNotes] = useState("");

  const [products, setProducts] = useState([createEmptyProduct()]);

  function createEmptyProduct() {
    return {
      id: Date.now() + Math.random(),
      product: "",
      qty: 1,
      unit: "Litre",
      ppp: "",
      discount: "",
      total: 0,
    };
  }

  const addRow = () => setProducts([...products, createEmptyProduct()]);

  const removeRow = (id) => {
    if (products.length > 1) {
      setProducts(products.filter((p) => p.id !== id));
    }
  };

  const clearAll = () => {
    setProducts([createEmptyProduct()]);
    setCustomerName("");
    setPhone("");
    setNotes("");
    setInvoiceNo("");
    setCustomerType("Walk-in");
    setPaymentType("Cash");
    setBillingDate(new Date().toISOString().split("T")[0]);
  };

  const updateProduct = (id, field, value) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, [field]: value };
        if (field === "qty" || field === "ppp" || field === "discount") {
          const qty = parseFloat(updated.qty) || 0;
          const ppp = parseFloat(updated.ppp) || 0;
          const disc = parseFloat(updated.discount) || 0;
          updated.total = Math.max(0, qty * ppp - disc);
        }
        return updated;
      })
    );
  };

  // Calculations
  const subtotal = products.reduce((a, p) => a + (p.total || 0), 0);
  const totalDiscount = products.reduce(
    (a, p) => a + (parseFloat(p.discount) || 0),
    0
  );
  const taxRate = 0.05;
  const taxAmount = subtotal * taxRate;
  const grandTotal = subtotal + taxAmount;
  const itemCount = products.filter((p) => p.product.trim() !== "").length;

  return (
    <div style={st.page}>
      <div style={st.main}>
        {/* ─── TOOLBAR ─── */}
        <div style={st.toolbar}>
          <div style={st.toolbarLeft}>
            <h1 style={st.pageTitle}>New Bill</h1>
            <span style={st.badge}>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
          </div>
          <div style={st.toolbarRight}>
            <button style={st.toolBtn} onClick={clearAll} title="Clear All">
              Clear
            </button>
          </div>
        </div>

        {/* ─── BILL META CARD ─── */}
        <div style={st.billMetaCard}>
          {/* TOP ROW */}
          <div style={st.metaTopRow}>
            <div style={st.metaField}>
              <span style={st.metaLabel}>Invoice No</span>
              <input
                style={st.metaInput}
                placeholder="INV-1001"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
              />
            </div>
            <div style={st.metaField}>
              <span style={st.metaLabel}>Billing Date</span>
              <input
                type="date"
                style={st.metaInput}
                value={billingDate}
                onChange={(e) => setBillingDate(e.target.value)}
              />
            </div>
          </div>

          {/* CUSTOMER */}
          <div style={st.customerRow}>
            <input
              style={st.customerInput}
              placeholder="Customer Name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>

          {/* PAYMENT + TYPE */}
          <div style={st.metaBottomRow}>
            <select
              style={st.metaInput}
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value)}
            >
              <option>Walk-in</option>
              <option>Farmer</option>
              <option>Dealer</option>
              <option>Distributor</option>
            </select>

            <select
              style={st.metaInput}
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
            >
              <option>Cash</option>
              <option>HBL Bank</option>
              <option>UBL Bank</option>
              <option>Meezan Bank</option>
              <option>JazzCash</option>
              <option>EasyPaisa</option>
              <option>Credit</option>
            </select>

            <input
              style={st.metaInput}
              placeholder="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        {/* ─── PRODUCTS ─── */}
        <div style={st.productCard}>
          <div style={st.productTop}>
            <h2 style={st.sectionTitle}>Products</h2>
            <button style={st.addBtn} onClick={addRow}>
              + Add Row
            </button>
          </div>

          <div style={st.tableWrap}>
            <div style={st.tableHead}>
              <span style={{ width: 36 }}>#</span>
              <span style={{ flex: 3 }}>Product</span>
              <span style={{ flex: 0.8 }}>Qty</span>
              <span style={{ flex: 0.9 }}>Unit</span>
              <span style={{ flex: 1 }}>PPP</span>
              <span style={{ flex: 1 }}>Discount</span>
              <span style={{ flex: 1 }}>Total</span>
              <span style={{ width: 40 }}></span>
            </div>

            {products.map((item, i) => (
              <div key={item.id} style={st.tableRow}>
                <span style={{ ...st.rowNum, width: 36 }}>{i + 1}</span>

                <select
                  style={{ ...st.inp, flex: 3 }}
                  value={item.product}
                  onChange={(e) =>
                    updateProduct(item.id, "product", e.target.value)
                  }
                >
                  <option value="">Select Product</option>
                  <option>Roundup</option>
                  <option>Mospilan</option>
                  <option>Acetamiprid</option>
                  <option>Confidor</option>
                  <option>Coragen</option>
                  <option>Aliette</option>
                  <option>Ridomil Gold</option>
                </select>

                <input
                  style={{ ...st.inp, flex: 0.8 }}
                  type="number"
                  min="1"
                  placeholder="1"
                  value={item.qty}
                  onChange={(e) =>
                    updateProduct(item.id, "qty", e.target.value)
                  }
                />

                <select
                  style={{ ...st.inp, flex: 0.9 }}
                  value={item.unit}
                  onChange={(e) =>
                    updateProduct(item.id, "unit", e.target.value)
                  }
                >
                  <option>Litre</option>
                  <option>Kg</option>
                  <option>Piece</option>
                  <option>Box</option>
                  <option>Packet</option>
                  <option>Bottle</option>
                </select>

                <input
                  style={{ ...st.inp, flex: 1 }}
                  type="number"
                  placeholder="0.00"
                  value={item.ppp}
                  onChange={(e) =>
                    updateProduct(item.id, "ppp", e.target.value)
                  }
                />

                <input
                  style={{ ...st.inp, flex: 1 }}
                  type="number"
                  placeholder="0.00"
                  value={item.discount}
                  onChange={(e) =>
                    updateProduct(item.id, "discount", e.target.value)
                  }
                />

                <div style={{ ...st.totalCell, flex: 1 }}>
                  Rs {item.total.toFixed(2)}
                </div>

                <button
                  style={st.delBtn}
                  onClick={() => removeRow(item.id)}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div style={st.hint}>
            Tip: Select a product, fill Qty &amp; PPP — Total auto-calculates.
          </div>
        </div>

        {/* ─── NOTES ─── */}
        <div style={st.notesCard}>
          <textarea
            style={st.notesInput}
            placeholder="Notes or delivery instructions (optional)…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        {/* ─── INLINE SUMMARY ─── */}
        <div style={st.summaryInline}>
          <div style={st.summaryGrid}>
            <SumCard label="Items" value={itemCount} />
            <SumCard label="Subtotal" value={`Rs ${subtotal.toFixed(0)}`} />
            <SumCard label="Discount" value={`Rs ${totalDiscount.toFixed(0)}`} />
            <SumCard label="Tax" value={`Rs ${taxAmount.toFixed(0)}`} />
            <SumCard
              label="Grand Total"
              value={`Rs ${grandTotal.toFixed(0)}`}
              highlight
            />
          </div>
          <button style={st.generateBtn}>Generate Bill</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Components ─── */

function SumCard({ label, value, highlight }) {
  return (
    <div
      style={{
        ...st.sumCard,
        ...(highlight ? st.sumCardHighlight : {}),
      }}
    >
      <span style={st.sumLabel}>{label}</span>
      <strong style={st.sumValue}>{value}</strong>
    </div>
  );
}

/* ─── STYLES ─── */

const st = {
  /* Page */
  page: {
    position: "relative",
    display: "flex",
    minHeight: "100%",
    background: "#f0f6f0",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    overflow: "hidden",
  },

  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 20,
    overflowY: "auto",
  },

  /* Toolbar */
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
  },
  toolbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  toolbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#1b3a1d",
    margin: 0,
  },
  badge: {
    background: "#dcf5dc",
    color: "#2e7d32",
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 20,
  },
  toolBtn: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid #d3e5d3",
    background: "#fff",
    color: "#555",
    fontSize: 13,
    cursor: "pointer",
    fontWeight: 500,
  },

  /* Bill Meta Card */
  billMetaCard: {
    background: "#ffffff",
    border: "1px solid #d5e8d5",
    borderRadius: 14,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  metaTopRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  metaBottomRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 16,
  },
  customerRow: {
    width: "100%",
  },
  metaField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#6a8f6c",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metaInput: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1.5px solid #cde0cd",
    background: "#fafff9",
    fontSize: 14,
    fontWeight: 500,
    outline: "none",
    color: "#1a1a1a",
    boxSizing: "border-box",
    width: "100%",
  },
  customerInput: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 10,
    border: "1.5px solid #cde0cd",
    background: "#fafff9",
    fontSize: 15,
    fontWeight: 500,
    outline: "none",
    color: "#1a1a1a",
    boxSizing: "border-box",
  },

  /* Product Card */
  productCard: {
    background: "#ffffff",
    borderRadius: 14,
    padding: "20px 22px",
    border: "1px solid #d5e8d5",
  },
  productTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#1b3a1d",
    margin: 0,
  },
  addBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    background: "#43a047",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
  },

  /* Table */
  tableWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  tableHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 4px 8px",
    borderBottom: "2px solid #e8f0e8",
    fontSize: 11,
    fontWeight: 700,
    color: "#6a8f6c",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 0",
    borderBottom: "1px solid #f2f7f2",
  },
  rowNum: {
    fontSize: 13,
    fontWeight: 600,
    color: "#a3bca5",
    textAlign: "center",
    flexShrink: 0,
  },

  /* Inputs */
  inp: {
    padding: "11px 14px",
    borderRadius: 10,
    border: "1.5px solid #cde0cd",
    fontSize: 15,
    fontWeight: 500,
    background: "#fafff9",
    color: "#1a1a1a",
    outline: "none",
    boxSizing: "border-box",
    minWidth: 0,
    transition: "border-color 0.15s, box-shadow 0.15s",
  },

  totalCell: {
    padding: "11px 14px",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    color: "#2e7d32",
    background: "#eef7ee",
    textAlign: "center",
    boxSizing: "border-box",
    minWidth: 0,
  },

  delBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "none",
    background: "#fff0f0",
    color: "#d32f2f",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "background 0.15s",
  },

  hint: {
    marginTop: 12,
    fontSize: 12,
    color: "#8aab8c",
    fontStyle: "italic",
  },

  /* Notes */
  notesCard: {
    background: "#fbfefb",
    border: "1px dashed #d5e5d5",
    borderRadius: 12,
    padding: "12px 16px",
  },
  notesInput: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 9,
    border: "1.5px solid #cde0cd",
    fontSize: 14,
    fontWeight: 500,
    background: "#fafff9",
    color: "#1a1a1a",
    outline: "none",
    boxSizing: "border-box",
    resize: "vertical",
    fontFamily: "inherit",
  },

  /* Inline Summary */
  summaryInline: {
    background: "#ffffff",
    border: "1px solid #d5e8d5",
    borderRadius: 14,
    padding: 18,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 14,
    marginBottom: 18,
  },
  sumCard: {
    background: "#f8fcf8",
    border: "1px solid #e0ece0",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sumCardHighlight: {
    background: "#eaf7ea",
    border: "1px solid #b9ddb9",
  },
  sumLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#6a8f6c",
  },
  sumValue: {
    fontSize: 20,
    color: "#1b3a1d",
  },

  generateBtn: {
    width: "100%",
    padding: "16px",
    border: "none",
    borderRadius: 12,
    background: "#2e7d32",
    color: "#fff",
    fontWeight: 700,
    fontSize: 16,
    cursor: "pointer",
    letterSpacing: 0.3,
  },
};
