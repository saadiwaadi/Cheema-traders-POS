/**
 * glBridge.js
 * ─────────────────────────────────────────────────────────────
 * Wires POS events to the double-entry journal.
 * Drop this file in: src/main/lib/glBridge.js
 *
 * USAGE — call from inside your existing IPC handlers, AFTER the
 * main insert succeeds, passing the same `db` instance:
 *
 *   const { postSale, postPayment, postPurchase, postSupplierPayment } = require('./glBridge');
 *
 *   // Inside db:save-sale handler, after your INSERT/UPDATE:
 *   postSale(db, savedSaleRow);
 *
 *   // Inside db:save-customer-payment handler, after INSERT:
 *   postPayment(db, savedPaymentRow);
 *
 *   // Inside db:save-purchase handler, after INSERT:
 *   postPurchase(db, savedPurchaseRow);
 *
 *   // Inside db:save-supplier-payment handler, after INSERT:
 *   postSupplierPayment(db, savedSupplierPaymentRow);
 * ─────────────────────────────────────────────────────────────
 */

"use strict";

// ─── Money helpers ────────────────────────────────────────────
// REAL amounts from your DB → integer paisa for journal_lines.
const toPaisa = (realVal) => Math.round((Number(realVal) || 0) * 100);

// ─── Balanced-entry validator ─────────────────────────────────
// Called before every journal write. Throws on any violation.
function assertBalanced(lines) {
  if (!Array.isArray(lines) || lines.length < 2)
    throw new Error("GL Bridge: entry needs at least two lines.");
  let totalDr = 0, totalCr = 0;
  for (const l of lines) {
    const d = Number(l.debit) || 0, c = Number(l.credit) || 0;
    if (d < 0 || c < 0)     throw new Error("GL Bridge: negative amount in line.");
    if (d > 0 && c > 0)     throw new Error("GL Bridge: line has both debit and credit.");
    if (d === 0 && c === 0) throw new Error("GL Bridge: line has no debit or credit.");
    totalDr += d; totalCr += c;
  }
  if (totalDr !== totalCr)
    throw new Error(`GL Bridge: unbalanced — Dr ${totalDr} ≠ Cr ${totalCr} paisa.`);
  return { totalDr, totalCr };
}

// ─── Account resolver ─────────────────────────────────────────
const _accountCache = {};
function accountId(db, code) {
  if (_accountCache[code]) return _accountCache[code];
  const row = db.prepare(`SELECT id FROM accounts WHERE code = ?`).get(code);
  if (!row) throw new Error(`GL Bridge: account code "${code}" not found in accounts table. Run the COA seed first.`);
  _accountCache[code] = row.id;
  return row.id;
}

function clearAccountCache() {
  for (const key in _accountCache) {
    delete _accountCache[key];
  }
}

// Maps payment method label → account code.
// Used as a fallback if dynamic bank lookup fails.
const METHOD_TO_CODE = {
  "cash":         "1000",
  "hbl bank":     "1010",
  "hbl":          "1010",
  "meezan bank":  "1011",
  "meezan":       "1011",
  "jazzcash":     "1013",
  "jazz cash":    "1013",
  "easypaisa":    "1014",
  "easy paisa":   "1014",
};

function methodAccountId(db, method) {
  const methodStr = String(method || "cash").trim();
  const key = methodStr.toLowerCase();
  
  if (key === "cih") return accountId(db, "1000");

  // 1. If method is a numeric bank_id
  if (!isNaN(methodStr) && Number(methodStr) > 0) {
    const bankRow = db.prepare(`SELECT name FROM bank_accounts WHERE id = ?`).get(Number(methodStr));
    if (bankRow) {
      const coaName = `Bank - ${bankRow.name}`;
      const accRow = db.prepare(`SELECT id FROM accounts WHERE name = ? COLLATE NOCASE`).get(coaName);
      if (accRow) return accRow.id;
    }
  }

  // 2. Try exactly matching the accounts table by name
  let accRow = db.prepare(`SELECT id FROM accounts WHERE name = ? COLLATE NOCASE`).get(methodStr);
  if (accRow) return accRow.id;
  
  accRow = db.prepare(`SELECT id FROM accounts WHERE name = ? COLLATE NOCASE`).get(`Bank - ${methodStr}`);
  if (accRow) return accRow.id;

  // 3. Fallback to hardcoded map
  const code = METHOD_TO_CODE[key] || "1000"; // default to Cash if unknown
  return accountId(db, code);
}

// ─── Entry number sequence ────────────────────────────────────
function nextEntryNo(db, date) {
  const year = String(date).slice(0, 4);
  const row = db.prepare(
    `SELECT entry_no FROM journal_entries WHERE entry_no LIKE ? ORDER BY entry_no DESC LIMIT 1`
  ).get(`JV-${year}-%`);
  const n = row ? parseInt(row.entry_no.split("-")[2], 10) + 1 : 1;
  return `JV-${year}-${String(n).padStart(5, "0")}`;
}

// ─── Core journal writer ──────────────────────────────────────
function writeEntry(db, { date, narration, source_type, source_id, lines }) {
  assertBalanced(lines);
  const tx = db.transaction(() => {
    const entry_no = nextEntryNo(db, date);
    const { lastInsertRowid: entryId } = db.prepare(`
      INSERT INTO journal_entries (entry_no, date, narration, status, source_type, source_id)
      VALUES (?, ?, ?, 'posted', ?, ?)
    `).run(entry_no, date, narration, source_type, source_id ?? null);

    const ins = db.prepare(`
      INSERT INTO journal_lines (entry_id, account_id, debit, credit, customer_id, supplier_id, line_memo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const l of lines)
      ins.run(entryId, l.accountId, l.debit, l.credit,
              l.customerId ?? null, l.supplierId ?? null, l.memo ?? null);

    return entryId;
  });
  return tx();
}

// ─── Idempotency check ────────────────────────────────────────
// Prevents double-posting if a handler fires more than once for the same row.
function alreadyPosted(db, source_type, source_id) {
  return !!db.prepare(
    `SELECT 1 FROM journal_entries WHERE source_type=? AND source_id=? LIMIT 1`
  ).get(source_type, source_id);
}


/* ═══════════════════════════════════════════════════════════════
   1. POST SALE
   Fires after a sale is saved (new or fully updated).
   Pass the complete sale row from your DB.

   Column mapping from your schema:
     sale.id, sale.invoice_no, sale.sale_date,
     sale.customer_id, sale.payment_method,
     sale.total, sale.amount_paid, sale.balance_due,
     sale.credit_applied, sale.voided_at
   ═══════════════════════════════════════════════════════════════ */
function postSale(db, sale) {
  // Skip voided sales entirely
  if (sale.voided_at) return;

  // Idempotency — only post once per sale id
  if (alreadyPosted(db, "sale", sale.id)) return;

  const totalPaisa    = toPaisa(sale.total);
  const creditApplied = toPaisa(sale.credit_applied || 0);

  // Cash/bank actually received = amount_paid minus any advance credit consumed
  const cashPaisa = Math.max(0, toPaisa(sale.amount_paid) - creditApplied);

  // AR = everything not settled by new cash
  // (includes balance_due that's still owed, plus advance offset = totalPaisa - cashPaisa)
  const arPaisa = totalPaisa - cashPaisa;

  if (totalPaisa === 0) return; // nothing to post

  const lines = [];

  // Debit side
  if (cashPaisa > 0)
    lines.push({
      accountId: methodAccountId(db, sale.payment_method),
      debit: cashPaisa, credit: 0,
      memo: `Cash received — ${sale.invoice_no}`,
    });

  if (arPaisa > 0)
    lines.push({
      accountId: accountId(db, "1100"),   // Accounts Receivable
      debit: arPaisa, credit: 0,
      customerId: sale.customer_id ?? null,
      memo: `AR — ${sale.invoice_no}`,
    });

  // Credit side
  lines.push({
    accountId: accountId(db, "4000"),     // Sales Revenue
    debit: 0, credit: totalPaisa,
    memo: sale.invoice_no,
  });

  // Calculate COGS
  const cogsRow = db.prepare(`
    SELECT COALESCE(SUM(ABS(im.quantity) * COALESCE(b.cost_price, p.cost_price, 0)), 0) AS totalCogs
    FROM inventory_movements im
    LEFT JOIN batches b ON im.batch_id = b.id
    LEFT JOIN products p ON im.product_id = p.id
    WHERE im.reference_type = 'sale' AND im.reference_id = ?
  `).get(sale.id);

  const cogsPaisa = toPaisa(cogsRow.totalCogs);

  if (cogsPaisa > 0) {
    // Dr COGS
    lines.push({
      accountId: accountId(db, "5000"),   // Cost of Goods Sold
      debit: cogsPaisa, credit: 0,
      memo: `COGS — ${sale.invoice_no}`,
    });
    // Cr Inventory
    lines.push({
      accountId: accountId(db, "1200"),   // Inventory
      debit: 0, credit: cogsPaisa,
      memo: `Inventory consumed — ${sale.invoice_no}`,
    });
  }

  try {
    writeEntry(db, {
      date:        (sale.sale_date || sale.created_at || "").slice(0, 10),
      narration:   `Sale — ${sale.invoice_no}${sale.customer_name ? ` / ${sale.customer_name}` : ""}`,
      source_type: "sale",
      source_id:   sale.id,
      lines,
    });
  } catch (err) {
    console.error("[glBridge] postSale failed:", err.message, { saleId: sale.id });
    // Do NOT re-throw — a GL posting failure must never roll back the sale itself.
  }
}


/* ═══════════════════════════════════════════════════════════════
   2. POST CUSTOMER PAYMENT
   Fires after a customer_payments row is saved.

   Column mapping:
     p.id, p.customer_id, p.payment_date,
     p.amount, p.payment_method, p.type   ('payment' | 'advance')
   ═══════════════════════════════════════════════════════════════ */
function postPayment(db, payment) {
  if (alreadyPosted(db, "payment", payment.id)) return;

  const amountPaisa = toPaisa(payment.amount);
  if (amountPaisa === 0) return;

  const date = (payment.payment_date || payment.created_at || "").slice(0, 10);
  const isAdvance = (payment.type || "").toLowerCase() === "advance";

  try {
    writeEntry(db, {
      date,
      narration: isAdvance
        ? `Advance deposit — Customer ID ${payment.customer_id}`
        : `Payment received — Customer ID ${payment.customer_id}`,
      source_type: "payment",
      source_id:   payment.id,
      lines: [
        {
          // Dr Cash / Bank (money comes in)
          accountId: methodAccountId(db, payment.payment_method),
          debit: amountPaisa, credit: 0,
          memo: isAdvance ? "Advance deposit" : "Payment received",
        },
        {
          // Cr Accounts Receivable (clears or creates credit balance)
          accountId: accountId(db, "1100"),
          debit: 0, credit: amountPaisa,
          customerId: payment.customer_id ?? null,
          memo: isAdvance ? "Advance — CR balance" : "AR cleared",
        },
      ],
    });
  } catch (err) {
    console.error("[glBridge] postPayment failed:", err.message, { paymentId: payment.id });
  }
}


/* ═══════════════════════════════════════════════════════════════
   3. POST PURCHASE (Supplier invoice)
   Fires after a purchases row is saved.

   ⚠ CONFIRM these column names match your purchases table:
     p.id, p.purchase_date (or p.date), p.supplier_id,
     p.invoice_no (or p.reference), p.total (or p.grand_total),
     p.amount_paid, p.payment_method

   Adjust the field names in the lines below if they differ.
   ═══════════════════════════════════════════════════════════════ */
function postPurchase(db, purchase) {
  if (alreadyPosted(db, "purchase", purchase.id)) return;

  // ── Adjust these field names to match your actual purchases schema ──
  const totalPaisa  = toPaisa(purchase.total ?? purchase.grand_total ?? 0);
  const paidPaisa   = toPaisa(purchase.amount_paid ?? 0);
  const apPaisa     = totalPaisa - paidPaisa;   // goes to Accounts Payable
  const date        = (purchase.purchase_date ?? purchase.date ?? purchase.created_at ?? "").slice(0, 10);
  const ref         = purchase.invoice_no ?? purchase.reference ?? `PUR-${purchase.id}`;
  // ───────────────────────────────────────────────────────────────────

  if (totalPaisa === 0) return;

  const lines = [];

  // Dr Inventory (or COGS / Purchases — use 5000 if you expense directly)
  lines.push({
    accountId: accountId(db, "1200"),   // 1200 Inventory — change to "5000" if periodic
    debit: totalPaisa, credit: 0,
    memo: ref,
  });

  // Cr Cash (if paid immediately)
  if (paidPaisa > 0)
    lines.push({
      accountId: methodAccountId(db, purchase.payment_method),
      debit: 0, credit: paidPaisa,
      memo: `Cash paid — ${ref}`,
    });

  // Cr Accounts Payable (unpaid portion)
  if (apPaisa > 0)
    lines.push({
      accountId: accountId(db, "2000"),  // Accounts Payable
      debit: 0, credit: apPaisa,
      supplierId: purchase.supplier_id ?? purchase.supplierId ?? null,
      memo: `AP — ${ref}`,
    });

  try {
    writeEntry(db, {
      date,
      narration: `Purchase — ${ref}`,
      source_type: "purchase",
      source_id:   purchase.id,
      lines,
    });
  } catch (err) {
    console.error("[glBridge] postPurchase failed:", err.message, { purchaseId: purchase.id });
  }
}


/* ═══════════════════════════════════════════════════════════════
   4. POST SUPPLIER PAYMENT
   Fires after a supplier_payments row is saved.

   ⚠ CONFIRM field names match your supplier_payments schema:
     sp.id, sp.payment_date (or sp.date), sp.supplier_id,
     sp.amount, sp.payment_method
   ═══════════════════════════════════════════════════════════════ */
function postSupplierPayment(db, supplierPayment) {
  if (alreadyPosted(db, "supplier_payment", supplierPayment.id)) return;

  const amountPaisa = toPaisa(supplierPayment.amount);
  if (amountPaisa === 0) return;

  const date = (supplierPayment.payment_date ?? supplierPayment.date ?? supplierPayment.created_at ?? "").slice(0, 10);

  try {
    const absAmountPaisa = Math.abs(amountPaisa);
    const lines = [];

    const supplierId = supplierPayment.supplier_id ?? supplierPayment.supplierId ?? null;

    if (amountPaisa > 0) {
      lines.push({
        // Dr Accounts Payable (we're paying off what we owe)
        accountId: accountId(db, "2000"),
        debit: absAmountPaisa, credit: 0,
        supplierId,
        memo: "AP cleared",
      });
      lines.push({
        // Cr Cash / Bank (money goes out)
        accountId: methodAccountId(db, supplierPayment.payment_method),
        debit: 0, credit: absAmountPaisa,
        memo: "Supplier payment",
      });
    } else {
      lines.push({
        // Dr Cash / Bank (money comes in / refund)
        accountId: methodAccountId(db, supplierPayment.payment_method),
        debit: absAmountPaisa, credit: 0,
        memo: "Supplier refund/withdrawal",
      });
      lines.push({
        // Cr Accounts Payable (reduces what we owe/prepayment)
        accountId: accountId(db, "2000"),
        debit: 0, credit: absAmountPaisa,
        supplierId,
        memo: "Supplier refund/withdrawal",
      });
    }

    writeEntry(db, {
      date,
      narration: amountPaisa > 0 
        ? `Supplier payment — ID ${supplierPayment.supplier_id}`
        : `Supplier refund/withdrawal — ID ${supplierPayment.supplier_id}`,
      source_type: "supplier_payment",
      source_id:   supplierPayment.id,
      lines,
    });
  } catch (err) {
    console.error("[glBridge] postSupplierPayment failed:", err.message, { id: supplierPayment.id });
  }
}


/* ═══════════════════════════════════════════════════════════════
   5. VOID A SALE (post a reversing entry)
   Call this when a sale is voided, NOT when it's first saved.
   Pass the voided sale row.
   ═══════════════════════════════════════════════════════════════ */
function voidSale(db, sale) {
  // Find the original journal entry for this sale
  const orig = db.prepare(
    `SELECT id FROM journal_entries WHERE source_type='sale' AND source_id=? AND status='posted' LIMIT 1`
  ).get(sale.id);

  if (!orig) return; // was never posted (e.g. pre-bridge sale)

  // Check not already reversed
  const already = db.prepare(
    `SELECT 1 FROM journal_entries WHERE source_type='void_sale' AND source_id=? LIMIT 1`
  ).get(sale.id);
  if (already) return;

  // Get original lines and swap Dr/Cr
  const origLines = db.prepare(
    `SELECT account_id, debit, credit, customer_id, line_memo FROM journal_lines WHERE entry_id=?`
  ).all(orig.id);

  const reversalLines = origLines.map(l => ({
    accountId:  l.account_id,
    debit:      l.credit,   // swapped
    credit:     l.debit,    // swapped
    customerId: l.customer_id,
    memo:       `Void: ${l.line_memo || ""}`,
  }));

  try {
    writeEntry(db, {
      date:        new Date().toISOString().slice(0, 10),
      narration:   `Void — ${sale.invoice_no}`,
      source_type: "void_sale",
      source_id:   sale.id,
      lines:       reversalLines,
    });
    db.prepare(`UPDATE journal_entries SET status='void' WHERE id=?`).run(orig.id);
  } catch (err) {
    console.error("[glBridge] voidSale failed:", err.message, { saleId: sale.id });
  }
}

/* ═══════════════════════════════════════════════════════════════
   6. POST BANK TRANSFER
   Fires after a transfer between cash and bank or bank and bank.
   ═══════════════════════════════════════════════════════════════ */
function postBankTransfer(db, transfer) {
  // transfer: { id, date, amount, reference, fromAccount, toAccount }
  // fromAccount/toAccount can be 'cih' or bank_id
  if (alreadyPosted(db, "bank_transfer", transfer.id)) return;

  const amountPaisa = toPaisa(transfer.amount);
  if (amountPaisa === 0) return;

  const date = (transfer.date || new Date().toISOString()).slice(0, 10);
  const fromName = transfer.fromAccount === 'cih' ? 'Cash' : `Bank ID ${transfer.fromAccount}`;
  const toName = transfer.toAccount === 'cih' ? 'Cash' : `Bank ID ${transfer.toAccount}`;

  try {
    writeEntry(db, {
      date,
      narration: `Fund Transfer: ${fromName} -> ${toName} ${transfer.reference ? '(' + transfer.reference + ')' : ''}`,
      source_type: "bank_transfer",
      source_id:   transfer.id || Date.now(), // Generate a unique ID if not saved in a table
      lines: [
        {
          // Dr To Account
          accountId: methodAccountId(db, transfer.toAccount),
          debit: amountPaisa, credit: 0,
          memo: "Transfer deposit",
        },
        {
          // Cr From Account
          accountId: methodAccountId(db, transfer.fromAccount),
          debit: 0, credit: amountPaisa,
          memo: "Transfer withdrawal",
        },
      ],
    });
  } catch (err) {
    console.error("[glBridge] postBankTransfer failed:", err.message, { transfer });
  }
}


/* ═══════════════════════════════════════════════════════════════
   7. POST EXPENSE
   Fires after an expense is saved.
   ═══════════════════════════════════════════════════════════════ */
function postExpense(db, expense) {
  // expense: { id, expenseDate, category, description, amount, paymentMethod }
  if (alreadyPosted(db, "expense", expense.id)) return;

  const amountPaisa = toPaisa(expense.amount);
  if (amountPaisa === 0) return;

  const date = (expense.expenseDate || expense.created_at || new Date().toISOString()).slice(0, 10);

  // Attempt to find the specific expense category account. If not found, use a default Misc Expense (e.g. 6900).
  let expenseAccountId;
  try {
    const accRow = db.prepare(`SELECT id FROM accounts WHERE name = ? COLLATE NOCASE`).get(expense.category);
    if (accRow) {
      expenseAccountId = accRow.id;
    } else {
      expenseAccountId = accountId(db, "6900");
    }
  } catch (e) {
    expenseAccountId = accountId(db, "6900");
  }

  try {
    writeEntry(db, {
      date,
      narration: `Expense: ${expense.category} - ${expense.description || ''}`,
      source_type: "expense",
      source_id:   expense.id,
      lines: [
        {
          // Dr Expense Account
          accountId: expenseAccountId,
          debit: amountPaisa, credit: 0,
          memo: expense.description || "Expense",
        },
        {
          // Cr Cash / Bank
          accountId: methodAccountId(db, expense.paymentMethod || expense.moneyFrom),
          debit: 0, credit: amountPaisa,
          memo: `Payment for ${expense.category}`,
        },
      ],
    });
  } catch (err) {
    console.error("[glBridge] postExpense failed:", err.message, { expense });
  }
}

/* ═══════════════════════════════════════════════════════════════
   8. REVERSE PURCHASE ITEM
   Fires when an individual item/batch is deleted from a purchase.
   ═══════════════════════════════════════════════════════════════ */
function reversePurchaseItem(db, itemAmount, supplierId, invoiceNo, batchId) {
  const amountPaisa = toPaisa(itemAmount);
  if (amountPaisa === 0) return;

  const date = new Date().toISOString().slice(0, 10);

  try {
    writeEntry(db, {
      date,
      narration: `Item Deleted / Reversal — ${invoiceNo || 'PUR'}`,
      source_type: "void_purchase_item",
      source_id: batchId,
      lines: [
        {
          accountId: accountId(db, "2000"), // Accounts Payable
          debit: amountPaisa, credit: 0,
          supplierId: supplierId || null,
          memo: `Item reversed — ${invoiceNo}`,
        },
        {
          accountId: accountId(db, "1200"), // Inventory
          debit: 0, credit: amountPaisa,
          memo: `Inventory reversed`,
        }
      ]
    });
  } catch (err) {
    console.error("[glBridge] reversePurchaseItem failed:", err.message);
  }
}

module.exports = { postSale, postPayment, postPurchase, postSupplierPayment, voidSale, postBankTransfer, postExpense, reversePurchaseItem, clearAccountCache };
