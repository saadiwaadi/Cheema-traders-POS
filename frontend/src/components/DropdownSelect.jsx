import { useState, useRef, useEffect } from "react";

export default function DropdownSelect({
  value,
  options = [],
  getOptionLabel = (o) => o.name,
  getOptionValue = (o) => o.id,
  onChange,
  placeholder = "Search...",
  compact = false,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = options.find((o) => getOptionValue(o) === value);

  useEffect(() => {
    if (selected) setQuery(getOptionLabel(selected));
    else setQuery("");
  }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options
    .filter((o) =>
      getOptionLabel(o).toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 40);

  const height = compact ? 36 : 46;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <input
        style={{
          width: "100%",
          height,
          borderRadius: 10,
          border: "1px solid #d3e0d3",
          background: "#fbfdfb",
          padding: "0 14px",
          fontSize: compact ? 13 : 14,
          outline: "none",
          boxSizing: "border-box",
          cursor: "pointer",
        }}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (e.target.value === "") onChange(null, null);
        }}
        onFocus={() => setOpen(true)}
      />

      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute",
          top: height + 4,
          left: 0,
          right: 0,
          background: "#fff",
          border: "1px solid #d3e0d3",
          borderRadius: 10,
          boxShadow: "0 6px 24px rgba(0,0,0,0.10)",
          zIndex: 9999,
          maxHeight: 220,
          overflowY: "auto",
        }}>
          {filtered.map((o) => (
            <div
              key={getOptionValue(o)}
              onMouseDown={() => {
                setQuery(getOptionLabel(o));
                setOpen(false);
                onChange(getOptionValue(o), o);
              }}
              style={{
                padding: compact ? "8px 12px" : "11px 14px",
                fontSize: compact ? 13 : 14,
                cursor: "pointer",
                borderBottom: "1px solid #f1f5f1",
                background: getOptionValue(o) === value ? "#eef7ee" : "#fff",
                color: "#203522",
                fontWeight: getOptionValue(o) === value ? 700 : 400,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f4faf4"}
              onMouseLeave={(e) => e.currentTarget.style.background = getOptionValue(o) === value ? "#eef7ee" : "#fff"}
            >
              {getOptionLabel(o)}
              {o.sku && (
                <span style={{ fontSize: 11, color: "#8fa490", marginLeft: 8 }}>
                  {o.sku} — Rs {(o.basePrice || o.price || 0).toFixed(0)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
