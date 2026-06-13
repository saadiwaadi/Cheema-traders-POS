import { useEffect, useState } from "react";
import { st } from "./shared/analysisStyles";
import { getCustomerDuesAnalysis } from "../../lib/posApi";

export default function CustomerDuesWorkspace() {
  const [agingData, setAgingData] = useState([]);
  const [customerData, setCustomerData] = useState([]);

  useEffect(() => {
    getCustomerDuesAnalysis()
      .then((data) => {
        if (data) {
          if (data.aging) {
            const mappedAging = data.aging.map((a) => ({
              bucket: a.bucket,
              value: `Rs ${a.value.toLocaleString()}`,
              count: a.count,
            }));
            setAgingData(mappedAging);
          }
          if (data.customers) {
            const mappedCustomers = data.customers.map((c) => ({
              customer: c.customer,
              pending: `Rs ${c.pending.toLocaleString()}`,
              lastPayment: c.lastPayment,
              overdue: c.overdue,
              status: c.status,
            }));
            setCustomerData(mappedCustomers);
          }
        }
      })
      .catch(console.error);
  }, []);

  return (
    <>
      <div style={st.card}>
        <div style={st.cardTop}>
          <div>
            <h2 style={st.cardTitle}>Credit Risk Aging</h2>
            <p style={st.cardSubtext}>Outstanding balances grouped by days overdue.</p>
          </div>
        </div>

        <div style={st.agingGrid}>
          {agingData.map((item, i) => (
            <div key={i} style={st.agingCard}>
              <div style={st.agingLabel}>{item.bucket}</div>
              <div style={st.agingValue}>{item.value}</div>
              <div style={st.agingCount}>{item.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <div>
            <h2 style={st.cardTitle}>Customer Pending Dues</h2>
            <p style={st.cardSubtext}>Detailed liability list for credit customers.</p>
          </div>
        </div>

        <div style={st.tableWrap}>
          <div style={st.tableHead}>
            <span style={{ flex: 2 }}>Customer Name</span>
            <span style={{ flex: 1 }}>Pending Amount</span>
            <span style={{ flex: 1.2 }}>Last Payment</span>
            <span style={{ flex: 1 }}>Days Overdue</span>
            <span style={{ width: 100 }}>Risk Status</span>
          </div>

          {customerData.map((item, index) => (
            <div key={index} style={st.tableRow}>
              <span style={{ flex: 2, ...st.cellBold }}>{item.customer}</span>
              <span style={{ flex: 1 }}>{item.pending}</span>
              <span style={{ flex: 1.2 }}>{item.lastPayment}</span>
              <span style={{ flex: 1 }}>{item.overdue} Days</span>
              <div style={{ width: 100 }}>
                <div style={{
                  ...st.badge,
                  ...(item.status === "Critical" ? st.badgeDanger : item.status === "Warning" ? st.badgeWarning : st.badgeNeutral)
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
