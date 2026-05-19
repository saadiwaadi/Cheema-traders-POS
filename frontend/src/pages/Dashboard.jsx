import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import SuppliersPage from "./suppliers";
import BillingPage from "./bill";
import InventoryManagementPage from "./inventory";
import CustomersPage from "./customers";
import ExpensesPage from "./expenses";
import LedgerPage from "./ledger";
import CashBookPage from "./CashBook";
import BanksPage from "./banks";
import AnalysisPage from "./analysis/AnalysisShell";
import { getDashboardSummary } from "../lib/posApi";
import OverviewWorkspace from "./analysis/OverviewWorkspace";

const NAV_ITEMS = [
  { id: "home", label: "Dashboard", icon: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" },
  { id: "addCompany", label: "Suppliers", icon: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" },
  { id: "customers", label: "Customers", icon: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" },
  { id: "sales", label: "Billing", icon: "M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM5.1 4H3V2H1v2h2l3.6 7.59L5.25 14c-.16.28-.25.61-.25.96C5 16.1 5.9 17 7 17h14v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63H19c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 23.47 4H5.1z" },
  { id: "products", label: "Inventory", icon: "M20 4H4v2l8 5 8-5V4zM4 13v7h16v-7l-8 5-8-5z" },
  { id: "expenses", label: "Expenses", icon: "M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V9H12v9zm4-5.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" },
  { id: "banks", label: "Banks", icon: "M4 10h3v7H4zm6.5 0h3v7h-3zM2 19h20v3H2zm15-9h3v7h-3zm-5-9L2 6v2h20V6z" },
  { id: "cashbook", label: "Cash Book", icon: "M2 4v16h20V4H2zm18 14H4V6h16v12zm-9-9h2v2h-2zm0 4h2v2h-2zm-4-4h2v2H7zm0 4h2v2H7zm8-4h2v2h-2zm0 4h2v2h-2z" },
  { id: "ledger", label: "Ledger", icon: "M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z" },
  { id: "analysis", label: "Analysis", icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" },
  { id: "reports", label: "Reports", icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z" },
];

export default function Dashboard() {
  const [active, setActive] = useState("home");
  const [showWelcome, setShowWelcome] = useState(true);
  const [summary, setSummary] = useState(null);
  const [hideFinancials, setHideFinancials] = useState(false);
  const navigate = useNavigate();

  let user;
  try {
    user = JSON.parse(localStorage.getItem("user")) || {};
  } catch {
    user = {};
  }
  const userRole = user?.role;

  useEffect(() => {
    if (!userRole) navigate("/");
  }, [navigate, userRole]);

  useEffect(() => {
    const timer = setTimeout(() => setShowWelcome(false), 1400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    getDashboardSummary()
      .then((data) => {
        if (alive) setSummary(data);
      })
      .catch(() => {
        if (alive) setSummary(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/");
  };

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div style={s.app}>
      <aside style={s.sidebar}>
        <div style={s.sidebarLogo}>
          <div style={s.brand}>POS</div>
          <div style={s.tagline}>Operational retail system</div>
        </div>

        <nav style={s.nav}>
          <div style={s.navLabel}>Main</div>
          {NAV_ITEMS.filter(item => {
            if (userRole !== "admin") {
              return ["home", "sales", "products", "customers"].includes(item.id);
            }
            return true;
          }).map((item) => (
            <NavItem key={item.id} item={item} active={active} onClick={setActive} />
          ))}
        </nav>

        <div style={s.footer}>
          <div style={s.userCard}>
            <div style={s.avatar}>{(user?.role || "AD").slice(0, 2).toUpperCase()}</div>
            <div>
              <div style={s.userName}>{user?.role || "Admin"}</div>
              <div style={s.userStatus}>
                <span style={s.statusDot} /> Logged in
              </div>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            style={s.logoutBtn}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
            </svg>
            Logout
          </motion.button>
        </div>
      </aside>

      <div style={s.main}>
        <AnimatePresence mode="wait">
          {showWelcome ? (
            <motion.div key="welcome" style={s.welcome} initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} style={s.loader} />
              <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={s.welcomeTitle}>
                Opening store console
              </motion.h1>
            </motion.div>
          ) : (
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              style={s.contentFrame}
            >
              <div style={s.topbar}>
                <div>
                  <div style={s.topbarTitle}>{NAV_ITEMS.find((item) => item.id === active)?.label}</div>
                  <div style={s.topbarDate}>{today}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={() => setHideFinancials(!hideFinancials)}
                    style={{ background: "none", border: "1px solid #c8e6c9", borderRadius: 20, padding: "3px 10px", fontSize: 11, cursor: "pointer", color: "#388e3c", fontWeight: 600 }}
                  >
                    {hideFinancials ? "Show Amounts" : "Hide Amounts"}
                  </button>
                  <div style={s.onlineBadge}>
                    <span style={s.onlineDot} /> Offline ready
                  </div>
                </div>
              </div>

              <div style={s.content}>
                {active === "home" && <HomeView user={user} summary={summary} hideFinancials={hideFinancials} />}
                {active === "sales" && <BillingPage />}
                {active === "products" && <InventoryManagementPage />}
                {active === "customers" && <CustomersPage />}
                {userRole === "admin" && active === "expenses" && <ExpensesPage />}
                {userRole === "admin" && active === "banks" && <BanksPage />}
                {userRole === "admin" && active === "cashbook" && <CashBookPage />}
                {userRole === "admin" && active === "ledger" && <LedgerPage />}
                {userRole === "admin" && active === "analysis" && <AnalysisPage />}
                {userRole === "admin" && active === "reports" && <ReportsView summary={summary} hideFinancials={hideFinancials} />}
                {userRole === "admin" && active === "addCompany" && <SuppliersPage />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function NavItem({ item, active, onClick }) {
  const isActive = active === item.id;
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick(item.id)}
      style={{ ...s.navItem, ...(isActive ? s.navItemActive : {}) }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, opacity: isActive ? 1 : 0.8 }}>
        <path d={item.icon} />
      </svg>
      {item.label}
    </motion.div>
  );
}

function HomeView({ user, summary, hideFinancials }) {
  const stats = [
    { label: "Today's Sales", value: hideFinancials ? "****" : `Rs ${(summary?.todaySales || 0).toFixed(0)}`, note: "Sales captured today" },
    { label: "Credit Due", value: hideFinancials ? "****" : `Rs ${(summary?.creditDue || 0).toFixed(0)}`, note: "Outstanding balance" },
    { label: "Low Stock", value: `${summary?.lowStockCount || 0}`, note: "Items under threshold" },
    { label: "Expiring Soon", value: `${summary?.expiringSoonCount || 0}`, note: "Within 90 days" },
  ];

  const recentSales = summary?.recentSales || [];

  return (
    <>
      <div style={s.sectionHeading}>
        <div>
          <h1 style={s.greeting}>Good day, {user?.role || "Admin"}</h1>
          <p style={s.subtle}>Quiet visibility for billing, inventory, and stock rotation.</p>
        </div>
      </div>

      <div style={s.statsGrid}>
        {stats.map((stat, index) => (
          <div key={stat.label} style={s.statCard}>
            <div style={{ ...s.statAccent, background: ["#4caf50", "#43a047", "#388e3c", "#2e7d32"][index] }} />
            <div style={s.statLabel}>{stat.label}</div>
            <div style={s.statValue}>{stat.value}</div>
            <div style={s.statNote}>{stat.note}</div>
          </div>
        ))}
      </div>


      <div style={{ marginTop: 24, paddingBottom: 24 }}>
        <OverviewWorkspace />
      </div>
    </>
  );
}

function ReportsView({ summary, hideFinancials }) {
  return (
    <div style={s.reportFrame}>
      <div style={s.reportCard}>
        <h2 style={s.reportTitle}>Operational reports</h2>
        <p style={s.reportText}>Current metrics stay intentionally compact. The full reporting layer can expand from the same SQLite sources without changing the workflow surface.</p>
        <div style={s.reportGrid}>
          <SnapshotLine label="Sales total" value={hideFinancials ? "****" : `Rs ${(summary?.todaySales || 0).toFixed(0)}`} />
          <SnapshotLine label="Credit due" value={hideFinancials ? "****" : `Rs ${(summary?.creditDue || 0).toFixed(0)}`} />
          <SnapshotLine label="Low stock" value={summary?.lowStockCount || 0} />
          <SnapshotLine label="Expiring soon" value={summary?.expiringSoonCount || 0} />
        </div>
      </div>
    </div>
  );
}

function SnapshotLine({ label, value }) {
  return (
    <div style={s.snapshotRow}>
      <span style={s.snapshotLabel}>{label}</span>
      <strong style={s.snapshotValue}>{value}</strong>
    </div>
  );
}

const s = {
  app: { display: "flex", height: "100vh", fontFamily: "Segoe UI, sans-serif", overflow: "hidden", background: "#edf4ed" },
  sidebar: { width: 204, minWidth: 204, background: "#e8f5e9", borderRight: "1px solid #c8e6c9", display: "flex", flexDirection: "column", height: "100vh" },
  sidebarLogo: { padding: "14px 14px 10px", borderBottom: "1px solid #c8e6c9" },
  brand: { fontSize: 17, fontWeight: 700, color: "#2e7d32", letterSpacing: 1 },
  tagline: { fontSize: 10, color: "#558f57", marginTop: 2 },
  nav: { flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" },
  navLabel: { fontSize: 9, fontWeight: 600, color: "#43a047", letterSpacing: 1, textTransform: "uppercase", padding: "4px 6px 2px" },
  navItem: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#2e7d32" },
  navItemActive: { background: "#388e3c", color: "#fff" },
  footer: { padding: 10, borderTop: "1px solid #c8e6c9" },
  userCard: { background: "#fff", border: "1px solid #c8e6c9", borderRadius: 8, padding: "7px 9px", display: "flex", alignItems: "center", gap: 8, marginBottom: 7 },
  avatar: { width: 28, height: 28, borderRadius: "50%", background: "#43a047", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 },
  userName: { fontSize: 12, fontWeight: 600, color: "#2e7d32" },
  userStatus: { display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#43a047" },
  statusDot: { display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#4caf50" },
  logoutBtn: { width: "100%", padding: "7px 0", borderRadius: 7, background: "transparent", border: "1px solid #a5d6a7", color: "#2e7d32", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 },
  welcome: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 },
  loader: { width: 36, height: 36, border: "3px solid #c8e6c9", borderTop: "3px solid #66bb6a", borderRadius: "50%" },
  welcomeTitle: { color: "#2e7d32", fontSize: 18, margin: 0, fontWeight: 600 },
  contentFrame: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" },
  topbar: { padding: "12px 22px", borderBottom: "1px solid #c8e6c9", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  topbarTitle: { fontSize: 15, fontWeight: 600, color: "#2e7d32" },
  topbarDate: { fontSize: 11, color: "#558f57" },
  onlineBadge: { display: "flex", alignItems: "center", gap: 5, background: "#e8f5e9", border: "1px solid #c8e6c9", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: "#388e3c", fontWeight: 500 },
  onlineDot: { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#4caf50" },
  content: { flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0, padding: 18 },
  sectionHeading: { marginBottom: 16 },
  greeting: { fontSize: 19, fontWeight: 600, color: "#2e7d32", margin: 0 },
  subtle: { fontSize: 13, color: "#558f57", marginTop: 3 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 },
  statCard: { background: "#fff", border: "1px solid #c8e6c9", borderRadius: 8, padding: "12px 14px", position: "relative", overflow: "hidden" },
  statAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: "8px 8px 0 0" },
  statLabel: { fontSize: 10, color: "#558f57", fontWeight: 500, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: 700, color: "#2e7d32" },
  statNote: { fontSize: 10, marginTop: 2, color: "#6b8a6d" },
  lowerGrid: { display: "grid", gridTemplateColumns: "1fr", gap: 12 },
  panel: { background: "#fff", border: "1px solid #c8e6c9", borderRadius: 8, padding: "12px 14px", minHeight: 280 },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  panelTitle: { fontSize: 12, fontWeight: 600, color: "#2e7d32" },
  panelLink: { fontSize: 11, color: "#558f57" },
  tableList: { display: "flex", flexDirection: "column", gap: 0 },
  emptyState: { padding: "8px 0", fontSize: 12, color: "#6b8a6d" },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #f1f8e9" },
  rowMain: { minWidth: 0, flex: 1 },
  rowTitle: { fontSize: 12, fontWeight: 600, color: "#2e7d32" },
  rowMeta: { fontSize: 10, color: "#6b8a6d", marginTop: 1 },
  rowAmount: { fontSize: 12, fontWeight: 600, color: "#388e3c", whiteSpace: "nowrap" },
  snapshotList: { display: "flex", flexDirection: "column", gap: 8 },
  snapshotRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f8e9" },
  snapshotLabel: { fontSize: 12, color: "#2e7d32" },
  snapshotValue: { fontSize: 12, color: "#16341b" },
  reportFrame: { maxWidth: 900 },
  reportCard: { background: "#fff", border: "1px solid #c8e6c9", borderRadius: 8, padding: 16 },
  reportTitle: { fontSize: 16, color: "#2e7d32", margin: 0 },
  reportText: { fontSize: 13, color: "#6b8a6d", marginTop: 6, marginBottom: 14 },
  reportGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 },
};
