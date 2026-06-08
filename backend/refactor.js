const fs = require('fs');

let code = fs.readFileSync('../frontend/src/pages/Journal.jsx', 'utf8');

// 1. Journal.jsx cleanup
code = code.replace(/const \[ledgerLines[\s\S]*?const \[ledgerTo[^\n]*\n/, '');
code = code.replace('useState("ledger")', 'useState("vouchers")');
code = code.replace(/const loadLedger = async \(\) => \{[\s\S]*?\n  \};\n/, '');
code = code.replace(/if \(activeTab === "ledger"\) \{\s+loadLedger\(\);\s+\} else /, '');
code = code.replace(/\/\/ Helper to get running balance list[\s\S]*?const metrics = ledgerMetrics\(\);\n/, '');

let ledgerTabStart = code.indexOf('{/* TAB 1: GENERAL LEDGER */}');
let ledgerTabEnd = code.indexOf('{/* TAB 2: JOURNAL VOUCHERS LIST */}');
if(ledgerTabStart > -1 && ledgerTabEnd > -1) {
  code = code.substring(0, ledgerTabStart - 100) + code.substring(ledgerTabEnd - 100);
}

// Remove ledger button
code = code.replace(/<button[^>]+onClick=\{[^}]*setActiveTab\("ledger"\)[^>]+>[\s\S]*?<\/button>/, '');

code = code.replace('General Ledger & Journal Entries', 'Journal Entries');
fs.writeFileSync('../frontend/src/pages/Journal.jsx', code);

// 2. LedgerPage.jsx cleanup
let lcode = fs.readFileSync('../frontend/src/pages/ledger.jsx', 'utf8');
lcode = lcode.replace(/const \[vouchers[\s\S]*?const \[formSuccess[^\n]*\n/, '');
lcode = lcode.replace(/const \[isReversing[\s\S]*?const \[reversalError[^\n]*\n/, '');

lcode = lcode.replace(/const loadVouchers = async \(\) => \{[\s\S]*?\n  \};\n/, '');
lcode = lcode.replace(/const loadNextJVNo = async \(\) => \{[\s\S]*?\n  \};\n/, '');
lcode = lcode.replace(/\/\/ JV calculation helpers[\s\S]*?const handleReverseVoucher = async \(e\) => \{[\s\S]*?\n  \};\n/, '');
lcode = lcode.replace(/\} else if \(activeTab === "vouchers"\) \{\s+loadVouchers\(\);\s+\} else if \(activeTab === "new-voucher"\) \{\s+loadNextJVNo\(\);\s+\}/, '}');
lcode = lcode.replace(/useEffect\(\(\) => \{\s+if \(activeTab === "new-voucher"[\s\S]*?\}\), \[jvDate\]\);\n/, '');

// Remove Voucher tabs buttons
lcode = lcode.replace(/<button[^>]+onClick=\{[^}]*setActiveTab\("vouchers"\)[^>]+>[\s\S]*?<\/button>/, '');
lcode = lcode.replace(/<button[^>]+onClick=\{[^}]*setActiveTab\("new-voucher"\)[^>]+>[\s\S]*?<\/button>/, '');

let vTabStart = lcode.indexOf('{/* TAB 2: JOURNAL VOUCHERS LIST */}');
let drawerStart = lcode.indexOf('{/* VOUCHER DETAILS DRAWER / MODAL */}');
if (vTabStart > -1 && drawerStart > -1) {
  lcode = lcode.substring(0, vTabStart - 100) + '\n      </div>\n    </div>\n  );\n}\n' + lcode.substring(lcode.lastIndexOf('const st = {'));
}

lcode = lcode.replace('General Ledger & Journal Entries', 'General Ledger');
fs.writeFileSync('../frontend/src/pages/ledger.jsx', lcode);

console.log('Refactor complete!');
