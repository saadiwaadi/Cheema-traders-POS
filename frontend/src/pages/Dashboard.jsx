import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell
} from "recharts";
import SuppliersPage from "./suppliers";
import BillingPage from "./bill";
import InvoiceHistory from "./invoices";
import InventoryManagementPage from "./inventory";
import CustomersPage from "./customers";
import PaymentsPage from "./PaymentsPage";
import ExpensesPage from "./expenses";
import LedgerPage from "./ledger";
import CashBookPage from "./CashBook";
import BanksPage from "./banks";
import AnalysisPage from "./analysis/AnalysisShell";
import { getDashboardSummary } from "../lib/posApi";
import OverviewWorkspace from "./analysis/OverviewWorkspace";
import SettingsPage from "./settings";
import ChartOfAccountsPage from "./ChartOfAccounts";
import ReportsPage from "./reports";

// ─────────────────────────────────────────────────────────────
//  IMPORTANT: You need to add these two API functions to posApi.js
//  and wire them to IPC handlers that query your SQLite database.
//  See the Antigravity prompt at the bottom of this file.
// ─────────────────────────────────────────────────────────────
//  import { getMonthlyReport, getTopDebtors } from "../lib/posApi";
// ─────────────────────────────────────────────────────────────

// Temporary inline stubs — remove these once posApi functions exist
async function getMonthlyReport() {
  // Returns last 12 months of revenue, cost, expenses, profit
  // Replace with: return await window.ipc.invoke("db:get-monthly-report");
  if (window.ipc) {
    try { return await window.ipc.invoke("db:get-monthly-report"); } catch { /* fall through */ }
  }
  // Fallback: empty data so the chart renders gracefully
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  return months.map((m, i) => ({
    month: m, year: now.getFullYear(),
    revenue: 0, cost: 0, expenses: 0, profit: 0,
  }));
}

async function getTopDebtors() {
  // Returns top 10 customers by outstanding balance (positive = owes us)
  // Replace with: return await window.ipc.invoke("db:get-top-debtors");
  if (window.ipc) {
    try { return await window.ipc.invoke("db:get-top-debtors"); } catch { /* fall through */ }
  }
  return [];
}


const NAV_ITEMS = [
  { id: "home", label: "Dashboard", icon: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z", section: "main" },
  { id: "sales", label: "Billing", icon: "M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM5.1 4H3V2H1v2h2l3.6 7.59L5.25 14c-.16.28-.25.61-.25.96C5 16.1 5.9 17 7 17h14v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63H19c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 23.47 4H5.1z", section: "main" },
  { id: "invoices", label: "Invoices", icon: "M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2zm0-8h4v2H8V8z", section: "main" },
  { id: "products", label: "Inventory", icon: "M20 4H4v2l8 5 8-5V4zM4 13v7h16v-7l-8 5-8-5z", section: "main" },
  { id: "customers", label: "Customers", icon: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z", section: "main" },
  { id: "addCompany", label: "Suppliers", icon: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z", section: "main" },
  { id: "payments", label: "Payments", icon: "M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z", section: "finance" },
  { id: "expenses", label: "Expenses", icon: "M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V9H12v9zm4-5.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z", section: "finance" },
  { id: "banks", label: "Banks", icon: "M4 10h3v7H4zm6.5 0h3v7h-3zM2 19h20v3H2zm15-9h3v7h-3zm-5-9L2 6v2h20V6z", section: "finance" },
  { id: "cashbook", label: "Cash Book", icon: "M2 4v16h20V4H2zm18 14H4V6h16v12zm-9-9h2v2h-2zm0 4h2v2h-2zm-4-4h2v2H7zm0 4h2v2H7zm8-4h2v2h-2zm0 4h2v2h-2z", section: "finance" },
  { id: "ledger", label: "Ledger", icon: "M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z", section: "accounting" },
  { id: "coa", label: "Chart of Accounts", icon: "M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3h7z", section: "accounting" },
  { id: "analysis", label: "Analysis", icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z", section: "accounting" },
  { id: "reports", label: "Reports", icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.89 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z", section: "accounting" },
  { id: "settings", label: "Settings", icon: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z", section: "system" },
];

const SECTION_LABELS = { main: "Operations", finance: "Finance", accounting: "Accounting", system: "System" };
const STAFF_VISIBLE = ["home", "sales", "invoices", "products", "customers", "settings"];

export default function Dashboard() {
  const [active, setActive] = useState("home");
  const [showWelcome, setShowWelcome] = useState(true);
  const [summary, setSummary] = useState(null);
  const [monthlyData, setMonthlyData] = useState([]);
  const [topDebtors, setTopDebtors] = useState([]);
  const [hideFinancials, setHideFinancials] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();

  let user;
  try { user = JSON.parse(localStorage.getItem("user")) || {}; } catch { user = {}; }
  const userRole = user?.role;

  useEffect(() => { if (!userRole) navigate("/"); }, [navigate, userRole]);
  useEffect(() => { const t = setTimeout(() => setShowWelcome(false), 1200); return () => clearTimeout(t); }, []);

  useEffect(() => {
    let alive = true;
    getDashboardSummary().then(d => { if (alive) setSummary(d); }).catch(() => { });
    getMonthlyReport().then(d => { if (alive && Array.isArray(d)) setMonthlyData(d); }).catch(() => { });
    getTopDebtors().then(d => { if (alive && Array.isArray(d)) setTopDebtors(d); }).catch(() => { });
    return () => { alive = false; };
  }, []);

  const handleLogout = () => { localStorage.removeItem("user"); navigate("/"); };

  const today = new Date().toLocaleDateString("en-PK", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const visibleNav = useMemo(() => {
    const items = userRole === "admin" ? NAV_ITEMS : NAV_ITEMS.filter(i => STAFF_VISIBLE.includes(i.id));
    const grouped = {};
    items.forEach(i => { (grouped[i.section] ??= []).push(i); });
    return grouped;
  }, [userRole]);

  return (
    <div style={s.app}>
      {/* ───── Sidebar ───── */}
      <aside style={{ ...s.sidebar, width: sidebarCollapsed ? 56 : 210 }}>
        <div style={s.sidebarTop}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={s.logoMark}>CT</div>
            {!sidebarCollapsed && (
              <div>
                <div style={s.brandName}>Cheema Traders</div>
                <div style={s.brandTag}>Point of Sale</div>
              </div>
            )}
          </div>
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={s.collapseBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d={sidebarCollapsed ? "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" : "M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"} />
            </svg>
          </button>
        </div>

        <nav style={s.nav}>
          {Object.entries(visibleNav).map(([section, items]) => (
            <div key={section} style={{ marginBottom: 6 }}>
              {!sidebarCollapsed && <div style={s.navSection}>{SECTION_LABELS[section]}</div>}
              {items.map(item => {
                const isActive = active === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setActive(item.id)}
                    style={{
                      ...s.navItem,
                      ...(isActive ? s.navItemActive : {}),
                      justifyContent: sidebarCollapsed ? "center" : "flex-start",
                      padding: sidebarCollapsed ? "9px 0" : "8px 10px",
                    }}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }}>
                      <path d={item.icon} />
                    </svg>
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={s.sidebarFooter}>
          {!sidebarCollapsed && (
            <div style={s.userCard}>
              <div style={s.avatar}>{(user?.role || "AD").slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.userName}>{user?.role || "Admin"}</div>
                <div style={s.userOnline}><span style={s.onlineDot} /> Active</div>
              </div>
            </div>
          )}
          <button onClick={handleLogout} style={s.logoutBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
            </svg>
            {!sidebarCollapsed && "Logout"}
          </button>
          {!sidebarCollapsed && (
            <div style={s.poweredBy}>
              Powered by <strong style={{ color: "#537a55" }}>BitLogic</strong> · 0317-8440437
            </div>
          )}
        </div>
      </aside>

      {/* ───── Main content ───── */}
      <div style={s.main}>
        <AnimatePresence mode="wait">
          {showWelcome ? (
            <motion.div key="welcome" style={s.welcome} initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={s.loader} />
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: "#2e7d32", fontSize: 15, fontWeight: 600, margin: "12px 0 0" }}>
                Loading store console…
              </motion.p>
            </motion.div>
          ) : (
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              style={s.contentFrame}
            >
              {/* Top bar */}
              <div style={s.topbar}>
                <div>
                  <h1 style={s.topTitle}>{NAV_ITEMS.find(i => i.id === active)?.label || "Dashboard"}</h1>
                  <div style={s.topDate}>{today}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => setHideFinancials(!hideFinancials)} style={s.toggleBtn}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      {hideFinancials
                        ? <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
                        : <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                      }
                    </svg>
                    {hideFinancials ? "Show" : "Hide"}
                  </button>
                  <div style={s.offlineBadge}><span style={s.onlineDot} /> Offline ready</div>
                </div>
              </div>

              {/* Page content */}
              <div style={s.content}>
                {active === "home" && (
                  <HomeView
                    user={user}
                    summary={summary}
                    monthlyData={monthlyData}
                    topDebtors={topDebtors}
                    hideFinancials={hideFinancials}
                    onNavigate={setActive}
                  />
                )}
                {active === "sales" && <BillingPage />}
                {active === "invoices" && <InvoiceHistory />}
                {active === "products" && <InventoryManagementPage />}
                {active === "customers" && <CustomersPage />}
                {active === "payments" && <PaymentsPage />}
                {active === "settings" && <SettingsPage />}
                {userRole === "admin" && active === "expenses" && <ExpensesPage />}
                {userRole === "admin" && active === "banks" && <BanksPage />}
                {userRole === "admin" && active === "cashbook" && <CashBookPage />}
                {userRole === "admin" && active === "ledger" && <LedgerPage />}
                {userRole === "admin" && active === "coa" && <ChartOfAccountsPage />}
                {userRole === "admin" && active === "analysis" && <AnalysisPage />}
                {userRole === "admin" && active === "reports" && <ReportsPage />}
                {userRole === "admin" && active === "addCompany" && <SuppliersPage />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   HOME VIEW — the actual dashboard content
   ═══════════════════════════════════════════════════════════════ */

function HomeView({ user, summary, monthlyData, topDebtors, hideFinancials, onNavigate }) {
  const todaySales = summary?.todaySales || 0;
  const creditDue = summary?.creditDue || 0;
  const todayExpenses = summary?.todayExpenses || 0;
  const todayProfit = summary?.todayProfit || (todaySales - todayExpenses);
  const lowStock = summary?.lowStockCount || 0;
  const expiring = summary?.expiringSoonCount || 0;
  const todayCash = summary?.todayCashSales || 0;
  const todayCredit = summary?.todayCreditSales || 0;
  const todayTxCount = summary?.todayTransactionCount || 0;
  const recentSales = summary?.recentSales || [];

  const mask = (v) => hideFinancials ? "• • • •" : v;

  // Compute monthly chart data safely
  const chartData = useMemo(() => {
    if (!monthlyData?.length) return [];
    return monthlyData.map(m => ({
      label: `${m.month}`,
      revenue: Math.round(m.revenue || 0),
      expenses: Math.round(m.expenses || 0),
      profit: Math.round(m.profit || 0),
    }));
  }, [monthlyData]);

  // Cash vs credit donut
  const cashCreditData = useMemo(() => {
    const c = todayCash || 0, cr = todayCredit || 0;
    if (c === 0 && cr === 0) return [{ name: "No sales", value: 1 }];
    return [{ name: "Cash", value: c }, { name: "Credit", value: cr }];
  }, [todayCash, todayCredit]);

  return (
    <div style={{ maxWidth: 1480, margin: "0 auto" }}>
      {/* Greeting */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={h.greeting}>Good {getGreetingTime()}, {user?.role || "Admin"}</h1>
        <p style={h.sub}>Here's your store performance at a glance.</p>
      </div>

      {/* ───── Stat cards ───── */}
      <div style={h.statsRow}>
        <StatCard
          icon="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"
          label="Today's Sales"
          value={mask(`Rs ${todaySales.toLocaleString()}`)}
          note={`${todayTxCount} transaction${todayTxCount !== 1 ? "s" : ""}`}
          accent="#1b7a24"
        />
        <StatCard
          icon="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
          label="Today's Profit"
          value={mask(`Rs ${todayProfit.toLocaleString()}`)}
          note={todayProfit >= 0 ? "Net positive" : "Net loss"}
          accent={todayProfit >= 0 ? "#2e7d32" : "#c62828"}
          valueColor={todayProfit >= 0 ? "#1b5e20" : "#c62828"}
        />
        <StatCard
          icon="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
          label="Credit Due"
          value={mask(`Rs ${creditDue.toLocaleString()}`)}
          note="Outstanding receivables"
          accent="#c62828"
          valueColor="#c62828"
        />
        <StatCard
          icon="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"
          label="Today's Expenses"
          value={mask(`Rs ${todayExpenses.toLocaleString()}`)}
          note="Recorded today"
          accent="#e65100"
        />
        <StatCard
          icon="M12 2l-5.5 9h11z M12 22l5.5-9h-11z"
          label="Alerts"
          value={`${lowStock + expiring}`}
          note={`${lowStock} low stock · ${expiring} expiring`}
          accent="#6a1b9a"
        />
      </div>

      {/* ───── Row 2: Monthly chart + Cash/Credit split ───── */}
      <div style={h.row2}>
        {/* Monthly Profit Chart */}
        <div style={{ ...h.card, flex: 3, minWidth: 0 }}>
          <div style={h.cardHead}>
            <h3 style={h.cardTitle}>Monthly Revenue & Profit</h3>
            <span style={h.cardSub}>Last 12 months</span>
          </div>
          {chartData.length > 0 && !hideFinancials ? (
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} barGap={2} barCategoryGap="18%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8f0e8" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6a8f6c" }} axisLine={{ stroke: "#c8d8c8" }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6a8f6c" }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                  />
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid #c8d8c8", borderRadius: 6, fontSize: 12 }}
                    formatter={(v) => [`Rs ${Number(v).toLocaleString()}`, undefined]}
                  />
                  <Bar dataKey="revenue" name="Revenue" fill="#66bb6a" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#ef9a9a" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="profit" name="Profit" fill="#2e7d32" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 13 }}>
              {hideFinancials ? "Financials hidden" : "No monthly data available yet"}
            </div>
          )}
        </div>

        {/* Cash / Credit donut */}
        <div style={{ ...h.card, flex: 1, minWidth: 220, display: "flex", flexDirection: "column" }}>
          <div style={h.cardHead}>
            <h3 style={h.cardTitle}>Today's Split</h3>
            <span style={h.cardSub}>Cash vs Credit</span>
          </div>
          {!hideFinancials ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "100%", height: 170 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={cashCreditData}
                      innerRadius={48} outerRadius={72}
                      dataKey="value" paddingAngle={3}
                      stroke="none"
                    >
                      {cashCreditData.map((_, i) => (
                        <Cell key={i} fill={["#2e7d32", "#ef5350", "#e0e0e0"][i] || "#e0e0e0"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `Rs ${Number(v).toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", gap: 20, fontSize: 12, marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: "#2e7d32", display: "inline-block" }} />
                  Cash
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: "#ef5350", display: "inline-block" }} />
                  Credit
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 13 }}>
              Hidden
            </div>
          )}
        </div>
      </div>

      {/* ───── Row 3: Quick actions + Top debtors + Alerts ───── */}
      <div style={h.row3}>
        {/* Quick Actions */}
        <div style={{ ...h.card, flex: 1 }}>
          <div style={h.cardHead}><h3 style={h.cardTitle}>Quick Actions</h3></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <QuickAction label="New Sale" accent="#2e7d32" onClick={() => onNavigate("sales")} />
            <QuickAction label="Record Payment" accent="#1565c0" onClick={() => onNavigate("payments")} />
            <QuickAction label="Add Expense" accent="#e65100" onClick={() => onNavigate("expenses")} />
            <QuickAction label="View Inventory" accent="#6a1b9a" onClick={() => onNavigate("products")} />
            <QuickAction label="Customer Ledger" accent="#00695c" onClick={() => onNavigate("customers")} />
          </div>
        </div>

        {/* Top Debtors */}
        <div style={{ ...h.card, flex: 2 }}>
          <div style={h.cardHead}>
            <h3 style={h.cardTitle}>Top Debtors</h3>
            <button style={h.linkBtn} onClick={() => onNavigate("customers")}>View all →</button>
          </div>
          {topDebtors.length > 0 && !hideFinancials ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {topDebtors.slice(0, 7).map((d, i) => (
                <div key={i} style={h.debtorRow}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={h.debtorRank}>{i + 1}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1b3a1d" }}>{d.name}</div>
                      {d.phone && <div style={{ fontSize: 11, color: "#888" }}>{d.phone}</div>}
                    </div>
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#c62828" }}>
                    Rs {(d.balance || d.current_balance || 0).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "24px 0", textAlign: "center", color: "#999", fontSize: 13 }}>
              {hideFinancials ? "Financials hidden" : "No outstanding balances"}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div style={{ ...h.card, flex: 1 }}>
          <div style={h.cardHead}><h3 style={h.cardTitle}>Alerts</h3></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <AlertRow
              label="Low Stock Items"
              value={lowStock}
              color={lowStock > 0 ? "#c62828" : "#2e7d32"}
              bg={lowStock > 0 ? "#ffebee" : "#e8f5e9"}
              onClick={() => onNavigate("products")}
            />
            <AlertRow
              label="Expiring Within 90d"
              value={expiring}
              color={expiring > 0 ? "#e65100" : "#2e7d32"}
              bg={expiring > 0 ? "#fff3e0" : "#e8f5e9"}
              onClick={() => onNavigate("products")}
            />
            <AlertRow
              label="Credit Due"
              value={hideFinancials ? "•••" : `Rs ${creditDue.toLocaleString()}`}
              color={creditDue > 0 ? "#c62828" : "#2e7d32"}
              bg={creditDue > 0 ? "#ffebee" : "#e8f5e9"}
              onClick={() => onNavigate("customers")}
            />
          </div>
        </div>
      </div>

      {/* ───── Row 4: Recent transactions ───── */}
      <div style={{ ...h.card, marginTop: 16 }}>
        <div style={h.cardHead}>
          <h3 style={h.cardTitle}>Recent Transactions</h3>
          <button style={h.linkBtn} onClick={() => onNavigate("invoices")}>All invoices →</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={h.table}>
            <thead>
              <tr>
                <th style={h.th}>Invoice</th>
                <th style={h.th}>Customer</th>
                <th style={h.th}>Date</th>
                <th style={h.th}>Method</th>
                <th style={{ ...h.th, textAlign: "right" }}>Amount</th>
                <th style={h.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 13 }}>No recent transactions</td></tr>
              ) : (
                recentSales.slice(0, 8).map((sale, i) => {
                  const status = sale.payment_status || (sale.remaining_amount > 0 ? (sale.paid_amount > 0 ? "Partial" : "Unpaid") : "Paid");
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #f2f7f2" }}>
                      <td style={h.td}>
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#2e7d32", fontWeight: 600 }}>
                          {sale.invoice_number || sale.reference || `#${sale.id}`}
                        </span>
                      </td>
                      <td style={h.td}>{sale.customer_name || "Walk-in"}</td>
                      <td style={h.td}>
                        {sale.date ? new Date(sale.date + "T00:00:00").toLocaleDateString("en-PK", { day: "2-digit", month: "short" }) : "-"}
                      </td>
                      <td style={h.td}>{sale.method || "Cash"}</td>
                      <td style={{ ...h.td, textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>
                        {hideFinancials ? "••••" : `Rs ${(sale.total_amount || sale.total || 0).toLocaleString()}`}
                      </td>
                      <td style={h.td}>
                        <span style={{
                          padding: "3px 10px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          background: status === "Paid" ? "#e8f5e9" : status === "Partial" ? "#fff8e1" : "#ffebee",
                          color: status === "Paid" ? "#2e7d32" : status === "Partial" ? "#f57f17" : "#c62828",
                          borderLeft: `3px solid ${status === "Paid" ? "#2e7d32" : status === "Partial" ? "#f57f17" : "#c62828"}`,
                        }}>
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ───── Overview workspace (existing) ───── */}
      <div style={{ marginTop: 20, paddingBottom: 24 }}>
        <OverviewWorkspace />
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════ */

function StatCard({ icon, label, value, note, accent, valueColor }) {
  return (
    <div style={h.statCard}>
      <div style={{ ...h.statAccent, background: accent }} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ ...h.statIcon, background: accent + "14", color: accent }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d={icon} /></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={h.statLabel}>{label}</div>
          <div style={{ ...h.statValue, color: valueColor || "#1b3a1d" }}>{value}</div>
          <div style={h.statNote}>{note}</div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ label, accent, onClick }) {
  return (
    <button onClick={onClick} style={h.quickBtn}>
      <span style={{ width: 4, height: "100%", minHeight: 16, borderRadius: 2, background: accent, flexShrink: 0 }} />
      {label}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#999" style={{ marginLeft: "auto" }}><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
    </button>
  );
}

function AlertRow({ label, value, color, bg, onClick }) {
  return (
    <div onClick={onClick} style={{ ...h.alertRow, background: bg, cursor: "pointer" }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>{label}</span>
      <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 800, color }}>{value}</span>
    </div>
  );
}

function getGreetingTime() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}


/* ═══════════════════════════════════════
   REPORTS VIEW (kept from original)
   ═══════════════════════════════════════ */
function ReportsView({ summary, hideFinancials }) {
  return (
    <div style={{ maxWidth: 900 }}>
      <div style={h.card}>
        <h2 style={{ fontSize: 17, color: "#1b3a1d", margin: "0 0 4px", fontWeight: 700 }}>Operational Reports</h2>
        <p style={{ fontSize: 13, color: "#6b8a6d", margin: "0 0 16px" }}>
          Current metrics stay compact. Full reporting can expand from the same SQLite sources.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {[
            ["Sales total", hideFinancials ? "••••" : `Rs ${(summary?.todaySales || 0).toLocaleString()}`],
            ["Credit due", hideFinancials ? "••••" : `Rs ${(summary?.creditDue || 0).toLocaleString()}`],
            ["Low stock", summary?.lowStockCount || 0],
            ["Expiring", summary?.expiringSoonCount || 0],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f1f8e9" }}>
              <span style={{ fontSize: 13, color: "#2e7d32" }}>{l}</span>
              <strong style={{ fontSize: 13, color: "#1b3a1d", fontFamily: "monospace" }}>{v}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════ */

const s = {
  app: { display: "flex", height: "100vh", fontFamily: "'Segoe UI', system-ui, sans-serif", overflow: "hidden", background: "#f0f4f0" },

  // Sidebar
  sidebar: {
    background: "linear-gradient(180deg, #f7fbf7 0%, #edf5ed 100%)",
    borderRight: "1px solid #c8d8c8",
    display: "flex", flexDirection: "column", height: "100vh", transition: "width 0.2s ease",
    overflow: "hidden", flexShrink: 0,
  },
  sidebarTop: {
    padding: "12px 10px",
    borderBottom: "1px solid #c8d8c8",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
  },
  logoMark: {
    width: 32, height: 32, borderRadius: 6,
    background: "linear-gradient(135deg, #2e7d32, #1b5e20)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: 0.5, flexShrink: 0,
  },
  brandName: { fontSize: 14, fontWeight: 700, color: "#1b3a1d", lineHeight: 1.2 },
  brandTag: { fontSize: 9, color: "#6a8f6c", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" },
  collapseBtn: {
    background: "none", border: "none", color: "#6a8f6c", cursor: "pointer",
    padding: 4, borderRadius: 4, display: "flex",
  },

  nav: { flex: 1, padding: "8px 6px", display: "flex", flexDirection: "column", overflowY: "auto", overflowX: "hidden" },
  navSection: {
    fontSize: 9, fontWeight: 700, color: "#8aab8c",
    textTransform: "uppercase", letterSpacing: "0.1em",
    padding: "10px 10px 3px", userSelect: "none",
  },
  navItem: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 10px", borderRadius: 6, cursor: "pointer",
    fontSize: 12.5, fontWeight: 500, color: "#3a5d3c",
    transition: "all 0.12s", userSelect: "none",
  },
  navItemActive: {
    background: "#2e7d32", color: "#fff",
    boxShadow: "0 2px 8px rgba(46,125,50,0.25)",
  },

  sidebarFooter: { padding: "8px 8px 4px", borderTop: "1px solid #c8d8c8" },
  userCard: {
    background: "#fff", border: "1px solid #c8e6c9", borderRadius: 6,
    padding: "6px 8px", display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
  },
  avatar: {
    width: 28, height: 28, borderRadius: "50%",
    background: "linear-gradient(135deg, #43a047, #2e7d32)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
  },
  userName: { fontSize: 12, fontWeight: 600, color: "#1b3a1d" },
  userOnline: { display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#43a047" },
  onlineDot: { display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#4caf50", flexShrink: 0 },
  logoutBtn: {
    width: "100%", padding: "7px 0", borderRadius: 6,
    background: "transparent", border: "1px solid #c8d8c8",
    color: "#5a755c", fontSize: 11.5, fontWeight: 500, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  },
  poweredBy: {
    textAlign: "center", padding: "8px 0 6px", fontSize: 9.5,
    color: "#8aab8c", letterSpacing: "0.03em", userSelect: "none",
  },

  // Main
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 },
  welcome: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  loader: { width: 32, height: 32, border: "3px solid #c8e6c9", borderTop: "3px solid #2e7d32", borderRadius: "50%" },
  contentFrame: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" },

  topbar: {
    padding: "10px 22px", borderBottom: "1px solid #d4ddd4",
    background: "#fff", display: "flex", alignItems: "center",
    justifyContent: "space-between", flexShrink: 0,
  },
  topTitle: { fontSize: 16, fontWeight: 700, color: "#1b3a1d", margin: 0 },
  topDate: { fontSize: 11, color: "#6a8f6c", marginTop: 1 },
  toggleBtn: {
    display: "flex", alignItems: "center", gap: 5,
    background: "#f5f8f5", border: "1px solid #c8d8c8", borderRadius: 16,
    padding: "4px 12px", fontSize: 11, color: "#3a5d3c", fontWeight: 600, cursor: "pointer",
  },
  offlineBadge: {
    display: "flex", alignItems: "center", gap: 5,
    background: "#f5f8f5", border: "1px solid #c8d8c8",
    borderRadius: 16, padding: "4px 12px", fontSize: 11, color: "#3a5d3c", fontWeight: 500,
  },

  content: { flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0, padding: "18px 22px" },
};

// Home view styles
const h = {
  greeting: { fontSize: 22, fontWeight: 700, color: "#1b3a1d", margin: 0 },
  sub: { fontSize: 13, color: "#6a8f6c", margin: "3px 0 0" },

  statsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 },
  statCard: {
    background: "#fff", border: "1px solid #d4ddd4", borderRadius: 6,
    padding: "14px 16px", position: "relative", overflow: "hidden",
  },
  statAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  statIcon: {
    width: 36, height: 36, borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  statLabel: { fontSize: 10, fontWeight: 700, color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.06em" },
  statValue: { fontSize: 20, fontWeight: 800, fontFamily: "'Segoe UI', monospace", color: "#1b3a1d", margin: "2px 0 1px", lineHeight: 1.2 },
  statNote: { fontSize: 10.5, color: "#8aab8c" },

  row2: { display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap" },
  row3: { display: "flex", gap: 14, flexWrap: "wrap" },

  card: {
    background: "#fff", border: "1px solid #d4ddd4", borderRadius: 6,
    padding: "16px 18px", minWidth: 0,
  },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 },
  cardTitle: { margin: 0, fontSize: 14, fontWeight: 700, color: "#1b3a1d" },
  cardSub: { fontSize: 11, color: "#8aab8c", fontWeight: 500 },
  linkBtn: {
    background: "none", border: "none", color: "#2e7d32", fontSize: 11,
    fontWeight: 600, cursor: "pointer", padding: 0,
  },

  quickBtn: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 12px", borderRadius: 6,
    border: "1px solid #e8f0e8", background: "#fafff9",
    cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1b3a1d",
    transition: "all 0.1s", textAlign: "left",
  },

  debtorRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "9px 0", borderBottom: "1px solid #f2f7f2",
  },
  debtorRank: {
    width: 22, height: 22, borderRadius: "50%",
    background: "#f5f8f5", border: "1px solid #d4ddd4",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, fontWeight: 700, color: "#6a8f6c", flexShrink: 0,
  },

  alertRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 14px", borderRadius: 6, border: "1px solid #e8e8e8",
  },

  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    padding: "10px 14px", fontSize: 10.5, fontWeight: 700,
    color: "#6a8f6c", textTransform: "uppercase", letterSpacing: "0.05em",
    borderBottom: "2px solid #d4ddd4", textAlign: "left",
  },
  td: { padding: "10px 14px", fontSize: 13, color: "#333" },
};
