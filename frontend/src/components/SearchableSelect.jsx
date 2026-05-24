import { useEffect, useMemo, useRef, useState } from "react";

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Search...",
  getOptionLabel = (option) => option?.label ?? "",
  getOptionValue = (option) => option?.value ?? option?.id,
  renderMeta,
  onInputChange,
  disabled = false,
  compact = false,
}) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => options.find((option) => String(getOptionValue(option)) === String(value)),
    [options, value, getOptionValue]
  );

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        setHighlight(0);
        setQuery(selected ? getOptionLabel(selected) : "");
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [selected, getOptionLabel]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => {
      const label = getOptionLabel(option).toLowerCase();
      return label.includes(normalized);
    });
  }, [options, query, getOptionLabel]);

  const commit = (option) => {
    if (!option) return;
    onChange?.(getOptionValue(option), option);
    setOpen(false);
    setHighlight(0);
    setQuery(getOptionLabel(option));
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[highlight] || filtered[0];
      if (option) commit(option);
    } else if (event.key === "Escape") {
      setOpen(false);
      setHighlight(0);
      setQuery(selected ? getOptionLabel(selected) : "");
    }
  };

  const showList = open && !disabled;

  return (
    <div ref={rootRef} style={styles.wrapper}>
      <input
        ref={inputRef}
        disabled={disabled}
        value={showList ? query : selected ? getOptionLabel(selected) : query}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          setHighlight(0);
          onInputChange?.(next);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{ ...styles.input, ...(compact ? styles.compactInput : {}) }}
      />

      {showList && (
        <div style={styles.menu}>
          {filtered.length === 0 ? (
            <div style={styles.empty}>No matches</div>
          ) : (
            filtered.slice(0, 12).map((option, index) => {
              const active = index === highlight;
              return (
                <button
                  type="button"
                  key={String(getOptionValue(option))}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(option)}
                  onMouseEnter={() => setHighlight(index)}
                  style={{ ...styles.option, ...(active ? styles.optionActive : {}) }}
                >
                  <span style={styles.optionLabel}>{getOptionLabel(option)}</span>
                  {renderMeta ? <span style={styles.optionMeta}>{renderMeta(option)}</span> : null}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    position: "relative",
    width: "100%",
    minWidth: 0,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cfe0cf",
    borderRadius: 8,
    padding: "10px 12px",
    background: "#fbfefb",
    color: "#16341b",
    fontSize: 14,
    outline: "none",
  },
  compactInput: {
    padding: "8px 10px",
    borderRadius: 7,
    fontSize: 13,
  },
  menu: {
    position: "absolute",
    zIndex: 40,
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    border: "1px solid #d6e6d6",
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 8px 20px rgba(16, 48, 16, 0.08)",
    maxHeight: 260,
    overflowY: "auto",
  },
  option: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    border: 0,
    background: "transparent",
    padding: "10px 12px",
    textAlign: "left",
    cursor: "pointer",
    color: "#16341b",
    borderBottom: "1px solid #f0f6f0",
  },
  optionActive: {
    background: "#edf7ed",
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: 600,
    minWidth: 0,
  },
  optionMeta: {
    fontSize: 11,
    color: "#6b8a6d",
    whiteSpace: "nowrap",
  },
  empty: {
    padding: "12px",
    fontSize: 12,
    color: "#6b8a6d",
  },
};
