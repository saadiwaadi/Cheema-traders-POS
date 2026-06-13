const express = require("express");
const router = express.Router();
const store = require("../store");

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await store.loginUser(username, password);
    if (!user) return res.status(401).json({ message: "Invalid username or password" });
    return res.json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/users", async (req, res) => {
  try {
    const users = await store.listUsers();
    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/users/active", async (req, res) => {
  try {
    const users = await store.listActiveUsers();
    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/users", async (req, res) => {
  try {
    const user = await store.saveUser(req.body);
    return res.json({ user });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.post("/users/change-password", async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    const result = await store.changePassword(userId, oldPassword, newPassword);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.get("/dashboard", async (_req, res) => {
  try {
    const summary = await store.getDashboardSummary();
    return res.json(summary);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/monthly-report", async (_req, res) => {
  try {
    const report = await store.getMonthlyReport();
    return res.json(report);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/top-debtors", async (_req, res) => {
  try {
    const debtors = await store.getTopDebtors();
    return res.json(debtors);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/trialbalance", async (req, res) => {
  try {
    const tb = await store.getTrialBalance({ asOf: req.query.asOf });
    return res.json(tb);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/cashbook", async (req, res) => {
  try {
    const cashbook = await store.getCashBook({
      fromDate: req.query.from,
      toDate: req.query.to,
    });
    return res.json(cashbook);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/products", async (req, res) => {
  try {
    const products = await store.listProducts({ search: req.query.search || "", limit: Number(req.query.limit || 200) });
    return res.json({ products });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/products", async (req, res) => {
  try {
    const product = await store.saveProduct(req.body);
    return res.status(201).json({ product });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.get("/batches", async (req, res) => {
  try {
    const batches = await store.listBatches({ search: req.query.search || "" });
    return res.json({ batches });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/batches", async (req, res) => {
  try {
    const batch = await store.saveBatch(req.body);
    return res.status(201).json({ batch });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.patch("/batches/:id", async (req, res) => {
  try {
    const batch = await store.updateBatch(Number(req.params.id), req.body);
    return res.json({ batch });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.delete("/batches/:id", async (req, res) => {
  try {
    await store.deleteBatch(Number(req.params.id));
    return res.json({ message: "Batch deleted successfully" });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.post("/purchases", async (req, res) => {
  try {
    const purchase = await store.createPurchase(req.body);
    return res.status(201).json({ purchase });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.get("/purchases", async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const purchases = await store.listPurchases({ limit });
    return res.json({ purchases });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/purchases/:id", async (req, res) => {
  try {
    const purchase = await store.updatePurchase(Number(req.params.id), req.body);
    return res.json({ purchase });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.delete("/purchases/:id", async (req, res) => {
  try {
    await store.deletePurchase(Number(req.params.id));
    return res.json({ message: "Purchase deleted successfully" });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

// --- CUSTOMERS ---

router.get("/customers", async (req, res) => {
  try {
    const customers = await store.listCustomers(req.query.search || "");
    return res.json({ customers });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/customers", async (req, res) => {
  try {
    const customer = await store.saveCustomer(req.body);
    return res.status(201).json({ customer });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.get("/customers/:id/history", async (req, res) => {
  try {
    const history = await store.getCustomerHistory(Number(req.params.id));
    return res.json({ history });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/suppliers/:id/history", async (req, res) => {
  try {
    const history = await store.getSupplierHistory(Number(req.params.id));
    return res.json({ history });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/customer-payments", async (req, res) => {
  try {
    const payment = await store.saveCustomerPayment(req.body);
    return res.status(201).json({ payment });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.post("/customer-withdrawals", async (req, res) => {
  try {
    const withdrawal = await store.saveWithdrawal(req.body);
    return res.status(201).json({ withdrawal });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.delete("/customers/:id", async (req, res) => {
  try {
    await store.softDeleteCustomer(req.params.id);
    return res.json({ message: "Customer deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// --- SALES ---

router.get("/sales/next-invoice-no", async (_req, res) => {
  try {
    const invoiceNo = await store.peekNextInvoiceNo();
    return res.json({ invoiceNo });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/sales", async (req, res) => {
  try {
    const sales = await store.listSales({
      limit: Number(req.query.limit || 100),
      search: req.query.search || "",
      paymentMethod: req.query.paymentMethod || "",
      from: req.query.from || "",
      to: req.query.to || "",
      includeVoided: req.query.includeVoided === "true",
    });
    return res.json({ sales });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/sales/next-invoice", async (req, res) => {
  try {
    const invoiceNo = await store.getNextInvoiceNo(req.query.date);
    return res.json({ invoiceNo });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/sales/:id", async (req, res) => {
  try {
    const sale = await store.getSaleById(Number(req.params.id));
    if (!sale) return res.status(404).json({ message: "Sale not found" });
    return res.json({ sale });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/sales", async (req, res) => {
  try {
    const sale = await store.createSale(req.body);
    return res.status(201).json({ sale });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.post("/sales/:id/void", async (req, res) => {
  try {
    const sale = await store.voidSale(Number(req.params.id));
    return res.json({ sale });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.post("/sales/:id/return", async (req, res) => {
  try {
    const sale = await store.returnSaleItems(Number(req.params.id), req.body.items);
    return res.json({ sale });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.get("/customers", async (req, res) => {
  try {
    const customers = await store.listCustomers(req.query.search || "");
    return res.json({ customers });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/suppliers", async (req, res) => {
  try {
    const suppliers = await store.listSuppliers(req.query.search || "");
    return res.json({ suppliers });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/suppliers", async (req, res) => {
  try {
    const supplier = await store.saveSupplier(req.body);
    return res.status(201).json({ supplier });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.get("/suppliers/:id/history", async (req, res) => {
  try {
    const history = await store.getSupplierHistory(Number(req.params.id));
    return res.json({ history });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/purchases/:id/items", async (req, res) => {
  try {
    const items = await store.getPurchaseItems(Number(req.params.id));
    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/supplier-payments", async (req, res) => {
  try {
    const payment = await store.saveSupplierPayment(req.body);
    return res.status(201).json({ payment });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.delete("/suppliers/:id", async (req, res) => {
  try {
    await store.softDeleteSupplier(req.params.id);
    return res.json({ message: "Supplier deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/expenses", async (req, res) => {
  try {
    const result = await store.listExpenses({
      from: req.query.from,
      to: req.query.to,
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/expenses", async (req, res) => {
  try {
    const result = await store.saveExpense(req.body);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

// ============================================================================
// BANK ACCOUNTS & TRANSFERS
// ============================================================================

router.get("/banks", async (req, res) => {
  try {
    const search = req.query.q || "";
    const banks = await store.listBanks(search);
    return res.json({ banks });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/banks", async (req, res) => {
  try {
    const bank = await store.saveBank(req.body);
    return res.status(201).json({ bank });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.get("/banks/:id/history", async (req, res) => {
  try {
    const history = await store.getBankHistory(Number(req.params.id));
    return res.json({ history });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/bank-transfers", async (req, res) => {
  try {
    const transfer = await store.saveBankTransfer(req.body);
    return res.status(201).json({ transfer });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.get("/settings", async (_req, res) => {
  try {
    const settings = await store.getSettings();
    return res.json({ settings });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/settings", async (req, res) => {
  try {
    const setting = await store.updateSetting(req.body.key, req.body.value);
    return res.status(201).json({ setting });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.get("/backup/export", async (req, res) => {
  try {
    if (!req.query.path) return res.status(400).json({ message: "Backup path is required" });
    const backupPath = await store.exportBackup(req.query.path);
    return res.json({ backupPath });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/backup/download", async (req, res) => {
  try {
    res.download(store.dbPath, "cheema_traders_pos_backup.db");
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/db/info", async (req, res) => {
  try {
    const fsModule = require("fs/promises");
    const stat = await fsModule.stat(store.dbPath);
    return res.json({
      path: store.dbPath,
      size: stat.size,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/backup/import", async (req, res) => {
  try {
    if (!req.body.path) return res.status(400).json({ message: "Backup path is required" });
    const dbPath = await store.importBackup(req.body.path);
    return res.json({ dbPath });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// --- REPORTS ---

router.get("/reports/receivables", async (req, res) => {
  try {
    const data = await store.getReceivablesReport(req.query);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/reports/payables", async (req, res) => {
  try {
    const data = await store.getPayablesReport(req.query);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/reports/cashflow", async (req, res) => {
  try {
    const data = await store.getCashFlowReport(req.query);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// --- CHART OF ACCOUNTS ---
router.get("/coa", async (req, res) => {
  try {
    const list = await store.listCoaAccounts();
    return res.json(list);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/coa", async (req, res) => {
  try {
    const result = await store.createCoaAccount(req.body);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.patch("/coa/:id", async (req, res) => {
  try {
    const result = await store.updateCoaAccount({ id: Number(req.params.id), ...req.body });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

router.post("/coa/:id/deactivate", async (req, res) => {
  try {
    const result = await store.deactivateCoaAccount({ id: Number(req.params.id) });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

// --- ANALYSIS ---
router.get("/analysis/overview", async (req, res) => {
  try {
    const data = await store.getAnalysisOverview();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/analysis/revenue-trend", async (req, res) => {
  try {
    const data = await store.getRevenueTrend();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/analysis/category-sales", async (req, res) => {
  try {
    const data = await store.getCategorySalesMtd();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/analysis/sales-summary", async (req, res) => {
  try {
    const data = await store.getSalesSummaryMtd();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/analysis/product-movement", async (req, res) => {
  try {
    const data = await store.getProductMovementMtd();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/analysis/weekly-sales", async (req, res) => {
  try {
    const data = await store.getWeeklySalesActual();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/analysis/inventory", async (req, res) => {
  try {
    const data = await store.getInventoryAnalysis();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/analysis/customer-dues", async (req, res) => {
  try {
    const data = await store.getCustomerDuesAnalysis();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/analysis/supplier", async (req, res) => {
  try {
    const data = await store.getSupplierAnalysis();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
