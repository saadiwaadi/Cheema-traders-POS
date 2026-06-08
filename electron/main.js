const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");

const isDev = !app.isPackaged;

// Must set DB_PATH before requiring any backend modules
if (!isDev) {
  process.env.DB_PATH = path.join(app.getPath("userData"), "pos.db");
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
    "pos:dashboard": () => store.getDashboardSummary(),
    "pos:products:list": (_, args) => store.listProducts(args || {}),
    "pos:products:save": (_, payload) => store.saveProduct(payload),
    "pos:batches:list": (_, args) => store.listBatches(args || {}),
    "pos:batches:save": (_, payload) => store.saveBatch(payload),
    "pos:batches:update": (_, id, payload) => store.updateBatch(id, payload),
    "pos:batches:delete": (_, id) => store.deleteBatch(id),
    "pos:sales:list": (_, args) => store.listSales(args || {}),
    "pos:sales:create": (_, payload) => store.createSale(payload),
    "pos:sales:next-invoice": (_, date) => store.getNextInvoiceNo(date),
    "pos:sales:get": (_, id) => store.getSaleById(id),
    "pos:sales:void": (_, id) => store.voidSale(id),
    "pos:sales:return": (_, id, payload) => store.returnSaleItems(id, payload.items),
    "pos:suppliers:list": (_, search) => store.listSuppliers(search || ""),
    "pos:suppliers:save": (_, payload) => store.saveSupplier(payload),
    "pos:suppliers:delete": (_, id) => store.softDeleteSupplier(id),
    "pos:suppliers:history": (_, id) => store.getSupplierHistory(id),
    "pos:suppliers:payment": (_, payload) => store.saveSupplierPayment(payload),
    "pos:customers:list": (_, search) => store.listCustomers(search || ""),
    "pos:customers:save": (_, payload) => store.saveCustomer(payload),
    "pos:customers:delete": (_, id) => store.softDeleteCustomer(id),
    "pos:customers:history": (_, id) => store.getCustomerHistory(id),
    "pos:customers:payment": (_, payload) => store.saveCustomerPayment(payload),
    "pos:customers:withdrawal": (_, payload) => store.saveWithdrawal(payload),
    "pos:purchases:create": (_, payload) => store.createPurchase(payload),
    "pos:purchases:items": (_, id) => store.getPurchaseItems(id),
    "pos:purchases:list": (_, args) => store.listPurchases(args || {}),
    "pos:purchases:update": (_, id, payload) => store.updatePurchase(id, payload),
    "pos:purchases:delete": (_, id) => store.deletePurchase(id),
    "pos:settings:list": () => store.getSettings(),
    "pos:settings:save": (_, payload) => store.updateSetting(payload.key, payload.value),
    "pos:backup:export": (_, targetPath) => store.exportBackup(targetPath),
    "pos:backup:import": (_, sourcePath) => store.importBackup(sourcePath),
    "coa:list": () => store.listCoaAccounts(),
    "coa:create": (_, payload) => store.createCoaAccount(payload),
    "coa:update": (_, payload) => store.updateCoaAccount(payload),
    "coa:deactivate": (_, payload) => store.deactivateCoaAccount(payload),
    "db:get-monthly-report": () => store.getMonthlyReport(),
    "db:get-top-debtors": () => store.getTopDebtors(),
    "journal:create": (_, payload) => store.createJournalEntry(payload),
    "journal:list": (_, args) => store.listJournalEntries(args),
    "journal:get": (_, id) => store.getJournalEntry(id),
    "journal:reverse": (_, payload) => store.reverseJournalEntry(payload),
    "journal:next-no": (_, date) => store.nextJournalEntryNo(date),
    "journal:ledger": (_, args) => store.getGeneralLedger(args),
    "pos:expenses:list": (_, args) => store.listExpenses(args || {}),
    "pos:expenses:save": (_, payload) => store.saveExpense(payload),
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
