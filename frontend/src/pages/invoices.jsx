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
  Filter,
} from "lucide-react";

const invoicesSeed = [
  {
    id: "INV-1001",
    client: "Apex Logistics",
    issueDate: "2026-05-02",
    dueDate: "2026-05-18",
    amount: 4800,
    tax: 240,
    status: "Paid",
    items: [
      { name: "Freight Services", qty: 2, price: 2200 },
      { name: "Handling Charges", qty: 1, price: 400 },
    ],
    paymentHistory: [
      { date: "2026-05-15", amount: 5040, method: "Bank Transfer" },
    ],
  },
  {
    id: "INV-1002",
    client: "BluePeak Studio",
    issueDate: "2026-04-12",
    dueDate: "2026-04-25",
    amount: 1200,
    tax: 60,
    status: "Overdue",
    items: [{ name: "Brand Identity", qty: 1, price: 1200 }],
    paymentHistory: [],
  },
  {
    id: "INV-1003",
    client: "Nova Retail",
    issueDate: "2026-05-10",
    dueDate: "2026-06-02",
    amount: 8650,
    tax: 432.5,
    status: "Pending",
    items: [
      { name: "POS System", qty: 1, price: 7200 },
      { name: "Support", qty: 1, price: 1450 },
    ],
    paymentHistory: [],
  },
  {
    id: "INV-1004",
    client: "Cedar Media",
    issueDate: "2026-01-20",
    dueDate: "2026-02-01",
    amount: 2400,
    tax: 120,
    status: "Paid",
    items: [{ name: "Video Editing", qty: 12, price: 200 }],
    paymentHistory: [
      { date: "2026-01-31", amount: 2520, method: "Stripe" },
    ],
  },
  {
    id: "INV-1005",
    client: "Northwind Traders",
    issueDate: "2026-03-10",
    dueDate: "2026-03-22",
    amount: 3200,
    tax: 160,
    status: "Sent",
    items: [{ name: "Inventory Audit", qty: 4, price: 800 }],
    paymentHistory: [],
  },
  {
    id: "INV-1006",
    client: "PixelForge",
    issueDate: "2026-02-14",
    dueDate: "2026-02-28",
    amount: 960,
    tax: 48,
    status: "Draft",
    items: [{ name: "Landing Page", qty: 1, price: 960 }],
    paymentHistory: [],
  },
];

while (invoicesSeed.length < 24) {
  const statuses = [
    "Paid",
    "Pending",
    "Overdue",
    "Draft",
    "Sent",
  ];

  const clients = [
    "Vertex Labs",
    "Motionly",
    "Orbit Tech",
    "Cheema Traders",
    "Everline Group",
    "Oakstone",
    "Skyline Ventures",
    "BrightPath",
  ];

  const randomStatus =
    statuses[Math.floor(Math.random() * statuses.length)];

  const randomAmount = Math.floor(Math.random() * 9000) + 700;

  const index = invoicesSeed.length + 1;

  invoicesSeed.push({
    id: `INV-${1000 + index}`,
    client: clients[Math.floor(Math.random() * clients.length)],
    issueDate: `2026-${String(Math.floor(Math.random() * 5) + 1).padStart(
      2,
      "0"
    )}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`,
    dueDate: `2026-${String(Math.floor(Math.random() * 5) + 1).padStart(
      2,
      "0"
    )}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`,
    amount: randomAmount,
    tax: randomAmount * 0.05,
    status: randomStatus,
    items: [
      {
        name: "Consulting Services",
        qty: Math.floor(Math.random() * 5) + 1,
        price: randomAmount / 2,
      },
    ],
    paymentHistory:
      randomStatus === "Paid"
        ? [
            {
              date: "2026-04-12",
              amount: randomAmount * 1.05,
              method: "Card",
            },
          ]
        : [],
  });
}

const statusStyles = {
  Paid: "bg-[#EAF3DE] text-[#3B6D11]",
  Pending: "bg-[#FAEEDA] text-[#854F0B]",
  Overdue: "bg-[#FCEBEB] text-[#A32D2D]",
  Draft: "bg-[#F1EFE8] text-[#5F5E5A]",
  Sent: "bg-[#E7F0FB] text-[#185FA5]",
};

const statusFilters = ["All", "Paid", "Pending"];

const formatMoney = (num) =>
  `$${num.toLocaleString(undefined, {
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
  const [invoices, setInvoices] = useState(invoicesSeed);
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [drawerInvoice, setDrawerInvoice] = useState(null);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState([]);
  const [datePreset, setDatePreset] = useState("Last 30 days");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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
  }, [selectedStatus, search, sort, datePreset, fromDate, toDate]);

  const filteredInvoices = useMemo(() => {
    let data = [...invoices];
    let startDate = null;
    let endDate = null;

    const now = new Date();
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );

    if (datePreset === "Last 30 days") {
      startDate = new Date(todayEnd);
      startDate.setDate(startDate.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      endDate = todayEnd;
    } else if (datePreset === "Last 90 days") {
      startDate = new Date(todayEnd);
      startDate.setDate(startDate.getDate() - 89);
      startDate.setHours(0, 0, 0, 0);
      endDate = todayEnd;
    } else if (datePreset === "This Year") {
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      endDate = todayEnd;
    } else if (datePreset === "Custom") {
      if (fromDate) {
        startDate = new Date(`${fromDate}T00:00:00`);
      }

      if (toDate) {
        endDate = new Date(`${toDate}T23:59:59`);
      }
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
        i.client.toLowerCase().includes(search.toLowerCase())
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
        data.sort((a, b) => b.amount - a.amount);
        break;
      case "low":
        data.sort((a, b) => a.amount - b.amount);
        break;
    }

    return data;
  }, [
    invoices,
    selectedStatus,
    search,
    sort,
    datePreset,
    fromDate,
    toDate,
  ]);

  const totalInvoices = invoices.length;

  const totalCollected = invoices
    .filter((i) => i.status === "Paid")
    .reduce((acc, curr) => acc + curr.amount + curr.tax, 0);

  const outstanding = invoices
    .filter((i) => i.status === "Pending" || i.status === "Overdue")
    .reduce((acc, curr) => acc + curr.amount + curr.tax, 0);

  const overdueCount = invoices.filter(
    (i) => i.status === "Overdue"
  ).length;

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

  const markSelectedPaid = () => {
    setInvoices((prev) =>
      prev.map((i) =>
        selectedRows.includes(i.id)
          ? { ...i, status: "Paid" }
          : i
      )
    );

    setSelectedRows([]);
  };

  return (
    <div className="min-h-screen bg-[#F7F6F3] p-6 text-[#1A1A1A]">
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

          <div
            className={`rounded-3xl bg-white p-6 shadow-sm border border-[#FCEBEB] ${
              overdueCount > 0 ? "animate-pulse" : ""
            }`}
          >
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
              <div className="flex items-center gap-2 rounded-xl border px-4 py-2">
                <Calendar size={16} />
                <select
                  value={datePreset}
                  onChange={(e) => {
                    const nextPreset = e.target.value;
                    setDatePreset(nextPreset);

                    if (nextPreset !== "Custom") {
                      setFromDate("");
                      setToDate("");
                    }
                  }}
                  className="bg-transparent outline-none"
                >
                  <option value="Last 30 days">Last 30 days</option>
                  <option value="Last 90 days">Last 90 days</option>
                  <option value="This Year">This Year</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setDatePreset("Custom");
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
                    setDatePreset("Custom");
                    setToDate(e.target.value);
                  }}
                  className="bg-transparent text-sm outline-none"
                  aria-label="To date"
                />
              </div>

              <div className="flex overflow-hidden rounded-xl bg-[#F1F3F5]">
                {statusFilters.map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setSelectedStatus(status);
                      setPage(1);
                    }}
                    className={`px-4 py-2 text-sm font-medium transition ${
                      selectedStatus === status
                        ? "bg-[#185FA5] text-white"
                        : "text-neutral-600 hover:bg-neutral-200"
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

              <div className="flex items-center gap-2 rounded-xl border px-4 py-2">
                <Filter size={16} />
                <select
                  className="bg-transparent outline-none"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="newest">
                    Date (newest)
                  </option>
                  <option value="oldest">
                    Date (oldest)
                  </option>
                  <option value="high">
                    Amount (high–low)
                  </option>
                  <option value="low">
                    Amount (low–high)
                  </option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button className="rounded-xl border px-4 py-2 font-medium hover:bg-neutral-50">
                Export CSV
              </button>

              <button className="rounded-xl bg-[#185FA5] px-4 py-2 font-medium text-white hover:opacity-90">
                Export PDF
              </button>
            </div>
          </div>
        </div>

        {/* BULK ACTION BAR */}
        {selectedRows.length > 0 && (
          <div className="flex items-center justify-between rounded-2xl bg-[#185FA5] px-5 py-4 text-white">
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
              <thead className="border-b bg-[#FAFAFA] text-left text-sm text-neutral-500">
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
                    <tr
                      key={invoice.id}
                      className="cursor-pointer border-b transition hover:bg-[#FAFAFA]"
                      onClick={() =>
                        setDrawerInvoice(invoice)
                      }
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
                        <div>
                          <p className="font-semibold">
                            {invoice.id}
                          </p>
                          <p className="text-sm text-neutral-500">
                            {invoice.client}
                          </p>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {formatDate(invoice.issueDate)}
                      </td>

                      <td
                        className={`px-5 py-4 ${
                          overdue
                            ? "font-medium text-[#A32D2D]"
                            : ""
                        }`}
                      >
                        {formatDate(invoice.dueDate)}
                      </td>

                      <td
                        className="px-5 py-4 text-right font-medium"
                        title={`Tax: ${formatMoney(
                          invoice.tax
                        )}`}
                      >
                        {formatMoney(invoice.amount)}
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
                              {
                                label: "View",
                                icon: FileText,
                              },
                              {
                                label: "Download PDF",
                                icon: Download,
                              },
                              {
                                label: "Duplicate",
                                icon: Copy,
                              },
                              {
                                label: "Mark as paid",
                                icon: CheckCircle2,
                              },
                              {
                                label: "Send reminder",
                                icon: Send,
                              },
                              {
                                label: "Delete",
                                icon: Trash2,
                              },
                            ].map((item) => (
                              <button
                                key={item.label}
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
                  {drawerInvoice.id}
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
                    <h3 className="font-bold text-[#185FA5]">
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

                <div className="mt-6 space-y-2 border-t pt-4 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>
                      {formatMoney(drawerInvoice.amount)}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Tax</span>
                    <span>
                      {formatMoney(drawerInvoice.tax)}
                    </span>
                  </div>

                  <div className="flex justify-between text-base font-bold">
                    <span>Total</span>
                    <span>
                      {formatMoney(
                        drawerInvoice.amount +
                          drawerInvoice.tax
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border p-5">
                <h4 className="mb-4 font-semibold">
                  Payment History
                </h4>

                {drawerInvoice.paymentHistory.length >
                0 ? (
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
                <button className="rounded-2xl bg-[#185FA5] px-5 py-3 font-medium text-white">
                  Download PDF
                </button>

                <button className="rounded-2xl border px-5 py-3 font-medium">
                  Send Reminder
                </button>

                <button className="rounded-2xl border px-5 py-3 font-medium">
                  Mark as Paid
                </button>

                <button className="rounded-2xl border px-5 py-3 font-medium">
                  Edit Invoice
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}