const BASE = "http://localhost:5000/api";

async function req(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

export const api = {
  /* ── Products ─────────────────────────────────── */
  getProducts: (search = "") =>
    req("GET", `/pos/products?search=${encodeURIComponent(search)}`),

  /* ── Customers ─────────────────────────────────── */
  getCustomers: (search = "") =>
    req("GET", `/pos/customers?search=${encodeURIComponent(search)}`),

  /* ── Sales ─────────────────────────────────────── */
  createSale: (payload) => req("POST", "/pos/sales", payload),
  getSales: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("GET", `/pos/sales${qs ? `?${qs}` : ""}`);
  },
  getSale: (id) => req("GET", `/pos/sales/${id}`),
  voidSale: (id) => req("POST", `/pos/sales/${id}/void`),
  nextInvoiceNo: () => req("GET", "/pos/sales/next-invoice-no"),
};
