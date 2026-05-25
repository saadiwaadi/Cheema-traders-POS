import React, { useEffect, useMemo, useState } from "react";
import {
  MoreVertical,
  Download,
  FileText,
  CheckCircle2,
  Trash2,
  Copy,
  Send,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
  Pencil,
  RotateCcw,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

import { listSales, getSale, voidSale, saveCustomerPayment } from "../lib/posApi";


const statusStyles = {
  Paid: "bg-[#EAF3DE] text-[#3B6D11]",
  Pending: "bg-[#FAEEDA] text-[#854F0B]",
  Returned: "bg-[#F1EFE8] text-[#7a5c00]",
};

const statusFilters = ["All", "Paid", "Pending", "Returned"];

const formatMoney = (num) =>
  `₨ ${num.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

export default function InvoiceHistoryModule() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [drawerInvoice, setDrawerInvoice] = useState(null);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState([]);
  const [returnInvoice, setReturnInvoice] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});
  const [expandedRowY, setExpandedRowY] = useState(0);
  const [returnSelections, setReturnSelections] = useState({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadInvoices = () => {
    setLoading(true);
    setError("");
    listSales({ limit: 1000 })
      .then(({ sales }) => {
        const mapped = (sales || []).map(s => ({
          id: s.id,
          invoiceNo: s.invoiceNo,
          customerId: s.customerId,
          client: s.customerName || "Walk-in Customer",
          issueDate: s.saleDate,
          dueDate: s.saleDate,
          amount: s.subtotal,
          discountTotal: s.discountTotal || 0,
          tax: 0,
          total: s.total,
          balanceDue: s.balanceDue,
          status: s.paymentStatus === "Paid" ? "Paid" : "Pending",
          items: [],
          itemsLoaded: false,
          paymentHistory: s.amountPaid > 0 ? [{ date: s.saleDate, amount: s.amountPaid, method: s.paymentMethod }] : [],
        }));
        setInvoices(mapped);
      })
      .catch(e => {
        console.error("Failed to load invoices:", e);
        setError(e.message || "Failed to load invoices.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const fetchInvoiceDetails = async (id) => {
    const inv = invoices.find(i => i.id === id);
    if (!inv || inv.itemsLoaded) return inv;

    try {
      const { sale } = await getSale(id);
      if (sale) {
        const mappedItems = (sale.items || []).map(item => ({
          name: item.productName || item.name,
          qty: item.quantity || item.qty,
          price: item.unitPrice || item.price,
          discount: item.discount || 0,
          lineTotal: item.lineTotal || ((item.quantity || item.qty) * (item.unitPrice || item.price))
        }));
        const updatedInvoice = {
          ...inv,
          itemsLoaded: true,
          items: mappedItems
        };
        setInvoices(prev => prev.map(item => item.id === id ? updatedInvoice : item));
        return updatedInvoice;
      }
    } catch (e) {
      console.error("Error loading invoice items:", e);
    }
    return inv;
  };

  const openDrawer = async (inv) => {
    setDrawerInvoice(inv);
    const updated = await fetchInvoiceDetails(inv.id);
    if (updated) {
      setDrawerInvoice(updated);
    }
  };

  useEffect(() => {
    const close = (e) => {
      if (e.key === "Escape") setDrawerInvoice(null);
    };

    window.addEventListener("keydown", close);

    return () => window.removeEventListener("keydown", close);
  }, []);

  useEffect(() => {
    if (!statusFilters.includes(selectedStatus)) {
      setSelectedStatus("All");
    }
  }, [selectedStatus, statusFilters]);

  useEffect(() => {
    setPage(1);
  }, [selectedStatus, search, sort, fromDate, toDate]);

  const filteredInvoices = useMemo(() => {
    let data = [...invoices];
    let startDate = null;
    let endDate = null;

    if (fromDate) {
      startDate = new Date(`${fromDate}T00:00:00`);
    }

    if (toDate) {
      endDate = new Date(`${toDate}T23:59:59`);
    }

    if (startDate && endDate && startDate > endDate) {
      const temp = startDate;
      startDate = endDate;
      endDate = temp;
    }

    if (startDate || endDate) {
      data = data.filter((i) => {
        const invoiceDate = new Date(`${i.issueDate}T12:00:00`);
        const afterStart = startDate ? invoiceDate >= startDate : true;
        const beforeEnd = endDate ? invoiceDate <= endDate : true;
        return afterStart && beforeEnd;
      });
    }

    if (selectedStatus !== "All") {
      data = data.filter((i) => i.status === selectedStatus);
    }

    if (search) {
      data = data.filter((i) =>
        i.client.toLowerCase().includes(search.toLowerCase()) ||
        i.invoiceNo.toLowerCase().includes(search.toLowerCase())
      );
    }

    switch (sort) {
      case "newest":
        data.sort(
          (a, b) =>
            new Date(b.issueDate).getTime() -
            new Date(a.issueDate).getTime()
        );
        break;
      case "oldest":
        data.sort(
          (a, b) =>
            new Date(a.issueDate).getTime() -
            new Date(b.issueDate).getTime()
        );
        break;
      case "high":
        data.sort((a, b) => b.total - a.total);
        break;
      case "low":
        data.sort((a, b) => a.total - b.total);
        break;
    }

    return data;
  }, [
    invoices,
    selectedStatus,
    search,
    sort,
    fromDate,
    toDate,
  ]);

  const totalInvoices = invoices.length;

  const totalCollected = invoices
    .filter((i) => i.status === "Paid")
    .reduce((acc, curr) => acc + curr.total, 0);

  const outstanding = invoices
    .filter((i) => i.status === "Pending")
    .reduce((acc, curr) => acc + curr.balanceDue, 0);

  const totalPages = Math.ceil(filteredInvoices.length / rowsPerPage);

  const paginated = filteredInvoices.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  const toggleSelect = (id) => {
    setSelectedRows((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  };

  const markSelectedPaid = async () => {
    const pendingRows = invoices.filter(i => selectedRows.includes(i.id) && i.status !== "Paid");
    if (!pendingRows.length) {
      setSelectedRows([]);
      return;
    }
    
    const hasWalkIn = pendingRows.some(i => !i.customerId);
    if (hasWalkIn) {
      alert("One or more selected invoices belong to Walk-in customers. Bulk payment is only supported for registered customers.");
      return;
    }

    try {
      for (const inv of pendingRows) {
        await saveCustomerPayment({
          customerId: inv.customerId,
          saleId: inv.id,
          amount: inv.balanceDue,
          method: "Cash",
          notes: "Marked as paid in bulk"
        });
      }
      loadInvoices();
      setSelectedRows([]);
    } catch (err) {
      alert("Error marking some invoices as paid: " + err.message);
    }
  };

  const markOnePaid = async (id) => {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    if (!inv.customerId) {
      alert("Walk-in customer sales cannot be paid via account payment. Please void or edit the sale.");
      return;
    }
    if (inv.balanceDue <= 0) {
      alert("Invoice is already paid.");
      return;
    }
    try {
      await saveCustomerPayment({
        customerId: inv.customerId,
        saleId: id,
        amount: inv.balanceDue,
        method: "Cash",
        notes: "Marked as paid from invoice history"
      });
      loadInvoices();
      if (drawerInvoice?.id === id) {
        setDrawerInvoice(prev => ({ ...prev, status: "Paid", balanceDue: 0 }));
      }
    } catch (err) {
      alert("Failed to mark as paid: " + err.message);
    }
  };

  const deleteInvoice = async (id) => {
    if (!window.confirm("Delete (void) this invoice? This cannot be undone.")) return;
    try {
      await voidSale(id);
      loadInvoices();
      if (drawerInvoice?.id === id) setDrawerInvoice(null);
    } catch (err) {
      alert("Failed to void invoice: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f6f0] p-6 text-[#1A1A1A]">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* TOP METRICS */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <button
            onClick={() => setSelectedStatus("All")}
            className="rounded-3xl bg-white p-6 shadow-sm transition hover:shadow-md text-left"
          >
            <p className="text-sm text-neutral-500">Total Invoices</p>
            <h2 className="mt-3 text-4xl font-bold">
              {totalInvoices}
            </h2>
          </button>

          <div className="rounded-3xl bg-white p-6 shadow-sm border border-[#EAF3DE]">
            <p className="text-sm text-[#3B6D11]">
              Total Collected
            </p>
            <h2 className="mt-3 text-4xl font-bold text-[#3B6D11]">
              {formatMoney(totalCollected)}
            </h2>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm border border-[#FCEBEB]">
            <p className="text-sm text-[#A32D2D]">Outstanding</p>
            <h2 className="mt-3 text-4xl font-bold text-[#A32D2D]">
              {formatMoney(outstanding)}
            </h2>
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
                <Calendar size={16} className="text-neutral-500" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                  }}
                  className="bg-transparent text-sm outline-none"
                  aria-label="From date"
                />

                <span className="text-xs text-neutral-400">to</span>

                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                  }}
                  className="bg-transparent text-sm outline-none"
                  aria-label="To date"
                />
              </div>

              <div className="flex overflow-hidden rounded-xl bg-[#e4ede4]">
                {statusFilters.map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setSelectedStatus(status);
                      setPage(1);
                    }}
                    className={`px-4 py-2 text-sm font-medium transition ${selectedStatus === status
                      ? "bg-[#2e7d32] text-white"
                      : "text-neutral-600 hover:bg-[#d0dfd0]"
                      }`}
                  >
                    {status}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 rounded-xl border px-4 py-2">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search client..."
                  className="bg-transparent outline-none"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  const headers = ["Invoice", "Client", "Issue Date", "Due Date", "Subtotal", "Total", "Balance Due", "Status"];
                  const rows = filteredInvoices.map(i => [
                    i.invoiceNo, i.client, i.issueDate, i.dueDate,
                    i.amount, i.total, i.balanceDue, i.status
                  ]);
                  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = "invoices.csv"; a.click();
                  URL.revokeObjectURL(url);
                }}
                className="rounded-xl border px-4 py-2 font-medium hover:bg-neutral-50"
              >
                Export CSV
              </button>

              <button className="rounded-xl bg-[#2e7d32] px-4 py-2 font-medium text-white hover:opacity-90">
                Export PDF
              </button>
            </div>
          </div>
        </div>

        {/* BULK ACTION BAR */}
        {selectedRows.length > 0 && (
          <div className="flex items-center justify-between rounded-2xl bg-[#2e7d32] px-5 py-4 text-white">
            <p>{selectedRows.length} invoices selected</p>

            <div className="flex gap-2">
              <button
                onClick={markSelectedPaid}
                className="rounded-xl bg-white/15 px-4 py-2"
              >
                Bulk Mark as Paid
              </button>

              <button className="rounded-xl bg-white/15 px-4 py-2">
                Bulk Export
              </button>
            </div>
          </div>
        )}

        {/* TABLE */}
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="border-b bg-[#fafdfa] text-left text-sm text-neutral-500">
                <tr>
                  <th className="px-5 py-4">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRows(
                            paginated.map((i) => i.id)
                          );
                        } else {
                          setSelectedRows([]);
                        }
                      }}
                    />
                  </th>

                  <th className="px-5 py-4">
                    Invoice / Client
                  </th>
                  <th className="px-5 py-4">Issue Date</th>
                  <th className="px-5 py-4">Due Date</th>
                  <th className="px-5 py-4 text-right">
                    Amount
                  </th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>

              <tbody>
                {paginated.map((invoice) => {
                  const overdue =
                    invoice.status === "Overdue";

                  return (
                    <React.Fragment key={invoice.id}>
                      <tr
                        className="cursor-pointer border-b transition hover:bg-[#fafdfa]"
                        onClick={async (e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setExpandedRowY(rect.top);
                          const isOpening = !expandedRows[invoice.id];
                          setExpandedRows(prev => ({ ...prev, [invoice.id]: isOpening }));
                          if (isOpening) {
                            await fetchInvoiceDetails(invoice.id);
                          }
                        }}
                      >
                        <td
                          className="px-5 py-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(
                              invoice.id
                            )}
                            onChange={() =>
                              toggleSelect(invoice.id)
                            }
                          />
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            {expandedRows[invoice.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            <div>
                              <p className="font-semibold">{invoice.invoiceNo || invoice.id}</p>
                              <p className="text-sm text-neutral-500">{invoice.client}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          {formatDate(invoice.issueDate)}
                        </td>

                        <td
                          className={`px-5 py-4 ${overdue
                            ? "font-medium text-[#A32D2D]"
                            : ""
                            }`}
                        >
                          {formatDate(invoice.dueDate)}
                        </td>

                        <td
                          className="px-5 py-4 text-right font-medium"
                        >
                          {formatMoney(invoice.total)}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[invoice.status]}`}
                          >
                            {invoice.status}
                          </span>
                        </td>

                        <td
                          className="px-5 py-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="group relative inline-block">
                            <button className="rounded-lg p-2 hover:bg-neutral-100">
                              <MoreVertical size={18} />
                            </button>

                            <div className="invisible absolute right-0 z-20 mt-2 w-52 rounded-2xl border bg-white p-2 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
                              {[
                                { label: "View", icon: FileText, action: (inv) => openDrawer(inv) },
                                { label: "Download PDF", icon: Download, action: () => { } },
                                { label: "Mark as paid", icon: CheckCircle2, action: (inv) => markOnePaid(inv.id) },
                                { label: "Return Items", icon: RotateCcw, action: (inv) => {
                                  setReturnInvoice(inv);
                                  fetchInvoiceDetails(inv.id);
                                } },
                                { label: "Delete", icon: Trash2, action: (inv) => deleteInvoice(inv.id) },
                              ].map((item) => (
                                <button
                                  key={item.label}
                                  onClick={() => item.action(invoice)}
                                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-neutral-100"
                                >
                                  <item.icon size={16} />
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                      {expandedRows[invoice.id] && (
                        <tr style={{ display: "none" }} />
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}
          <div className="flex flex-col gap-4 border-t px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-500">
                Rows per page
              </span>

              <select
                className="rounded-lg border px-3 py-2"
                value={rowsPerPage}
                onChange={(e) =>
                  setRowsPerPage(Number(e.target.value))
                }
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>

              <p className="text-sm text-neutral-500">
                Showing {(page - 1) * rowsPerPage + 1}–
                {Math.min(
                  page * rowsPerPage,
                  filteredInvoices.length
                )}{" "}
                of {filteredInvoices.length} invoices
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() =>
                  setPage((prev) => prev - 1)
                }
                className="rounded-xl border p-2 disabled:opacity-40"
              >
                <ChevronLeft size={18} />
              </button>

              <button
                disabled={page === totalPages}
                onClick={() =>
                  setPage((prev) => prev + 1)
                }
                className="rounded-xl border p-2 disabled:opacity-40"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          {Object.entries(expandedRows).map(([id, open]) => {
            if (!open) return null;
            const inv = paginated.find(i => String(i.id) === id);
            if (!inv) return null;
            return (
              <div
                key={id}
                style={{ top: Math.min(expandedRowY - 10, window.innerHeight - 320) }}
                className="fixed right-6 z-50 w-[520px] rounded-3xl bg-white shadow-2xl border border-[#e8f0e8] p-5"
              >
                <div className="flex justify-between items-center mb-3">
                  <p className="font-bold">{inv.invoiceNo || inv.id} — {inv.client}</p>
                  <button onClick={() => setExpandedRows(prev => ({ ...prev, [id]: false }))}>
                    <X size={16} />
                  </button>
                </div>
                {!inv.itemsLoaded ? (
                  <div className="py-6 text-center text-sm text-[#2e7d32] font-medium">Loading items...</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-neutral-500 border-b">
                        <th className="text-left pb-2">Product</th>
                        <th className="text-right pb-2">Qty</th>
                        <th className="text-right pb-2">Unit Price</th>
                        <th className="text-right pb-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.items.map((item, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2">{item.name}</td>
                          <td className="text-right">{item.qty}</td>
                          <td className="text-right">{formatMoney(item.price)}</td>
                          <td className="text-right font-semibold">{formatMoney(item.lineTotal || (item.qty * item.price))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="mt-3 flex gap-3 justify-end">
                  <button onClick={() => {
                    setReturnInvoice(inv);
                    fetchInvoiceDetails(inv.id);
                  }} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-neutral-50">↩ Return Items</button>
                  <button onClick={() => openDrawer(inv)} className="text-sm px-3 py-1.5 rounded-lg bg-[#2e7d32] text-white hover:opacity-90">Full Details</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DRAWER */}
      {drawerInvoice && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setDrawerInvoice(null)}
          />

          <div className="fixed right-0 top-0 z-50 h-screen w-[420px] overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-5">
              <div>
                <h2 className="text-xl font-bold">
                  {drawerInvoice.invoiceNo || drawerInvoice.id}
                </h2>
                <p className="text-sm text-neutral-500">
                  {drawerInvoice.client}
                </p>
              </div>

              <button
                onClick={() => setDrawerInvoice(null)}
                className="rounded-xl p-2 hover:bg-neutral-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="rounded-2xl border p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-[#2e7d32]">
                      Your Business
                    </h3>
                    <p className="text-sm text-neutral-500">
                      billing@company.com
                    </p>
                  </div>

                  <div
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[drawerInvoice.status]}`}
                  >
                    {drawerInvoice.status}
                  </div>
                </div>

                {!drawerInvoice.itemsLoaded ? (
                  <div className="py-6 text-center text-sm text-[#2e7d32] font-medium">Loading details...</div>
                ) : (
                  <div className="space-y-2 text-sm">
                    {drawerInvoice.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between"
                      >
                        <span>
                          {item.name} × {item.qty}
                        </span>

                        <span>
                          {formatMoney(item.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 space-y-2 border-t pt-4 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>
                      {formatMoney(drawerInvoice.amount)}
                    </span>
                  </div>

                  {drawerInvoice.discountTotal > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Discount</span>
                      <span>
                        -{formatMoney(drawerInvoice.discountTotal)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-base font-bold">
                    <span>Total</span>
                    <span>
                      {formatMoney(drawerInvoice.total)}
                    </span>
                  </div>

                  {drawerInvoice.balanceDue > 0 && (
                    <div className="flex justify-between text-sm font-semibold text-red-600">
                      <span>Outstanding Balance</span>
                      <span>
                        {formatMoney(drawerInvoice.balanceDue)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border p-5">
                <h4 className="mb-4 font-semibold">
                  Payment History
                </h4>

                {drawerInvoice.paymentHistory && drawerInvoice.paymentHistory.length > 0 ? (
                  <div className="space-y-3">
                    {drawerInvoice.paymentHistory.map(
                      (payment, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl bg-[#F8F8F8] p-3"
                        >
                          <div className="flex justify-between">
                            <span className="font-medium">
                              {formatMoney(
                                payment.amount
                              )}
                            </span>

                            <span className="text-sm text-neutral-500">
                              {payment.method}
                            </span>
                          </div>

                          <p className="mt-1 text-sm text-neutral-500">
                            {formatDate(payment.date)}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">
                    No payments recorded yet.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <button className="rounded-2xl bg-[#2e7d32] px-5 py-3 font-medium text-white">
                  Download PDF
                </button>

                <button
                  onClick={() => { deleteInvoice(drawerInvoice.id); }}
                  className="rounded-2xl border border-red-200 px-5 py-3 font-medium text-red-600 hover:bg-red-50"
                >
                  Delete Invoice
                </button>

                {drawerInvoice.status !== "Paid" && (
                  <button
                    onClick={() => markOnePaid(drawerInvoice.id)}
                    className="rounded-2xl border px-5 py-3 font-medium hover:bg-neutral-50"
                  >
                    Mark as Paid
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {returnInvoice && (
        <>
          <div className="fixed inset-0 z-60 bg-black/40" onClick={() => setReturnInvoice(null)} />
          <div className="fixed left-1/2 top-1/2 z-70 w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-8 shadow-2xl text-left">
            <h2 className="mb-2 text-xl font-bold">Return Items</h2>
            <p className="text-sm text-neutral-500 mb-6">{returnInvoice.invoiceNo || returnInvoice.id} · {returnInvoice.client}</p>

            {!returnInvoice.itemsLoaded ? (
              <div className="py-12 text-center text-sm text-[#2e7d32] font-medium">Loading items...</div>
            ) : (
              <div className="space-y-3 mb-6">
                {(returnInvoice.items || []).map((item, idx) => {
                  const key = `${returnInvoice.id}-${idx}`;
                  const sel = returnSelections[key] || { checked: false, qty: item.qty };
                  return (
                    <div key={idx} className="flex items-center gap-4 rounded-xl border p-3">
                      <input type="checkbox" checked={sel.checked}
                        onChange={e => setReturnSelections(prev => ({ ...prev, [key]: { ...sel, checked: e.target.checked } }))} />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-xs text-neutral-500">Max: {item.qty}</p>
                      </div>
                      <input type="number" min={1} max={item.qty} value={sel.qty}
                        disabled={!sel.checked}
                        onChange={e => setReturnSelections(prev => ({ ...prev, [key]: { ...sel, qty: Math.min(item.qty, Number(e.target.value)) } }))}
                        className="w-20 rounded-lg border px-2 py-1 text-sm disabled:opacity-40" />
                      <span className="text-sm font-medium w-24 text-right">
                        {formatMoney(item.price * (sel.checked ? sel.qty : 0))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={async () => {
                  const hasSelection = Object.values(returnSelections).some(s => s.checked);
                  if (!hasSelection) { alert("Select at least one item to return."); return; }

                  if (!window.confirm("Confirm return of items? This will void the invoice and restore stock.")) return;

                  try {
                    await voidSale(returnInvoice.id);
                    loadInvoices();
                    setReturnInvoice(null);
                    setReturnSelections({});
                    if (drawerInvoice && drawerInvoice.id === returnInvoice.id) {
                      setDrawerInvoice(null);
                    }
                  } catch (err) {
                    alert("Failed to void sale for return: " + err.message);
                  }
                }}
                className="flex-1 rounded-2xl bg-[#2e7d32] py-3 font-medium text-white hover:opacity-90"
              >
                Confirm Return
              </button>
              <button onClick={() => { setReturnInvoice(null); setReturnSelections({}); }}
                className="flex-1 rounded-2xl border py-3 font-medium hover:bg-neutral-50">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}