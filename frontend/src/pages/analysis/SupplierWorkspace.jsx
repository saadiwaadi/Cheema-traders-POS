import { st } from "./shared/analysisStyles";

export default function SupplierWorkspace() {
  const summaryData = [
    { label: "Total Pending Liability", value: "Rs 245,000" },
    { label: "Overdue Amount", value: "Rs 90,000" },
    { label: "Partially Paid", value: "Rs 45,000" },
    { label: "Settled This Month", value: "Rs 110,000" },
  ];

  const supplierData = [
    { supplier: "Bayer CropScience", pending: "Rs 90,000", invoice: "INV-B-442", dueDate: "10 Aug 2026", status: "Overdue" },
    { supplier: "Syngenta", pending: "Rs 45,000", invoice: "INV-S-102", dueDate: "25 Aug 2026", status: "Partially Paid" },
    { supplier: "FMC Corporation", pending: "Rs 110,000", invoice: "INV-F-881", dueDate: "05 Sep 2026", status: "Unpaid" },
    { supplier: "Corteva Agriscience", pending: "Rs 0", invoice: "INV-C-339", dueDate: "01 Aug 2026", status: "Settled" },
  ];

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
