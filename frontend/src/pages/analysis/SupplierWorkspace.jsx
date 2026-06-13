import { useEffect, useState } from "react";
import { st } from "./shared/analysisStyles";
import { getSupplierAnalysis } from "../../lib/posApi";

export default function SupplierWorkspace() {
  const [summaryData, setSummaryData] = useState([]);
  const [supplierData, setSupplierData] = useState([]);

  useEffect(() => {
    getSupplierAnalysis()
      .then((data) => {
        if (data) {
          if (data.summary) {
            setSummaryData(data.summary.map((s) => ({
              label: s.label,
              value: `Rs ${s.value.toLocaleString()}`,
            })));
          }
          if (data.suppliers) {
            setSupplierData(data.suppliers.map((s) => ({
              supplier: s.supplier,
              pending: `Rs ${s.pending.toLocaleString()}`,
              invoice: s.invoice || "-",
              dueDate: s.dueDate || "-",
              status: s.status,
            })));
          }
        }
      })
      .catch(console.error);
  }, []);

  return (
    <>
      <div style={st.summaryGrid}>
        {summaryData.map((item, i) => (
          <div key={i} style={st.summaryCard}>
            <div style={st.summaryLabel}>{item.label}</div>
            <div style={st.summaryValue}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <div>
            <h2 style={st.cardTitle}>Supplier Liability</h2>
            <p style={st.cardSubtext}>Pending invoices and payment states for all suppliers.</p>
          </div>
        </div>

        <div style={st.tableWrap}>
          <div style={st.tableHead}>
            <span style={{ flex: 2 }}>Supplier Name</span>
            <span style={{ flex: 1.2 }}>Invoice Ref</span>
            <span style={{ flex: 1 }}>Pending Amount</span>
            <span style={{ flex: 1.2 }}>Due Date</span>
            <span style={{ width: 110 }}>Payment State</span>
          </div>

          {supplierData.map((item, index) => (
            <div key={index} style={st.tableRow}>
              <span style={{ flex: 2, ...st.cellBold }}>{item.supplier}</span>
              <span style={{ flex: 1.2 }}>{item.invoice}</span>
              <span style={{ flex: 1 }}>{item.pending}</span>
              <span style={{ flex: 1.2 }}>{item.dueDate}</span>
              <div style={{ width: 110 }}>
                <div style={{
                  ...st.badge,
                  ...(item.status === "Overdue" ? st.badgeDanger : item.status === "Partially Paid" ? st.badgeWarning : item.status === "Settled" ? st.badgeSuccess : st.badgeNeutral)
                }}>
                  {item.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
