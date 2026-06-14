const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, ipcMain } = require("electron");

const isDev = !app.isPackaged;

function ensureDatabase() {
  if (!isDev) {
    const userDataPath = app.getPath("userData");
    fs.mkdirSync(userDataPath, { recursive: true });
  }
}
ensureDatabase();

// Must set DB_PATH before requiring any backend modules
if (!isDev) {
  const targetDbPath = path.join(app.getPath("userData"), "pos.db");
  process.env.DB_PATH = targetDbPath;
  
  if (!fs.existsSync(targetDbPath)) {
    const sourceDbPath = path.join(__dirname, "..", "database", "pos.db");
    try {
      if (fs.existsSync(sourceDbPath)) {
        fs.copyFileSync(sourceDbPath, targetDbPath);
        console.log("Copied seeded database to:", targetDbPath);
      }
    } catch (err) {
      console.error("Failed to copy database:", err);
    }
  }
}

const store = require("../backend/store");

if (!isDev) {
  try {
    require("../backend/server");
  } catch (err) {
    console.error("Failed to start backend server:", err);
  }
}

let mainWindow;

function registerIpc() {
  const handlers = {
    "pos:login": (_, pin) => store.loginByPin(pin),
    "users:login": (_, username, password) => store.loginUser(username, password),
    "users:list": () => store.listUsers(),
    "users:list-active": () => store.listActiveUsers(),
    "users:save": (_, user) => store.saveUser(user),
    "users:change-password": (_, userId, oldPassword, newPassword) => store.changePassword(userId, oldPassword, newPassword),
    "pos:dashboard": () => store.getDashboardSummary(),
    "pos:products:list": async (_, args) => ({ products: await store.listProducts(args || {}) }),
    "pos:products:save": async (_, payload) => ({ product: await store.saveProduct(payload) }),
    "pos:batches:list": async (_, args) => ({ batches: await store.listBatches(args || {}) }),
    "pos:batches:save": async (_, payload) => ({ batch: await store.saveBatch(payload) }),
    "pos:batches:update": async (_, id, payload) => ({ batch: await store.updateBatch(id, payload) }),
    "pos:batches:delete": async (_, id) => { await store.deleteBatch(id); return { message: "Batch deleted successfully" }; },
    "pos:sales:list": async (_, args) => ({ sales: await store.listSales(args || {}) }),
    "pos:sales:create": async (_, payload) => ({ sale: await store.createSale(payload) }),
    "pos:sales:next-invoice": async (_, date) => ({ invoiceNo: await store.getNextInvoiceNo(date) }),
    "pos:sales:get": async (_, id) => ({ sale: await store.getSaleById(id) }),
    "pos:sales:void": async (_, id) => ({ sale: await store.voidSale(id) }),
    "pos:sales:return": async (_, id, payload) => ({ sale: await store.returnSaleItems(id, payload.items) }),
    "pos:suppliers:list": async (_, search) => ({ suppliers: await store.listSuppliers(search || "") }),
    "pos:suppliers:save": async (_, payload) => ({ supplier: await store.saveSupplier(payload) }),
    "pos:suppliers:delete": async (_, id) => { await store.softDeleteSupplier(id); return { message: "Supplier deleted successfully" }; },
    "pos:suppliers:history": async (_, id) => ({ history: await store.getSupplierHistory(id) }),
    "pos:suppliers:payment": async (_, payload) => ({ payment: await store.saveSupplierPayment(payload) }),
    "pos:customers:list": async (_, search) => ({ customers: await store.listCustomers(search || "") }),
    "pos:customers:save": async (_, payload) => ({ customer: await store.saveCustomer(payload) }),
    "pos:customers:delete": async (_, id) => { await store.softDeleteCustomer(id); return { message: "Customer deleted successfully" }; },
    "pos:customers:history": async (_, id) => ({ history: await store.getCustomerHistory(id) }),
    "pos:customers:payment": async (_, payload) => ({ payment: await store.saveCustomerPayment(payload) }),
    "pos:customers:withdrawal": async (_, payload) => ({ withdrawal: await store.saveWithdrawal(payload) }),
    "pos:purchases:create": async (_, payload) => ({ purchase: await store.createPurchase(payload) }),
    "pos:purchases:items": async (_, id) => ({ items: await store.getPurchaseItems(id) }),
    "pos:purchases:list": async (_, args) => ({ purchases: await store.listPurchases(args || {}) }),
    "pos:purchases:update": async (_, id, payload) => ({ purchase: await store.updatePurchase(id, payload) }),
    "pos:purchases:delete": async (_, id) => { await store.deletePurchase(id); return { message: "Purchase deleted successfully" }; },
    "pos:settings:list": async () => ({ settings: await store.getSettings() }),
    "pos:settings:save": async (_, payload) => ({ setting: await store.updateSetting(payload.key, payload.value) }),
    "pos:backup:export": async (_, targetPath) => ({ backupPath: await store.exportBackup(targetPath) }),
    "pos:backup:import": async (_, sourcePath) => ({ dbPath: await store.importBackup(sourcePath) }),
    "system:reset-data": async () => ({ result: await store.resetDatabase() }),
    "coa:list": () => store.listCoaAccounts(),
    "coa:create": (_, payload) => store.createCoaAccount(payload),
    "coa:update": (_, payload) => store.updateCoaAccount(payload),
    "coa:deactivate": (_, payload) => store.deactivateCoaAccount(payload),
    "db:get-monthly-report": () => store.getMonthlyReport(),
    "db:get-top-debtors": () => store.getTopDebtors(),
    "trialbalance:get": (_, args) => store.getTrialBalance(args),
    "journal:create": (_, payload) => store.createJournalEntry(payload),
    "journal:list": (_, args) => store.listJournalEntries(args),
    "journal:get": (_, id) => store.getJournalEntry(id),
    "journal:reverse": (_, payload) => store.reverseJournalEntry(payload),
    "journal:delete": (_, id) => store.deleteJournalEntry(id),
    "journal:next-no": (_, date) => store.nextJournalEntryNo(date),
    "journal:ledger": (_, args) => store.getGeneralLedger(args),
    "pos:expenses:list": (_, args) => store.listExpenses(args || {}),
    "pos:expenses:save": (_, payload) => store.saveExpense(payload),
    "pos:expenses:delete": (_, id) => store.deleteExpense(id),
    "pos:banks:list": async (_, search) => ({ banks: await store.listBanks(search || "") }),
    "pos:banks:save": async (_, payload) => ({ bank: await store.saveBank(payload) }),
    "pos:banks:history": async (_, id) => ({ history: await store.getBankHistory(id) }),
    "pos:banks:transfer": async (_, payload) => ({ transfer: await store.saveBankTransfer(payload) }),
    "pos:banks:cashbook": (_, args) => store.getCashBook(args || {}),
    "db:get-receivables": (_, args) => store.getReceivablesReport(args || {}),
    "db:get-payables": (_, args) => store.getPayablesReport(args || {}),
    "db:get-cashflow": (_, args) => store.getCashFlowReport(args || {}),
    "analysis:overview": () => store.getAnalysisOverview(),
    "analysis:revenue-trend": () => store.getRevenueTrend(),
    "analysis:category-sales": () => store.getCategorySalesMtd(),
    "analysis:sales-summary": () => store.getSalesSummaryMtd(),
    "analysis:product-movement": () => store.getProductMovementMtd(),
    "analysis:weekly-sales": () => store.getWeeklySalesActual(),
    "analysis:inventory": () => store.getInventoryAnalysis(),
    "analysis:customer-dues": () => store.getCustomerDuesAnalysis(),
    "analysis:supplier": () => store.getSupplierAnalysis(),
    "pos:license:info": () => store.getLicenseInfo(),
    "pos:license:activate": (_, payload) => store.activateLicense(payload),
    "analysis:roi-stats": (_, args) => store.getRoiStats(args),
    "pos:employees:list": async (_, search) => ({ employees: await store.listEmployees(search || "") }),
    "pos:employees:save": async (_, payload) => ({ employee: await store.addEmployee(payload) }),
    "pos:employees:history": async (_, id) => ({ history: await store.getEmployeeHistory(id) }),
    "pos:employees:transaction": async (_, payload) => await store.recordEmployeeTransaction(payload),
    "pos:employees:stats": async () => await store.getEmployeeStats(),
    "db:print-html-report": async (_, html) => {
      let printWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
      printWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
      printWindow.webContents.on("did-finish-load", () => {
        printWindow.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
          printWindow.destroy();
        });
      });
      return true;
    },
    "system:versions": () => ({
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      appVersion: app.getVersion()
    }),
    "system:show-save-dialog": async (_, options) => {
      const { dialog } = require("electron");
      return dialog.showSaveDialog(mainWindow, options);
    },
    "system:show-open-dialog": async (_, options) => {
      const { dialog } = require("electron");
      return dialog.showOpenDialog(mainWindow, options);
    },
    "system:delete-backup": async (_, targetPath) => {
      return store.deleteBackup(targetPath);
    },
    "db:info": async () => {
      const fs = require("fs/promises");
      const pathModule = require("path");
      const stat = await fs.stat(store.dbPath);
      const homeDir = process.env.USERPROFILE || process.env.HOME || "C:";
      const backupDir = pathModule.join(homeDir, "CheemaTradersPOS", "Backups");
      return {
        path: store.dbPath,
        size: stat.size,
        backupDir: backupDir,
      };
    },
  };

  Object.entries(handlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, handler);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#f4faf4",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (isDev) {
    await mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(path.join(__dirname, "..", "frontend", "dist", "index.html"));
  }
}

app.whenReady().then(async () => {
  registerIpc();
  await createWindow();
});

app.on("window-all-closed", async () => {
  await store.close().catch(() => {});
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
