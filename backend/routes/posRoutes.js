const express = require("express");
const router = express.Router();
const store = require("../store");

router.post("/login", async (req, res) => {
  try {
    const user = await store.loginByPin(req.body.pin);
    if (!user) return res.status(401).json({ message: "Invalid PIN" });
    return res.json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
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

router.post("/purchases", async (req, res) => {
  try {
    const purchase = await store.createPurchase(req.body);
    return res.status(201).json({ purchase });
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

router.post("/customer-payments", async (req, res) => {
  try {
    const payment = await store.saveCustomerPayment(req.body);
    return res.status(201).json({ payment });
  } catch (error) {
    return res.status(400).json({ message: error.message });
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

router.post("/backup/import", async (req, res) => {
  try {
    if (!req.body.path) return res.status(400).json({ message: "Backup path is required" });
    const dbPath = await store.importBackup(req.body.path);
    return res.json({ dbPath });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
