export const st = {
  page: { minHeight: "100%", background: "#f1f6f1", fontFamily: "Segoe UI, sans-serif", color: "#1d351f" },
  shell: { padding: 20, display: "flex", flexDirection: "column", gap: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { margin: 0, fontSize: 24, fontWeight: 700, color: "#1d351f" },
  subtitle: { marginTop: 5, fontSize: 13, color: "#708571" },
  exportBtn: { height: 40, padding: "0 18px", borderRadius: 10, border: "1px solid #d8e5d8", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#355437" },

  navStrip: { display: "flex", gap: 4, background: "#e4ede4", borderRadius: 12, padding: 4 },
  navBtn: { flex: 1, padding: "10px 0", border: "none", borderRadius: 9, background: "transparent", fontSize: 13, fontWeight: 600, color: "#5a755c", cursor: "pointer" },
  navBtnActive: { background: "#fff", color: "#1d351f", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },

  statusBar: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 },
  statusCard: { background: "#fff", border: "1px solid #dbe8db", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 },
  statusLabel: { fontSize: 11, color: "#718872", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 },
  statusValue: { fontSize: 20, color: "#1d351f", fontWeight: 700 },

  mainGrid: { display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 16, alignItems: "start" },
  workspaceBody: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 },

  rightPanel: { display: "flex", flexDirection: "column", gap: 16 },
  sideCard: { background: "#fff", border: "1px solid #dbe8db", borderRadius: 14, padding: 18 },
  sideTitle: { margin: 0, marginBottom: 14, fontSize: 15, fontWeight: 700, color: "#1d351f" },
  metricList: { display: "flex", flexDirection: "column", gap: 8 },
  metricRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: 10, background: "#f8fbf8", border: "1px solid #e4eee4", fontSize: 13, color: "#355437" },
  metricHighlight: { background: "#edf8ed", border: "1px solid #cfe1cf", fontWeight: 600 },
  insightList: { display: "flex", flexDirection: "column", gap: 8 },
  insightItem: { padding: "12px 14px", borderRadius: 10, background: "#f8fbf8", border: "1px solid #e4eee4", fontSize: 13, lineHeight: 1.55, color: "#4a634b" },
  activityList: { display: "flex", flexDirection: "column", gap: 8 },
  activityItem: { padding: "11px 14px", borderRadius: 10, background: "#f8fbf8", border: "1px solid #e4eee4", fontSize: 13, color: "#4a634b" },

  card: { background: "#fff", border: "1px solid #dbe8db", borderRadius: 14, padding: 18 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  cardTitle: { margin: 0, fontSize: 17, fontWeight: 700, color: "#1d351f" },
  cardSubtext: { marginTop: 4, fontSize: 12, color: "#7b907c" },

  tableHead: { display: "flex", alignItems: "center", gap: 10, padding: "0 4px 10px", borderBottom: "2px solid #edf3ed", fontSize: 11, fontWeight: 700, color: "#708571", textTransform: "uppercase", letterSpacing: 0.4 },
  tableRow: { display: "flex", alignItems: "center", gap: 10, padding: "13px 4px", borderBottom: "1px solid #f1f5f1", fontSize: 14, color: "#2a4a2c" },
  cellBold: { fontWeight: 600, color: "#1d351f" },
  cellMuted: { color: "#708571", fontSize: 13 },

  badge: { display: "inline-block", padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, textAlign: "center", textTransform: "capitalize", whiteSpace: "nowrap" },
  badgeWarning: { background: "#fff4dc", color: "#8b6500" },
  badgeDanger: { background: "#fff0f0", color: "#ba2f2f" },
  badgeNeutral: { background: "#eef6ee", color: "#3d6f40" },
  badgeSuccess: { background: "#e6f4e6", color: "#2a6e2e" },

  agingGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 },
  agingCard: { background: "#f8fbf8", border: "1px solid #e4eee4", borderRadius: 12, padding: "14px 16px", textAlign: "center" },
  agingLabel: { fontSize: 11, fontWeight: 700, color: "#708571", textTransform: "uppercase", marginBottom: 6 },
  agingValue: { fontSize: 20, fontWeight: 700, color: "#1d351f" },
  agingCount: { fontSize: 11, color: "#708571", marginTop: 4 },

  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 },
  summaryCard: { background: "#f8fbf8", border: "1px solid #e4eee4", borderRadius: 12, padding: "14px 16px" },
  summaryLabel: { fontSize: 11, fontWeight: 700, color: "#708571", textTransform: "uppercase", marginBottom: 6 },
  summaryValue: { fontSize: 18, fontWeight: 700, color: "#1d351f" },

  barTrack: { width: "100%", height: 6, background: "#edf5ed", borderRadius: 999, overflow: "hidden" },
  barFill: { height: "100%", background: "#6da56f", borderRadius: 999 },

  emptyState: { padding: "32px 0", textAlign: "center", fontSize: 14, color: "#8a9f8b" },
  compRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: 10, background: "#f8fbf8", border: "1px solid #e4eee4", fontSize: 14, marginBottom: 8 },
};
