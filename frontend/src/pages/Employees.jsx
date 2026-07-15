import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, PlusCircle, ArrowLeft, Calendar, User, Shield, Briefcase, FileText, Download, Printer } from "lucide-react";
import XLSX from "xlsx-js-style";
import SuccessNotification from "../components/SuccessNotification";
import {
  listEmployees,
  saveEmployee,
  getEmployeeHistory,
  recordEmployeeTransaction,
  getEmployeeStats,
  listBanks,
  getSettings
} from "../lib/posApi";

const BUSINESS_NAME = "Cheema Traders";

const formatMoney = (num) =>
  `Rs. ${(Number(num) || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function EmployeesPage() {
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [isTxPanelOpen, setIsTxPanelOpen] = useState(false);
  const [employeeToEdit, setEmployeeToEdit] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [successData, setSuccessData] = useState(null);
  const [stats, setStats] = useState({ totalEmployees: 0, totalSalaryOwed: 0, totalAdvancesOutstanding: 0 });

  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listEmployees(search);
      if (res && res.employees) {
        setEmployees(res.employees);
        if (selectedEmployee) {
          const updated = res.employees.find(e => e.id === selectedEmployee.id);
          if (updated) setSelectedEmployee(updated);
        }
      }
      const statRes = await getEmployeeStats();
      if (statRes) {
        setStats(statRes);
      }
    } catch (e) {
      console.error("Failed to load employees", e);
    } finally {
      setLoading(false);
    }
  }, [selectedEmployee, search]);

  useEffect(() => {
    loadEmployees();
  }, [search]);

  const handleOpenAddPanel = () => {
    setEmployeeToEdit(null);
    setIsAddPanelOpen(true);
  };

  const handleEditEmployee = (emp) => {
    setEmployeeToEdit(emp);
    setIsAddPanelOpen(true);
  };

  const handleSavedEmployee = (savedInfo) => {
    setIsAddPanelOpen(false);
    setEmployeeToEdit(null);
    setSuccessData({
      title: employeeToEdit ? "Employee Updated" : "Employee Added",
      lines: [
        { label: "Name", value: savedInfo.name },
        { label: "Designation", value: savedInfo.designation || "-" },
        { label: "Base Salary", value: formatMoney(savedInfo.baseAmount) }
      ],
    });
    loadEmployees();
  };

  const handleOpenTxPanel = () => {
    setIsTxPanelOpen(true);
  };

  const handleTxSaved = () => {
    setIsTxPanelOpen(false);
    setSuccessData({
      title: "Transaction Posted",
      lines: [
        { label: "Status", value: "Success" },
        { label: "Message", value: "Double-entry subledger posting recorded successfully." }
      ]
    });
    loadEmployees();
  };

  return (
    <div style={st.page}>
      <div style={st.pageHeader}>
        <div>
          {selectedEmployee ? (
            <button style={st.backBtn} onClick={() => setSelectedEmployee(null)}>
              <ArrowLeft size={16} /> Back to Directory
            </button>
          ) : (
            <>
              <h1 style={st.title}>Employees & Payroll</h1>
              <p style={st.subtitle}>Staff Directory, Advances & Payroll Subledger</p>
            </>
          )}
        </div>
        {!selectedEmployee && (
          <div style={st.headerActions}>
            <button style={st.primaryBtn} onClick={handleOpenAddPanel}>
              <PlusCircle size={16} /> Add Employee
            </button>
          </div>
        )}
      </div>

      {!selectedEmployee && (
        <div style={st.kpiStrip}>
          <div style={st.kpiItem}>
            <div style={st.kpiLabel}>Total Staff</div>
            <div style={st.kpiValue}>{stats.totalEmployees}</div>
          </div>
          <div style={st.kpiDivider} />
          <div style={st.kpiItem}>
            <div style={st.kpiLabel}>Salaries Payable (2100)</div>
            <div style={{ ...st.kpiValue, color: "var(--danger)" }}>{formatMoney(stats.totalSalaryOwed)}</div>
          </div>
          <div style={st.kpiDivider} />
          <div style={st.kpiItem}>
            <div style={st.kpiLabel}>Advances Outstanding (1300)</div>
            <div style={{ ...st.kpiValue, color: "var(--info)" }}>{formatMoney(stats.totalAdvancesOutstanding)}</div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
        {selectedEmployee ? (
          <EmployeeHistoryView
            employee={selectedEmployee}
            onOpenTx={handleOpenTxPanel}
            onRefresh={loadEmployees}
          />
        ) : (
          <EmployeeListView
            employees={employees}
            loading={loading}
            onSelectHistory={setSelectedEmployee}
            onEdit={handleEditEmployee}
            search={search}
            setSearch={setSearch}
          />
        )}
      </div>

      <AddEmployeePanel
        isOpen={isAddPanelOpen}
        employeeToEdit={employeeToEdit}
        onClose={() => {
          setIsAddPanelOpen(false);
          setEmployeeToEdit(null);
        }}
        onSaved={handleSavedEmployee}
      />

      <RecordTransactionPanel
        isOpen={isTxPanelOpen}
        employee={selectedEmployee}
        onClose={() => setIsTxPanelOpen(false)}
        onSaved={handleTxSaved}
      />

      {successData && (
        <SuccessNotification
          visible={!!successData}
          title={successData.title}
          lines={successData.lines}
          onClose={() => setSuccessData(null)}
        />
      )}
    </div>
  );
}

function EmployeeListView({ employees, loading, onSelectHistory, onEdit, search, setSearch }) {
  return (
    <div style={st.card}>
      <div style={st.filterRow}>
        <div style={st.searchWrap}>
          <Search size={16} style={st.searchIcon} />
          <input
            style={st.searchInput}
            placeholder="Search by employee name or designation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div style={st.tableWrap}>
        <table style={st.table}>
          <thead>
            <tr style={st.tableHeadRow}>
              <th style={st.th}>Employee Details</th>
              <th style={st.th}>Joining Date</th>
              <th style={st.th}>Monthly / Weekly Rate</th>
              <th style={{ ...st.th, textAlign: "right" }}>Salaries Payable</th>
              <th style={{ ...st.th, textAlign: "right" }}>Advances Outstanding</th>
              <th style={{ ...st.th, textAlign: "center", width: 150 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && employees.length === 0 ? (
              <tr>
                <td colSpan="6" style={st.emptyCell}>Loading employees...</td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan="6" style={st.emptyCell}>No employees found.</td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.id} style={st.tableRow}>
                  <td style={st.td}>
                    <div>
                      <strong style={{ fontSize: 14, color: "#111827" }}>{emp.name}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      {emp.designation || "Staff"} • <span style={{ textTransform: "capitalize" }}>{emp.payType}</span> pay
                    </div>
                  </td>
                  <td style={st.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Calendar size={14} style={{ color: "#9ca3af" }} />
                      <span>{emp.joiningDate}</span>
                    </div>
                  </td>
                  <td style={st.td}>
                    <strong style={{ color: "#374151" }}>{formatMoney(emp.baseAmount)}</strong>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}> / {emp.payType === "monthly" ? "mo" : "wk"}</span>
                  </td>
                  <td style={{ ...st.td, textAlign: "right", color: emp.salaryBalance > 0 ? "var(--danger)" : "#374151", fontWeight: emp.salaryBalance > 0 ? "bold" : "normal" }}>
                    {formatMoney(emp.salaryBalance)}
                  </td>
                  <td style={{ ...st.td, textAlign: "right", color: emp.advanceBalance > 0 ? "var(--info)" : "#374151", fontWeight: emp.advanceBalance > 0 ? "bold" : "normal" }}>
                    {formatMoney(emp.advanceBalance)}
                  </td>
                  <td style={{ ...st.td, textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      <button style={st.secondaryBtnSmall} onClick={() => onSelectHistory(emp)}>
                        Ledger History
                      </button>
                      <button style={st.editBtnSmall} onClick={() => onEdit(emp)}>
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddEmployeePanel({ isOpen, onClose, onSaved, employeeToEdit }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [designation, setDesignation] = useState("");
  const [payType, setPayType] = useState("monthly");
  const [baseAmount, setBaseAmount] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [notes, setNotes] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingAdvanceBalance, setOpeningAdvanceBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (employeeToEdit) {
        setName(employeeToEdit.name || "");
        setPhone(employeeToEdit.phone || "");
        setDesignation(employeeToEdit.designation || "");
        setPayType(employeeToEdit.payType || "monthly");
        setBaseAmount(employeeToEdit.baseAmount === 0 ? "" : String(employeeToEdit.baseAmount));
        setJoiningDate(employeeToEdit.joiningDate || new Date().toISOString().split("T")[0]);
        setNotes(employeeToEdit.notes || "");
        setOpeningBalance("");
        setOpeningAdvanceBalance("");
      } else {
        setName("");
        setPhone("");
        setDesignation("");
        setPayType("monthly");
        setBaseAmount("");
        setJoiningDate(new Date().toISOString().split("T")[0]);
        setNotes("");
        setOpeningBalance("");
        setOpeningAdvanceBalance("");
      }
      setErrorMsg("");
    }
  }, [isOpen, employeeToEdit]);

  const handleSave = async () => {
    setErrorMsg("");
    if (!name.trim()) return setErrorMsg("Employee Name is required");
    if (phone && phone.length !== 11) {
      return setErrorMsg("Phone number must be exactly 11 digits (e.g. 03001234567)");
    }
    const parsedBase = Number(baseAmount);
    if (isNaN(parsedBase) || parsedBase <= 0) {
      return setErrorMsg("Base amount must be a positive number");
    }

    setSaving(true);
    try {
      const payload = {
        id: employeeToEdit ? employeeToEdit.id : undefined,
        name: name.trim(),
        phone: phone.trim() || null,
        designation: designation.trim() || null,
        payType,
        baseAmount: parsedBase,
        joiningDate,
        notes: notes.trim() || null,
      };

      if (!employeeToEdit) {
        payload.openingBalance = Number(openingBalance || 0);
        payload.openingAdvanceBalance = Number(openingAdvanceBalance || 0);
      }

      const saved = await saveEmployee(payload);
      onSaved(saved.employee);
    } catch (e) {
      setErrorMsg(e.message || "Failed to save employee.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            style={st.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            style={st.sidePanel}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <div style={st.panelHeader}>
              <h2 style={st.panelTitle}>{employeeToEdit ? "Edit Employee Profile" : "Add New Employee"}</h2>
              <button style={st.closeBtn} onClick={onClose}>✕</button>
            </div>

            <div style={st.panelBody}>
              {errorMsg && <div style={st.errorMsg}>{errorMsg}</div>}

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Employee Name *</label>
                <input
                  style={{ ...st.input, height: 44, fontSize: 14 }}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ahmad Cheema"
                />
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Designation / Role</label>
                <input
                  style={st.input}
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Sales Executive, Warehouse In-charge"
                />
              </div>

              <div style={st.fieldRow}>
                <div style={{ flex: 1 }}>
                  <label style={st.fieldLabel}>Pay Frequency</label>
                  <select
                    style={st.input}
                    value={payType}
                    onChange={(e) => setPayType(e.target.value)}
                  >
                    <option value="monthly">Monthly Salary</option>
                    <option value="weekly">Weekly Wages</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={st.fieldLabel}>Salary Rate (PKR) *</label>
                  <input
                    style={st.input}
                    type="number"
                    value={baseAmount}
                    onChange={(e) => setBaseAmount(e.target.value)}
                    placeholder="Rate amount"
                  />
                </div>
              </div>

              <div style={st.fieldRow}>
                <div style={{ flex: 1 }}>
                  <label style={st.fieldLabel}>Phone Number</label>
                  <input
                    style={st.input}
                    placeholder="03XXXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={st.fieldLabel}>Joining Date</label>
                  <input
                    style={st.input}
                    type="date"
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                  />
                </div>
              </div>

              {!employeeToEdit && (
                <fieldset style={st.fieldset}>
                  <legend style={st.legend}>Opening Balances</legend>
                  <div style={st.fieldRow}>
                    <div style={{ flex: 1 }}>
                      <label style={st.fieldLabel}>Salaries Owed (Payable)</label>
                      <input
                        style={st.input}
                        type="number"
                        placeholder="0.00"
                        value={openingBalance}
                        onChange={(e) => setOpeningBalance(e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={st.fieldLabel}>Advance Outstanding</label>
                      <input
                        style={st.input}
                        type="number"
                        placeholder="0.00"
                        value={openingAdvanceBalance}
                        onChange={(e) => setOpeningAdvanceBalance(e.target.value)}
                      />
                    </div>
                  </div>
                </fieldset>
              )}

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Notes / Department Info</label>
                <textarea
                  style={{ ...st.input, height: 80, resize: "none" }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter employee contact, address, or payroll notes..."
                />
              </div>

              <div style={{ flex: 1 }} />

              <div style={st.panelActions}>
                <button style={st.secondaryBtn} onClick={onClose} disabled={saving}>
                  Cancel
                </button>
                <button style={st.primaryBtn} onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : employeeToEdit ? "Save Profile" : "Create Profile"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function RecordTransactionPanel({ isOpen, onClose, onSaved, employee }) {
  const [type, setType] = useState("accrual");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [description, setDescription] = useState("");
  const [banks, setBanks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function loadBanks() {
      try {
        const res = await listBanks();
        if (res && res.banks) {
          setBanks(res.banks);
        }
      } catch (err) {
        console.error("Failed to load banks list for payroll", err);
      }
    }
    if (isOpen) {
      loadBanks();
      setType("accrual");
      setAmount("");
      setDate(new Date().toISOString().split("T")[0]);
      setPaymentMethod("Cash");
      setDescription("");
      setErrorMsg("");
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    setErrorMsg("");
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return setErrorMsg("Please enter a valid amount greater than 0");
    }
    if (!description.trim()) {
      return setErrorMsg("Description/Memo is required for reference");
    }

    setSaving(true);
    try {
      const tMap = {
        accrual: "salary",
        payout: "payment",
        advance: "advance",
        deduction: "deduction",
        bonus: "bonus"
      };
      await recordEmployeeTransaction({
        employeeId: employee.id,
        transactionType: tMap[type],
        type,
        amount: parsedAmount,
        transactionDate: date,
        date,
        notes: description.trim(),
        description: description.trim(),
        paymentMethod: ["payout", "advance", "deduction"].includes(type) ? paymentMethod : null
      });
      onSaved();
    } catch (e) {
      setErrorMsg(e.message || "Failed to post payroll transaction.");
    } finally {
      setSaving(false);
    }
  };

  const showPaymentMethod = ["payout", "advance"].includes(type);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            style={st.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            style={st.sidePanel}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <div style={st.panelHeader}>
              <h2 style={st.panelTitle}>Record Transaction</h2>
              <button style={st.closeBtn} onClick={onClose}>✕</button>
            </div>

            <div style={st.panelBody}>
              {errorMsg && <div style={st.errorMsg}>{errorMsg}</div>}

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Employee</label>
                <div style={st.readOnlyBox}>{employee?.name} ({employee?.designation})</div>
              </div>

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Transaction Type</label>
                <select
                  style={st.input}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="accrual">Accrual (Accrue Salary Expense)</option>
                  <option value="payout">Payout (Pay Salary Owed)</option>
                  <option value="advance">Advance (Issue Salary Advance)</option>
                  <option value="deduction">Deduction (Deduct Advance from Salaries Payable)</option>
                  <option value="bonus">Bonus / Allowance</option>
                </select>
              </div>

              <div style={st.fieldRow}>
                <div style={{ flex: 1 }}>
                  <label style={st.fieldLabel}>Amount (PKR) *</label>
                  <input
                    style={st.input}
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={st.fieldLabel}>Transaction Date</label>
                  <input
                    style={st.input}
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>

              {showPaymentMethod && (
                <div style={st.fieldWrap}>
                  <label style={st.fieldLabel}>Payment Mode / Source Account</label>
                  <select
                    style={st.input}
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="Cash">Cash Account</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={st.fieldWrap}>
                <label style={st.fieldLabel}>Reference Memo / Narration *</label>
                <input
                  style={st.input}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Regular Salary Accrual for June 2026"
                />
              </div>

              <div style={{ flex: 1 }} />

              <div style={st.panelActions}>
                <button style={st.secondaryBtn} onClick={onClose} disabled={saving}>
                  Cancel
                </button>
                <button style={st.primaryBtn} onClick={handleSubmit} disabled={saving}>
                  {saving ? "Posting..." : "Post Transaction"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function EmployeeHistoryView({ employee, onOpenTx, onRefresh }) {
  const [history, setHistory] = useState([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [businessProfile, setBusinessProfile] = useState({
    business_name: "Cheema Traders"
  });

  useEffect(() => {
    getSettings().then(res => {
      if (res && res.business_name) {
        setBusinessProfile({ business_name: res.business_name });
      }
    }).catch(e => console.error("Failed to load business profile settings", e));
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getEmployeeHistory(employee.id);
      if (res && res.history) {
        setHistory(res.history);
      }
    } catch (err) {
      console.error("Failed to load employee history", err);
    } finally {
      setLoading(false);
    }
  }, [employee]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredRows = useMemo(() => {
    return history.filter((row) => {
      if (fromDate && row.date < fromDate) return false;
      if (toDate && row.date > toDate) return false;
      return true;
    });
  }, [history, fromDate, toDate]);

  const excelExport = () => {
    const wb = XLSX.utils.book_new();
    const wsData = [];
    
    wsData.push(["PAYROLL LEDGER STATEMENT"]);
    wsData.push([businessProfile.business_name]);
    wsData.push([]);
    wsData.push(["Employee:", employee.name]);
    wsData.push(["Designation:", employee.designation || "Staff"]);
    wsData.push(["Period:", `${fromDate || "Inception"} to ${toDate || "Today"}`]);
    wsData.push([]);
    wsData.push(["S.No", "Date", "Description", "Type", "Debit (PKR)", "Credit (PKR)", "Salary Balance (PKR)", "Advance Balance (PKR)"]);

    let idx = 1;
    filteredRows.forEach((r) => {
      wsData.push([
        idx++,
        r.date,
        r.narration,
        r.sourceType.toUpperCase(),
        r.debit || 0,
        r.credit || 0,
        r.runningSalary || 0,
        r.runningAdvance || 0
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Payroll Statement");
    XLSX.writeFile(wb, `Payroll_Statement_${employee.name.replace(/\s+/g, '_')}.xlsx`);
  };

  const handlePrint = () => {
    let sNo = 1;
    const tableRowsHtml = filteredRows.map((r) => {
      return `
        <tr>
          <td>${sNo++}</td>
          <td>${new Date(r.date + "T00:00:00").toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}</td>
          <td>${r.narration}</td>
          <td><span style="font-weight:bold;text-transform:uppercase;font-size:10px;">${r.sourceType}</span></td>
          <td class="num">${r.debit > 0 ? formatMoney(r.debit) : "-"}</td>
          <td class="num text-success">${r.credit > 0 ? formatMoney(r.credit) : "-"}</td>
          <td class="num bold">${formatMoney(r.runningSalary)}</td>
          <td class="num bold">${formatMoney(r.runningAdvance)}</td>
        </tr>
      `;
    }).join("");

    const html = `
      <html>
        <head>
          <title>Payroll Ledger Statement - ${employee.name}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; font-size: 11px; color: #333; }
            .header { border-bottom: 2px solid #397d3d; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; }
            .brand { font-size: 20px; font-weight: bold; color: #397d3d; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
            .info-card { border: 1px solid #ddd; padding: 10px; border-radius: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background-color: #397d3d; color: white; padding: 8px; text-align: left; font-size: 10px; }
            td { padding: 8px; border-bottom: 1px solid #eee; }
            .num { text-align: right; font-family: monospace; }
            .bold { font-weight: bold; }
            .text-success { color: #2e7d32; }
            .footer-block { margin-top: 50px; display: flex; justify-content: space-between; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">${businessProfile.business_name}</div>
              <div style="font-size:12px;margin-top:4px;">Payroll Subledger Ledger</div>
            </div>
            <div style="text-align:right;">
              <h2 style="margin:0;color:#333;">Payroll Ledger Statement</h2>
              <div style="margin-top:5px;font-weight:bold;">Period: ${fromDate || "Inception"} to ${toDate || "Today"}</div>
            </div>
          </div>
          <div class="info-grid">
            <div class="info-card">
              <strong>Employee:</strong> ${employee.name}<br/>
              <strong>Designation:</strong> ${employee.designation || "-"}<br/>
              <strong>Joining Date:</strong> ${employee.joiningDate}<br/>
            </div>
            <div class="info-card" style="text-align:right;">
              <strong>Salary Balance (2100):</strong> ${formatMoney(employee.salaryBalance)}<br/>
              <strong>Advance Balance (1300):</strong> ${formatMoney(employee.advanceBalance)}<br/>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Date</th>
                <th>Description</th>
                <th>Type</th>
                <th style="text-align:right;">Debit (PKR)</th>
                <th style="text-align:right;">Credit (PKR)</th>
                <th style="text-align:right;">Salary Balance (2100)</th>
                <th style="text-align:right;">Advance Balance (1300)</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml || '<tr><td colspan="8" style="text-align:center;">No postings found.</td></tr>'}
            </tbody>
          </table>
          <div class="footer-block">
            <div>Prepared By: _________________</div>
            <div>Checked By: _________________</div>
            <div>Employee Signature: _________________</div>
          </div>
        </body>
      </html>
    `;
    
    if (window.ipc) {
      window.ipc.invoke("db:print-html-report", html);
    } else {
      const w = window.open();
      w.document.write(html);
      w.print();
    }
  };

  return (
    <div style={st.container}>
      <div style={st.profileHeader}>
        <div style={st.profileMeta}>
          <div style={st.profileAvatar}>
            <User size={28} style={{ color: "#397d3d" }} />
          </div>
          <div>
            <h2 style={st.profileName}>{employee.name}</h2>
            <div style={st.profileSub}>
              <Briefcase size={12} /> {employee.designation || "Staff"} • Joining Date: {employee.joiningDate}
            </div>
          </div>
        </div>
        <div style={st.profileActions}>
          <button style={st.primaryBtn} onClick={onOpenTx}>
            Record Transaction
          </button>
        </div>
      </div>

      <div style={st.balanceCardGrid}>
        <div style={{ ...st.balanceCard, borderLeft: "4px solid var(--danger)" }}>
          <div style={st.balanceLabel}>Salary Owed (Salaries Payable 2100)</div>
          <div style={{ ...st.balanceVal, color: "var(--danger)" }}>{formatMoney(employee.salaryBalance)}</div>
        </div>
        <div style={{ ...st.balanceCard, borderLeft: "4px solid var(--info)" }}>
          <div style={st.balanceLabel}>Advance Outstanding (Advances 1300)</div>
          <div style={{ ...st.balanceVal, color: "var(--info)" }}>{formatMoney(employee.advanceBalance)}</div>
        </div>
      </div>

      <div style={st.card}>
        <div style={st.filterBar}>
          <div style={st.filterGroup}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={st.fieldLabel}>From Date</label>
              <input
                type="date"
                style={st.dateInput}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={st.fieldLabel}>To Date</label>
              <input
                type="date"
                style={st.dateInput}
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          <div style={st.exportGroup}>
            <button style={st.iconBtn} onClick={handlePrint} title="Print Statement">
              <Printer size={16} /> Print Statement
            </button>
            <button style={st.iconBtn} onClick={excelExport} title="Export to Excel">
              <Download size={16} /> Export Excel
            </button>
          </div>
        </div>

        <div style={st.tableWrap}>
          <table style={st.table}>
            <thead>
              <tr style={st.tableHeadRow}>
                <th style={st.th}>S.No</th>
                <th style={st.th}>Date</th>
                <th style={st.th}>Description/Memo</th>
                <th style={st.th}>Type</th>
                <th style={{ ...st.th, textAlign: "right" }}>Debit</th>
                <th style={{ ...st.th, textAlign: "right" }}>Credit</th>
                <th style={{ ...st.th, textAlign: "right" }}>Salary Balance (2100)</th>
                <th style={{ ...st.th, textAlign: "right" }}>Advance Balance (1300)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={st.emptyCell}>Loading ledger entries...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="8" style={st.emptyCell}>No transaction postings found for this period.</td>
                </tr>
              ) : (
                filteredRows.map((r, i) => (
                  <tr key={i} style={st.tableRow}>
                    <td style={st.td}>{i + 1}</td>
                    <td style={st.td}>{r.date}</td>
                    <td style={st.td}>{r.narration}</td>
                    <td style={st.td}>
                      <span style={st.typeBadge}>{r.sourceType.toUpperCase()}</span>
                    </td>
                    <td style={{ ...st.td, textAlign: "right", color: "#2e7d32" }}>
                      {r.debit > 0 ? formatMoney(r.debit) : "—"}
                    </td>
                    <td style={{ ...st.td, textAlign: "right", color: "#c62828" }}>
                      {r.credit > 0 ? formatMoney(r.credit) : "—"}
                    </td>
                    <td style={{ ...st.td, textAlign: "right", fontWeight: "bold" }}>
                      {formatMoney(r.runningSalary)}
                    </td>
                    <td style={{ ...st.td, textAlign: "right", fontWeight: "bold" }}>
                      {formatMoney(r.runningAdvance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={st.signFooter}>
          <div style={st.signBlock}>Prepared By: ___________________</div>
          <div style={st.signBlock}>Checked By: ___________________</div>
          <div style={st.signBlock}>Employee Signature: ___________________</div>
        </div>
      </div>
    </div>
  );
}

const st = {
  page: {
    padding: "24px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    background: "#F8FAFC",
    minHeight: "100vh",
    fontFamily: "Inter, sans-serif"
  },
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: "#0F172A",
    letterSpacing: "-0.025em"
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 14,
    color: "#64748B"
  },
  backBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    color: "#397d3d",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: 0
  },
  primaryBtn: {
    background: "#397d3d",
    color: "white",
    border: "none",
    padding: "10px 18px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    transition: "background 0.2s"
  },
  secondaryBtn: {
    background: "#F1F5F9",
    color: "#334155",
    border: "1px solid #CBD5E1",
    padding: "10px 18px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer"
  },
  secondaryBtnSmall: {
    background: "#F1F5F9",
    color: "#334155",
    border: "1px solid #CBD5E1",
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer"
  },
  editBtnSmall: {
    background: "rgba(57, 125, 61, 0.1)",
    color: "#397d3d",
    border: "1px solid rgba(57, 125, 61, 0.2)",
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer"
  },
  kpiStrip: {
    display: "flex",
    background: "white",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: "16px 24px",
    gap: 24,
    alignItems: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
  },
  kpiItem: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.05em"
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: 700,
    color: "#0F172A",
    fontFamily: "monospace"
  },
  kpiDivider: {
    width: 1,
    height: 32,
    background: "#E2E8F0"
  },
  card: {
    background: "white",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    overflow: "hidden"
  },
  filterRow: {
    padding: "16px 20px",
    borderBottom: "1px solid #E2E8F0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  searchWrap: {
    position: "relative",
    width: "100%",
    maxWidth: 400
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    top: 10,
    color: "#94A3B8"
  },
  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 12px 8px 36px",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    fontSize: 13,
    outline: "none",
    background: "#F8FAFC"
  },
  tableWrap: {
    overflowX: "auto"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13
  },
  tableHeadRow: {
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0"
  },
  th: {
    padding: "12px 20px",
    textAlign: "left",
    fontWeight: 600,
    color: "#475569"
  },
  tableRow: {
    borderBottom: "1px solid #F1F5F9",
    transition: "background 0.15s"
  },
  td: {
    padding: "14px 20px",
    verticalAlign: "middle",
    color: "#334155"
  },
  emptyCell: {
    padding: 40,
    textAlign: "center",
    color: "#64748B",
    fontSize: 14
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.3)",
    zIndex: 1000
  },
  sidePanel: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: 460,
    background: "white",
    borderLeft: "1px solid #E2E8F0",
    boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
    zIndex: 1001,
    display: "flex",
    flexDirection: "column"
  },
  panelHeader: {
    padding: "20px 24px",
    borderBottom: "1px solid #E2E8F0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  panelTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: "#0F172A"
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: 20,
    cursor: "pointer",
    color: "#64748B"
  },
  panelBody: {
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    flex: 1,
    overflowY: "auto"
  },
  errorMsg: {
    padding: "10px 14px",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid #ef4444",
    borderRadius: 6,
    color: "#b91c1c",
    fontSize: 13
  },
  fieldWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#475569"
  },
  input: {
    padding: "8px 12px",
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    fontSize: 13,
    outline: "none",
    background: "#F8FAFC",
    color: "#0F172A",
    transition: "border-color 0.15s"
  },
  fieldRow: {
    display: "flex",
    gap: 16
  },
  fieldset: {
    border: "1px dashed #CBD5E1",
    borderRadius: 8,
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  legend: {
    fontSize: 11,
    fontWeight: 700,
    color: "#397d3d",
    padding: "0 6px",
    textTransform: "uppercase"
  },
  panelActions: {
    display: "flex",
    gap: 12,
    paddingTop: 16,
    borderTop: "1px solid #E2E8F0"
  },
  readOnlyBox: {
    padding: "10px 12px",
    background: "#F1F5F9",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "#334155"
  },
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 20
  },
  profileHeader: {
    background: "white",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: 24,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  profileMeta: {
    display: "flex",
    alignItems: "center",
    gap: 16
  },
  profileAvatar: {
    width: 54,
    height: 54,
    borderRadius: 12,
    background: "rgba(57, 125, 61, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  profileName: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "#0F172A"
  },
  profileSub: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
    display: "flex",
    alignItems: "center",
    gap: 6
  },
  profileActions: {
    display: "flex",
    gap: 12
  },
  balanceCardGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20
  },
  balanceCard: {
    background: "white",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.05em"
  },
  balanceVal: {
    fontSize: 22,
    fontWeight: 700,
    marginTop: 6,
    fontFamily: "monospace"
  },
  filterBar: {
    padding: "16px 20px",
    borderBottom: "1px solid #E2E8F0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  filterGroup: {
    display: "flex",
    gap: 12
  },
  dateInput: {
    padding: "6px 10px",
    border: "1px solid #E2E8F0",
    borderRadius: 6,
    fontSize: 12,
    background: "#F8FAFC",
    outline: "none"
  },
  exportGroup: {
    display: "flex",
    gap: 8
  },
  iconBtn: {
    background: "white",
    border: "1px solid #E2E8F0",
    padding: "8px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    color: "#334155",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
  },
  typeBadge: {
    padding: "2px 6px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    background: "#F1F5F9",
    color: "#475569"
  },
  signFooter: {
    marginTop: 40,
    padding: "24px 20px",
    borderTop: "1.5px solid #F1F5F9",
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#475569"
  },
  signBlock: {
    fontWeight: 600
  }
};
