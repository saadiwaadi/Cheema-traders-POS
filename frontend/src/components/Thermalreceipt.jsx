/**
 * ThermalReceipt.jsx
 * Drop into src/components/ThermalReceipt.jsx
 *
 * Usage:
 *   const [receiptData, setReceiptData] = useState(null);
 *   printReceipt(receiptData);          // call the exported helper
 */

/**
 * Call this after saveSale() succeeds.
 * It opens a tiny print window, writes the receipt, triggers print, then closes.
 *
 * @param {Object} data
 *   invoiceNo, saleDate, cashier,
 *   customerName, phone,
 *   items: [{ productName, quantity, unit, price, discount, lineTotal }],
 *   subtotal, totalDiscount, creditApplied,
 *   grandTotal, paymentMethod,
 *   amountPaid, remainingAmount, changeAmount,
 *   prevBalance,   // customer balance BEFORE this sale (pass selectedCustomerObj.current_balance)
 *   notes
 */
export function printReceipt(data) {
    if (!data) return;

    const {
        invoiceNo = "—",
        saleDate = new Date().toLocaleDateString("en-PK"),
        cashier = "Staff",
        customerName = "Walk-in Customer",
        phone = "",
        items = [],
        subtotal = 0,
        totalDiscount = 0,
        creditApplied = 0,
        grandTotal = 0,
        paymentMethod = "Cash",
        amountPaid = 0,
        remainingAmount = 0,
        changeAmount = 0,
        prevBalance = 0,  // positive = they owed us, negative = they had advance
        notes = "",
    } = data;

    // Net balance after this transaction
    const netBalance = prevBalance + remainingAmount - creditApplied;

    const fmt = (n) => "Rs " + Number(n).toLocaleString("en-PK");

    // Build items rows HTML
    const itemRows = items.map((item, i) => {
        const disc = Number(item.discount || 0);
        const lineTotal = Number(item.lineTotal || (item.quantity * item.price - disc));
        const hasDisc = disc > 0;
        return `
      <div class="item-row">
        <span class="item-name">${i + 1}. ${item.productName}${item.unit ? " (" + item.unit + ")" : ""}</span>
        <span></span>
      </div>
      <div class="item-row item-calc">
        <span>${item.quantity} x ${fmt(item.price)}${hasDisc ? " - disc " + fmt(disc) : ""}</span>
        <span class="bold">${fmt(lineTotal)}</span>
      </div>
    `;
    }).join("");

    const creditRow = creditApplied > 0 ? `
    <div class="total-row">
      <span>Advance Credit</span><span>- ${fmt(creditApplied)}</span>
    </div>` : "";

    const changeRow = changeAmount > 0 ? `
    <div class="total-row">
      <span>Change Return</span><span>${fmt(changeAmount)}</span>
    </div>` : "";

    const balanceSection = (prevBalance !== 0 || remainingAmount > 0) ? `
    <div class="dash"></div>
    <div class="total-row small">
      <span>Prev. Balance</span>
      <span>${prevBalance > 0 ? "(Dr) " : prevBalance < 0 ? "(Cr) " : ""}${fmt(Math.abs(prevBalance))}</span>
    </div>
    <div class="total-row small bold">
      <span>Net Balance</span>
      <span>${netBalance > 0 ? "(Dr) " : netBalance < 0 ? "(Cr) " : ""}${fmt(Math.abs(netBalance))}</span>
    </div>` : "";

    const notesSection = notes ? `
    <div class="dash"></div>
    <div class="small center">${notes}</div>` : "";

    const nowStr = new Date().toLocaleString("en-PK", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Receipt ${invoiceNo}</title>
<style>
  @page { margin: 4mm 3mm; size: 80mm auto; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    color: #000;
    width: 272px;
    padding: 10px 8px 16px;
    line-height: 1.5;
  }
  .center  { text-align: center; }
  .right   { text-align: right; }
  .bold    { font-weight: bold; }
  .small   { font-size: 10px; }
  .mt4     { margin-top: 4px; }
  .mt8     { margin-top: 8px; }

  .dash  { border:none; border-top:1px dashed #000; margin:7px 0; }
  .solid { border:none; border-top:1px solid  #000; margin:7px 0; }
  .double{ border:none; border-top:3px double #000; margin:7px 0; }

  .shop-name {
    font-size: 16px;
    font-weight: bold;
    letter-spacing: 2px;
    text-transform: uppercase;
    text-align: center;
    margin-top: 4px;
  }
  .tagline {
    font-size: 9px;
    letter-spacing: 3px;
    text-transform: uppercase;
    text-align: center;
    margin-top: 1px;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }

  .item-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1px 0;
    font-size: 11.5px;
  }
  .item-name { flex:1; font-weight:600; }
  .item-calc { font-size: 10.5px; color: #333; padding-left: 8px; }

  .total-row {
    display: flex;
    justify-content: space-between;
    font-size: 11.5px;
    padding: 1px 0;
  }
  .grand-row {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    font-weight: bold;
    padding: 3px 0;
  }

  .logo-art {
    text-align: center;
    font-size: 10px;
    letter-spacing: 1px;
    line-height: 1.2;
  }

  .footer {
    text-align: center;
    font-size: 10px;
    line-height: 1.9;
    margin-top: 4px;
  }
  .powered {
    text-align: center;
    font-size: 8.5px;
    color: #666;
    margin-top: 10px;
    letter-spacing: 0.5px;
  }
</style>
</head>
<body>

  <div class="logo-art">.-----.<br>| C T |<br>'-----'</div>
  <div class="shop-name">Cheema Traders</div>
  <div class="tagline">We Do. Pests Obey.</div>

  <hr class="dash mt8">

  <div class="center small">
    Shop No. [XX], [Market Name], [City]<br>
    Ph: 0300-XXXXXXX
  </div>

  <hr class="dash">

  <div class="meta-row"><span>Invoice:</span> <span class="bold">${invoiceNo}</span></div>
  <div class="meta-row"><span>Date:</span>    <span>${nowStr}</span></div>
  <div class="meta-row"><span>Cashier:</span> <span>${cashier}</span></div>

  <hr class="dash">

  <div class="meta-row"><span>Customer:</span> <span class="bold">${customerName}</span></div>
  ${phone ? `<div class="meta-row"><span>Phone:</span> <span>${phone}</span></div>` : ""}

  <hr class="solid">

  ${itemRows}

  <hr class="solid">

  <div class="total-row"><span>Subtotal</span>    <span>${fmt(subtotal)}</span></div>
  ${totalDiscount > 0 ? `<div class="total-row"><span>Discount</span><span>- ${fmt(totalDiscount)}</span></div>` : ""}
  ${creditRow}

  <hr class="double">

  <div class="grand-row">
    <span>TOTAL</span><span>${fmt(grandTotal)}</span>
  </div>

  <hr class="dash">

  <div class="total-row"><span>Payment</span>      <span>${paymentMethod}</span></div>
  <div class="total-row"><span>Amount Paid</span>  <span>${fmt(amountPaid)}</span></div>
  ${changeRow}
  ${remainingAmount > 0 ? `<div class="total-row bold"><span>Balance Due</span><span>${fmt(remainingAmount)}</span></div>` : ""}

  ${balanceSection}
  ${notesSection}

  <hr class="solid">

  <div class="footer">
    Items non-returnable without receipt.<br>
    Exchange within 7 days only.<br>
    <br>
    ** Thank You For Your Business! **
  </div>

  <div class="powered">
    Powered by BitLogic &nbsp;·&nbsp; 0317-8440437
  </div>

</body>
</html>`;

    const win = window.open("", "_blank", "width=320,height=600");
    win.document.write(html);
    win.document.close();
    win.focus();
    // slight delay lets fonts/layout settle before print dialog
    setTimeout(() => { win.print(); win.close(); }, 300);
}