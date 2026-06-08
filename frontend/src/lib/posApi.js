const HTTP_BASE = "http://localhost:5000/api/pos";

async function httpJson(path, options = {}) {
  const response = await fetch(`${HTTP_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

function usingIpc() {
  return typeof window !== "undefined" && window.pos;
}

export async function loginWithPin(pin) {
  if (usingIpc()) return window.pos.login(pin);
  return httpJson("/login", { method: "POST", body: JSON.stringify({ pin }) });
}

export async function getDashboardSummary() {
  if (usingIpc()) return window.pos.getDashboardSummary();
  return httpJson("/dashboard");
}

export async function getMonthlyReport() {
  if (usingIpc()) {
    if (window.pos.getMonthlyReport) return window.pos.getMonthlyReport();
    if (window.ipc) return window.ipc.invoke("db:get-monthly-report");
  }
  return httpJson("/monthly-report");
}

export async function getTopDebtors() {
  if (usingIpc()) {
    if (window.pos.getTopDebtors) return window.pos.getTopDebtors();
    if (window.ipc) return window.ipc.invoke("db:get-top-debtors");
  }
  return httpJson("/top-debtors");
}

export async function getTrialBalance(args) {
  if (usingIpc()) {
    if (window.ipc) return window.ipc.invoke("trialbalance:get", args);
  }
  const query = new URLSearchParams();
  if (args.asOf) query.set("asOf", args.asOf);
  return httpJson(`/trialbalance?${query.toString()}`);
}

export async function listProducts(args = {}) {
  if (usingIpc()) return window.pos.listProducts(args);
  const query = new URLSearchParams();
  if (args.search) query.set("search", args.search);
  if (args.limit) query.set("limit", String(args.limit));
  return httpJson(`/products?${query.toString()}`);
}

export async function saveProduct(payload) {
  if (usingIpc()) return window.pos.saveProduct(payload);
  return httpJson("/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listBatches(args = {}) {
  if (usingIpc()) return window.pos.listBatches(args);
  const query = new URLSearchParams();
  if (args.search) query.set("search", args.search);
  return httpJson(`/batches?${query.toString()}`);
}

export async function saveBatch(payload) {
  if (usingIpc()) return window.pos.saveBatch(payload);
  return httpJson("/batches", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateBatch(id, payload) {
  if (usingIpc()) return window.pos.updateBatch(id, payload);
  return httpJson(`/batches/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteBatch(id) {
  if (usingIpc()) return window.pos.deleteBatch(id);
  return httpJson(`/batches/${id}`, {
    method: "DELETE",
  });
}

export async function createPurchase(payload) {
  if (usingIpc()) return window.pos.createPurchase(payload);
  return httpJson("/purchases", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listPurchases(args = {}) {
  if (usingIpc()) return window.pos.listPurchases(args);
  const q = new URLSearchParams(args).toString();
  return httpJson(`/purchases?${q}`);
}

export async function updatePurchase(id, payload) {
  if (usingIpc()) return window.pos.updatePurchase(id, payload);
  return httpJson(`/purchases/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deletePurchase(id) {
  if (usingIpc()) return window.pos.deletePurchase(id);
  return httpJson(`/purchases/${id}`, {
    method: "DELETE",
  });
}

export async function getPurchaseItems(id) {
  if (usingIpc()) return window.pos.getPurchaseItems(id);
  return httpJson(`/purchases/${id}/items`);
}

// --- CUSTOMERS ---

export async function listCustomers(search = "") {
  if (usingIpc()) return window.pos.listCustomers(search);
  const query = new URLSearchParams();
  if (search) query.set("search", search);
  return httpJson(`/customers?${query.toString()}`);
}

export async function saveCustomer(payload) {
  if (usingIpc()) return window.pos.saveCustomer(payload);
  return httpJson("/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCustomerHistory(id) {
  if (usingIpc()) return window.pos.getCustomerHistory(id);
  return httpJson(`/customers/${id}/history`);
}

export async function saveCustomerPayment(payload) {
  if (usingIpc()) return window.pos.saveCustomerPayment(payload);
  return httpJson("/customer-payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function saveWithdrawal(payload) {
  if (usingIpc()) return window.pos.saveWithdrawal(payload);
  return httpJson("/customer-withdrawals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listExpenses(args = {}) {
  if (usingIpc()) return window.pos.listExpenses(args);
  const q = new URLSearchParams(args).toString();
  return httpJson(`/expenses?${q}`);
}

export async function saveExpense(payload) {
  if (usingIpc()) return window.pos.saveExpense(payload);
  return httpJson("/expenses", { method: "POST", body: JSON.stringify(payload) });
}

export async function listSales(args = {}) {
  if (usingIpc()) return window.pos.listSales(args);
  const query = new URLSearchParams();
  if (args.limit) query.set("limit", String(args.limit));
  if (args.search) query.set("search", args.search);
  if (args.paymentMethod) query.set("paymentMethod", args.paymentMethod);
  if (args.from) query.set("from", args.from);
  if (args.to) query.set("to", args.to);
  if (args.includeVoided) query.set("includeVoided", "true");
  return httpJson(`/sales?${query.toString()}`);
}

export async function saveSale(payload) {
  if (usingIpc()) return window.pos.createSale(payload);
  return httpJson("/sales", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSale(id) {
  if (usingIpc()) return window.pos.getSale(id);
  return httpJson(`/sales/${id}`);
}

export async function voidSale(id) {
  if (usingIpc()) return window.pos.voidSale(id);
  return httpJson(`/sales/${id}/void`, {
    method: "POST",
  });
}

export async function returnSale(id, payload) {
  if (usingIpc()) return window.pos.returnSale(id, payload);
  return httpJson(`/sales/${id}/return`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getNextInvoiceNo(date) {
  if (usingIpc()) return window.pos.getNextInvoiceNo(date);
  const query = new URLSearchParams();
  if (date) query.set("date", date);
  return httpJson(`/sales/next-invoice?${query.toString()}`);
}

export async function listSuppliers(search = "") {
  if (usingIpc()) return window.pos.listSuppliers(search);
  const query = new URLSearchParams();
  if (search) query.set("search", search);
  return httpJson(`/suppliers?${query.toString()}`);
}

export async function saveSupplier(payload) {
  if (usingIpc()) return window.pos.saveSupplier(payload);
  return httpJson("/suppliers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSupplierHistory(id) {
  if (usingIpc()) return window.pos.getSupplierHistory(id);
  return httpJson(`/suppliers/${id}/history`);
}

export async function saveSupplierPayment(payload) {
  if (usingIpc()) return window.pos.saveSupplierPayment(payload);
  return httpJson("/supplier-payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listBanks(search = "") {
  if (usingIpc()) return window.pos.listBanks(search);
  const query = new URLSearchParams();
  if (search) query.set("search", search);
  return httpJson(`/banks?${query.toString()}`);
}

export async function saveBank(payload) {
  if (usingIpc()) return window.pos.saveBank(payload);
  return httpJson("/banks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getBankHistory(id) {
  if (usingIpc()) return window.pos.getBankHistory(id);
  return httpJson(`/banks/${id}/history`);
}

export async function saveBankTransfer(payload) {
  if (usingIpc()) return window.pos.saveBankTransfer(payload);
  return httpJson("/bank-transfers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteSupplier(id) {
  if (usingIpc()) return window.pos.deleteSupplier(id);
  return httpJson(`/suppliers/${id}`, { method: "DELETE" });
}

export async function getSettings() {
  if (usingIpc()) return window.pos.getSettings();
  return httpJson("/settings");
}

export async function saveSetting(payload) {
  if (usingIpc()) return window.pos.saveSetting(payload);
  return httpJson("/settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function exportBackup(targetPath) {
  if (usingIpc()) return window.pos.exportBackup(targetPath);
  return httpJson(`/backup/export?path=${encodeURIComponent(targetPath)}`);
}

export async function importBackup(sourcePath) {
  if (usingIpc()) return window.pos.importBackup(sourcePath);
  return httpJson("/backup/import", {
    method: "POST",
    body: JSON.stringify({ path: sourcePath }),
  });
}

export async function getCashBook(args = {}) {
  if (usingIpc()) return window.pos.getCashBook(args);
  const query = new URLSearchParams();
  if (args.fromDate) query.set("from", args.fromDate);
  if (args.toDate) query.set("to", args.toDate);
  return httpJson(`/cashbook?${query.toString()}`);
}

export async function deleteCustomer(id) {
  if (usingIpc()) return window.pos.deleteCustomer(id);
  return httpJson(`/customers/${id}`, { method: "DELETE" });
}

export async function getReceivables(args = {}) {
  if (usingIpc()) return window.pos.getReceivables(args);
  const q = new URLSearchParams(args).toString();
  return httpJson(`/reports/receivables?${q}`);
}

export async function getPayables(args = {}) {
  if (usingIpc()) return window.pos.getPayables(args);
  const q = new URLSearchParams(args).toString();
  return httpJson(`/reports/payables?${q}`);
}

export async function getCashFlow(args = {}) {
  if (usingIpc()) return window.pos.getCashFlow(args);
  const q = new URLSearchParams(args).toString();
  return httpJson(`/reports/cashflow?${q}`);
}

// --- CHART OF ACCOUNTS ---

export async function listCoaAccounts() {
  if (usingIpc() && window.ipc) return window.ipc.invoke("coa:list");
  return httpJson("/coa");
}

export async function createCoaAccount(payload) {
  if (usingIpc() && window.ipc) return window.ipc.invoke("coa:create", payload);
  return httpJson("/coa", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateCoaAccount(payload) {
  if (usingIpc() && window.ipc) return window.ipc.invoke("coa:update", payload);
  return httpJson(`/coa/${payload.id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deactivateCoaAccount(id) {
  if (usingIpc() && window.ipc) return window.ipc.invoke("coa:deactivate", { id });
  return httpJson(`/coa/${id}/deactivate`, { method: "POST" });
}
