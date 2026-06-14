export const st = {
  page: { minHeight: "100%", background: "var(--background)", fontFamily: "Segoe UI, sans-serif", color: "var(--text-primary)" },
  shell: { padding: 20, display: "flex", flexDirection: "column", gap: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { margin: 0, fontSize: 24, fontWeight: 700, color: "var(--text-primary)" },
  subtitle: { marginTop: 5, fontSize: 13, color: "var(--text-secondary)" },
  exportBtn: { height: 40, padding: "0 18px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-primary)" },

  navStrip: { display: "flex", gap: 6, background: "var(--border)", borderRadius: 12, padding: 4, width: "fit-content" },
  navBtn: { padding: "10px 20px", border: "none", borderRadius: 9, background: "transparent", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s ease" },
  navBtnActive: { background: "var(--surface)", color: "var(--text-primary)", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },

  statusBar: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 },
  statusCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 },
  statusLabel: { fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 },
  statusValue: { fontSize: 20, color: "var(--text-primary)", fontWeight: 700 },

  mainGrid: { display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 16, alignItems: "start" },
  workspaceBody: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 },

  rightPanel: { display: "flex", flexDirection: "column", gap: 16 },
  sideCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 18 },
  sideTitle: { margin: 0, marginBottom: 14, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" },
  metricList: { display: "flex", flexDirection: "column", gap: 8 },
  metricRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: 10, background: "var(--surface-secondary)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text-primary)" },
  metricHighlight: { background: "rgba(46, 125, 50, 0.15)", border: "1px solid var(--success)", fontWeight: 600 },
  insightList: { display: "flex", flexDirection: "column", gap: 8 },
  insightItem: { padding: "12px 14px", borderRadius: 10, background: "var(--surface-secondary)", border: "1px solid var(--border)", fontSize: 13, lineHeight: 1.55, color: "var(--text-primary)" },
  activityList: { display: "flex", flexDirection: "column", gap: 8 },
  activityItem: { padding: "11px 14px", borderRadius: 10, background: "var(--surface-secondary)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text-secondary)" },

  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 18 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  cardTitle: { margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text-primary)" },
  cardSubtext: { marginTop: 4, fontSize: 12, color: "var(--text-secondary)" },

  tableHead: { display: "flex", alignItems: "center", gap: 10, padding: "0 4px 10px", borderBottom: "2px solid var(--border)", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.4 },
  tableRow: { display: "flex", alignItems: "center", gap: 10, padding: "13px 4px", borderBottom: "1px solid var(--border)", fontSize: 14, color: "var(--text-primary)" },
  cellBold: { fontWeight: 600, color: "var(--text-primary)" },
  cellMuted: { color: "var(--text-secondary)", fontSize: 13 },

  badge: { display: "inline-block", padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, textAlign: "center", textTransform: "capitalize", whiteSpace: "nowrap" },
  badgeWarning: { background: "#fff4dc", color: "#8b6500" },
  badgeDanger: { background: "#fff0f0", color: "#ba2f2f" },
  badgeNeutral: { background: "rgba(46, 125, 50, 0.1)", color: "var(--success)" },
  badgeSuccess: { background: "rgba(46, 125, 50, 0.15)", color: "var(--success)" },

  agingGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 },
  agingCard: { background: "var(--surface-secondary)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", textAlign: "center" },
  agingLabel: { fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 6 },
  agingValue: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)" },
  agingCount: { fontSize: 11, color: "var(--text-secondary)", marginTop: 4 },

  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 },
  summaryCard: { background: "var(--surface-secondary)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" },
  summaryLabel: { fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 6 },
  summaryValue: { fontSize: 18, fontWeight: 700, color: "var(--text-primary)" },

  barTrack: { width: "100%", height: 6, background: "var(--border)", borderRadius: 999, overflow: "hidden" },
  barFill: { height: "100%", background: "#6da56f", borderRadius: 999 },

  emptyState: { padding: "32px 0", textAlign: "center", fontSize: 14, color: "var(--text-secondary)" },
  compRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: 10, background: "var(--surface-secondary)", border: "1px solid var(--border)", fontSize: 14, marginBottom: 8 },
};
