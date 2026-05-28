const { contextBridge, ipcRenderer } = require("electron");

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld("pos", {
  login: (pin) => invoke("pos:login", pin),
  getDashboardSummary: () => invoke("pos:dashboard"),
  listProducts: (args) => invoke("pos:products:list", args),
  saveProduct: (payload) => invoke("pos:products:save", payload),
  listBatches: (args) => invoke("pos:batches:list", args),
  saveBatch: (payload) => invoke("pos:batches:save", payload),
  updateBatch: (id, payload) => invoke("pos:batches:update", id, payload),
  deleteBatch: (id) => invoke("pos:batches:delete", id),
  listSales: (args) => invoke("pos:sales:list", args),
  createSale: (payload) => invoke("pos:sales:create", payload),
  getNextInvoiceNo: (date) => invoke("pos:sales:next-invoice", date),
  getSale: (id) => invoke("pos:sales:get", id),
  voidSale: (id) => invoke("pos:sales:void", id),
  returnSale: (id, payload) => invoke("pos:sales:return", id, payload),
  listSuppliers: (search) => invoke("pos:suppliers:list", search),
  saveSupplier: (payload) => invoke("pos:suppliers:save", payload),
  deleteSupplier: (id) => invoke("pos:suppliers:delete", id),
  getSupplierHistory: (id) => invoke("pos:suppliers:history", id),
  saveSupplierPayment: (payload) => invoke("pos:suppliers:payment", payload),
  getCustomerHistory: (id) => invoke("pos:customers:history", id),
  saveCustomerPayment: (payload) => invoke("pos:customers:payment", payload),
  listCustomers: (search) => invoke("pos:customers:list", search),
  saveCustomer: (payload) => invoke("pos:customers:save", payload),
  deleteCustomer: (id) => invoke("pos:customers:delete", id),
  createPurchase: (payload) => invoke("pos:purchases:create", payload),
  getPurchaseItems: (id) => invoke("pos:purchases:items", id),
  listPurchases: (args) => invoke("pos:purchases:list", args),
  updatePurchase: (id, payload) => invoke("pos:purchases:update", id, payload),
  deletePurchase: (id) => invoke("pos:purchases:delete", id),
  getSettings: () => invoke("pos:settings:list"),
  saveSetting: (payload) => invoke("pos:settings:save", payload),
  exportBackup: (targetPath) => invoke("pos:backup:export", targetPath),
  importBackup: (sourcePath) => invoke("pos:backup:import", sourcePath),
});
