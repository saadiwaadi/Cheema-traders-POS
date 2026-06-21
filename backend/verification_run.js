const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const reportPath = path.resolve(__dirname, "../verification_report.txt");
const liveDbPath = path.resolve(__dirname, "../database/pos.db");
const backupDir = "C:\\Users\\GWB\\CheemaTradersPOS\\Backups";

let reportContent = "=== DATABASE SCHEMA INTEGRITY & BACKUP VERIFICATION REPORT ===\n\n";

function runVerify() {
  const liveDb = new sqlite3.Database(liveDbPath, (err) => {
    if (err) {
      reportContent += `Error opening live db: ${err.message}\n`;
      saveReport();
      return;
    }
    
    liveDb.all("PRAGMA table_info(products)", (err, liveCols) => {
      if (err) {
        reportContent += `Error reading live products schema: ${err.message}\n`;
      } else {
        reportContent += "1. LIVE DATABASE PRODUCTS SCHEMA (PRAGMA table_info):\n";
        liveCols.forEach(c => {
          reportContent += `  Column: ${c.name} | Type: ${c.type} | NotNull: ${c.notnull} | Default: ${c.dflt_value} | PK: ${c.pk}\n`;
        });
        reportContent += `Total Columns count: ${liveCols.length}\n\n`;
      }
      
      liveDb.all("SELECT * FROM sale_returns_summary LIMIT 5", (err, viewRows) => {
        if (err) {
          reportContent += `2. VIEW DATA (SELECT * FROM sale_returns_summary LIMIT 5):\n  [ERROR QUERYING VIEW] ${err.message}\n\n`;
        } else {
          reportContent += "2. VIEW DATA (SELECT * FROM sale_returns_summary LIMIT 5):\n";
          reportContent += `  Found ${viewRows.length} rows in sale_returns_summary:\n`;
          viewRows.forEach((r, idx) => {
            reportContent += `  Row ${idx + 1}: ${JSON.stringify(r)}\n`;
          });
          reportContent += "\n";
        }
        liveDb.close();
        
        // Now check backups
        verifyBackup();
      });
    });
  });
}

function verifyBackup() {
  reportContent += "3. PRE-MIGRATION BACKUP FILE VERIFICATION:\n";
  if (fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith("cheema_traders_pos_auto_backup_before_migration"))
      .map(f => ({ name: f, path: path.join(backupDir, f), stat: fs.statSync(path.join(backupDir, f)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    if (files.length > 0) {
      const latestBackup = files[0];
      reportContent += `  Latest Backup File: ${latestBackup.name}\n`;
      reportContent += `  Size: ${(latestBackup.stat.size / 1024).toFixed(2)} KB\n`;
      reportContent += `  Modified Time: ${latestBackup.stat.mtime.toISOString()}\n`;

      const backupDb = new sqlite3.Database(latestBackup.path, (err) => {
        if (err) {
          reportContent += `  [ERROR OPENING BACKUP DB] ${err.message}\n`;
          saveReport();
          return;
        }
        backupDb.all("PRAGMA table_info(products)", (err, backupCols) => {
          if (err) {
            reportContent += `  [ERROR READING BACKUP SCHEMA] ${err.message}\n`;
          } else {
            reportContent += `  [SUCCESS] Backup file opened successfully. Products table found with ${backupCols.length} columns:\n`;
            backupCols.forEach(c => {
              reportContent += `    Column: ${c.name} | Type: ${c.type} | NotNull: ${c.notnull} | Default: ${c.dflt_value} | PK: ${c.pk}\n`;
            });
          }
          backupDb.close();
          saveReport();
        });
      });
    } else {
      reportContent += "  No pre-migration backup files found in the directory.\n";
      saveReport();
    }
  } else {
    reportContent += "  Backup directory does not exist.\n";
    saveReport();
  }
}

function saveReport() {
  fs.writeFileSync(reportPath, reportContent, "utf8");
  console.log("Verification report written to verification_report.txt");
}

runVerify();
