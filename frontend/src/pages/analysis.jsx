export default function AnalysisPage() {
    const stockAlerts = [
        {
            product: "Roundup",
            issue: "Expiry Risk",
            detail: "Expires in 18 days",
            status: "warning",
        },
        {
            product: "Mospilan",
            issue: "Low Stock",
            detail: "Only 8 bottles left",
            status: "danger",
        },
        {
            product: "Coragen",
            issue: "Slow Movement",
            detail: "No sales in 22 days",
            status: "neutral",
        },
    ];

    const inventoryData = [
        {
            product: "Roundup",
            sold: 142,
            stock: 88,
            expiry: "12 Aug 2026",
            trend: "Fast",
        },
        {
            product: "Mospilan",
            sold: 118,
            stock: 14,
            expiry: "08 Jul 2026",
            trend: "Low Stock",
        },
        {
            product: "Coragen",
            sold: 74,
            stock: 42,
            expiry: "18 Sep 2026",
            trend: "Stable",
        },
        {
            product: "Confidor",
            sold: 52,
            stock: 20,
            expiry: "22 Nov 2026",
            trend: "Normal",
        },
    ];

    return (
        <div style={st.page}>
            <div style={st.main}>
                {/* HEADER */}
                <div style={st.header}>
                    <div>
                        <h1 style={st.title}>Operational Analysis</h1>
                        <p style={st.subtitle}>
                            Inventory movement, stock awareness and financial overview.
                        </p>
                    </div>

                    <div style={st.headerRight}>
                        <button style={st.headerBtn}>Export Report</button>
                    </div>
                </div>

                {/* TOP STATUS */}
                <div style={st.topBar}>
                    <StatusCard label="Today's Sales" value="Rs 148,200" />
                    <StatusCard label="Cash In Hand" value="Rs 84,000" />
                    <StatusCard label="Supplier Dues" value="Rs 245,000" />
                    <StatusCard label="Credit Outstanding" value="Rs 212,400" />
                    <StatusCard label="Inventory Value" value="Rs 2.8M" />
                </div>

                {/* MAIN GRID */}
                <div style={st.mainGrid}>
                    {/* LEFT */}
                    <div style={st.leftSection}>
                        {/* ATTENTION CENTER */}
                        <div style={st.card}>
                            <div style={st.cardTop}>
                                <div>
                                    <h2 style={st.cardTitle}>Attention Required</h2>
                                    <p style={st.cardSubtext}>
                                        Products and operations needing review.
                                    </p>
                                </div>
                            </div>

                            <div style={st.alertTable}>
                                <div style={st.alertHead}>
                                    <span style={{ flex: 2 }}>Product</span>
                                    <span style={{ flex: 1.2 }}>Issue</span>
                                    <span style={{ flex: 2 }}>Details</span>
                                    <span style={{ width: 90 }}>Status</span>
                                </div>

                                {stockAlerts.map((item, index) => (
                                    <div key={index} style={st.alertRow}>
                                        <span style={{ flex: 2, fontWeight: 600 }}>
                                            {item.product}
                                        </span>

                                        <span style={{ flex: 1.2 }}>{item.issue}</span>

                                        <span style={{ flex: 2 }}>{item.detail}</span>

                                        <div style={{ width: 90 }}>
                                            <div
                                                style={{
                                                    ...st.statusBadge,
                                                    ...(item.status === "warning"
                                                        ? st.warningBadge
                                                        : item.status === "danger"
                                                            ? st.dangerBadge
                                                            : st.normalBadge),
                                                }}
                                            >
                                                {item.status}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* MOVEMENT TABLE */}
                        <div style={st.card}>
                            <div style={st.cardTop}>
                                <div>
                                    <h2 style={st.cardTitle}>Inventory Movement</h2>
                                    <p style={st.cardSubtext}>
                                        Fast moving and active inventory overview.
                                    </p>
                                </div>
                            </div>

                            <div style={st.inventoryTable}>
                                <div style={st.inventoryHead}>
                                    <span style={{ flex: 2 }}>Product</span>
                                    <span style={{ flex: 1 }}>Units Sold</span>
                                    <span style={{ flex: 1 }}>Current Stock</span>
                                    <span style={{ flex: 1.2 }}>Expiry</span>
                                    <span style={{ width: 120 }}>Trend</span>
                                </div>

                                {inventoryData.map((item, index) => (
                                    <div key={index} style={st.inventoryRow}>
                                        <span style={{ flex: 2, fontWeight: 600 }}>
                                            {item.product}
                                        </span>

                                        <span style={{ flex: 1 }}>{item.sold}</span>

                                        <span style={{ flex: 1 }}>{item.stock}</span>

                                        <span style={{ flex: 1.2 }}>{item.expiry}</span>

                                        <div style={{ width: 120 }}>
                                            <div style={st.trendTag}>{item.trend}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT */}
                    <div style={st.rightSection}>
                        <div style={st.sideCard}>
                            <h3 style={st.sideTitle}>Financial Overview</h3>

                            <div style={st.metricList}>
                                <MetricRow
                                    label="Today's Profit"
                                    value="Rs 18,400"
                                    highlight
                                />

                                <MetricRow
                                    label="Pending Supplier Payments"
                                    value="Rs 245,000"
                                />

                                <MetricRow
                                    label="Customer Credit"
                                    value="Rs 212,400"
                                />

                                <MetricRow
                                    label="Expenses Today"
                                    value="Rs 8,200"
                                />
                            </div>
                        </div>

                        <div style={st.sideCard}>
                            <h3 style={st.sideTitle}>Quick Insights</h3>

                            <div style={st.insightList}>
                                <div style={st.insightItem}>
                                    Roundup sales increasing rapidly. Consider restocking within 5 days.
                                </div>

                                <div style={st.insightItem}>
                                    Mospilan approaching low stock threshold.
                                </div>

                                <div style={st.insightItem}>
                                    Coragen inventory movement slowing down this month.
                                </div>
                            </div>
                        </div>

                        <div style={st.sideCard}>
                            <h3 style={st.sideTitle}>Recent Activity</h3>

                            <div style={st.activityList}>
                                <div style={st.activityItem}>
                                    Invoice INV-1042 edited.
                                </div>

                                <div style={st.activityItem}>
                                    New supplier payment recorded.
                                </div>

                                <div style={st.activityItem}>
                                    Inventory batch added for Roundup.
                                </div>

                                <div style={st.activityItem}>
                                    Product pricing updated for Mospilan.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* COMPONENTS */

function StatusCard({ label, value }) {
    return (
        <div style={st.statusCard}>
            <span style={st.statusLabel}>{label}</span>
            <strong style={st.statusValue}>{value}</strong>
        </div>
    );
}

function MetricRow({ label, value, highlight }) {
    return (
        <div
            style={{
                ...st.metricRow,
                ...(highlight ? st.metricHighlight : {}),
            }}
        >
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

/* STYLES */

const st = {
    page: {
        minHeight: "100vh",
        background: "#f1f6f1",
        fontFamily: "Segoe UI, sans-serif",
        color: "#1d351f",
    },

    main: {
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 18,
    },

    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
    },

    title: {
        margin: 0,
        fontSize: 24,
        fontWeight: 700,
    },

    subtitle: {
        marginTop: 6,
        fontSize: 13,
        color: "#708571",
    },

    headerRight: {
        display: "flex",
        alignItems: "center",
    },

    headerBtn: {
        height: 42,
        padding: "0 18px",
        borderRadius: 10,
        border: "1px solid #d8e5d8",
        background: "#ffffff",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        color: "#355437",
    },

    topBar: {
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 14,
    },

    statusCard: {
        background: "#ffffff",
        border: "1px solid #dbe8db",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
    },

    statusLabel: {
        fontSize: 12,
        color: "#718872",
        fontWeight: 600,
    },

    statusValue: {
        fontSize: 22,
        color: "#1d351f",
        fontWeight: 700,
    },

    mainGrid: {
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        gap: 18,
        alignItems: "start",
    },

    leftSection: {
        display: "flex",
        flexDirection: "column",
        gap: 18,
    },

    rightSection: {
        display: "flex",
        flexDirection: "column",
        gap: 18,
    },

    card: {
        background: "#ffffff",
        border: "1px solid #dbe8db",
        borderRadius: 14,
        padding: 18,
    },

    sideCard: {
        background: "#ffffff",
        border: "1px solid #dbe8db",
        borderRadius: 14,
        padding: 18,
    },

    cardTop: {
        marginBottom: 16,
    },

    cardTitle: {
        margin: 0,
        fontSize: 17,
        fontWeight: 700,
    },

    cardSubtext: {
        marginTop: 5,
        fontSize: 12,
        color: "#7b907c",
    },

    alertTable: {
        display: "flex",
        flexDirection: "column",
    },

    alertHead: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 4px 10px",
        borderBottom: "2px solid #edf3ed",
        fontSize: 11,
        fontWeight: 700,
        color: "#708571",
        textTransform: "uppercase",
    },

    alertRow: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 4px",
        borderBottom: "1px solid #f1f5f1",
        fontSize: 14,
    },

    statusBadge: {
        padding: "7px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        textAlign: "center",
        textTransform: "capitalize",
    },

    warningBadge: {
        background: "#fff4dc",
        color: "#8b6500",
    },

    dangerBadge: {
        background: "#fff0f0",
        color: "#ba2f2f",
    },

    normalBadge: {
        background: "#eef6ee",
        color: "#3d6f40",
    },

    inventoryTable: {
        display: "flex",
        flexDirection: "column",
    },

    inventoryHead: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 4px 10px",
        borderBottom: "2px solid #edf3ed",
        fontSize: 11,
        fontWeight: 700,
        color: "#708571",
        textTransform: "uppercase",
    },

    inventoryRow: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 4px",
        borderBottom: "1px solid #f1f5f1",
        fontSize: 14,
    },

    trendTag: {
        background: "#eef6ee",
        color: "#3d6f40",
        borderRadius: 999,
        padding: "7px 10px",
        fontSize: 12,
        fontWeight: 700,
        textAlign: "center",
    },

    sideTitle: {
        margin: 0,
        marginBottom: 14,
        fontSize: 16,
        fontWeight: 700,
    },

    metricList: {
        display: "flex",
        flexDirection: "column",
        gap: 10,
    },

    metricRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "13px 14px",
        borderRadius: 10,
        background: "#f8fbf8",
        border: "1px solid #e4eee4",
        fontSize: 14,
    },

    metricHighlight: {
        background: "#edf8ed",
        border: "1px solid #cfe1cf",
    },

    insightList: {
        display: "flex",
        flexDirection: "column",
        gap: 10,
    },

    insightItem: {
        padding: "14px 14px",
        borderRadius: 10,
        background: "#f8fbf8",
        border: "1px solid #e4eee4",
        fontSize: 13,
        lineHeight: 1.5,
        color: "#4a634b",
    },

    activityList: {
        display: "flex",
        flexDirection: "column",
        gap: 10,
    },

    activityItem: {
        padding: "13px 14px",
        borderRadius: 10,
        background: "#f8fbf8",
        border: "1px solid #e4eee4",
        fontSize: 13,
        color: "#4a634b",
    },
};
