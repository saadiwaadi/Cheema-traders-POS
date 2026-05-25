import { useEffect, useState } from "react";

export default function SuccessNotification({
  visible,
  onClose,
  title = "Payment Recorded",
  lines = [],
  onPrint,
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) setShow(true);
  }, [visible]);

  if (!visible && !show) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.18)",
        opacity: show ? 1 : 0,
        transition: "opacity 0.3s ease",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "36px 44px",
          minWidth: 340,
          maxWidth: 420,
          boxShadow: "0 16px 48px rgba(0,0,0,0.14)",
          border: "1px solid #e0ede0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
          transform: show ? "scale(1)" : "scale(0.95)",
          transition: "transform 0.3s ease",
        }}
      >
        <svg
          width="56"
          height="56"
          viewBox="0 0 56 56"
          fill="none"
          style={{ marginBottom: 18 }}
        >
          <circle cx="28" cy="28" r="28" fill="#eaf5ea" />
          <circle cx="28" cy="28" r="20" fill="#2e7d32" />
          <polyline
            points="18,28 25,35 38,21"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 28,
              strokeDashoffset: show ? 0 : 28,
              transition: "stroke-dashoffset 0.45s ease 0.1s",
            }}
          />
        </svg>

        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "#6a8f6c",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Confirmed
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#1b3a1d",
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          {title}
        </div>

        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 0,
            borderTop: "1px solid #eaf0ea",
            borderBottom: "1px solid #eaf0ea",
            marginBottom: 20,
          }}
        >
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0",
                borderBottom: i < lines.length - 1 ? "1px solid #f2f7f2" : "none",
                fontSize: 13,
              }}
            >
              <span style={{ color: "#6a8f6c", fontWeight: 600 }}>
                {line.label}
              </span>
              <span
                style={{
                  color: "#1b3a1d",
                  fontWeight: 700,
                  fontFamily: line.mono ? "monospace" : "inherit",
                }}
              >
                {line.value}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          {onPrint && (
            <button
              onClick={onPrint}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 8,
                border: "1px solid #c8e6c9",
                background: "#f1f8f1",
                color: "#2e7d32",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              🖨 Print Bill
            </button>
          )}
          <button
            onClick={() => {
              setShow(false);
              setTimeout(onClose, 300);
            }}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 8,
              border: "none",
              background: "#2e7d32",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
