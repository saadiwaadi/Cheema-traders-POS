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
  listSales: (args) => invoke("pos:sales:list", args),
  createSale: (payload) => invoke("pos:sales:create", payload),
  listSuppliers: (search) => invoke("pos:suppliers:list", search),
  saveSupplier: (payload) => invoke("pos:suppliers:save", payload),
  deleteSupplier: (id) => invoke("pos:suppliers:delete", id),
  getSettings: () => invoke("pos:settings:list"),
  saveSetting: (payload) => invoke("pos:settings:save", payload),
  exportBackup: (targetPath) => invoke("pos:backup:export", targetPath),
  importBackup: (sourcePath) => invoke("pos:backup:import", sourcePath),
});
