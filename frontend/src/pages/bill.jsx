import { useMemo, useState, useEffect } from "react";
import DropdownSelect from "../components/DropdownSelect";
import { listCustomers, saveCustomer, listProducts, saveSale, getNextInvoiceNo } from "../lib/posApi";
import SuccessNotification from "../components/SuccessNotification";
import WarningNotification from "../components/Warningnotification";
import { printReceipt } from "../components/Thermalreceipt";

const palette = {
  pageBg: "#f2f6f2",
  primary: "#397d3d",
  success: "#2e7d32",
  danger: "#c62828",
  muted: "#738675",
  cardBg: "#ffffff",
};


function createRow() {
  return {
    id: Date.now() + Math.random(),
    product: "",
    qty: 1,
    unit: "",
    price: "",
    discount: "",
    total: 0,
    availableStock: null,
    outOfStock: false,
    overStock: false,
  };
}

export default function BillingWorkspace() {
  const [rows, setRows] = useState([createRow()]);
  const [customer, setCustomer] = useState("");
  const [paymentType, setPaymentType] = useState("Cash");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCustomerObj, setSelectedCustomerObj] = useState(null);
  const [successData, setSuccessData] = useState(null);
  const [warnData, setWarnData] = useState(null);
  const [applyCredit, setApplyCredit] = useState(false);

  const isNewCustomer = useMemo(() => {
    const trimmed = customer.trim();
    if (!trimmed) return false;
    return !customers.some(c => c.name.toLowerCase() === trimmed.toLowerCase());
  }, [customer, customers]);

  const billingDate = useMemo(() => new Date().toISOString().split("T")[0], []);

  useEffect(() => {
    async function loadData() {
      try {
        const custRes = await listCustomers();
        if (custRes && custRes.customers) {
          setCustomers(custRes.customers);
        }
        const prodRes = await listProducts();
        if (prodRes && prodRes.products) {
          setProducts(prodRes.products);
        }
      } catch (e) {
        console.error("Failed to load initial billing data", e);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    async function fetchInvoiceNo() {
      try {
        const res = await getNextInvoiceNo(billingDate);
        if (res && res.invoiceNo) {
          setInvoiceNo(res.invoiceNo);
        }
      } catch (e) {
        console.error("Failed to fetch next invoice number", e);
      }
    }
    fetchInvoiceNo();
  }, [billingDate]);

  const subtotal = useMemo(() => {
    return rows.reduce((acc, row) => acc + row.total, 0);
  }, [rows]);

  useEffect(() => {
    if (!selectedCustomerObj && subtotal > 0) {
      setReceivedAmount(subtotal.toFixed(0));
    }
  }, [subtotal, selectedCustomerObj]);

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
          const selected = products.find(
            (p) => p.name === value
          );

          if (selected) {
            updated.productId = selected.id;
            updated.unit = selected.unit;
            updated.price = selected.basePrice || selected.price || 0;

            const stock = selected.currentStock ?? selected.quantity ?? null;
            updated.availableStock = stock;
            updated.outOfStock = stock !== null && stock <= 0;
          } else {
            updated.productId = "";
            updated.unit = "";
            updated.price = 0;
            updated.availableStock = null;
            updated.outOfStock = false;
            updated.overStock = false;
          }
        }

        const qty = parseFloat(updated.qty) || 0;
        const price = parseFloat(updated.price) || 0;
        const discount = parseFloat(updated.discount) || 0;

        updated.total = Math.max(0, qty * price - discount);

        updated.outOfStock = updated.availableStock !== null && updated.availableStock <= 0;
        updated.overStock  = updated.availableStock !== null && updated.availableStock > 0 && qty > updated.availableStock;

        return updated;
      })
    );
  };

  const changeRowQty = (id, delta) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const nextQty = Math.max(0, (parseFloat(row.qty) || 0) + delta);
        const price = parseFloat(row.price) || 0;
        const discount = parseFloat(row.discount) || 0;
        return {
          ...row,
          qty: nextQty,
          total: Math.max(0, nextQty * price - discount),
          outOfStock: row.availableStock !== null && row.availableStock <= 0,
          overStock:  row.availableStock !== null && row.availableStock > 0 && nextQty > row.availableStock,
        };
      })
    );
  };

  

  const totalDiscount = useMemo(() => {
    return rows.reduce(
      (acc, row) => acc + (parseFloat(row.discount) || 0),
      0
    );
  }, [rows]);

  const itemCount = rows.filter((r) => r.product !== "").length;

  const customerCredit = selectedCustomerObj?.current_balance < 0
    ? Math.abs(selectedCustomerObj.current_balance)
    : 0;

  const creditApplied = applyCredit ? Math.min(customerCredit, subtotal) : 0;
  const parsedReceived = parseFloat(receivedAmount) || 0;
  const totalCovered = creditApplied + parsedReceived;

  const remainingAmount = Math.max(0, subtotal - totalCovered);
  const changeAmount = Math.max(0, totalCovered - subtotal);

  const paymentStatus =
    totalCovered <= 0
      ? "Unpaid"
      : totalCovered < subtotal
        ? "Partial"
        : "Paid";

  const proceedGenerateInvoice = async (activeRows, saleItems) => {
    if (!selectedCustomerObj && parsedReceived < subtotal) {
      setWarnData({
        title: "Payment Required",
        lines: [
          { label: "Customer", value: "Walk-in Customer" },
          { label: "Rule", value: "Must pay full invoice amount" }
        ]
      });
      return;
    }

    const payload = {
      invoiceNo: invoiceNo,
      saleDate: billingDate,
      customerId: selectedCustomerObj?.id || null,
      customerName: customer?.trim() || "Walk-in Customer",
      phone: selectedCustomerObj?.phone || null,
      paymentMethod: paymentType,
      totalAmount: subtotal,
      amountPaid: Math.min(totalCovered, subtotal),
      remainingAmount: remainingAmount,
      paymentStatus: paymentStatus,
      creditApplied: creditApplied,
      notes: notes,
      items: saleItems,
    };

    try {
      const res = await saveSale(payload);
      if (res?.sale) {
        setSuccessData({
          title: "Invoice Generated!",
          lines: [
            { label: "Invoice No", value: res.sale.invoiceNo },
            { label: "Total Bill", value: `Rs ${res.sale.total?.toLocaleString()}`, mono: true },
            { label: "Cash Paid", value: `Rs ${res.sale.amountPaid?.toLocaleString()}`, mono: true },
            { label: "Remaining Due", value: `Rs ${res.sale.balanceDue?.toLocaleString()}`, mono: true },
          ],
          onPrint: () => printReceipt({
            invoiceNo:      res.sale.invoiceNo,
            cashier:        "Ahmad Cheema",
            customerName:   payload.customerName,
            phone:          payload.phone || "",
            items:          activeRows.map(r => ({
              productName:  r.product,
              quantity:     parseFloat(r.qty) || 0,
              unit:         r.unit,
              price:        parseFloat(r.price) || 0,
              discount:     parseFloat(r.discount) || 0,
              lineTotal:    r.total,
            })),
            subtotal:       subtotal,
            totalDiscount:  totalDiscount,
            creditApplied:  creditApplied,
            grandTotal:     subtotal - creditApplied,
            paymentMethod:  paymentType,
            amountPaid:     Math.min(totalCovered, subtotal),
            remainingAmount: remainingAmount,
            changeAmount:   changeAmount,
            prevBalance:    selectedCustomerObj?.current_balance ?? 0,
            notes:          notes,
          })
        });
        setRows([createRow()]);
        setCustomer(""); setSelectedCustomerObj(null);
        setNotes(""); setReceivedAmount("");
        const nextInv = await getNextInvoiceNo(billingDate);
        if (nextInv?.invoiceNo) setInvoiceNo(nextInv.invoiceNo);
      }
    } catch (error) {
      console.error("Failed to generate invoice", error);
      setWarnData({
        title: "Error Generating Invoice",
        lines: [{ label: "Error", value: error.message || "Unknown error occurred" }]
      });
    }
  };

  const handleGenerateInvoice = async () => {
    const activeRows = rows.filter((r) => r.product);
    if (!activeRows.length) {
      setWarnData({
        title: "Empty Invoice",
        lines: [{ label: "Alert", value: "Please add at least one product item to the invoice." }]
      });
      return;
    }
    const saleItems = activeRows.map((r) => ({
      productId: r.productId,
      productName: r.product,
      quantity: parseFloat(r.qty) || 0,
      unit: r.unit,
      price: parseFloat(r.price) || 0,
      discount: parseFloat(r.discount) || 0,
    }));
    const outOfStockItems = activeRows.filter((r) => r.outOfStock);
    const overStockItems  = activeRows.filter((r) => r.overStock);

    if (outOfStockItems.length > 0 || overStockItems.length > 0) {
      setWarnData({
        title: "Stock Warning",
        lines: [
          ...outOfStockItems.map((r) => ({ label: r.product, value: "Out of Stock" })),
          ...overStockItems.map((r) => ({
            label: r.product,
            value: `Qty ${r.qty} exceeds stock (${r.availableStock} available)`,
          })),
          { label: "Note", value: "Invoice will still be generated" },
        ],
        confirmLabel: "Generate Anyway",
        cancelLabel: "Review Items",
        onConfirm: () => proceedGenerateInvoice(activeRows, saleItems),
      });
      return;
    }
    await proceedGenerateInvoice(activeRows, saleItems);
  };

  // Keyboard shortcuts: Ctrl/Cmd+S -> generate invoice, Ctrl/Cmd+P -> print
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleGenerateInvoice();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.print();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleGenerateInvoice]);
  return (
    <div style={st.page}>
      <div style={st.workspace}>
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
            <DropdownSelect
              value={selectedCustomerObj ? selectedCustomerObj.id : ""}
              options={customers}
              getOptionLabel={(c) => c.name}
              getOptionValue={(c) => c.id}
              placeholder="Search or Select Customer Name"
              onChange={(val, obj) => {
                setSelectedCustomerObj(obj || null);
                setCustomer(obj ? obj.name : val || "");
                setApplyCredit(false);
              }}
            />
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
                </p>
              </div>

              <button style={st.addRowBtn} onClick={addRow}>
                + Add Row
              </button>
            </div>

            <div>
              <div style={st.tableWrap}>
                <div style={st.tableHead}>
                  <span style={{ width: 36 }}>#</span>
                  <span style={{ flex: 3 }}>Product</span>
                  <span style={{ flex: 0.9 }}>Qty</span>
                  <span style={{ flex: 1 }}>Unit</span>
                  <span style={{ flex: 1.2 }}>Price (Rs)</span>
                  <span style={{ flex: 1 }}>Discount</span>
                  <span style={{ flex: 1.3 }}>Total</span>
                  <span style={{ width: 44 }}></span>
                </div>

                {rows.map((row, index) => (
                  <div key={row.id} style={{
                    ...st.tableRow,
                    ...(row.outOfStock ? { background: "#fff5f5", borderBottom: "1px solid #ffd4d4", borderRadius: 8 } : {}),
                    ...(row.overStock  ? { background: "#fff8f0", borderBottom: "1px solid #ffe0b2", borderRadius: 8 } : {}),
                  }}>
                    <div style={{ ...st.rowIndex, width: 36 }}>
                      {index + 1}
                    </div>

                    <div style={{ flex: 3, display: 'flex', flexDirection: 'column' }}>
                      <DropdownSelect
                        value={row.productId || ""}
                        options={products}
                        getOptionLabel={(p) => p.name}
                        getOptionValue={(p) => p.id}
                        placeholder="Search product..."
                        compact
                        onChange={(val, option) => {
                          if (option) updateRow(row.id, "product", option.name);
                        }}
                      />
                      {row.outOfStock && (
                        <div style={{ fontSize: 10, color: "#c62828", fontWeight: 700, marginTop: 2, paddingLeft: 2 }}>
                          ⚠ Out of stock
                        </div>
                      )}
                      {row.overStock && (
                        <div style={{ fontSize: 10, color: "#e65100", fontWeight: 700, marginTop: 2, paddingLeft: 2 }}>
                          ⚠ Only {row.availableStock} in stock
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 0.9 }}>
                      <button style={st.qtyBtn} onClick={() => changeRowQty(row.id, -1)}>-</button>
                      <input
                        style={{ ...st.input, textAlign: 'center', width: 64 }}
                        type="number"
                        value={row.qty}
                        onChange={(e) => updateRow(row.id, "qty", e.target.value)}
                      />
                      <button style={st.qtyBtn} onClick={() => changeRowQty(row.id, 1)}>+</button>
                    </div>

                    <div style={{ ...st.unitCell, flex: 1 }}>
                      {row.unit || "-"}
                    </div>

                    <input
                      style={{ ...st.input, flex: 1.2 }}
                      type="number"
                      value={row.price}
                      onChange={(e) => updateRow(row.id, "price", e.target.value)}
                    />

                    <input
                      style={{ ...st.input, flex: 1 }}
                      type="number"
                      value={row.discount}
                      onChange={(e) => updateRow(row.id, "discount", e.target.value)}
                    />

                    <div style={{ ...st.totalCell, flex: 1.3 }}>
                      Rs {row.total.toFixed(0)}
                    </div>

                    <button style={st.deleteBtn} onClick={() => removeRow(row.id)}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
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
            {/* MERGED SUMMARY + PAYMENT */}
            <div style={st.sideCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={st.sideTitle}>Summary & Payment</h3>
                <div style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  background: paymentStatus === "Paid" ? "#e8f5e9" : paymentStatus === "Partial" ? "#fff3e0" : "#ffebee",
                  color: paymentStatus === "Paid" ? "#2e7d32" : paymentStatus === "Partial" ? "#ef6c00" : "#c62828"
                }}>
                  {paymentStatus}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                <SummaryRow label="Items" value={`${itemCount}`} />
                <SummaryRow label="Discount" value={`Rs ${totalDiscount.toFixed(0)}`} />
                {creditApplied > 0 && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', borderRadius: 10,
                    background: '#e8f5e9', border: '1px solid #c8e6c9', fontSize: 14,
                  }}>
                    <span style={{ color: '#2e7d32', fontWeight: 700 }}>✓ Advance Credit Applied</span>
                    <strong style={{ color: '#2e7d32' }}>− Rs {creditApplied.toLocaleString()}</strong>
                  </div>
                )}
              </div>

              <div style={{ ...st.grandTotalBox, padding: 12, marginBottom: 10 }}>
                <span style={st.grandLabel}>Grand Total</span>
                <strong style={{ ...st.grandValue, fontSize: 22 }}>Rs {subtotal.toFixed(0)}</strong>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={st.paymentBox}>
                  <span style={st.paymentLabel}>
                    {creditApplied > 0
                      ? `Cash Received (Credit Rs ${creditApplied.toLocaleString()} auto-applied)`
                      : "Amount Received"}
                  </span>
                  <input
                    type="number"
                    value={receivedAmount}
                    onChange={(e) => setReceivedAmount(e.target.value)}
                    style={st.paymentInput}
                    placeholder="0"
                  />
                </div>

                <div style={st.paymentBox}>
                  <span style={st.paymentLabel}>{changeAmount > 0 ? "Change Return" : "Remaining Due"}</span>
                  <strong style={{
                    ...st.paymentValue,
                    fontSize: 18,
                    color: changeAmount > 0 ? "#2e7d32" : remainingAmount > 0 ? "#c62828" : "#2e7d32"
                  }}>
                    Rs {(changeAmount || remainingAmount).toFixed(0)}
                  </strong>
                </div>
              </div>

              {!selectedCustomerObj && remainingAmount > 0 && (
                <div style={{ ...st.walkInWarning, marginTop: 8, fontSize: 12, padding: '8px 12px' }}>
                  Walk-in customer invoices cannot remain unpaid.
                </div>
              )}
            </div>

            {/* CUSTOMER CONTEXT */}
            <div style={st.sideCard}>
              <div style={{ marginBottom: 8 }}>
                <h3 style={st.sideTitle}>Customer Context</h3>
              </div>

              {selectedCustomerObj ? (
                <>
                  <div style={{ ...st.contextItem, borderLeft: `3px solid ${selectedCustomerObj.current_balance > 0 ? '#c62828' : selectedCustomerObj.current_balance < 0 ? '#2e7d32' : '#738675'}` }}>
                    <div style={{ fontSize: 11, color: "#6f8571", textTransform: "uppercase", fontWeight: 700 }}>Current Balance</div>
                    <div style={{ fontSize: 15, fontWeight: "bold", color: selectedCustomerObj.current_balance > 0 ? '#c62828' : '#203522', marginTop: 2 }}>
                      {selectedCustomerObj.current_balance === 0
                        ? 'Rs 0'
                        : selectedCustomerObj.current_balance > 0
                          ? `(Dr) Rs ${Math.abs(selectedCustomerObj.current_balance).toLocaleString()}`
                          : `(Cr) Rs ${Math.abs(selectedCustomerObj.current_balance).toLocaleString()}`}
                    </div>
                    {customerCredit > 0 && (
                      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: applyCredit ? '#e8f5e9' : '#f8fbf8', border: `1px solid ${applyCredit ? '#a5d6a7' : '#dde8dd'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#2e7d32' }}>
                            Apply Advance Credit
                          </span>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <span style={{ fontSize: 11, color: applyCredit ? '#2e7d32' : '#999', fontWeight: 600 }}>
                              {applyCredit ? 'ON' : 'OFF'}
                            </span>
                            <div
                              onClick={() => setApplyCredit(p => !p)}
                              style={{
                                width: 40, height: 22, borderRadius: 999, cursor: 'pointer',
                                background: applyCredit ? '#2e7d32' : '#ccc',
                                position: 'relative', transition: 'background 0.2s',
                              }}
                            >
                              <div style={{
                                position: 'absolute', top: 3, left: applyCredit ? 21 : 3,
                                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                              }} />
                            </div>
                          </label>
                        </div>
                        {applyCredit && subtotal > 0 && (
                          <div style={{ fontSize: 11, color: '#2e7d32', marginTop: 5, fontWeight: 600 }}>
                            Rs {Math.min(customerCredit, subtotal).toLocaleString()} will be deducted from advance
                          </div>
                        )}
                        {!applyCredit && (
                          <div style={{ fontSize: 11, color: '#999', marginTop: 5 }}>
                            Customer will pay full amount in cash
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ ...st.contextItem, marginBottom: 0 }}>
                    Last Purchase: {selectedCustomerObj.last_purchase || "None"}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: '#738675' }}>
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
              <span style={st.bottomLabel}>Total Items</span>
              <strong>{itemCount}</strong>
            </div>

            <div style={st.bottomMetric}>
              <span style={st.bottomLabel}>Discount Given</span>
              <strong>Rs {totalDiscount.toFixed(0)}</strong>
            </div>

            <div style={st.bottomMetric}>
              <span style={st.bottomLabel}>Payment Method</span>
              <strong>{paymentType}</strong>
            </div>
          </div>

          <div style={st.bottomRight}>
            <div style={st.bottomTotal}>Rs {subtotal.toFixed(0)}</div>
            <button style={st.generateBtn} onClick={handleGenerateInvoice}>
              Generate Invoice
            </button>
          </div>
        </div>

        <SuccessNotification
          visible={!!successData}
          title={successData?.title}
          lines={successData?.lines}
          onPrint={successData?.onPrint}
          onClose={() => setSuccessData(null)}
        />

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
    gap: 10,
    padding: 12,
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
    padding: "10px 16px",
    display: "grid",
    gridTemplateColumns: "1fr 2fr 1fr",
    gap: 16,
    alignItems: "center",
    borderLeft: "5px solid #397d3d",
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

  addCustomerInlineBtn: {
    height: 46,
    padding: "0 16px",
    borderRadius: 10,
    border: "none",
    background: "#397d3d",
    color: "white",
    fontWeight: "bold",
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s",
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
    gap: 12,
    alignItems: "start",
  },

  productWorkspace: {
    background: "#ffffff",
    border: "1px solid #dbe7db",
    borderRadius: 14,
    padding: 12,
    borderLeft: "5px solid #2e7d32",
  },

  sectionTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
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
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: '1px solid #d4e1d4',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  },

  tableWrap: {
    display: "flex",
    flexDirection: "column",
  },

  tableHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 6px",
    borderBottom: "2px solid #deeede",
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    color: "#5a7a5c",
    letterSpacing: "0.06em",
    background: "#f7faf7",
    borderRadius: "8px 8px 0 0",
  },

  tableRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 6px",
    borderBottom: "1px solid #f1f5f1",
    borderRadius: 8,
    transition: "background 0.15s",
  },

  rowIndex: {
    fontSize: 13,
    color: "#91a392",
    textAlign: "center",
    fontWeight: 700,
  },

  input: {
    height: 36,
    borderRadius: 8,
    border: "1px solid #d4e1d4",
    background: "#fbfdfb",
    padding: "0 10px",
    fontSize: 13,
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
    height: 40,
    borderRadius: 8,
    background: "#eef7ee",
    border: "1px solid #c8e0c8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    color: "#1b5e20",
    fontSize: 13,
    letterSpacing: "0.02em",
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
    padding: 10,
    fontSize: 13,
    resize: "none",
    outline: "none",
    boxSizing: "border-box",
  },

  sidePanel: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  sideCard: {
    background: "#ffffff",
    border: "1px solid #dbe7db",
    borderRadius: 14,
    padding: 14,
  },

  sideCardTop: {
    marginBottom: 8,
  },

  sideTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 800,
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
    padding: "10px 12px",
    borderRadius: 10,
    background: "#f8fbf8",
    border: "1px solid #e5eee5",
    fontSize: 14,
  },

  grandTotalBox: {
    marginTop: 12,
    borderRadius: 12,
    background: "#edf7ed",
    border: "1px solid #cfe2cf",
    padding: 12,
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
  

  paymentSettlement: {
    marginTop: 18,
    border: "1px solid #dbe7db",
    borderRadius: 14,
    background: "#ffffff",
    padding: 18,
    borderLeft: "5px solid #4a9e4e",
  },

  paymentSettlementTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },

  paymentSettlementTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
  },

  paymentSettlementSub: {
    marginTop: 4,
    fontSize: 12,
    color: "#758977",
  },

  paymentStatusBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
  },

  paymentGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  paymentBox: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    background: "#fff",
    border: "1px solid #e2ebe2",
  },

  paymentLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#738675",
  },

  paymentValue: {
    fontSize: 22,
    fontWeight: 700,
    color: "#1f5824",
  },

  paymentInput: {
    height: 42,
    borderRadius: 10,
    border: "1px solid #d4e1d4",
    background: "#fbfdfb",
    padding: "0 12px",
    fontSize: 16,
    fontWeight: 700,
    outline: "none",
  },

  walkInWarning: {
    marginTop: 0,
    padding: "12px 14px",
    borderRadius: 10,
    background: "#fff4f4",
    border: "1px solid #ffd4d4",
    color: "#c62828",
    fontWeight: 600,
    fontSize: 13,
  },
  bottomBar: {
    background: "#ffffff",
    border: "1px solid #dbe7db",
    borderRadius: 14,
    padding: "10px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderLeft: "5px solid #1b5e20",
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
    height: 56,
    padding: "0 30px",
    borderRadius: 12,
    border: "none",
    background: "#1b5e20",
    color: "white",
    fontWeight: 800,
    fontSize: 17,
    cursor: "pointer",
    boxShadow: '0 4px 16px rgba(27,94,32,0.25)',
    letterSpacing: 0.5,
  },
};