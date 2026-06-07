// lib/money.js  — store paisa, format only on display
export const toPaisa  = (rupees) => Math.round(Number(rupees) * 100);
export const toRupees = (paisa)  => Number(paisa) / 100;
export const fmtPKR   = (paisa)  =>
  "Rs " + (Number(paisa) / 100).toLocaleString("en-PK",
    { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const drcr = (signed) => signed > 0 ? "Dr" : signed < 0 ? "Cr" : "";
