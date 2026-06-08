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

import { listSales, getSale, voidSale, saveCustomerPayment, returnSale, listBanks } from "../lib/posApi";

const BUSINESS_NAME = "Cheema Traders";
const BUSINESS_EMAIL = "contact@cheematraders.com";

const statusStyles = {
  Paid: "bg-[#EAF3DE] text-[#3B6D11] border-l-[3px] border-[#3B6D11] rounded-sm font-semibold tracking-wider",
  Pending: "bg-[#FAEEDA] text-[#854F0B] border-l-[3px] border-[#854F0B] rounded-sm font-semibold tracking-wider",
  Overdue: "bg-[#FCEBEB] text-[#A32D2D] border-l-[3px] border-[#A32D2D] rounded-sm font-semibold tracking-wider",
  Returned: "bg-[#F1EFE8] text-[#7a5c00] border-l-[3px] border-[#7a5c00] rounded-sm font-semibold tracking-wider",
};

const statusFilters = ["All", "Paid", "Pending", "Overdue", "Returned"];

const formatMoney = (num) =>
  `₨ ${(Number(num) || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (date) => {
  if (!date) return "-";
  const dateStr = typeof date === "string" && !date.includes("T") ? date + "T00:00:00" : date;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

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
  const [returnSelections, setReturnSelections] = useState({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Drawer Payment Form states
  const [drawerPayAmount, setDrawerPayAmount] = useState("");
  const [drawerPayMethod, setDrawerPayMethod] = useState("Cash");
  const [drawerPayDate, setDrawerPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [drawerPayNotes, setDrawerPayNotes] = useState("");

  // Payment states (modals)
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [payingBulk, setPayingBulk] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [banks, setBanks] = useState([]);

  useEffect(() => {
    listBanks().then(res => {
      if (res && res.banks) setBanks(res.banks);
    }).catch(console.error);
  }, []);

  const loadInvoices = () => {
    setLoading(true);
    setError("");
    listSales({ 
      limit: 1000,
      search: search,
      from: fromDate,
      to: toDate
    })
      .then(({ sales }) => {
        const mapped = (sales || []).map(s => {
          let status = "Pending";
          if (s.paymentStatus === "Paid") {
            status = "Paid";
          } else if (s.paymentStatus === "Returned") {
            status = "Returned";
          } else {
            const today = new Date();
            today.setHours(0,0,0,0);
            const dateStr = typeof s.saleDate === "string" && !s.saleDate.includes("T") ? s.saleDate + "T00:00:00" : s.saleDate;
            const issue = new Date(dateStr);
            issue.setHours(0,0,0,0);
            if (issue < today) {
              status = "Overdue";
            }
          }

          return {
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
            status,
            items: [],
            itemsLoaded: false,
            paymentHistory: s.amountPaid > 0 ? [{ date: s.saleDate, amount: s.amountPaid, method: s.paymentMethod }] : [],
          };
        });
        setInvoices(mapped);
      })
      .catch(e => {
        console.error("Failed to load invoices:", e);
        setError(e.message || "Failed to load invoices.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      loadInvoices();
    }, 250);

    return () => clearTimeout(delayDebounceFn);
  }, [search, fromDate, toDate]);

  const fetchInvoiceDetails = async (id) => {
    const inv = invoices.find(i => i.id === id);
    if (!inv || inv.itemsLoaded) return inv;

    try {
      const { sale } = await getSale(id);
      if (sale) {
        const mappedItems = (sale.items || []).map(item => ({
          productId: item.productId,
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
    if (drawerInvoice) {
      setDrawerPayAmount(drawerInvoice.balanceDue.toString());
      setDrawerPayMethod("Cash");
      setDrawerPayDate(new Date().toISOString().split("T")[0]);
      setDrawerPayNotes("");
    }
  }, [drawerInvoice]);

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
  }, [selectedStatus]);

  useEffect(() => {
    setPage(1);
  }, [selectedStatus, sort]);

  const filteredInvoices = useMemo(() => {
    let data = [...invoices];

    if (selectedStatus !== "All") {
      data = data.filter((i) => i.status === selectedStatus);
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
  }, [invoices, selectedStatus, sort]);

  const totalInvoices = filteredInvoices.length;

  const totalCollected = filteredInvoices
    .filter((i) => i.status === "Paid")
    .reduce((acc, curr) => acc + curr.total, 0);

  const outstanding = filteredInvoices
    .filter((i) => i.status === "Pending" || i.status === "Overdue")
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

  // Status Tab Counts
  const getTabCount = (status) => {
    if (status === "All") return invoices.length;
    return invoices.filter((i) => i.status === status).length;
  };

  // Payment triggers & execution
  const triggerOnePaid = (inv) => {
    if (inv.balanceDue <= 0) {
      alert("Invoice is already paid.");
      return;
    }
    setPayingInvoice(inv);
    setPaymentMethod("Cash");
  };

  const triggerSelectedPaid = () => {
    const pendingRows = invoices.filter(i => selectedRows.includes(i.id) && i.status !== "Paid");
    if (!pendingRows.length) {
      setSelectedRows([]);
      return;
    }
    setPayingBulk(true);
    setPaymentMethod("Cash");
  };

  const executePayment = async () => {
    try {
      if (payingBulk) {
        const pendingRows = invoices.filter(i => selectedRows.includes(i.id) && i.status !== "Paid");
        for (const inv of pendingRows) {
          await saveCustomerPayment({
            customerId: inv.customerId || null,
            saleId: inv.id,
            amount: inv.balanceDue,
            method: paymentMethod,
            notes: "Marked as paid in bulk"
          });
        }
        setSelectedRows([]);
        setPayingBulk(false);
      } else if (payingInvoice) {
        await saveCustomerPayment({
          customerId: payingInvoice.customerId || null,
          saleId: payingInvoice.id,
          amount: payingInvoice.balanceDue,
          method: paymentMethod,
          notes: "Marked as paid from invoice history"
        });
        if (drawerInvoice?.id === payingInvoice.id) {
          setDrawerInvoice(prev => ({ ...prev, status: "Paid", balanceDue: 0 }));
        }
        setPayingInvoice(null);
      }
      loadInvoices();
    } catch (err) {
      alert("Failed to save payment: " + err.message);
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

  // OS Print integration
  const printInvoice = (inv) => {
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) {
      alert("Please allow popups to print/download invoice.");
      return;
    }
    const itemsHtml = (inv.items || []).map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${item.qty}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₨ ${item.price.toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold;">₨ ${(item.lineTotal || (item.qty * item.price)).toFixed(2)}</td>
      </tr>
    `).join("");

    win.document.write(`
      <html>
        <head>
          <title>Invoice ${inv.invoiceNo || inv.id}</title>
          <style>
            body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; color: #1a1a1a; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2e7d32; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: bold; color: #2e7d32; }
            .meta-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .meta-block h3 { margin: 0 0 8px 0; color: #2e7d32; font-size: 14px; text-transform: uppercase; }
            .meta-block p { margin: 0; font-size: 14px; color: #555; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background: #f5f8f5; text-align: left; padding: 10px 8px; border-bottom: 2px solid #c8d8c8; color: #2e7d32; font-size: 12px; text-transform: uppercase; }
            .totals { width: 250px; margin-left: auto; font-size: 14px; }
            .totals-row { display: flex; justify-content: space-between; padding: 6px 0; }
            .grand-total { font-weight: bold; font-size: 16px; border-top: 2px solid #2e7d32; border-bottom: 2px solid #2e7d32; padding: 10px 0; color: #2e7d32; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">${BUSINESS_NAME}</div>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">Quality Agro Inputs & Products</p>
            </div>
            <div style="text-align: right;">
              <h1 style="margin: 0; font-size: 20px; color: #1b3a1d;">INVOICE</h1>
              <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: bold;">No: ${inv.invoiceNo || inv.id}</p>
            </div>
          </div>
          <div class="meta-info">
            <div class="meta-block">
              <h3>Billed To:</h3>
              <p><strong>${inv.client}</strong></p>
              <p>Customer ID: ${inv.customerId || 'Walk-in'}</p>
            </div>
            <div class="meta-block" style="text-align: right;">
              <p><strong>Issue Date:</strong> ${formatDate(inv.issueDate)}</p>
              <p><strong>Status:</strong> ${inv.status}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Product Description</th>
                <th style="text-align: right;">Qty</th>
                <th style="text-align: right;">Price</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="totals">
            <div class="totals-row">
              <span>Subtotal</span>
              <span>₨ ${inv.amount.toFixed(2)}</span>
            </div>
            ${inv.discountTotal > 0 ? `
            <div class="totals-row" style="color: #c62828;">
              <span>Discount</span>
              <span>-₨ ${inv.discountTotal.toFixed(2)}</span>
            </div>
            ` : ""}
            <div class="totals-row grand-total">
              <span>Total</span>
              <span>₨ ${inv.total.toFixed(2)}</span>
            </div>
            ${inv.balanceDue > 0 ? `
            <div class="totals-row" style="color: #c62828; font-weight: bold;">
              <span>Outstanding</span>
              <span>₨ ${inv.balanceDue.toFixed(2)}</span>
            </div>
            ` : ""}
          </div>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleDownloadPDF = async (inv) => {
    const updated = await fetchInvoiceDetails(inv.id);
    printInvoice(updated || inv);
  };

  // CSV Export for selected rows
  const exportSelectedInvoicesCSV = () => {
    const selectedInvs = filteredInvoices.filter(i => selectedRows.includes(i.id));
    const headers = ["Invoice", "Client", "Issue Date", "Subtotal", "Total", "Balance Due", "Status"];
    const rows = selectedInvs.map(i => [
      i.invoiceNo, i.client, i.issueDate,
      i.amount, i.total, i.balanceDue, i.status
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "selected_invoices.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportFilteredInvoicesPDF = () => {
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) {
      alert("Please allow popups to print/download the report.");
      return;
    }
    const rowsHtml = filteredInvoices.map((inv, idx) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${idx + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${inv.invoiceNo || inv.id}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${inv.client}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${formatDate(inv.issueDate)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatMoney(inv.total)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${inv.status}</td>
      </tr>
    `).join("");

    win.document.write(`
      <html>
        <head>
          <title>Filtered Invoices Report</title>
          <style>
            body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; color: #1a1a1a; }
            .header { border-bottom: 2px solid #2e7d32; padding-bottom: 10px; margin-bottom: 20px; }
            .title { font-size: 20px; font-weight: bold; color: #2e7d32; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
            th { background: #f5f8f5; padding: 10px 8px; border-bottom: 2px solid #c8d8c8; color: #2e7d32; text-align: left; }
            td { padding: 10px 8px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">${BUSINESS_NAME} - SALES REPORT</div>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">Generated: ${new Date().toLocaleDateString()}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 40px;">#</th>
                <th>Invoice No</th>
                <th>Customer</th>
                <th>Date</th>
                <th style="text-align: right;">Total Amount</th>
                <th style="text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="min-h-screen bg-[#f5f8f5] p-6 text-[#1A1A1A] font-sans">
      <div className="mx-auto max-w-7xl space-y-6">
        
        {/* PAGE TITLE HEADER */}
        <div className="flex justify-between items-center border-b border-[#c8d8c8] pb-3.5 mb-2">
          <h1 className="text-base font-bold text-[#1b3a1d] uppercase tracking-wider pl-3 border-l-[3px] border-[#2e7d32]">
            Sales History & Invoices
          </h1>
        </div>

        {/* TOP METRICS STRIP */}
        <div className="grid grid-cols-1 md:grid-cols-3 bg-white border border-[#c8d8c8] rounded-sm divide-y md:divide-y-0 md:divide-x divide-[#c8d8c8]">
          <button
            onClick={() => setSelectedStatus("All")}
            className="p-5 text-left transition hover:bg-[#f7fbf7] outline-none"
          >
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              {(fromDate || toDate || selectedStatus !== "All" || search)
                ? "Filtered Invoices"
                : "Total Invoices"}
            </p>
            <h2 className="mt-2 text-3xl font-bold text-[#1b3a1d]" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
              {totalInvoices}
            </h2>
          </button>

          <div className="p-5 text-left">
            <p className="text-[10px] font-bold text-[#3B6D11] uppercase tracking-wider">
              Total Collected
            </p>
            <h2 className="mt-2 text-3xl font-bold text-[#3B6D11]" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
              {formatMoney(totalCollected)}
            </h2>
          </div>

          <div className="p-5 text-left">
            <p className="text-[10px] font-bold text-[#A32D2D] uppercase tracking-wider">Outstanding</p>
            <h2 className="mt-2 text-3xl font-bold text-[#A32D2D]" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
              {formatMoney(outstanding)}
            </h2>
          </div>
        </div>

        {/* FILTER CONTROL STRIP */}
        <div className="border border-[#c8d8c8] bg-[#fcfdfc] p-4 flex flex-col gap-4 rounded-sm">
          
          {/* Status Tabs Underline with Dynamic Counts */}
          <div className="flex flex-wrap gap-6 border-b border-[#c8d8c8] px-2 pb-1 w-full">
            {statusFilters.map((status) => (
              <button
                key={status}
                onClick={() => {
                  setSelectedStatus(status);
                  setPage(1);
                }}
                className="pb-2.5 text-sm font-semibold transition cursor-pointer border-b-2 outline-none"
                style={{
                  borderBottomColor: selectedStatus === status ? "#2e7d32" : "transparent",
                  color: selectedStatus === status ? "#1d351f" : "#5a755c",
                  borderRadius: 0,
                }}
              >
                {status} ({getTabCount(status)})
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-sm border border-[#cde0cd] px-3 py-1.5 bg-white">
                <Calendar size={15} className="text-[#6a8f6c]" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-transparent text-sm outline-none font-mono"
                  aria-label="From date"
                />
                <span className="text-xs text-neutral-400">to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-transparent text-sm outline-none font-mono"
                  aria-label="To date"
                />
              </div>

              <div className="flex items-center gap-2 rounded-sm border border-[#cde0cd] px-3 py-1.5 bg-white">
                <Search size={15} className="text-[#6a8f6c]" />
                <input
                  type="text"
                  placeholder="Search client, invoice, or product..."
                  className="bg-transparent text-sm outline-none w-64"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  const headers = ["Invoice", "Client", "Issue Date", "Subtotal", "Total", "Balance Due", "Status"];
                  const rows = filteredInvoices.map(i => [
                    i.invoiceNo, i.client, i.issueDate,
                    i.amount, i.total, i.balanceDue, i.status
                  ]);
                  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = "invoices.csv"; a.click();
                  URL.revokeObjectURL(url);
                }}
                className="rounded-sm border border-[#cde0cd] bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Export CSV
              </button>

              <button 
                onClick={exportFilteredInvoicesPDF}
                className="rounded-sm bg-[#2e7d32] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
              >
                Export PDF Report
              </button>
            </div>
          </div>
        </div>

        {/* BULK ACTION BAR */}
        {selectedRows.length > 0 && (
          <div className="flex items-center justify-between rounded-sm bg-[#2e7d32] border border-[#1b3a1d] px-5 py-3 text-white text-xs font-semibold">
            <p>{selectedRows.length} invoices selected</p>

            <div className="flex gap-2">
              <button
                onClick={triggerSelectedPaid}
                className="rounded-sm bg-white/20 px-3 py-1.5 hover:bg-white/30"
              >
                Bulk Mark as Paid
              </button>

              <button 
                onClick={exportSelectedInvoicesCSV}
                className="rounded-sm bg-white/20 px-3 py-1.5 hover:bg-white/30"
              >
                Bulk Export
              </button>
            </div>
          </div>
        )}

        {/* TABLE CONTAINER */}
        <div className="overflow-hidden rounded-sm bg-white border border-[#c8d8c8] shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#c8d8c8]">
              <thead className="bg-[#f5f8f5] border-b-2 border-[#c8d8c8] text-left text-[10px] font-bold text-[#6a8f6c] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 w-10">
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
                  <th className="px-5 py-3">Invoice / Client</th>
                  <th className="px-5 py-3">Issue Date</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 w-12"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#c8d8c8]/40">
                {/* LOADING SKELETONS */}
                {loading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="px-5 py-4"><div className="h-4 w-4 bg-neutral-200 rounded-sm" /></td>
                      <td className="px-5 py-4">
                        <div className="h-4 w-32 bg-neutral-200 rounded-sm mb-1.5" />
                        <div className="h-3 w-48 bg-neutral-100 rounded-sm" />
                      </td>
                      <td className="px-5 py-4"><div className="h-4 w-20 bg-neutral-200 rounded-sm" /></td>
                      <td className="px-5 py-4 text-right"><div className="h-4 w-24 bg-neutral-200 rounded-sm ml-auto" /></td>
                      <td className="px-5 py-4"><div className="h-4 w-16 bg-neutral-200 rounded-sm" /></td>
                      <td className="px-5 py-4"><div className="h-4 w-8 bg-neutral-200 rounded-sm" /></td>
                    </tr>
                  ))
                ) : filteredInvoices.length === 0 ? (
                  /* EMPTY STATE */
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <FileText size={36} className="text-neutral-300" />
                        <div>
                          <p className="text-sm font-semibold text-neutral-500">No invoices found for this filter</p>
                          <p className="text-xs text-neutral-400 mt-1">Try adjusting your filters or search query to find invoices.</p>
                        </div>
                        <button
                          onClick={() => {
                            setSearch("");
                            setFromDate("");
                            setToDate("");
                            setSelectedStatus("All");
                          }}
                          className="mt-2 rounded-sm border border-[#cde0cd] bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                        >
                          Clear Filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((invoice) => {
                    const isExpanded = expandedRows[invoice.id];

                    return (
                      <React.Fragment key={invoice.id}>
                        <tr
                          className={`cursor-pointer transition hover:bg-[#f7fbf7] ${isExpanded ? "bg-[#fcfdfc]" : ""}`}
                          onClick={async () => {
                            const isOpening = !isExpanded;
                            setExpandedRows(prev => ({ ...prev, [invoice.id]: isOpening }));
                            if (isOpening) {
                              await fetchInvoiceDetails(invoice.id);
                            }
                          }}
                        >
                          <td
                            className="px-5 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedRows.includes(invoice.id)}
                              onChange={() => toggleSelect(invoice.id)}
                            />
                          </td>

                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              {isExpanded ? <ChevronUp size={14} className="text-[#6a8f6c]" /> : <ChevronDown size={14} className="text-[#6a8f6c]" />}
                              <div>
                                <p className="font-semibold text-sm text-[#1b3a1d]">{invoice.invoiceNo || invoice.id}</p>
                                <p className="text-xs text-neutral-500">{invoice.client}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-3 text-xs font-mono">
                            {formatDate(invoice.issueDate)}
                          </td>

                          <td className="px-5 py-3 text-right text-sm font-semibold font-mono text-[#1b3a1d]">
                            {formatMoney(invoice.total)}
                          </td>

                          <td className="px-5 py-3 text-xs">
                            <span className={`px-2 py-0.5 ${statusStyles[invoice.status] || ""}`}>
                              {invoice.status}
                            </span>
                          </td>

                          <td
                            className="px-5 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="group relative inline-block">
                              <button className="rounded-sm p-1.5 hover:bg-neutral-100 outline-none">
                                <MoreVertical size={16} />
                              </button>

                              <div className="invisible absolute right-0 z-20 mt-1 w-52 rounded-sm border border-[#c8d8c8] bg-white p-1.5 opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
                                {[
                                  { label: "View Details", icon: FileText, action: (inv) => openDrawer(inv) },
                                  { label: "Print Invoice", icon: Download, action: (inv) => handleDownloadPDF(inv) },
                                  { label: "Mark as Paid", icon: CheckCircle2, action: (inv) => triggerOnePaid(inv) },
                                  { label: "Return Items", icon: RotateCcw, action: (inv) => {
                                    setReturnInvoice(inv);
                                    fetchInvoiceDetails(inv.id);
                                  } },
                                  { label: "Delete (Void)", icon: Trash2, action: (inv) => deleteInvoice(inv.id) },
                                ].map((item) => (
                                  <button
                                    key={item.label}
                                    onClick={() => item.action(invoice)}
                                    className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-xs hover:bg-[#f5f8f5] text-neutral-700 outline-none"
                                  >
                                    <item.icon size={14} className="text-[#6a8f6c]" />
                                    {item.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* PROPER INLINE EXPANSION */}
                        {isExpanded && (
                          <tr className="bg-[#f7fbf7] border-b border-[#c8d8c8]">
                            <td colSpan={6} className="px-12 py-3">
                              {!invoice.itemsLoaded ? (
                                <div className="py-4 text-center text-xs text-[#2e7d32] font-semibold">Loading details...</div>
                              ) : (
                                <div className="border border-[#c8d8c8] rounded-sm bg-white p-4">
                                  <h4 className="font-bold text-[10px] uppercase text-[#1b3a1d] tracking-wider mb-2.5">Invoice Items</h4>
                                  <table className="w-full text-xs text-left">
                                    <thead className="bg-[#f5f8f5] text-[10px] font-bold text-[#6a8f6c] uppercase tracking-wider border-b border-[#c8d8c8]">
                                      <tr>
                                        <th className="px-4 py-2">Product Name</th>
                                        <th className="px-4 py-2 text-right">Qty</th>
                                        <th className="px-4 py-2 text-right">Unit Price</th>
                                        <th className="px-4 py-2 text-right">Line Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100">
                                      {invoice.items.map((item, idx) => (
                                        <tr key={idx}>
                                          <td className="px-4 py-2">{item.name}</td>
                                          <td className="px-4 py-2 text-right font-mono">{item.qty}</td>
                                          <td className="px-4 py-2 text-right font-mono">{formatMoney(item.price)}</td>
                                          <td className="px-4 py-2 text-right font-mono font-semibold">{formatMoney(item.lineTotal || (item.qty * item.price))}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  <div className="mt-3 flex gap-2 justify-end">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setReturnInvoice(invoice);
                                        fetchInvoiceDetails(invoice.id);
                                      }}
                                      className="text-[11px] font-semibold px-3 py-1.5 rounded-sm border border-[#cde0cd] hover:bg-neutral-50"
                                    >
                                      ↩ Return Items
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openDrawer(invoice);
                                      }}
                                      className="text-[11px] font-semibold px-3 py-1.5 rounded-sm bg-[#2e7d32] text-white hover:opacity-90"
                                    >
                                      Full Details
                                    </button>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}
          <div className="flex flex-col gap-4 border-t border-[#c8d8c8] px-5 py-4 md:flex-row md:items-center md:justify-between bg-[#fcfdfc]">
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500">Rows per page</span>
              <select
                className="rounded-sm border border-[#cde0cd] px-2 py-1 text-xs bg-white"
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>

              <p className="text-xs text-neutral-500">
                {filteredInvoices.length === 0 
                  ? "No results"
                  : `Showing ${(page - 1) * rowsPerPage + 1}–${Math.min(page * rowsPerPage, filteredInvoices.length)} of ${filteredInvoices.length} invoices`
                }
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((prev) => prev - 1)}
                className="rounded-sm border border-[#cde0cd] p-1.5 disabled:opacity-40 bg-white cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>

              <button
                disabled={page === totalPages || totalPages === 0}
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded-sm border border-[#cde0cd] p-1.5 disabled:opacity-40 bg-white cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FLUSH DRAWER */}
      {drawerInvoice && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setDrawerInvoice(null)}
          />

          <div className="fixed right-0 top-0 z-50 h-screen w-[420px] overflow-y-auto bg-white shadow-2xl border-l border-[#c8d8c8] rounded-none flex flex-col">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#c8d8c8] px-6 py-5 bg-[#f5f8f5]">
              <div>
                <h2 className="text-base font-bold text-[#1b3a1d] uppercase tracking-wider">
                  {drawerInvoice.invoiceNo || drawerInvoice.id}
                </h2>
                <p className="text-xs text-neutral-500">{drawerInvoice.client}</p>
              </div>

              <button
                onClick={() => setDrawerInvoice(null)}
                className="rounded-sm p-1.5 hover:bg-neutral-200 outline-none"
              >
                <X size={16} />
              </button>
            </div>

            {/* ACTION BUTTONS (AT TOP RIGHT BELOW HEADER) */}
            <div className="flex gap-2 p-4 bg-[#f5f8f5]/60 border-b border-[#c8d8c8] text-xs">
              {drawerInvoice.status !== "Paid" && drawerInvoice.status !== "Returned" && (
                <button
                  onClick={() => triggerOnePaid(drawerInvoice)}
                  className="flex-1 rounded-sm bg-[#2e7d32] py-2 px-3 font-semibold text-white hover:opacity-90 outline-none cursor-pointer"
                >
                  Mark Paid
                </button>
              )}
              <button
                onClick={() => handleDownloadPDF(drawerInvoice)}
                className="flex-1 rounded-sm border border-[#cde0cd] bg-white py-2 px-3 font-semibold text-neutral-700 hover:bg-neutral-50 outline-none cursor-pointer"
              >
                Print Invoice
              </button>
              <button
                onClick={() => deleteInvoice(drawerInvoice.id)}
                className="flex-1 rounded-sm border border-red-200 bg-white py-2 px-3 font-semibold text-red-600 hover:bg-red-50 outline-none cursor-pointer"
              >
                Void
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Card 1 */}
              <div className="border border-[#c8d8c8] p-5 rounded-sm bg-white">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-[#2e7d32] uppercase tracking-wider">
                      {BUSINESS_NAME}
                    </h3>
                    <p className="text-xs text-neutral-500">{BUSINESS_EMAIL}</p>
                  </div>

                  <span className={`px-2 py-0.5 ${statusStyles[drawerInvoice.status] || ""}`}>
                    {drawerInvoice.status}
                  </span>
                </div>

                {!drawerInvoice.itemsLoaded ? (
                  <div className="py-6 text-center text-xs text-[#2e7d32] font-semibold">Loading details...</div>
                ) : (
                  <div className="space-y-2 text-xs divide-y divide-neutral-100">
                    {drawerInvoice.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between pt-2 first:pt-0">
                        <span className="text-neutral-700">
                          {item.name} × {item.qty}
                        </span>
                        <span className="font-semibold font-mono">
                          {formatMoney(item.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 space-y-2 border-t border-[#c8d8c8] pt-4 text-xs">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatMoney(drawerInvoice.amount)}</span>
                  </div>

                  {drawerInvoice.discountTotal > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Discount</span>
                      <span className="font-mono">-{formatMoney(drawerInvoice.discountTotal)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm font-bold text-[#1b3a1d] border-t border-dashed border-neutral-200 pt-2">
                    <span>Total</span>
                    <span className="font-mono">{formatMoney(drawerInvoice.total)}</span>
                  </div>

                  {drawerInvoice.balanceDue > 0 && (
                    <div className="flex justify-between text-xs font-bold text-red-600">
                      <span>Outstanding Balance</span>
                      <span className="font-mono">{formatMoney(drawerInvoice.balanceDue)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* PARTIAL PAYMENT RECORD SECTION */}
              {drawerInvoice.balanceDue > 0 && (
                <div className="border border-[#c8d8c8] p-5 rounded-sm bg-[#fcfdfc] space-y-4">
                  <h4 className="text-xs font-bold text-[#1b3a1d] uppercase tracking-wider border-b border-[#c8d8c8] pb-2">
                    Record Payment
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[#6a8f6c] uppercase tracking-wider mb-1">
                        Amount (₨)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        max={drawerInvoice.balanceDue}
                        value={drawerPayAmount}
                        onChange={(e) => setDrawerPayAmount(e.target.value)}
                        className="w-full rounded-sm border border-[#cde0cd] p-2 bg-white text-xs outline-none font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#6a8f6c] uppercase tracking-wider mb-1">
                        Method
                      </label>
                      <select
                        value={drawerPayMethod}
                        onChange={(e) => setDrawerPayMethod(e.target.value)}
                        className="w-full rounded-sm border border-[#cde0cd] p-2 bg-white text-xs outline-none"
                      >
                        {["Cash", ...banks.map(b => b.name), "Cheque"].map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[#6a8f6c] uppercase tracking-wider mb-1">
                        Payment Date
                      </label>
                      <input
                        type="date"
                        value={drawerPayDate}
                        onChange={(e) => setDrawerPayDate(e.target.value)}
                        className="w-full rounded-sm border border-[#cde0cd] p-2 bg-white text-xs outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#6a8f6c] uppercase tracking-wider mb-1">
                        Notes
                      </label>
                      <input
                        type="text"
                        placeholder="Payment details or memo..."
                        value={drawerPayNotes}
                        onChange={(e) => setDrawerPayNotes(e.target.value)}
                        className="w-full rounded-sm border border-[#cde0cd] p-2 bg-white text-xs outline-none"
                      />
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const amt = Number(drawerPayAmount);
                      if (!amt || amt <= 0) {
                        alert("Please enter a valid payment amount.");
                        return;
                      }
                      if (amt > drawerInvoice.balanceDue) {
                        alert("Payment amount cannot exceed outstanding balance.");
                        return;
                      }
                      try {
                        await saveCustomerPayment({
                          customerId: drawerInvoice.customerId || null,
                          saleId: drawerInvoice.id,
                          amount: amt,
                          method: drawerPayMethod,
                          date: drawerPayDate,
                          notes: drawerPayNotes,
                        });
                        alert("Payment recorded successfully.");
                        loadInvoices();
                        const updated = await fetchInvoiceDetails(drawerInvoice.id);
                        if (updated) {
                          setDrawerInvoice(updated);
                        }
                      } catch (err) {
                        alert("Failed to record payment: " + err.message);
                      }
                    }}
                    className="w-full rounded-sm bg-[#2e7d32] py-2 text-xs font-semibold text-white hover:opacity-90 outline-none cursor-pointer"
                  >
                    Submit Payment
                  </button>
                </div>
              )}

              {/* Payment History */}
              <div className="border border-[#c8d8c8] p-5 rounded-sm bg-white">
                <h4 className="mb-4 text-xs font-bold text-[#1b3a1d] uppercase tracking-wider">
                  Payment History
                </h4>

                {drawerInvoice.paymentHistory && drawerInvoice.paymentHistory.length > 0 ? (
                  <div className="space-y-2">
                    {drawerInvoice.paymentHistory.map((payment, idx) => (
                      <div key={idx} className="border border-[#cde0cd] bg-[#fcfdfc] p-3 rounded-sm text-xs">
                        <div className="flex justify-between">
                          <span className="font-semibold text-[#1b3a1d] font-mono">
                            {formatMoney(payment.amount)}
                          </span>
                          <span className="text-neutral-500 font-semibold">{payment.method}</span>
                        </div>
                        <p className="mt-1 text-neutral-400 font-mono">{formatDate(payment.date)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-400">No payments recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* PARTIAL RETURNS MODAL (WIRED TO REAL BACKEND API) */}
      {returnInvoice && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setReturnInvoice(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white p-6 border border-[#c8d8c8] shadow-2xl text-left">
            <h2 className="mb-1.5 text-base font-bold text-[#1b3a1d] uppercase tracking-wider">Return Items</h2>
            <p className="text-xs text-neutral-500 mb-5">
              {returnInvoice.invoiceNo || returnInvoice.id} · {returnInvoice.client}
            </p>

            {!returnInvoice.itemsLoaded ? (
              <div className="py-12 text-center text-xs text-[#2e7d32] font-semibold">Loading items...</div>
            ) : (
              <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto">
                {(returnInvoice.items || []).map((item, idx) => {
                  const key = `${returnInvoice.id}-${idx}`;
                  const sel = returnSelections[key] || { checked: false, qty: item.qty };
                  return (
                    <div key={idx} className="flex items-center gap-4 rounded-sm border border-[#cde0cd] p-3 bg-[#fcfdfc]">
                      <input
                        type="checkbox"
                        checked={sel.checked}
                        onChange={e => setReturnSelections(prev => ({
                          ...prev,
                          [key]: { ...sel, checked: e.target.checked }
                        }))}
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-xs text-[#1b3a1d]">{item.name}</p>
                        <p className="text-[10px] text-neutral-400 font-mono">Max return qty: {item.qty}</p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={item.qty}
                        value={sel.qty}
                        disabled={!sel.checked}
                        onChange={e => setReturnSelections(prev => ({
                          ...prev,
                          [key]: { ...sel, qty: Math.min(item.qty, Math.max(1, Number(e.target.value))) }
                        }))}
                        className="w-16 rounded-sm border border-[#cde0cd] px-2 py-1 text-xs text-center font-mono disabled:opacity-40"
                      />
                      <span className="text-xs font-semibold w-24 text-right font-mono text-[#1b3a1d]">
                        {formatMoney(item.price * (sel.checked ? sel.qty : 0))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3 justify-end border-t border-[#c8d8c8] pt-4">
              <button
                onClick={() => { setReturnInvoice(null); setReturnSelections({}); }}
                className="rounded-sm border border-[#cde0cd] px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const returnItems = (returnInvoice.items || []).map((item, idx) => {
                    const key = `${returnInvoice.id}-${idx}`;
                    const sel = returnSelections[key];
                    if (sel && sel.checked) {
                      return {
                        productId: item.productId,
                        productName: item.name,
                        quantity: sel.qty,
                        price: item.price
                      };
                    }
                    return null;
                  }).filter(Boolean);

                  if (returnItems.length === 0) {
                    alert("Select at least one item to return.");
                    return;
                  }

                  if (!window.confirm("Confirm return of items? This will register a sales return and restore inventory stock.")) return;

                  try {
                    await returnSale(returnInvoice.id, { items: returnItems });
                    loadInvoices();
                    setReturnInvoice(null);
                    setReturnSelections({});
                    if (drawerInvoice && drawerInvoice.id === returnInvoice.id) {
                      setDrawerInvoice(null);
                    }
                  } catch (err) {
                    alert("Failed to process items return: " + err.message);
                  }
                }}
                className="rounded-sm bg-[#2e7d32] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 cursor-pointer"
              >
                Confirm Return
              </button>
            </div>
          </div>
        </>
      )}

      {/* RECORD PAYMENT METHOD MODAL */}
      {(payingInvoice || payingBulk) && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => { setPayingInvoice(null); setPayingBulk(false); }} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white p-6 border border-[#c8d8c8] shadow-2xl text-left">
            <h3 className="text-sm font-bold text-[#1b3a1d] uppercase tracking-wider mb-2">Record Invoice Payment</h3>
            <p className="text-xs text-neutral-500 mb-4">
              {payingBulk 
                ? `Recording outstanding account payment in bulk for selected invoice items.` 
                : `Recording outstanding balance of ${formatMoney(payingInvoice?.balanceDue || 0)} for Invoice ${payingInvoice?.invoiceNo || payingInvoice?.id}.`
              }
            </p>
            <div className="mb-5">
              <label className="block text-[10px] font-bold text-[#6a8f6c] uppercase tracking-wider mb-1.5">Select Payment Channel</label>
              <select 
                value={paymentMethod} 
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full rounded-sm border border-[#cde0cd] p-2 bg-[#fcfdfc] text-xs outline-none"
              >
                {["Cash", ...banks.map(b => b.name), "Cheque"].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 justify-end border-t border-neutral-100 pt-4">
              <button 
                onClick={() => { setPayingInvoice(null); setPayingBulk(false); }}
                className="px-4 py-2 text-xs font-semibold rounded-sm border border-[#cde0cd] hover:bg-neutral-50 text-neutral-600 cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={executePayment}
                className="px-4 py-2 text-xs font-semibold rounded-sm bg-[#2e7d32] text-white hover:opacity-90 cursor-pointer"
              >
                Record Payment
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}