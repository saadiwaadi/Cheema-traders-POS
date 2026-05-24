export default function StatementPrint({ customer, rows, fromDate, toDate }) {
  let running = 0;

  const withBalance = rows.map((h) => {
    if (h.type === "Sale") {
      running += Number(h.total_amount || 0) - Number(h.paid_amount || 0);
    } else {
      running -= Number(h.paid_amount || 0);
    }

    return { ...h, runningBalance: running };
  });

  const totalBilled = rows
    .filter((h) => h.type === "Sale")
    .reduce((s, h) => s + Number(h.total_amount || 0), 0);

  const totalReceived = rows.reduce(
    (s, h) => s + Number(h.paid_amount || 0),
    0
  );

  const totalPending = rows
    .filter((h) => h.type === "Sale")
    .reduce((s, h) => s + Number(h.remaining_amount || 0), 0);

  const bal = customer.current_balance;

  return (
    <div id="print-statement" style={{ display: "none" }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-statement, #print-statement * { visibility: visible !important; }
          #print-statement {
            display: block !important;
            position: fixed !important;
            inset: 0;
            padding: 32px 40px;
            font-family: 'Segoe UI', Arial, sans-serif;
            color: #111;
            background: #fff;
            font-size: 12px;
          }
          .ps-page-break { page-break-before: always; }
        }

        #print-statement { display: none; }

        .ps-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2.5px solid #1b5e20;
          padding-bottom: 14px;
          margin-bottom: 18px;
        }
        .ps-company-name {
          font-size: 22px;
          font-weight: 800;
          color: #1b5e20;
          letter-spacing: -0.3px;
        }
        .ps-company-sub {
          font-size: 10px;
          color: #6a8f6c;
          margin-top: 3px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .ps-doc-title {
          text-align: right;
        }
        .ps-doc-title h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: #1b3a1d;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .ps-doc-title p {
          margin: 3px 0 0;
          font-size: 10px;
          color: #888;
        }

        .ps-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 18px;
          background: #f7fcf7;
          border: 1px solid #d4e8d4;
          border-radius: 8px;
          padding: 14px 18px;
        }
        .ps-meta-block { display: flex; flex-direction: column; gap: 3px; }
        .ps-meta-label { font-size: 9px; font-weight: 700; color: #6a8f6c; text-transform: uppercase; letter-spacing: 0.08em; }
        .ps-meta-value { font-size: 13px; font-weight: 700; color: #1b3a1d; }

        .ps-summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 20px;
        }
        .ps-summary-box {
          border: 1px solid #d4e8d4;
          border-radius: 7px;
          padding: 10px 14px;
          background: #fff;
        }
        .ps-summary-box.highlight { background: #f0f9f0; border-color: #2e7d32; }
        .ps-summary-label { font-size: 9px; font-weight: 700; color: #6a8f6c; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px; }
        .ps-summary-val { font-size: 15px; font-weight: 800; color: #1b3a1d; font-family: monospace; }
        .ps-summary-val.red { color: #c62828; }
        .ps-summary-val.green { color: #1b5e20; }

        .ps-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .ps-table thead tr { background: #1b5e20; color: #fff; }
        .ps-table thead th {
          padding: 9px 10px;
          text-align: left;
          font-weight: 700;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .ps-table thead th.right { text-align: right; }
        .ps-table tbody tr:nth-child(even) { background: #f7fcf7; }
        .ps-table tbody tr { border-bottom: 1px solid #e8f0e8; }
        .ps-table td { padding: 8px 10px; color: #222; vertical-align: middle; }
        .ps-table td.right { text-align: right; font-family: monospace; font-weight: 600; }
        .ps-table td.muted { color: #888; }
        .ps-table td.red { color: #c62828; font-weight: 700; }
        .ps-table td.green { color: #1b5e20; font-weight: 700; }
        .ps-pill {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .ps-pill-paid { background: #e8f5e9; color: #2e7d32; }
        .ps-pill-partial { background: #fff8e1; color: #8a6d00; }
        .ps-pill-unpaid { background: #fdecec; color: #c62828; }
        .ps-pill-recv { background: #e8f5e9; color: #2e7d32; }

        .ps-footer {
          margin-top: 32px;
          border-top: 1.5px solid #d4e8d4;
          padding-top: 14px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .ps-footer-note { font-size: 10px; color: #888; }
        .ps-sig { text-align: right; }
        .ps-sig-line { border-top: 1px solid #555; width: 160px; margin-left: auto; margin-top: 32px; }
        .ps-sig-label { font-size: 10px; color: #555; margin-top: 4px; text-align: center; }
      `}</style>

      <div className="ps-header">
        <div>
          <div className="ps-company-name">Your Business Name</div>
          <div className="ps-company-sub">Customer Account Statement</div>
        </div>
        <div className="ps-doc-title">
          <h2>Account Statement</h2>
          <p>
            Printed: {new Date().toLocaleDateString("en-PK", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
          {(fromDate || toDate) && (
            <p>Period: {fromDate || "Inception"} - {toDate || "Today"}</p>
          )}
        </div>
      </div>

      <div className="ps-meta">
        <div className="ps-meta-block">
          <span className="ps-meta-label">Customer Name</span>
          <span className="ps-meta-value">{customer.name}</span>
        </div>
        <div className="ps-meta-block">
          <span className="ps-meta-label">Phone</span>
          <span className="ps-meta-value">{customer.phone || "-"}</span>
        </div>
        <div className="ps-meta-block">
          <span className="ps-meta-label">Current Balance</span>
          <span
            className="ps-meta-value"
            style={{ color: bal > 0 ? "#c62828" : bal < 0 ? "#1b5e20" : "#333" }}
          >
            {bal === 0
              ? "Settled - Rs 0"
              : bal > 0
                ? `Receivable - Rs ${Math.abs(bal).toLocaleString()}`
                : `Advance - Rs ${Math.abs(bal).toLocaleString()}`}
          </span>
        </div>
        <div className="ps-meta-block">
          <span className="ps-meta-label">Last Purchase</span>
          <span className="ps-meta-value">{customer.last_purchase || "-"}</span>
        </div>
      </div>

      <div className="ps-summary">
        <div className="ps-summary-box">
          <div className="ps-summary-label">Total Billed</div>
          <div className="ps-summary-val">Rs {totalBilled.toLocaleString()}</div>
        </div>
        <div className="ps-summary-box">
          <div className="ps-summary-label">Total Received</div>
          <div className="ps-summary-val green">Rs {totalReceived.toLocaleString()}</div>
        </div>
        <div className="ps-summary-box">
          <div className="ps-summary-label">Pending Amount</div>
          <div className={`ps-summary-val ${totalPending > 0 ? "red" : "green"}`}>
            Rs {totalPending.toLocaleString()}
          </div>
        </div>
        <div className="ps-summary-box highlight">
          <div className="ps-summary-label">Net Balance</div>
          <div className={`ps-summary-val ${bal > 0 ? "red" : "green"}`}>
            {bal === 0 ? "Rs 0 - Settled" : `Rs ${Math.abs(bal).toLocaleString()}`}
          </div>
        </div>
      </div>

      <table className="ps-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            <th style={{ width: 72 }}>Date</th>
            <th>Description</th>
            <th>Method</th>
            <th>Status</th>
            <th className="right">Billed</th>
            <th className="right">Paid</th>
            <th className="right">Remaining</th>
            <th className="right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {withBalance.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ textAlign: "center", padding: 24, color: "#aaa" }}>
                No transactions in this range
              </td>
            </tr>
          ) : (
            withBalance.map((h, i) => {
              const isSale = h.type === "Sale";
              const status = isSale ? h.payment_status || "Unpaid" : "Received";
              const pillClass =
                status === "Paid"
                  ? "ps-pill-paid"
                  : status === "Partial"
                    ? "ps-pill-partial"
                    : status === "Received"
                      ? "ps-pill-recv"
                      : "ps-pill-unpaid";
              return (
                <tr key={i}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    {new Date(h.date + "T00:00:00").toLocaleDateString("en-PK", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </td>
                  <td>
                    <strong>{isSale ? "Sale Bill" : "Payment Received"}</strong>
                    {h.reference && (
                      <span style={{ color: "#888", marginLeft: 6, fontSize: 10 }}>{h.reference}</span>
                    )}
                  </td>
                  <td className="muted">{h.method || "-"}</td>
                  <td>
                    <span className={`ps-pill ${pillClass}`}>{status}</span>
                  </td>
                  <td className="right">
                    {isSale ? `Rs ${Number(h.total_amount || 0).toLocaleString()}` : "-"}
                  </td>
                  <td className="right green">Rs {Number(h.paid_amount || 0).toLocaleString()}</td>
                  <td className={`right ${isSale && Number(h.remaining_amount) > 0 ? "red" : "muted"}`}>
                    {isSale ? `Rs ${Number(h.remaining_amount || 0).toLocaleString()}` : "-"}
                  </td>
                  <td className={`right ${h.runningBalance > 0 ? "red" : h.runningBalance < 0 ? "green" : "muted"}`}>
                    Rs {Math.abs(h.runningBalance).toLocaleString()}
                    <span style={{ fontSize: 9, marginLeft: 3 }}>
                      {h.runningBalance > 0 ? "Dr" : h.runningBalance < 0 ? "Cr" : ""}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <div className="ps-footer">
        <div className="ps-footer-note">
          This is a computer-generated statement.
          <br />
          For queries contact the accounts department.
        </div>
        <div className="ps-sig">
          <div className="ps-sig-line" />
          <div className="ps-sig-label">Authorized Signature</div>
        </div>
      </div>
    </div>
  );
}
