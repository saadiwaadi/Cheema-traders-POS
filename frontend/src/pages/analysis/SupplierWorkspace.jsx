import { st } from "./shared/analysisStyles";

export default function SupplierWorkspace({ analysis }) {
  const rs = (n) => `Rs ${Math.round(Number(n || 0)).toLocaleString()}`;
  // Suppliers we owe (positive balance = payable).
  const all = analysis?.supplierDues || [];
  const payables = all.filter((s) => Number(s.balance || 0) > 0);
  const advances = all.filter((s) => Number(s.balance || 0) < 0);
  const totalPayable = payables.reduce((s, x) => s + Number(x.balance || 0), 0);
  const top = payables.slice().sort((a, b) => b.balance - a.balance);

  const summaryData = [
    { label: "Total Pending Liability", value: rs(totalPayable) },
    { label: "Suppliers Owed", value: String(payables.length) },
    { label: "Largest Liability", value: rs(top[0]?.balance || 0) },
    { label: "Advances / Overpaid", value: rs(Math.abs(advances.reduce((s, x) => s + Number(x.balance || 0), 0))) },
  ];

  const supplierData = top.map((s) => ({
    supplier: s.name,
    pending: rs(s.balance),
    invoice: s.phone || "—",
    dueDate: "—",
    status: "Unpaid",
  }));

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
            <span style={{ flex: 1.2 }}>Contact</span>
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
