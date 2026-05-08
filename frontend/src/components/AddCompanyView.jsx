import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const EMPTY_FORM = { name: "", phone: "", salesOfficerPhone: "", address: "" };

function Toast({ toasts, removeToast }) {
  return (
    <div style={ts.toastContainer}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            transition={{ duration: 0.22 }}
            style={{
              ...ts.toast,
              ...(t.type === "success" ? ts.toastSuccess : ts.toastError),
            }}
          >
            {t.type === "success" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 13h-2v-2h2v2zm0-4h-2V7h2v4z" />
              </svg>
            )}
            <span style={{ flex: 1, fontSize: 12, lineHeight: 1.4 }}>{t.message}</span>
            <button onClick={() => removeToast(t.id)} style={ts.toastClose}>✕</button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default function AddCompanyView() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    fetch("http://localhost:5000/api/company/list")
      .then((r) => r.json())
      .then((data) => setCompanies(data.companies || []))
      .catch(() => {});
  }, []);

  const addToast = (type, message) => {
    const id = Date.now();
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => removeToast(id), 3500);
  };

  const removeToast = (id) => setToasts((p) => p.filter((t) => t.id !== id));

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "phone" || name === "salesOfficerPhone") {
      if (!/^\d*$/.test(value)) return;
    }
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Company name is required";
    if (form.phone && form.phone.length < 7) errs.phone = "Enter a valid phone number";
    if (form.salesOfficerPhone && form.salesOfficerPhone.length < 7)
      errs.salesOfficerPhone = "Enter a valid phone number";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/company/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setCompanies((p) => [data.company || { ...form, _id: Date.now() }, ...p]);
        setForm(EMPTY_FORM);
        setErrors({});
        addToast("success", `"${form.name}" added successfully`);
      } else {
        addToast("error", data.message || "Failed to add company");
      }
    } catch {
      addToast("error", "Server error. Please try again.");
    }
    setLoading(false);
  };

  const handleClear = () => {
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`http://localhost:5000/api/company/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        setCompanies((prev) => prev.filter((c) => c._id !== id));
        addToast("success", "Company deleted successfully");
      } else {
        addToast("error", data.message || "Delete failed");
      }
    } catch (err) {
      addToast("error", "Server error");
    }
  };

  return (
    <div style={ts.scrollContainer}>
      <Toast toasts={toasts} removeToast={removeToast} />

      <div style={ts.wrapper}>
        <div style={ts.pageHeader}>
          <h2 style={ts.pageTitle}>Add Company</h2>
          <p style={ts.pageSub}>Register a new supplier or partner company</p>
        </div>

        {/* ── Form Card ── */}
        <div style={ts.card}>
          {/* Company Name */}
          <div style={ts.fieldFull}>
            <label style={ts.label}>
              Company Name <span style={{ color: "#c62828" }}>*</span>
            </label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Nestle Pakistan Ltd."
              maxLength={100}
              style={{ ...ts.input, ...(errors.name ? ts.inputError : {}) }}
            />
            {errors.name && <span style={ts.errMsg}>{errors.name}</span>}
          </div>

          <div style={ts.row}>
            <div style={ts.fieldHalf}>
              <label style={ts.label}>Company Phone</label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="03xxxxxxxxx"
                maxLength={15}
                style={{ ...ts.input, ...(errors.phone ? ts.inputError : {}) }}
              />
              {errors.phone && <span style={ts.errMsg}>{errors.phone}</span>}
            </div>
            <div style={ts.fieldHalf}>
              <label style={ts.label}>Sales Officer Phone</label>
              <input
                name="salesOfficerPhone"
                value={form.salesOfficerPhone}
                onChange={handleChange}
                placeholder="03xxxxxxxxx"
                maxLength={15}
                style={{ ...ts.input, ...(errors.salesOfficerPhone ? ts.inputError : {}) }}
              />
              {errors.salesOfficerPhone && (
                <span style={ts.errMsg}>{errors.salesOfficerPhone}</span>
              )}
            </div>
          </div>

          <div style={ts.fieldFull}>
            <label style={ts.label}>Address</label>
            <textarea
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="Street, City, Province"
              maxLength={250}
              style={ts.textarea}
            />
            <span style={ts.charCount}>{form.address.length} / 250</span>
          </div>

          <div style={ts.formFooter}>
            <button onClick={handleClear} style={ts.btnSecondary}>Clear</button>
            <motion.button
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.97 }}
              onClick={handleSubmit}
              disabled={loading}
              style={{ ...ts.btnPrimary, ...(loading ? ts.btnDisabled : {}) }}
            >
              {loading ? (
                <><SpinnerIcon /> Adding...</>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                  </svg>
                  Add Company
                </>
              )}
            </motion.button>
          </div>
        </div>

        <div style={ts.card}>
          <div style={ts.sectionHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#43a047">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              <span style={ts.sectionTitle}>Registered Companies</span>
            </div>
            <span style={ts.totalBadge}>{companies.length} total</span>
          </div>

          {companies.length === 0 ? (
            <div style={ts.emptyState}>
              <p style={{ fontSize: 13, color: "#66bb6a" }}>No companies added yet</p>
            </div>
          ) : (
            <div style={ts.tableScroll}>
              <table style={ts.table}>
                <thead>
                  <tr>
                    <th style={{ ...ts.th, width: "32%" }}>Company</th>
                    <th style={{ ...ts.th, width: "22%" }}>Phone</th>
                    <th style={{ ...ts.th, width: "22%" }}>Sales Officer</th>
                    <th style={{ ...ts.th, width: "14%" }}>Status</th>
                    <th style={{ ...ts.th, width: "10%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c, i) => (
                    <tr key={c._id || i} style={i % 2 === 0 ? ts.trEven : ts.trOdd}>
                      <td style={ts.td}>
                        <div style={ts.companyName}>{c.name}</div>
                        {c.address && <div style={ts.companyAddress}>{c.address}</div>}
                      </td>
                      <td style={ts.tdMono}>{c.phone || "—"}</td>
                      <td style={ts.tdMono}>{c.salesOfficerPhone || "—"}</td>
                      <td style={ts.td}>
                        <span style={ts.badge}>Active</span>
                      </td>
                      <td style={{ ...ts.td, textAlign: "center" }}>
                        <motion.button
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleDelete(c._id)}
                          style={ts.deleteBtn}
                          title="Delete company"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#ef5350">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                          </svg>
                        </motion.button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <span style={{
      display: "inline-block",
      width: 13, height: 13,
      border: "2px solid rgba(255,255,255,0.35)",
      borderTop: "2px solid #fff",
      borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}

const ts = {
  scrollContainer: {
    height: "100%",         
    overflowY: "auto",    
    overflowX: "hidden",
    padding: "20px 24px 40px",
    boxSizing: "border-box",
  },

  wrapper: {
    maxWidth: 860,
    width: "100%",
    margin: "0 auto",
  },

  toastContainer: {
    position: "fixed",
    top: 16,
    right: 16,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: 280,
    pointerEvents: "none",
  },
  toast: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 8,
    boxShadow: "0 2px 10px rgba(0,0,0,0.13)",
    pointerEvents: "auto",
  },
  toastSuccess: { background: "#e8f5e9", border: "1px solid #a5d6a7", color: "#1b5e20" },
  toastError:   { background: "#ffebee", border: "1px solid #ef9a9a", color: "#b71c1c" },
  toastClose: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: 13, color: "inherit", opacity: 0.55,
    padding: "0 0 0 4px", lineHeight: 1, flexShrink: 0,
  },

  pageHeader: { marginBottom: 16 },
  pageTitle:  { fontSize: 18, fontWeight: 600, color: "#2e7d32", margin: 0 },
  pageSub:    { fontSize: 12, color: "#43a047", marginTop: 3 },

  card: {
    background: "#fff",
    border: "1px solid #c8e6c9",
    borderRadius: 10,
    padding: "18px 20px",
    marginBottom: 16,
    width: "100%",
    boxSizing: "border-box",
  },

  fieldFull: {
    display: "flex", flexDirection: "column",
    gap: 4, marginBottom: 14, width: "100%",
  },
  row: {
    display: "flex", gap: 14,
    marginBottom: 14, flexWrap: "wrap",
  },
  fieldHalf: {
    display: "flex", flexDirection: "column",
    gap: 4, flex: "1 1 180px", minWidth: 0,
  },
  label: { fontSize: 11, fontWeight: 600, color: "#388e3c", letterSpacing: 0.3 },
  input: {
    padding: "8px 11px",
    border: "1px solid #c8e6c9",
    borderRadius: 7,
    fontSize: 13, color: "#1b5e20",
    outline: "none", width: "100%",
    boxSizing: "border-box", background: "#fff",
    transition: "border 0.15s, box-shadow 0.15s",
  },
  inputError: { borderColor: "#ef5350", boxShadow: "0 0 0 3px rgba(239,83,80,0.1)" },
  textarea: {
    padding: "8px 11px",
    border: "1px solid #c8e6c9",
    borderRadius: 7,
    fontSize: 13, color: "#1b5e20",
    outline: "none", resize: "vertical",
    minHeight: 76, width: "100%",
    boxSizing: "border-box",
    fontFamily: "Segoe UI, sans-serif",
    background: "#fff",
  },
  errMsg:    { fontSize: 10, color: "#c62828", marginTop: 1 },
  charCount: { fontSize: 10, color: "#66bb6a", textAlign: "right", marginTop: 2 },

  formFooter: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 14, marginTop: 4,
    borderTop: "1px solid #e8f5e9",
    flexWrap: "wrap", gap: 8,
  },
  btnPrimary: {
    padding: "9px 18px", borderRadius: 7,
    fontSize: 13, fontWeight: 600,
    cursor: "pointer", border: "none",
    background: "#388e3c", color: "#fff",
    display: "flex", alignItems: "center", gap: 7,
    whiteSpace: "nowrap",
  },
  btnDisabled:   { background: "#a5d6a7", cursor: "not-allowed" },
  btnSecondary: {
    padding: "8px 16px", borderRadius: 7,
    fontSize: 13, fontWeight: 500, cursor: "pointer",
    background: "#e8f5e9", color: "#2e7d32",
    border: "1px solid #c8e6c9", whiteSpace: "nowrap",
  },

  sectionHeader: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", marginBottom: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "#2e7d32" },
  totalBadge:   { fontSize: 11, color: "#66bb6a" },

  tableScroll: {
    width: "100%",
    overflowX: "auto",   
    borderRadius: 7,
    border: "1px solid #c8e6c9",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",   
    minWidth: 480,          
  },

  th: {
    padding: "9px 14px",
    background: "#e8f5e9",
    color: "#388e3c",
    fontWeight: 600,
    fontSize: 11,
    textAlign: "left",      
    whiteSpace: "nowrap",
    borderBottom: "1px solid #c8e6c9",
    position: "sticky",
    top: 0,
    zIndex: 1,
    boxSizing: "border-box",
    overflow: "hidden",
  },

  td: {
    padding: "9px 14px",
    fontSize: 12,
    color: "#1b5e20",
    verticalAlign: "middle",
    textAlign: "left",         
    borderBottom: "1px solid #f1f8e9",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    boxSizing: "border-box",
  },

  tdMono: {
    padding: "9px 14px",
    fontSize: 12,
    color: "#1b5e20",
    verticalAlign: "middle",
    textAlign: "left",
    borderBottom: "1px solid #f1f8e9",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    boxSizing: "border-box",
    letterSpacing: 0.3,
  },

  trEven: { background: "#fff" },
  trOdd:  { background: "#f9fdf9" },

  companyName: {
    fontWeight: 600,
    fontSize: 12,
    color: "#1b5e20",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  companyAddress: {
    fontSize: 10,
    color: "#66bb6a",
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  badge: {
    display: "inline-block",
    padding: "2px 9px",
    borderRadius: 10,
    fontSize: 10,
    fontWeight: 600,
    background: "#e8f5e9",
    color: "#2e7d32",
    whiteSpace: "nowrap",
    border: "1px solid #c8e6c9",
  },

  deleteBtn: {
    background: "none", border: "none",
    cursor: "pointer", padding: "3px 6px",
    borderRadius: 5,
    display: "inline-flex",
    alignItems: "center", justifyContent: "center",
  },

  emptyState: {
    textAlign: "center",
    padding: "28px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },

  scrollContainer: {
  padding: "20px 24px 40px",
  boxSizing: "border-box",
  width: "100%",
},
};