import React, { useEffect, useState } from "react";
import { st } from "./shared/analysisStyles";
import { listEmployees, getEmployeeStats } from "../../lib/posApi";

const formatMoney = (num) =>
  `Rs. ${(Number(num) || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function PayrollWorkspace() {
  const [employees, setEmployees] = useState([]);
  const [stats, setStats] = useState({ totalEmployees: 0, totalSalaryOwed: 0, totalAdvancesOutstanding: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await listEmployees("");
        if (res && res.employees) {
          setEmployees(res.employees);
        }
        const statRes = await getEmployeeStats();
        if (statRes) {
          setStats(statRes);
        }
      } catch (err) {
        console.error("Failed to load payroll analysis data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <>
      <div style={st.card}>
        <div style={st.cardTop}>
          <div>
            <h2 style={st.cardTitle}>Payroll Liabilities & Assets</h2>
            <p style={st.cardSubtext}>Summary of current salary liabilities and advance asset accounts.</p>
          </div>
        </div>

        <div style={{ ...st.agingGrid, gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div style={st.agingCard}>
            <div style={st.agingLabel}>Total Active Staff</div>
            <div style={{ ...st.agingValue, color: "var(--accent)" }}>{stats.totalEmployees}</div>
            <div style={st.agingCount}>Employees</div>
          </div>
          <div style={st.agingCard}>
            <div style={st.agingLabel}>Salaries Payable (Account 2100)</div>
            <div style={{ ...st.agingValue, color: "#dc2626" }}>{formatMoney(stats.totalSalaryOwed)}</div>
            <div style={st.agingCount}>Accrued Owed</div>
          </div>
          <div style={st.agingCard}>
            <div style={st.agingLabel}>Employee Advances (Account 1300)</div>
            <div style={{ ...st.agingValue, color: "#0284c7" }}>{formatMoney(stats.totalAdvancesOutstanding)}</div>
            <div style={st.agingCount}>Outstanding Advances</div>
          </div>
        </div>
      </div>

      <div style={st.card}>
        <div style={st.cardTop}>
          <div>
            <h2 style={st.cardTitle}>Employee Financial Summary</h2>
            <p style={st.cardSubtext}>Itemized balances for salaries payable and active advances per employee.</p>
          </div>
        </div>

        <div style={st.tableWrap}>
          <div style={st.tableHead}>
            <span style={{ flex: 1.5 }}>Employee Name</span>
            <span style={{ flex: 1.2 }}>Designation</span>
            <span style={{ flex: 1 }}>Base Pay Rate</span>
            <span style={{ flex: 1.2, textAlign: "right" }}>Salaries Owed (Cr)</span>
            <span style={{ flex: 1.2, textAlign: "right" }}>Advances (Dr)</span>
          </div>

          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)" }}>Loading employee details...</div>
          ) : employees.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)" }}>No employee records found.</div>
          ) : (
            employees.map((emp) => (
              <div key={emp.id} style={st.tableRow}>
                <span style={{ flex: 1.5, ...st.cellBold }}>{emp.name}</span>
                <span style={{ flex: 1.2, color: "var(--text-secondary)" }}>{emp.designation || "Staff"}</span>
                <span style={{ flex: 1 }}>
                  {formatMoney(emp.baseAmount)}
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>/{emp.payType === "monthly" ? "mo" : "wk"}</span>
                </span>
                <span style={{ flex: 1.2, textAlign: "right", color: emp.salaryBalance > 0 ? "#dc2626" : "inherit", fontWeight: emp.salaryBalance > 0 ? "bold" : "normal" }}>
                  {formatMoney(emp.salaryBalance)}
                </span>
                <span style={{ flex: 1.2, textAlign: "right", color: emp.advanceBalance > 0 ? "#0284c7" : "inherit", fontWeight: emp.advanceBalance > 0 ? "bold" : "normal" }}>
                  {formatMoney(emp.advanceBalance)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
