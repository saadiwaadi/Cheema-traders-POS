import { st } from "./shared/analysisStyles";

export default function ExpenseWorkspace() {
  const expenseSummary = [
    { label: "Total Expenses (MTD)", value: "Rs 64,200" },
    { label: "Projected Monthly", value: "Rs 88,000" },
    { label: "Largest Category", value: "Salaries" },
    { label: "Recurring Costs", value: "Rs 52,000" },
  ];

  const expenseData = [
    { category: "Salaries", currentMonth: "Rs 45,000", lastMonth: "Rs 45,000", type: "Recurring" },
    { category: "Rent", currentMonth: "Rs 12,000", lastMonth: "Rs 12,000", type: "Recurring" },
    { category: "Electricity", currentMonth: "Rs 4,500", lastMonth: "Rs 3,800", type: "Variable" },
    { category: "Transport", currentMonth: "Rs 1,200", lastMonth: "Rs 1,500", type: "Variable" },
    { category: "Miscellaneous", currentMonth: "Rs 1,500", lastMonth: "Rs 800", type: "Variable" },
  ];

  return (
    <>
      <div style={st.summaryGrid}>
        {expenseSummary.map((item, i) => (
          <div key={i} style={st.summaryCard}>
            <div style={st.summaryLabel}>{item.label}</div>
            <div style={st.summaryValue}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <div>
            <h2 style={st.cardTitle}>Operational Expenses</h2>
            <p style={st.cardSubtext}>Categorized business expenses and monthly comparisons.</p>
          </div>
        </div>

        <div style={st.tableWrap}>
          <div style={st.tableHead}>
            <span style={{ flex: 2 }}>Category</span>
            <span style={{ flex: 1.2 }}>Expense Type</span>
            <span style={{ flex: 1.5 }}>This Month</span>
            <span style={{ flex: 1.5 }}>Last Month</span>
          </div>

          {expenseData.map((item, index) => (
            <div key={index} style={st.tableRow}>
              <span style={{ flex: 2, ...st.cellBold }}>{item.category}</span>
              <span style={{ flex: 1.2 }}>{item.type}</span>
              <span style={{ flex: 1.5 }}>{item.currentMonth}</span>
              <span style={{ flex: 1.5, ...st.cellMuted }}>{item.lastMonth}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
