import { useMemo, useState, useEffect } from "react";
import { listCustomers } from "../lib/posApi";

const productDatabase = [
  { name: "Roundup", unit: "Litre", price: 580 },
  { name: "Mospilan", unit: "Bottle", price: 920 },
  { name: "Coragen", unit: "Bottle", price: 1450 },
  { name: "Confidor", unit: "Bottle", price: 860 },
  { name: "Aliette", unit: "Kg", price: 1240 },
  { name: "Ridomil Gold", unit: "Packet", price: 760 },
];

function createRow() {
  return {
    id: Date.now() + Math.random(),
    product: "",
    qty: 1,
    unit: "",
    price: "",
    discount: "",
    total: 0,
  };
}

export default function BillingWorkspace() {
  const [rows, setRows] = useState([createRow()]);
  const [customer, setCustomer] = useState("");
  const [paymentType, setPaymentType] = useState("Cash");
  const [invoiceNo] = useState("INV-1048");
  const [notes, setNotes] = useState("");

  const [customers, setCustomers] = useState([]);
  const [selectedCustomerObj, setSelectedCustomerObj] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await listCustomers();
        if (res && res.customers) {
          setCustomers(res.customers);
        }
      } catch (e) {
        console.error(e);
      }
    }
    load();
  }, []);

  const billingDate = new Date().toISOString().split("T")[0];

  const addRow = () => {
    setRows((prev) => [...prev, createRow()]);
  };

  const removeRow = (id) => {
    if (rows.length === 1) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id, field, value) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;

        const updated = {
          ...row,
          [field]: value,
        };

        if (field === "product") {
          const selected = productDatabase.find(
            (p) => p.name === value
          );

          if (selected) {
            updated.unit = selected.unit;
            updated.price = selected.price;
          }
        }

        const qty = parseFloat(updated.qty) || 0;
        const price = parseFloat(updated.price) || 0;
        const discount = parseFloat(updated.discount) || 0;

        updated.total = Math.max(0, qty * price - discount);

        return updated;
      })
    );
  };

  const subtotal = useMemo(() => {
    return rows.reduce((acc, row) => acc + row.total, 0);
  }, [rows]);

  const totalDiscount = useMemo(() => {
    return rows.reduce(
      (acc, row) => acc + (parseFloat(row.discount) || 0),
      0
    );
  }, [rows]);

  const itemCount = rows.filter((r) => r.product !== "").length;

  return (
    <div style={st.page}>
      <div style={st.workspace}>
        {/* HEADER */}
        <div style={st.headerBar}>
          <div>
            <h1 style={st.pageTitle}>Billing Workspace</h1>
            <p style={st.pageSubtext}>
              Fast operational billing and invoice generation.
            </p>
          </div>

          <div style={st.headerActions}>
            <button style={st.secondaryBtn}>Invoice History</button>
            <button style={st.primaryBtn}>Generate Invoice</button>
          </div>
        </div>

        {/* TOP STRIP */}
        <div style={st.topStrip}>
          <div style={st.stripLeft}>
            <div style={st.metaBlock}>
              <span style={st.metaLabel}>Invoice No</span>
              <strong style={st.metaValue}>{invoiceNo}</strong>
            </div>

            <div style={st.metaBlock}>
              <span style={st.metaLabel}>Date</span>
              <strong style={st.metaValue}>{billingDate}</strong>
            </div>
          </div>

          <div style={st.stripCenter}>
            <input
              style={st.customerInput}
              list="customers-list"
              placeholder="Search or Select Customer Name"
              value={customer}
              onChange={(e) => {
                  setCustomer(e.target.value);
                  const match = customers.find(c => c.name === e.target.value);
                  setSelectedCustomerObj(match || null);
              }}
            />
            <datalist id="customers-list">
              {customers.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>

          <div style={st.stripRight}>
            <select
              style={st.paymentSelect}
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
          </div>
        </div>

        {/* MAIN WORKSPACE */}
        <div style={st.mainGrid}>
          {/* PRODUCT WORKSPACE */}
          <div style={st.productWorkspace}>
            <div style={st.sectionTop}>
              <div>
                <h2 style={st.sectionTitle}>Product Entry</h2>
                <p style={st.sectionSubtext}>
                  Search products and generate invoices quickly.
                </p>
              </div>

              <button style={st.addRowBtn} onClick={addRow}>
                + Add Row
              </button>
            </div>

            <div style={st.tableWrap}>
              <div style={st.tableHead}>
                <span style={{ width: 36 }}>#</span>
                <span style={{ flex: 3 }}>Product</span>
                <span style={{ flex: 0.9 }}>Qty</span>
                <span style={{ flex: 1 }}>Unit</span>
                <span style={{ flex: 1.2 }}>PPP</span>
                <span style={{ flex: 1 }}>Discount</span>
                <span style={{ flex: 1.3 }}>Total</span>
                <span style={{ width: 44 }}></span>
              </div>

              {rows.map((row, index) => (
                <div key={row.id} style={st.tableRow}>
                  <div style={{ ...st.rowIndex, width: 36 }}>
                    {index + 1}
                  </div>

                  <select
                    style={{ ...st.input, flex: 3 }}
                    value={row.product}
                    onChange={(e) =>
                      updateRow(row.id, "product", e.target.value)
                    }
                  >
                    <option value="">Search Product</option>

                    {productDatabase.map((item) => (
                      <option key={item.name}>{item.name}</option>
                    ))}
                  </select>

                  <input
                    style={{ ...st.input, flex: 0.9 }}
                    type="number"
                    value={row.qty}
                    onChange={(e) =>
                      updateRow(row.id, "qty", e.target.value)
                    }
                  />

                  <div style={{ ...st.unitCell, flex: 1 }}>
                    {row.unit || "-"}
                  </div>

                  <input
                    style={{ ...st.input, flex: 1.2 }}
                    type="number"
                    value={row.price}
                    onChange={(e) =>
                      updateRow(row.id, "price", e.target.value)
                    }
                  />

                  <input
                    style={{ ...st.input, flex: 1 }}
                    type="number"
                    value={row.discount}
                    onChange={(e) =>
                      updateRow(row.id, "discount", e.target.value)
                    }
                  />

                  <div style={{ ...st.totalCell, flex: 1.3 }}>
                    Rs {row.total.toFixed(0)}
                  </div>

                  <button
                    style={st.deleteBtn}
                    onClick={() => removeRow(row.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div style={st.notesArea}>
              <textarea
                style={st.notesInput}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes or delivery instructions..."
              />
            </div>
          </div>

          {/* SIDE PANEL */}
          <div style={st.sidePanel}>
            {/* LIVE SUMMARY */}
            <div style={st.sideCard}>
              <div style={st.sideCardTop}>
                <h3 style={st.sideTitle}>Live Summary</h3>
              </div>

              <div style={st.summaryStack}>
                <SummaryRow
                  label="Items"
                  value={`${itemCount}`}
                />

                <SummaryRow
                  label="Subtotal"
                  value={`Rs ${subtotal.toFixed(0)}`}
                />

                <SummaryRow
                  label="Discount"
                  value={`Rs ${totalDiscount.toFixed(0)}`}
                />
              </div>

              <div style={st.grandTotalBox}>
                <span style={st.grandLabel}>Grand Total</span>
                <strong style={st.grandValue}>
                  Rs {subtotal.toFixed(0)}
                </strong>
              </div>
            </div>

            {/* CUSTOMER CONTEXT */}
            <div style={st.sideCard}>
              <div style={st.sideCardTop}>
                <h3 style={st.sideTitle}>Customer Context</h3>
              </div>

              {selectedCustomerObj ? (
                <>
                  <div style={{...st.contextItem, borderLeft: `3px solid ${selectedCustomerObj.current_balance > 0 ? '#c62828' : selectedCustomerObj.current_balance < 0 ? '#2e7d32' : '#738675'}`}}>
                    <div style={{ fontSize: 11, color: "#6f8571", textTransform: "uppercase", fontWeight: 700 }}>Current Balance</div>
                    <div style={{ fontSize: 16, fontWeight: "bold", color: selectedCustomerObj.current_balance > 0 ? '#c62828' : selectedCustomerObj.current_balance < 0 ? '#2e7d32' : '#203522', marginTop: 4 }}>
                        {selectedCustomerObj.current_balance === 0 
                            ? 'Rs 0' 
                            : selectedCustomerObj.current_balance > 0 
                                ? `(Dr) Rs ${Math.abs(selectedCustomerObj.current_balance).toLocaleString()}` 
                                : `(Cr) Rs ${Math.abs(selectedCustomerObj.current_balance).toLocaleString()}`}
                    </div>
                  </div>
                  <div style={st.contextItem}>
                    Last Purchase: {selectedCustomerObj.last_purchase || "None"}
                  </div>
                </>
              ) : (
                  <div style={{ fontSize: 13, color: '#738675', padding: '10px 0' }}>
                      {customer ? "Walk-in / Unregistered" : "No customer selected."}
                  </div>
              )}
            </div>


          </div>
        </div>

        {/* BOTTOM OPERATION BAR */}
        <div style={st.bottomBar}>
          <div style={st.bottomLeft}>
            <div style={st.bottomMetric}>
              <span style={st.bottomLabel}>Items</span>
              <strong>{itemCount}</strong>
            </div>

            <div style={st.bottomMetric}>
              <span style={st.bottomLabel}>Discount</span>
              <strong>Rs {totalDiscount.toFixed(0)}</strong>
            </div>

            <div style={st.bottomMetric}>
              <span style={st.bottomLabel}>Payment</span>
              <strong>{paymentType}</strong>
            </div>
          </div>

          <div style={st.bottomRight}>
            <div style={st.bottomTotal}>
              Rs {subtotal.toFixed(0)}
            </div>

            <button style={st.generateBtn}>
              Generate Invoice
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={st.summaryRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const st = {
  page: {
    minHeight: "100vh",
    background: "#f2f6f2",
    fontFamily: "Segoe UI, sans-serif",
    color: "#203522",
  },

  workspace: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    padding: 20,
  },

  headerBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  pageTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
  },

  pageSubtext: {
    marginTop: 5,
    fontSize: 13,
    color: "#728773",
  },

  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  secondaryBtn: {
    height: 42,
    padding: "0 16px",
    borderRadius: 10,
    border: "1px solid #d6e3d6",
    background: "#ffffff",
    color: "#49604b",
    fontWeight: 600,
    cursor: "pointer",
  },

  primaryBtn: {
    height: 42,
    padding: "0 18px",
    borderRadius: 10,
    border: "none",
    background: "#397d3d",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },

  topStrip: {
    background: "#ffffff",
    border: "1px solid #dbe7db",
    borderRadius: 14,
    padding: 16,
    display: "grid",
    gridTemplateColumns: "1fr 2fr 1fr",
    gap: 16,
    alignItems: "center",
  },

  stripLeft: {
    display: "flex",
    gap: 26,
  },

  metaBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },

  metaLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: 700,
    color: "#7d907f",
  },

  metaValue: {
    fontSize: 15,
    color: "#203522",
  },

  stripCenter: {
    width: "100%",
  },

  customerInput: {
    width: "100%",
    height: 46,
    borderRadius: 10,
    border: "1px solid #d3e0d3",
    background: "#fbfdfb",
    padding: "0 14px",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },

  stripRight: {
    display: "flex",
    justifyContent: "flex-end",
  },

  paymentSelect: {
    height: 46,
    minWidth: 180,
    borderRadius: 10,
    border: "1px solid #d3e0d3",
    background: "#fbfdfb",
    padding: "0 12px",
    fontSize: 14,
    outline: "none",
  },

  mainGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 360px",
    gap: 18,
    alignItems: "start",
  },

  productWorkspace: {
    background: "#ffffff",
    border: "1px solid #dbe7db",
    borderRadius: 14,
    padding: 18,
  },

  sectionTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },

  sectionSubtext: {
    marginTop: 5,
    fontSize: 12,
    color: "#758977",
  },

  addRowBtn: {
    height: 40,
    padding: "0 16px",
    borderRadius: 10,
    border: "1px solid #d6e4d6",
    background: "#f8fbf8",
    color: "#456548",
    fontWeight: 700,
    cursor: "pointer",
  },

  tableWrap: {
    display: "flex",
    flexDirection: "column",
  },

  tableHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 4px 10px",
    borderBottom: "2px solid #edf3ed",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#738675",
  },

  tableRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 0",
    borderBottom: "1px solid #f1f5f1",
  },

  rowIndex: {
    fontSize: 13,
    color: "#91a392",
    textAlign: "center",
    fontWeight: 700,
  },

  input: {
    height: 44,
    borderRadius: 10,
    border: "1px solid #d4e1d4",
    background: "#fbfdfb",
    padding: "0 12px",
    fontSize: 14,
    outline: "none",
    minWidth: 0,
  },

  unitCell: {
    height: 44,
    borderRadius: 10,
    border: "1px solid #e3ece3",
    background: "#f7faf7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    color: "#4d664f",
  },

  totalCell: {
    height: 44,
    borderRadius: 10,
    background: "#eef7ee",
    border: "1px solid #d4e5d4",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    color: "#2d7032",
  },

  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: "none",
    background: "#fff1f1",
    color: "#c03a3a",
    fontWeight: 700,
    cursor: "pointer",
  },

  notesArea: {
    marginTop: 18,
  },

  notesInput: {
    width: "100%",
    borderRadius: 10,
    border: "1px solid #d6e3d6",
    background: "#fbfdfb",
    padding: 14,
    fontSize: 14,
    resize: "vertical",
    outline: "none",
    boxSizing: "border-box",
  },

  sidePanel: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },

  sideCard: {
    background: "#ffffff",
    border: "1px solid #dbe7db",
    borderRadius: 14,
    padding: 18,
  },

  sideCardTop: {
    marginBottom: 14,
  },

  sideTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
  },

  summaryStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    borderRadius: 10,
    background: "#f8fbf8",
    border: "1px solid #e5eee5",
    fontSize: 14,
  },

  grandTotalBox: {
    marginTop: 16,
    borderRadius: 12,
    background: "#edf7ed",
    border: "1px solid #cfe2cf",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },

  grandLabel: {
    fontSize: 12,
    color: "#6f8571",
    fontWeight: 700,
    textTransform: "uppercase",
  },

  grandValue: {
    fontSize: 28,
    color: "#215926",
  },

  contextItem: {
    padding: "13px 14px",
    borderRadius: 10,
    background: "#f8fbf8",
    border: "1px solid #e5eee5",
    fontSize: 13,
    marginBottom: 10,
    color: "#4d654f",
  },



  bottomBar: {
    background: "#ffffff",
    border: "1px solid #dbe7db",
    borderRadius: 14,
    padding: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  bottomLeft: {
    display: "flex",
    gap: 30,
    alignItems: "center",
  },

  bottomMetric: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },

  bottomLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    color: "#7c907e",
    fontWeight: 700,
  },

  bottomRight: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },

  bottomTotal: {
    fontSize: 28,
    fontWeight: 700,
    color: "#1f5824",
  },

  generateBtn: {
    height: 48,
    padding: "0 22px",
    borderRadius: 10,
    border: "none",
    background: "#397d3d",
    color: "white",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
};