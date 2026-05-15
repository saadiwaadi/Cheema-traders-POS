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

export async function listSales(args = {}) {
  if (usingIpc()) return window.pos.listSales(args);
  const query = new URLSearchParams();
  if (args.limit) query.set("limit", String(args.limit));
  return httpJson(`/sales?${query.toString()}`);
}

export async function saveSale(payload) {
  if (usingIpc()) return window.pos.createSale(payload);
  return httpJson("/sales", {
    method: "POST",
    body: JSON.stringify(payload),
  });
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
