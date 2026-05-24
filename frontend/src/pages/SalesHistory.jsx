import { useState, useEffect, useCallback } from "react";
import { listSales, getSale, voidSale } from "../lib/posApi";

const PAYMENT_METHODS = ["All", "Cash", "HBL Bank", "UBL Bank", "Meezan Bank", "JazzCash", "EasyPaisa", "Credit"];

export default function SalesHistoryPage() {
  const [sales, setSales]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");

  // Filters
  const [search, setSearch]       = useState("");
  const [method, setMethod]       = useState("All");
  const [from, setFrom]           = useState("");
  const [to, setTo]               = useState("");

  // Detail modal
  const [detail, setDetail]       = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Void confirm
  const [voidTarget, setVoidTarget] = useState(null);
  const [voiding, setVoiding]     = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const params = {};
    if (search) params.search = search;
    if (method !== "All") params.paymentMethod = method;
    if (from) params.from = from;
    if (to)   params.to   = to;
    params.limit = 200;

    listSales(params)
      .then(({ sales: s }) => setSales(s || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [search, method, from, to]);

  useEffect(() => { load(); }, [load]);

  async function openDetail(id) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const { sale } = await getSale(id);
      setDetail(sale);
    } catch (e) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function doVoid(id) {
    setVoiding(true);
    try {
      await voidSale(id);
      setVoidTarget(null);
      setDetail(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setVoiding(false);
    }
  }

  // Totals summary
  const totalRevenue = sales.reduce((a, s) => a + (s.total || 0), 0);
  const totalDue     = sales.reduce((a, s) => a + (s.balanceDue || 0), 0);

  return (
    <div style={st.page}>
      {/* ── HEADER ── */}
      <div style={st.header}>
        <div>
          <h1 style={st.title}>Sale History</h1>
          <span style={st.sub}>{sales.length} record{sales.length !== 1 ? "s" : ""}</span>
        </div>
        <div style={st.headerStats}>
          <Stat label="Revenue" value={`Rs ${totalRevenue.toFixed(0)}`} />
          <Stat label="Credit Due" value={`Rs ${totalDue.toFixed(0)}`} accent />
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div style={st.filterBar}>
        <input
          style={st.filterInput}
          placeholder="Search invoice, customer, phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={st.filterSelect} value={method} onChange={e => setMethod(e.target.value)}>
          {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
        </select>
        <input type="date" style={st.filterInput} value={from} onChange={e => setFrom(e.target.value)} placeholder="From" />
        <input type="date" style={st.filterInput} value={to}   onChange={e => setTo(e.target.value)}   placeholder="To" />
        <button style={st.clearBtn} onClick={() => { setSearch(""); setMethod("All"); setFrom(""); setTo(""); }}>
          Clear
        </button>
      </div>

      {/* ── ERROR ── */}
      {error && <div style={st.alertError}>{error}</div>}

      {/* ── TABLE ── */}
      <div style={st.tableCard}>
        <div style={st.tableHead}>
          <span style={{ flex: 1.4 }}>Invoice</span>
          <span style={{ flex: 1 }}>Date</span>
          <span style={{ flex: 1.6 }}>Customer</span>
          <span style={{ flex: 1.2 }}>Payment</span>
          <span style={{ flex: 1 }}>Status</span>
          <span style={{ flex: 1, textAlign: "right" }}>Total</span>
          <span style={{ flex: 1, textAlign: "right" }}>Due</span>
          <span style={{ width: 60 }}></span>
        </div>

        {loading && <div style={st.emptyState}>Loading…</div>}
        {!loading && sales.length === 0 && <div style={st.emptyState}>No sales found.</div>}

        {sales.map(s => (
          <div key={s.id} style={st.tableRow}>
            <span style={{ ...st.mono, flex: 1.4 }}>{s.invoiceNo}</span>
            <span style={{ flex: 1, color: "#555", fontSize: 13 }}>{s.saleDate}</span>
            <span style={{ flex: 1.6, fontSize: 13 }}>{s.customerName || <em style={{ color: "#aaa" }}>Walk-in</em>}</span>
            <span style={{ flex: 1.2, fontSize: 13 }}>{s.paymentMethod}</span>
            <span style={{ flex: 1 }}>
              <StatusBadge status={s.paymentStatus} />
            </span>
            <span style={{ flex: 1, textAlign: "right", fontWeight: 600, color: "#1b3a1d" }}>
              Rs {(s.total || 0).toFixed(0)}
            </span>
            <span style={{ flex: 1, textAlign: "right", fontWeight: 600, color: s.balanceDue > 0 ? "#c62828" : "#8aab8c" }}>
              {s.balanceDue > 0 ? `Rs ${s.balanceDue.toFixed(0)}` : "—"}
            </span>
            <div style={{ width: 60, display: "flex", gap: 4, justifyContent: "flex-end" }}>
              <button style={st.viewBtn} onClick={() => openDetail(s.id)} title="View">👁</button>
              <button style={st.voidBtn} onClick={() => setVoidTarget(s)} title="Void">✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── DETAIL MODAL ── */}
      {(detail || detailLoading) && (
        <div style={st.overlay} onClick={() => setDetail(null)}>
          <div style={st.modal} onClick={e => e.stopPropagation()}>
            {detailLoading ? (
              <div style={st.modalLoading}>Loading…</div>
            ) : detail ? (
              <>
                <div style={st.modalHeader}>
                  <div>
                    <div style={st.modalTitle}>{detail.invoiceNo}</div>
                    <div style={st.modalSub}>{detail.saleDate} · {detail.paymentMethod} · <StatusBadge status={detail.paymentStatus} /></div>
                  </div>
                  <button style={st.closeBtn} onClick={() => setDetail(null)}>✕</button>
                </div>

                <div style={st.modalMeta}>
                  <span>Customer: <strong>{detail.customerName || "Walk-in"}</strong></span>
                  {detail.phone && <span>Phone: <strong>{detail.phone}</strong></span>}
                  {detail.notes && <span>Notes: {detail.notes}</span>}
                </div>

                <div style={st.modalTable}>
                  <div style={st.modalHead}>
                    <span style={{ flex: 3 }}>Product</span>
                    <span style={{ flex: 0.8, textAlign: "right" }}>Qty</span>
                    <span style={{ flex: 0.7 }}>Unit</span>
                    <span style={{ flex: 1, textAlign: "right" }}>Price</span>
                    <span style={{ flex: 1, textAlign: "right" }}>Discount</span>
                    <span style={{ flex: 1, textAlign: "right" }}>Total</span>
                  </div>
                  {(detail.items || []).map(item => (
                    <div key={item.id} style={st.modalRow}>
                      <span style={{ flex: 3 }}>{item.productName}</span>
                      <span style={{ flex: 0.8, textAlign: "right" }}>{item.quantity}</span>
                      <span style={{ flex: 0.7, color: "#888" }}>{item.unit}</span>
                      <span style={{ flex: 1, textAlign: "right" }}>Rs {(item.unitPrice || 0).toFixed(0)}</span>
                      <span style={{ flex: 1, textAlign: "right", color: "#c62828" }}>
                        {item.discount > 0 ? `Rs ${item.discount.toFixed(0)}` : "—"}
                      </span>
                      <span style={{ flex: 1, textAlign: "right", fontWeight: 600 }}>Rs {(item.lineTotal || 0).toFixed(0)}</span>
                    </div>
                  ))}
                </div>

                <div style={st.modalTotals}>
                  <TotalRow label="Subtotal"  value={`Rs ${(detail.subtotal || 0).toFixed(0)}`} />
                  <TotalRow label="Discount"  value={`Rs ${(detail.discountTotal || 0).toFixed(0)}`} />
                  <TotalRow label="Grand Total" value={`Rs ${(detail.total || 0).toFixed(0)}`} bold />
                  {detail.balanceDue > 0 && <TotalRow label="Balance Due" value={`Rs ${detail.balanceDue.toFixed(0)}`} accent />}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ── VOID CONFIRM ── */}
      {voidTarget && (
        <div style={st.overlay} onClick={() => setVoidTarget(null)}>
          <div style={st.confirmBox} onClick={e => e.stopPropagation()}>
            <div style={st.confirmTitle}>Void Invoice?</div>
            <div style={st.confirmBody}>
              <strong>{voidTarget.invoiceNo}</strong> will be voided and stock will be restored. This cannot be undone.
            </div>
            <div style={st.confirmActions}>
              <button style={st.cancelBtn} onClick={() => setVoidTarget(null)}>Cancel</button>
              <button style={{ ...st.doVoidBtn, opacity: voiding ? 0.7 : 1 }} onClick={() => doVoid(voidTarget.id)} disabled={voiding}>
                {voiding ? "Voiding…" : "Yes, Void"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function Stat({ label, value, accent }) {
  return (
    <div style={st.statBox}>
      <span style={st.statLabel}>{label}</span>
      <span style={{ ...st.statValue, color: accent ? "#c62828" : "#1b3a1d" }}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    Paid:   { bg: "#eaf7ea", color: "#2e7d32", label: "Paid" },
    Credit: { bg: "#fff3e0", color: "#e65100", label: "Credit" },
    Partial:{ bg: "#e3f2fd", color: "#1565c0", label: "Partial" },
  };
  const s = map[status] || { bg: "#f3f3f3", color: "#555", label: status || "—" };
  return <span style={{ ...st.badge, background: s.bg, color: s.color }}>{s.label}</span>;
}

function TotalRow({ label, value, bold, accent }) {
  return (
    <div style={st.totalRow}>
      <span style={{ color: "#6a8f6c" }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500, color: accent ? "#c62828" : "#1b3a1d" }}>{value}</span>
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────────── */

const st = {
  page:   { minHeight: "100%", background: "#f0f6f0", fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 20, display: "flex", flexDirection: "column", gap: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  title:  { fontSize: 22, fontWeight: 700, color: "#1b3a1d", margin: 0 },
  sub:    { fontSize: 13, color: "#8aab8c" },
  headerStats: { display: "flex", gap: 16 },
  statBox:     { background: "#fff", border: "1px solid #d5e8d5", borderRadius: 12, padding: "12px 18px", textAlign: "right" },
  statLabel:   { display: "block", fontSize: 11, fontWeight: 600, color: "#6a8f6c", textTransform: "uppercase", marginBottom: 4 },
  statValue:   { fontSize: 18, fontWeight: 700 },

  filterBar:    { display: "flex", gap: 10, flexWrap: "wrap" },
  filterInput:  { padding: "10px 14px", borderRadius: 10, border: "1.5px solid #cde0cd", background: "#fafff9", fontSize: 14, outline: "none", color: "#1a1a1a", minWidth: 160 },
  filterSelect: { padding: "10px 14px", borderRadius: 10, border: "1.5px solid #cde0cd", background: "#fafff9", fontSize: 14, outline: "none", color: "#1a1a1a" },
  clearBtn:     { padding: "10px 16px", borderRadius: 10, border: "1px solid #d3e5d3", background: "#fff", color: "#555", fontSize: 13, cursor: "pointer" },

  alertError: { padding: "10px 14px", borderRadius: 9, background: "#fff0f0", border: "1px solid #f5c6c6", color: "#c62828", fontSize: 13, fontWeight: 500 },

  tableCard: { background: "#fff", border: "1px solid #d5e8d5", borderRadius: 14, overflow: "hidden" },
  tableHead: { display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "2px solid #e8f0e8", fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: 0.6, background: "#f8fcf8" },
  tableRow:  { display: "flex", alignItems: "center", gap: 12, padding: "13px 20px", borderBottom: "1px solid #f2f7f2", fontSize: 14 },
  mono:      { fontFamily: "monospace", fontWeight: 600, color: "#1b3a1d", fontSize: 13 },
  emptyState:{ padding: "32px 20px", textAlign: "center", color: "#aaa", fontSize: 14 },

  badge: { padding: "3px 9px", borderRadius: 20, fontSize: 12, fontWeight: 600 },

  viewBtn: { width: 28, height: 28, borderRadius: 7, border: "1px solid #d5e8d5", background: "#f8fcf8", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  voidBtn: { width: 28, height: 28, borderRadius: 7, border: "none", background: "#fff0f0", color: "#d32f2f", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },

  // Modal
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" },
  modalLoading: { padding: 40, textAlign: "center", color: "#8aab8c" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "20px 24px 16px", borderBottom: "1px solid #e8f0e8" },
  modalTitle:  { fontSize: 18, fontWeight: 700, color: "#1b3a1d", fontFamily: "monospace" },
  modalSub:    { fontSize: 13, color: "#6a8f6c", marginTop: 4, display: "flex", alignItems: "center", gap: 8 },
  closeBtn:    { width: 32, height: 32, borderRadius: 8, border: "1px solid #e4efe4", background: "#f9fdf9", color: "#666", fontSize: 16, cursor: "pointer" },
  modalMeta:   { display: "flex", flexDirection: "column", gap: 4, padding: "14px 24px", background: "#f8fcf8", fontSize: 13, color: "#4a6b4d" },
  modalTable:  { padding: "16px 24px" },
  modalHead:   { display: "flex", gap: 10, padding: "0 0 8px", borderBottom: "2px solid #e8f0e8", fontSize: 11, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase" },
  modalRow:    { display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid #f2f7f2", fontSize: 14 },
  modalTotals: { display: "flex", flexDirection: "column", gap: 8, padding: "16px 24px 24px", borderTop: "1px solid #e8f0e8", marginTop: 4 },
  totalRow:    { display: "flex", justifyContent: "space-between", fontSize: 14 },

  // Void confirm
  confirmBox:     { background: "#fff", borderRadius: 14, padding: 28, maxWidth: 420, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" },
  confirmTitle:   { fontSize: 18, fontWeight: 700, color: "#1b3a1d", marginBottom: 12 },
  confirmBody:    { fontSize: 14, color: "#4a6b4d", marginBottom: 24, lineHeight: 1.6 },
  confirmActions: { display: "flex", gap: 10, justifyContent: "flex-end" },
  cancelBtn:      { padding: "10px 20px", borderRadius: 9, border: "1px solid #d3e5d3", background: "#fff", color: "#555", fontSize: 14, cursor: "pointer", fontWeight: 500 },
  doVoidBtn:      { padding: "10px 20px", borderRadius: 9, border: "none", background: "#d32f2f", color: "#fff", fontSize: 14, cursor: "pointer", fontWeight: 600 },
};
