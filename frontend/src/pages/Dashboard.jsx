import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import AddCompanyView from "../components/AddCompanyView";
import BillingPage from "./bill";
import InventoryManagementPage from "./inventory";

const NAV_ITEMS = [
  { id: "home", label: "Dashboard", icon: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" },
  { id: "addCompany", label: "Add Company", icon: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" },
  { id: "sales", label: "Billing", icon: "M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM5.1 4H3V2H1v2h2l3.6 7.59L5.25 14c-.16.28-.25.61-.25.96C5 16.1 5.9 17 7 17h14v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63H19c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 23.47 4H5.1z" },
  { id: "products", label: "Products", icon: "M20 4H4v2l8 5 8-5V4zM4 13v7h16v-7l-8 5-8-5z" },
  { id: "reports", label: "Reports", icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z" },
];

const STATS = [
  { label: "Today's Sales", value: "Rs 48,200", change: "↑ 12% vs yesterday", up: true },
  { label: "Orders", value: "134", change: "↑ 8 new today", up: true },
  { label: "Products", value: "286", change: "4 low stock", up: false },
  { label: "Revenue (Mo.)", value: "Rs 3.8L", change: "↑ 6% vs last mo.", up: true },
];

const TRANSACTIONS = [
  { name: "Milk & Bread", time: "2 min ago", amount: "Rs 420" },
  { name: "Electronics", time: "18 min ago", amount: "Rs 5,200" },
  { name: "Groceries", time: "34 min ago", amount: "Rs 1,100" },
  { name: "Beverages", time: "1 hr ago", amount: "Rs 660" },
  { name: "Stationery", time: "2 hr ago", amount: "Rs 310" },
];

const CATEGORIES = [
  { label: "Groceries", pct: 82 },
  { label: "Electronics", pct: 65 },
  { label: "Beverages", pct: 58 },
  { label: "Clothing", pct: 44 },
  { label: "Stationery", pct: 31 },
];

export default function Dashboard() {
  const [active, setActive] = useState("home");
  const [showWelcome, setShowWelcome] = useState(true);
  const navigate = useNavigate();

  let user = {};
    try {
    user = JSON.parse(localStorage.getItem("user")) || {};
    } catch {
    user = {};
    }

useEffect(() => {
  if (!user || !user.role) navigate("/");
}, [navigate]);

  useEffect(() => {
    const t = setTimeout(() => setShowWelcome(false), 2000);
    return () => clearTimeout(t);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/");
  };

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div style={s.app}>
      <aside style={s.sidebar}>
        <div style={s.sidebarLogo}>
          <div style={s.brand}>POS</div>
          <div style={s.tagline}>Point of Sale</div>
        </div>

        <nav style={s.nav}>
          <div style={s.navLabel}>Main</div>
          {NAV_ITEMS.slice(0, 4).map((item) => (
            <NavItem key={item.id} item={item} active={active} onClick={setActive} />
          ))}
          <div style={{ ...s.navLabel, marginTop: 8 }}>Analytics</div>
          <NavItem item={NAV_ITEMS[4]} active={active} onClick={setActive} />
        </nav>

        <div style={s.footer}>
          <div style={s.userCard}>
            <div style={s.avatar}>
              {(user?.role || "AD").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={s.userName}>{user?.role || "Admin"}</div>
              <div style={s.userStatus}>
                <span style={s.statusDot} /> Logged in
              </div>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
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
              <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ color: "#2e7d32", fontSize: 22 }}>
                Welcome To POS
              </motion.h1>
            </motion.div>
          ) : (
           <motion.div
            key={active}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}
          >
              <div style={s.topbar}>
                <div>
                  <div style={s.topbarTitle}>{NAV_ITEMS.find(n => n.id === active)?.label}</div>
                  <div style={s.topbarDate}>{today}</div>
                </div>
                <div style={s.onlineBadge}>
                  <span style={s.onlineDot} /> System Online
                </div>
              </div>

              <div style={s.content}>
                {active === "home" && <HomeView user={user} />}
                {active === "sales" && <BillingPage />}
                {active === "products" && <InventoryManagementPage />}
                {active === "reports" && <PlaceholderView label="Reports" />}
                {active === "addCompany" && <AddCompanyView />}
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
      whileTap={{ scale: 0.97 }}
      onClick={() => onClick(item.id)}
      style={{ ...s.navItem, ...(isActive ? s.navItemActive : {}) }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, opacity: isActive ? 1 : 0.75 }}>
        <path d={item.icon} />
      </svg>
      {item.label}
    </motion.div>
  );
}

function HomeView({ user }) {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 19, fontWeight: 600, color: "#2e7d32" }}>Good day, {user?.role || "Admin"}</h1>
        <p style={{ fontSize: 13, color: "#43a047", marginTop: 2 }}>Here's what's happening with your store today.</p>
      </div>

      <div style={s.statsGrid}>
        {STATS.map((stat, i) => (
          <motion.div key={i} whileHover={{ y: -2 }} style={s.statCard}>
            <div style={{ ...s.statAccent, background: ["#4caf50","#43a047","#388e3c","#2e7d32"][i] }} />
            <div style={s.statLabel}>{stat.label}</div>
            <div style={s.statValue}>{stat.value}</div>
            <div style={{ ...s.statChange, color: stat.up ? "#2e7d32" : "#c62828" }}>{stat.change}</div>
          </motion.div>
        ))}
      </div>

      <div style={s.lowerGrid}>
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Recent Transactions</span>
            <span style={s.panelLink}>View all</span>
          </div>
          {TRANSACTIONS.map((t, i) => (
            <div key={i} style={s.txRow}>
              <div style={s.txIcon}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#4caf50">
                  <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
                </svg>
              </div>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "#2e7d32" }}>{t.name}</span>
              <span style={{ fontSize: 10, color: "#66bb6a", marginRight: 10 }}>{t.time}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#388e3c" }}>{t.amount}</span>
            </div>
          ))}
        </div>

        <div style={s.panel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Top Categories</span>
            <span style={s.panelLink}>Details</span>
          </div>
          {CATEGORIES.map((c, i) => (
            <div key={i} style={s.qRow}>
              <span style={{ fontSize: 12, color: "#388e3c", width: 80 }}>{c.label}</span>
              <div style={s.qBarWrap}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${c.pct}%` }}
                  transition={{ delay: i * 0.07, duration: 0.5 }}
                  style={s.qBar}
                />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#2e7d32", minWidth: 30, textAlign: "right" }}>{c.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function PlaceholderView({ label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: "#66bb6a", gap: 8 }}>
      <p style={{ fontSize: 16, fontWeight: 500, color: "#2e7d32" }}>{label}</p>
      <small style={{ fontSize: 12 }}>Content coming soon</small>
    </div>
  );
}

const s = {
  app: { display: "flex", height: "100vh", fontFamily: "Segoe UI, sans-serif", overflow: "hidden" },
  sidebar: { width: 196, minWidth: 196, background: "#e8f5e9", borderRight: "1px solid #c8e6c9", display: "flex", flexDirection: "column", height: "100vh" },
  sidebarLogo: { padding: "14px 14px 10px", borderBottom: "1px solid #c8e6c9" },
  brand: { fontSize: 17, fontWeight: 700, color: "#2e7d32", letterSpacing: 2 },
  tagline: { fontSize: 9, color: "#43a047", marginTop: 1, letterSpacing: 0.5 },
  nav: { flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" },
  navLabel: { fontSize: 9, fontWeight: 600, color: "#43a047", letterSpacing: 1, textTransform: "uppercase", padding: "4px 6px 2px" },
  navItem: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#2e7d32", transition: "background 0.15s" },
  navItemActive: { background: "#388e3c", color: "#fff" },
  footer: { padding: 10, borderTop: "1px solid #c8e6c9" },
  userCard: { background: "#fff", border: "1px solid #c8e6c9", borderRadius: 8, padding: "7px 9px", display: "flex", alignItems: "center", gap: 8, marginBottom: 7 },
  avatar: { width: 28, height: 28, borderRadius: "50%", background: "#43a047", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 },
  userName: { fontSize: 12, fontWeight: 600, color: "#2e7d32" },
  userStatus: { display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#43a047" },
  statusDot: { display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#4caf50" },
  logoutBtn: { width: "100%", padding: "7px 0", borderRadius: 7, background: "transparent", border: "1px solid #a5d6a7", color: "#2e7d32", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 },
main: {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  background: "#f4faf4",
  overflow: "hidden",    
  minHeight: 0,     
},
  welcome: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 },
  loader: { width: 36, height: 36, border: "3px solid #c8e6c9", borderTop: "3px solid #66bb6a", borderRadius: "50%" },
  topbar: { padding: "12px 22px", borderBottom: "1px solid #c8e6c9", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  topbarTitle: { fontSize: 15, fontWeight: 600, color: "#2e7d32" },
  topbarDate: { fontSize: 11, color: "#43a047" },
  onlineBadge: { display: "flex", alignItems: "center", gap: 5, background: "#e8f5e9", border: "1px solid #c8e6c9", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: "#388e3c", fontWeight: 500 },
  onlineDot: { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#4caf50" },
content: {
  flex: 1,
  overflowY: "auto",   
  overflowX: "hidden",
  minHeight: 0,         
  padding: "0",          
},
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 },
  statCard: { background: "#fff", border: "1px solid #c8e6c9", borderRadius: 9, padding: "12px 14px", position: "relative", overflow: "hidden" },
  statAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: "9px 9px 0 0" },
  statLabel: { fontSize: 10, color: "#43a047", fontWeight: 500, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: 700, color: "#2e7d32" },
  statChange: { fontSize: 10, marginTop: 2 },
  lowerGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  panel: { background: "#fff", border: "1px solid #c8e6c9", borderRadius: 9, padding: "12px 14px" },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  panelTitle: { fontSize: 12, fontWeight: 600, color: "#2e7d32" },
  panelLink: { fontSize: 11, color: "#43a047", cursor: "pointer", textDecoration: "underline" },
  txRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f1f8e9" },
  txIcon: { width: 26, height: 26, borderRadius: 6, background: "#f1f8e9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  qRow: { display: "flex", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f1f8e9", gap: 8 },
  qBarWrap: { flex: 1, height: 5, background: "#c8e6c9", borderRadius: 10, overflow: "hidden" },
  qBar: { height: "100%", background: "#4caf50", borderRadius: 10 },
};