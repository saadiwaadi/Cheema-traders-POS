import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * WarningNotification
 *
 * Usage (identical to SuccessNotification):
 *
 *   const [warnData, setWarnData] = useState(null);
 *
 *   setWarnData({
 *     title: "Credit Limit Exceeded",
 *     lines: [
 *       { label: "Customer",      value: "Ali Traders" },
 *       { label: "Credit Limit",  value: "Rs 10,000", mono: true },
 *       { label: "Current Bill",  value: "Rs 14,500", mono: true },
 *     ],
 *     // optional — if omitted the notification auto-closes after 5 s
 *     // and shows no confirm button
 *     onConfirm: () => handleGenerateAnyway(),
 *     confirmLabel: "Proceed Anyway",   // defaults to "Confirm"
 *     cancelLabel:  "Go Back",          // defaults to "Dismiss"
 *   });
 *
 *   <WarningNotification
 *     visible={!!warnData}
 *     title={warnData?.title}
 *     lines={warnData?.lines}
 *     onConfirm={warnData?.onConfirm}
 *     confirmLabel={warnData?.confirmLabel}
 *     cancelLabel={warnData?.cancelLabel}
 *     onClose={() => setWarnData(null)}
 *   />
 */
export default function WarningNotification({
    visible,
    title,
    lines = [],
    onConfirm,       // optional – renders action buttons when provided
    confirmLabel = "Confirm",
    cancelLabel = "Dismiss",
    onClose,
    autoDismissMs = 5000, // set to 0 to disable auto-dismiss
}) {
    const timerRef = useRef(null);

    /* auto-dismiss when no confirm action is required */
    useEffect(() => {
        if (visible && !onConfirm && autoDismissMs > 0) {
            timerRef.current = setTimeout(() => onClose?.(), autoDismissMs);
        }
        return () => clearTimeout(timerRef.current);
    }, [visible, onConfirm, autoDismissMs, onClose]);

    /* close on Escape */
    useEffect(() => {
        if (!visible) return;
        const handler = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [visible, onClose]);

    return (
        <AnimatePresence>
            {visible && (
                <>
                    {/* backdrop — subtle, not full black */}
                    <motion.div
                        style={st.backdrop}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />

                    {/* card */}
                    <motion.div
                        style={st.card}
                        initial={{ opacity: 0, x: "-50%", y: "-40%", scale: 0.95 }}
                        animate={{ opacity: 1, x: "-50%", y: "-50%", scale: 1 }}
                        exit={{ opacity: 0, x: "-50%", y: "-45%", scale: 0.97 }}
                        transition={{ type: "spring", damping: 22, stiffness: 260 }}
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="warn-title"
                    >
                        {/* top accent bar */}
                        <div style={st.accentBar} />

                        {/* header */}
                        <div style={st.header}>
                            <div style={st.iconWrap}>
                                <WarningIcon />
                            </div>

                            <div style={{ flex: 1 }}>
                                <p style={st.label}>Warning</p>
                                <h3 id="warn-title" style={st.title}>{title}</h3>
                            </div>

                            <button style={st.closeBtn} onClick={onClose} aria-label="Close">
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            </button>
                        </div>

                        {/* lines */}
                        {lines.length > 0 && (
                            <div style={st.lines}>
                                {lines.map((line, i) => (
                                    <div key={i} style={st.lineRow}>
                                        <span style={st.lineLabel}>{line.label}</span>
                                        <span style={{ ...st.lineValue, ...(line.mono ? st.mono : {}) }}>
                                            {line.value}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* progress bar (auto-dismiss indicator) */}
                        {!onConfirm && autoDismissMs > 0 && (
                            <div style={st.progressTrack}>
                                <motion.div
                                    style={st.progressBar}
                                    initial={{ width: "100%" }}
                                    animate={{ width: "0%" }}
                                    transition={{ duration: autoDismissMs / 1000, ease: "linear" }}
                                />
                            </div>
                        )}

                        {/* action buttons — only when onConfirm is provided */}
                        {onConfirm && (
                            <div style={st.actions}>
                                <button
                                    style={st.cancelBtn}
                                    onClick={onClose}
                                >
                                    {cancelLabel}
                                </button>
                                <button
                                    style={st.confirmBtn}
                                    onClick={() => { onConfirm(); onClose?.(); }}
                                >
                                    {confirmLabel}
                                </button>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

/* ── icon ─────────────────────────────────────────────────── */
function WarningIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
                d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                fill="#fff3cd"
                stroke="#d97706"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
            <line x1="12" y1="9" x2="12" y2="13" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="16.5" r="1" fill="#d97706" />
        </svg>
    );
}

/* ── styles ───────────────────────────────────────────────── */
const st = {
    backdrop: {
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(1px)",
    },

    card: {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1200,
        width: 360,
        background: "#fffdf5",
        border: "1px solid #fde68a",
        borderRadius: 16,
        boxShadow: "0 12px 40px rgba(217,119,6,0.18), 0 2px 8px rgba(0,0,0,0.06)",
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
    },

    accentBar: {
        height: 4,
        background: "linear-gradient(90deg, #f59e0b, #d97706)",
    },

    header: {
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "16px 16px 12px",
    },

    iconWrap: {
        width: 40,
        height: 40,
        borderRadius: 10,
        background: "#fef3c7",
        border: "1px solid #fde68a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },

    label: {
        margin: 0,
        fontSize: 10,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "#d97706",
    },

    title: {
        margin: "3px 0 0",
        fontSize: 15,
        fontWeight: 700,
        color: "#78350f",
        lineHeight: 1.3,
    },

    closeBtn: {
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "#b45309",
        padding: 4,
        borderRadius: 6,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.6,
    },

    lines: {
        margin: "0 16px 14px",
        borderRadius: 10,
        background: "#fff",
        border: "1px solid #fde68a",
        overflow: "hidden",
    },

    lineRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "9px 14px",
        borderBottom: "1px solid #fef3c7",
    },

    lineLabel: {
        fontSize: 12,
        fontWeight: 600,
        color: "#92400e",
    },

    lineValue: {
        fontSize: 13,
        fontWeight: 700,
        color: "#78350f",
    },

    mono: {
        fontFamily: "monospace",
        fontSize: 13,
    },

    progressTrack: {
        height: 3,
        background: "#fde68a",
        margin: "0 0 0 0",
    },

    progressBar: {
        height: "100%",
        background: "#d97706",
        borderRadius: 2,
    },

    actions: {
        display: "flex",
        gap: 8,
        padding: "12px 16px 16px",
    },

    cancelBtn: {
        flex: 1,
        height: 38,
        borderRadius: 9,
        border: "1px solid #fde68a",
        background: "#fff",
        color: "#92400e",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
    },

    confirmBtn: {
        flex: 1,
        height: 38,
        borderRadius: 9,
        border: "none",
        background: "#d97706",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(217,119,6,0.3)",
    },
};