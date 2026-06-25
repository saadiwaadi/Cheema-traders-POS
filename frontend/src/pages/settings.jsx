import { useState, useEffect } from "react";
import * as api from "../lib/posApi";
import { useThemeLanguage } from "../context/ThemeLanguageContext";
import WarningNotification from "../components/Warningnotification";
import SuccessNotification from "../components/SuccessNotification";
import { Save, Folder, RefreshCw, AlertTriangle, Trash2, Copy, Check, X } from "lucide-react";

const ALL_MODULES = [
  { id: "home", label: "Dashboard" },
  { id: "sales", label: "Billing" },
  { id: "invoices", label: "Invoices" },
  { id: "products", label: "Inventory" },
  { id: "customers", label: "Customers" },
  { id: "addCompany", label: "Suppliers" },
  { id: "payments", label: "Payments" },
  { id: "expenses", label: "Expenses" },
  { id: "banks", label: "Banks" },
  { id: "cashbook", label: "Cash Book" },
  { id: "ledger", label: "General Ledger" },
  { id: "journal", label: "Journal Entries" },
  { id: "coa", label: "Chart of Accounts" },
  { id: "trialbalance", label: "Trial Balance" },
  { id: "analysis", label: "Analysis" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
];

export default function SettingsPage({ user, onLicenseUpdate }) {
  const isAdmin = user?.role === "admin";
  const { t, language } = useThemeLanguage();
  const [activeTab, setActiveTab] = useState(isAdmin ? "general" : "changePassword");

  // Backup State
  const [dbInfo, setDbInfo] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg, setBackupMsg] = useState(null);
  const [recentBackups, setRecentBackups] = useState([]);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [warnData, setWarnData] = useState(null);

  // License states
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [newLicensee, setNewLicensee] = useState("");
  const [newLicenseKey, setNewLicenseKey] = useState("");
  const [licensingError, setLicensingError] = useState("");
  const [licensingSuccess, setLicensingSuccess] = useState("");
  const [licensingLoading, setLicensingLoading] = useState(false);

  // Sync states
  const [dbMode, setDbMode] = useState("local");
  const [syncUrl, setSyncUrl] = useState("");
  const [syncApiKey, setSyncApiKey] = useState("");
  const [syncFreq, setSyncFreq] = useState("hourly");
  const [syncSaveSuccess, setSyncSaveSuccess] = useState(false);

  // Business Profile states
  const [businessName, setBusinessName] = useState("");
  const [businessTagline, setBusinessTagline] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessWhatsapp, setBusinessWhatsapp] = useState("");
  const [businessNtn, setBusinessNtn] = useState("");
  const [businessStrn, setBusinessStrn] = useState("");
  const [showSuccessMsg, setShowSuccessMsg] = useState("");

  const fetchDbInfo = async () => {
    try {
      const info = await api.getDbInfo();
      setDbInfo(info);
    } catch (err) {
      console.error("Failed to fetch database info:", err);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchDbInfo();

      // Fetch settings
      api.getSettings().then(res => {
        const mode = res?.db_mode || "local";
        const url = res?.sync_url || "";
        const key = res?.sync_api_key || "";
        const freq = res?.sync_frequency || "hourly";
        setDbMode(mode);
        setSyncUrl(url);
        setSyncApiKey(key);
        setSyncFreq(freq);

        setBusinessName(res?.business_name || "");
        setBusinessTagline(res?.business_tagline || "");
        setBusinessAddress(res?.business_address || "");
        setBusinessPhone(res?.business_phone || "");
        setBusinessEmail(res?.business_email || "");
        setBusinessWhatsapp(res?.business_whatsapp || "");
        setBusinessNtn(res?.business_ntn || "");
        setBusinessStrn(res?.business_strn || "");
      }).catch(console.error);

      // Fetch license info
      api.getLicenseInfo().then(info => {
        setLicenseInfo(info);
        if (info) {
          setNewLicensee(info.licensee || "");
          setNewLicenseKey(info.rawKey || "");
        }
      }).catch(console.error);
    }
  }, [isAdmin]);

  const formatBytes = (bytes) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleOneClickBackup = async () => {
    setBackupLoading(true);
    setBackupMsg(null);
    try {
      const now = new Date();
      const timestamp = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + "_" +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
      
      const targetDir = "C:\\CheemaTradersPOS\\Backups\\";
      const filename = `cheema_traders_pos_backup_${timestamp}.db`;
      const fullPath = targetDir + filename;

      await api.exportBackup(fullPath);

      const newBackup = {
        path: fullPath,
        time: now.toLocaleTimeString()
      };
      setRecentBackups(prev => [newBackup, ...prev]);

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(fullPath);
      }

      setBackupMsg({
        type: "success",
        text: t("settings.backup_success", "Database backup created successfully!") + ` (${fullPath})`
      });
      fetchDbInfo();
    } catch (err) {
      setBackupMsg({
        type: "error",
        text: t("settings.backup_failed", "Failed to create database backup: {error}").replace("{error}", err.message)
      });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleCustomBackup = async () => {
    setBackupLoading(true);
    setBackupMsg(null);
    try {
      const now = new Date();
      const timestamp = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + "_" +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
      const filename = `cheema_traders_pos_backup_${timestamp}.db`;

      if (api.usingIpc() && window.ipc) {
        const res = await window.ipc.invoke("system:show-save-dialog", {
          title: t("settings.custom_backup_btn", "Save to Custom Location..."),
          defaultPath: filename,
          filters: [{ name: "SQLite Database", extensions: ["db"] }]
        });

        if (res.canceled || !res.filePath) {
          setBackupLoading(false);
          return;
        }

        await api.exportBackup(res.filePath);

        const newBackup = {
          path: res.filePath,
          time: now.toLocaleTimeString()
        };
        setRecentBackups(prev => [newBackup, ...prev]);

        if (navigator.clipboard) {
          await navigator.clipboard.writeText(res.filePath);
        }

        setBackupMsg({
          type: "success",
          text: t("settings.backup_success", "Database backup created successfully!") + ` (${res.filePath})`
        });
      } else {
        const downloadUrl = api.getBackupDownloadUrl();
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setBackupMsg({
          type: "success",
          text: t("settings.backup_success", "Database backup created successfully!") + " (Initiated download)"
        });
      }
      fetchDbInfo();
    } catch (err) {
      setBackupMsg({
        type: "error",
        text: t("settings.backup_failed", "Failed to create database backup: {error}").replace("{error}", err.message)
      });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    setBackupMsg(null);
    try {
      let sourcePath = "";

      if (api.usingIpc() && window.ipc) {
        const res = await window.ipc.invoke("system:show-open-dialog", {
          title: t("settings.restore_btn", "Restore from Backup File..."),
          properties: ["openFile"],
          filters: [{ name: "SQLite Database", extensions: ["db"] }]
        });

        if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
          return;
        }
        sourcePath = res.filePaths[0];
      } else {
        alert("Restore functionality via Web UI is restricted. Please use the Electron app to import databases locally.");
        return;
      }

      const confirmRestore = window.confirm(
        t("settings.confirm_restore_msg", "Are you absolutely sure you want to restore the database from this file? All current data since the backup will be lost. This cannot be undone.")
      );

      if (!confirmRestore) return;

      setBackupLoading(true);
      await api.importBackup(sourcePath);

      setBackupMsg({
        type: "success",
        text: t("settings.restore_success", "Database restored successfully! Reloading...")
      });

      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err) {
      setBackupMsg({
        type: "error",
        text: t("settings.restore_failed", "Failed to restore database: {error}").replace("{error}", err.message)
      });
      setBackupLoading(false);
    }
  };

  const handleDeleteBackup = async (path, idx) => {
    const confirmDelete = window.confirm(
      t("settings.confirm_delete_backup", "Are you sure you want to delete this backup file? This will permanently remove the file from your computer.")
    );
    if (!confirmDelete) return;

    try {
      await api.deleteBackup(path);
      setRecentBackups(prev => prev.filter((_, i) => i !== idx));
      setBackupMsg({
        type: "success",
        text: t("settings.delete_backup_success", "Backup file deleted successfully.")
      });
      fetchDbInfo();
    } catch (err) {
      setBackupMsg({
        type: "error",
        text: t("settings.delete_backup_failed", "Failed to delete backup file: {error}").replace("{error}", err.message)
      });
    }
  };

  const handleTriggerResetWarning = () => {
    const backupDirPreview = dbInfo?.backupDir || "C:\\Users\\...\\CheemaTradersPOS\\Backups\\";
    setWarnData({
      title: t("settings.reset_confirm_title", "Confirm System Reset"),
      lines: [
        { label: t("settings.reset_line_action", "Action"), value: t("settings.reset_line_action_val", "Reset All Databases") },
        { label: t("settings.reset_line_backup", "Auto-Backup"), value: t("settings.reset_line_backup_val", "Yes (Prior to clear)") },
        { label: t("settings.reset_line_failsafe", "Fail-Safe Location"), value: backupDirPreview },
        { label: t("settings.reset_line_preserve", "Preserved"), value: t("settings.reset_line_preserve_val", "Admin User Account") }
      ],
      confirmLabel: t("settings.reset_confirm_btn", "Yes, Reset Everything"),
      cancelLabel: t("settings.reset_cancel_btn", "Cancel"),
      onConfirm: async () => {
        setBackupLoading(true);
        setBackupMsg(null);
        try {
          const res = await api.resetDatabase();
          const backupPath = res?.result?.backupPath || "Backup Folder";
          
          setBackupMsg({
            type: "success",
            text: t("settings.reset_success", "All data reset successfully! Auto-backup saved to: {path}").replace("{path}", backupPath)
          });
          
          setTimeout(() => {
            window.location.reload();
          }, 3500);
        } catch (err) {
          setBackupMsg({
            type: "error",
            text: t("settings.reset_failed", "Failed to reset database: {error}").replace("{error}", err.message)
          });
        } finally {
          setBackupLoading(false);
        }
      }
    });
  };

  const handleCopyPath = async (path, idx) => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(path);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 1500);
    }
  };
  const [expiryDays, setExpiryDays] = useState(() => {
    return Number(localStorage.getItem("expiryThresholdDays")) || 60;
  });

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [saveStatus, setSaveStatus] = useState({}); // productId -> "saved" | "error"

  // User Management state
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // User Form fields state
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("staff");
  const [formActive, setFormActive] = useState(1);
  const [formUseCustomPerms, setFormUseCustomPerms] = useState(false);
  const [formPerms, setFormPerms] = useState([]);

  const handleExpiryThresholdChange = (val) => {
    const days = Number(val) || 0;
    setExpiryDays(days);
    localStorage.setItem("expiryThresholdDays", days);
  };

  useEffect(() => {
    if (activeTab === "stock" && isAdmin) {
      const fetchProducts = async () => {
        setLoading(true);
        try {
          const res = await api.listProducts({ limit: 1000 });
          const list = Array.isArray(res) ? res : (res && Array.isArray(res.products) ? res.products : []);
          setProducts(list);
        } catch (err) {
          console.error("Failed to load products:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchProducts();
    }
  }, [activeTab, isAdmin]);

  const fetchUsersList = async () => {
    setUsersLoading(true);
    try {
      const res = await api.listUsers();
      if (res?.users) {
        setUsersList(res.users);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "users" && isAdmin) {
      fetchUsersList();
    }
  }, [activeTab, isAdmin]);

  const handleUpdateStockThreshold = async (product, val) => {
    const newVal = parseInt(val, 10);
    if (Number.isNaN(newVal) || newVal < 0) return;
    setSavingId(product.id);
    try {
      await api.saveProduct({
        ...product,
        lowStockLevel: newVal,
      });
      setSaveStatus(prev => ({ ...prev, [product.id]: "saved" }));
      setTimeout(() => {
        setSaveStatus(prev => ({ ...prev, [product.id]: null }));
      }, 1500);
    } catch (err) {
      setSaveStatus(prev => ({ ...prev, [product.id]: "error" }));
    } finally {
      setSavingId(null);
    }
  };

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormUsername("");
    setFormPassword("");
    setFormRole("staff");
    setFormActive(1);
    setFormUseCustomPerms(false);
    setFormPerms(["home", "sales", "invoices", "products", "customers", "settings"]);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (u) => {
    setEditingUser(u);
    setFormUsername(u.username);
    setFormPassword("");
    setFormRole(u.role);
    setFormActive(u.active);
    if (u.permissions && Array.isArray(u.permissions)) {
      setFormUseCustomPerms(true);
      setFormPerms(u.permissions);
    } else {
      setFormUseCustomPerms(false);
      setFormPerms([]);
    }
    setIsFormOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!formUsername.trim()) return;

    const payload = {
      username: formUsername.trim(),
      role: formRole,
      active: Number(formActive),
      permissions: formUseCustomPerms ? formPerms : null,
    };

    if (editingUser) {
      payload.id = editingUser.id;
      if (formPassword) {
        payload.password = formPassword;
      }
    } else {
      if (!formPassword) {
        alert("Password is required for new users");
        return;
      }
      payload.password = formPassword;
    }

    try {
      await api.saveUser(payload);
      setIsFormOpen(false);
      fetchUsersList();
    } catch (err) {
      alert("Failed to save user: " + err.message);
    }
  };

  const handleTogglePerm = (permId) => {
    setFormPerms(prev => {
      if (prev.includes(permId)) {
        return prev.filter(p => p !== permId);
      } else {
        return [...prev, permId];
      }
    });
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())) ||
    (p.categoryName && p.categoryName.toLowerCase().includes(search.toLowerCase()))
  );

  const handleUpdateLicense = async (e) => {
    e.preventDefault();
    if (!newLicensee.trim() || !newLicenseKey.trim()) {
      setLicensingError("Please fill in both fields.");
      return;
    }
    setLicensingLoading(true);
    setLicensingError("");
    setLicensingSuccess("");
    try {
      const res = await api.activateLicense({
        licensee: newLicensee.trim(),
        key: newLicenseKey.trim()
      });
      if (res?.success) {
        setLicensingSuccess("License activated successfully!");
        // Fetch updated info from backend to get proper status/masked key
        const updatedInfo = await api.getLicenseInfo();
        setLicenseInfo(updatedInfo);
        if (updatedInfo) {
          setNewLicenseKey(updatedInfo.rawKey || "");
        }
        if (onLicenseUpdate) onLicenseUpdate();
      } else {
        setLicensingError("Activation failed.");
      }
    } catch (err) {
      setLicensingError(err.message || "Invalid license key.");
    } finally {
      setLicensingLoading(false);
    }
  };

  const handleSaveSyncSettings = async (e) => {
    e.preventDefault();
    try {
      await api.saveSetting({ key: "db_mode", value: dbMode });
      await api.saveSetting({ key: "sync_url", value: syncUrl });
      await api.saveSetting({ key: "sync_api_key", value: syncApiKey });
      await api.saveSetting({ key: "sync_frequency", value: syncFreq });
      setSyncSaveSuccess(true);
      setTimeout(() => setSyncSaveSuccess(false), 2500);
    } catch (err) {
      alert("Failed to save sync settings: " + err.message);
    }
  };

  const handleSaveBusinessProfile = async (e) => {
    e.preventDefault();
    try {
      await api.saveSettings({
        business_name: businessName,
        business_tagline: businessTagline,
        business_address: businessAddress,
        business_phone: businessPhone,
        business_email: businessEmail,
        business_whatsapp: businessWhatsapp,
        business_ntn: businessNtn,
        business_strn: businessStrn,
      });
      setShowSuccessMsg("Business profile settings saved successfully!");
      setTimeout(() => setShowSuccessMsg(""), 3000);
    } catch (err) {
      setWarnData({
        title: "Save Profile Failed",
        lines: [
          { label: "Error Message", value: err.message || "An unknown error occurred" }
        ]
      });
    }
  };

  return (
    <div style={st.container}>
      {/* Settings Navigation */}
      <div style={st.navRow}>
        {isAdmin && (
          <>
            <button
              onClick={() => setActiveTab("general")}
              style={{ ...st.navTab, ...(activeTab === "general" ? st.navTabActive : {}) }}
            >
              {t("settings.general_alerts", "General Alerts")}
            </button>
            <button
              onClick={() => setActiveTab("stock")}
              style={{ ...st.navTab, ...(activeTab === "stock" ? st.navTabActive : {}) }}
            >
              {t("settings.low_stock_thresholds", "Low-Stock Thresholds")}
            </button>
          </>
        )}
        <button
          onClick={() => setActiveTab("changePassword")}
          style={{ ...st.navTab, ...(activeTab === "changePassword" ? st.navTabActive : {}) }}
        >
          {t("settings.change_password", "Change Password")}
        </button>
        {isAdmin && (
          <>
            <button
              onClick={() => setActiveTab("users")}
              style={{ ...st.navTab, ...(activeTab === "users" ? st.navTabActive : {}) }}
            >
              {t("settings.user_management", "User Management")}
            </button>
            <button
              onClick={() => setActiveTab("backup")}
              style={{ ...st.navTab, ...(activeTab === "backup" ? st.navTabActive : {}) }}
            >
              {t("settings.database_backup", "Database Backup")}
            </button>
            <button
              onClick={() => setActiveTab("license")}
              style={{ ...st.navTab, ...(activeTab === "license" ? st.navTabActive : {}) }}
            >
              License Management
            </button>
            <button
              onClick={() => setActiveTab("sync")}
              style={{ ...st.navTab, ...(activeTab === "sync" ? st.navTabActive : {}) }}
            >
              Cloud Sync
            </button>
          </>
        )}
      </div>

      <div style={st.card}>
        {activeTab === "general" && isAdmin && (
          <div>
            {/* Business Profile Section */}
            <div style={{ marginBottom: 32 }}>
              <h3 style={st.sectionTitle}>Business Profile</h3>
              <p style={st.subText}>Manage your company details used across invoices, print templates, and statements.</p>
              
              <form onSubmit={handleSaveBusinessProfile} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 600, marginBottom: 32 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={st.formLabel}>Business Name</label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={e => setBusinessName(e.target.value)}
                      style={st.thresholdInputText}
                      required
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={st.formLabel}>Tagline / Description</label>
                    <input
                      type="text"
                      value={businessTagline}
                      onChange={e => setBusinessTagline(e.target.value)}
                      style={st.thresholdInputText}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={st.formLabel}>Address</label>
                  <textarea
                    rows={2}
                    value={businessAddress}
                    onChange={e => setBusinessAddress(e.target.value)}
                    style={{ ...st.thresholdInputText, height: "auto", padding: "8px 12px" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={st.formLabel}>Phone</label>
                    <input
                      type="text"
                      value={businessPhone}
                      onChange={e => setBusinessPhone(e.target.value)}
                      style={st.thresholdInputText}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={st.formLabel}>Email</label>
                    <input
                      type="email"
                      value={businessEmail}
                      onChange={e => setBusinessEmail(e.target.value)}
                      style={st.thresholdInputText}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={st.formLabel}>WhatsApp (Optional)</label>
                    <input
                      type="text"
                      value={businessWhatsapp}
                      onChange={e => setBusinessWhatsapp(e.target.value)}
                      style={st.thresholdInputText}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={st.formLabel}>NTN Number (Optional)</label>
                    <input
                      type="text"
                      value={businessNtn}
                      onChange={e => setBusinessNtn(e.target.value)}
                      style={st.thresholdInputText}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={st.formLabel}>STRN Number (Optional)</label>
                    <input
                      type="text"
                      value={businessStrn}
                      onChange={e => setBusinessStrn(e.target.value)}
                      style={st.thresholdInputText}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <button type="submit" style={st.btnPrimary}>
                    Save Profile
                  </button>
                </div>
              </form>
            </div>

            <h3 style={st.sectionTitle}>General Alert Preferences</h3>
            <p style={st.subText}>Configure generic alerts and warning parameters across the system.</p>

            <div style={st.settingGroup}>
              <label style={st.label}>Batch Expiry Threshold (Days)</label>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                <input
                  type="number"
                  value={expiryDays}
                  onChange={(e) => handleExpiryThresholdChange(e.target.value)}
                  style={st.inputNumber}
                />
                <span style={st.helperText}>
                  Batches with expiration dates within these days will trigger an **"expiring"** status.
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "stock" && isAdmin && (
          <div>
            <h3 style={st.sectionTitle}>Low-Stock Product Thresholds</h3>
            <p style={st.subText}>Specify minimum quantity limits to trigger low-stock warning labels.</p>

            {/* Search Bar */}
            <div style={{ margin: "16px 0" }}>
              <input
                placeholder="Search products by name, SKU or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={st.searchInput}
              />
            </div>

            {/* List */}
            {loading ? (
              <div style={st.loadingText}>Loading product list...</div>
            ) : filteredProducts.length === 0 ? (
              <div style={st.loadingText}>No products found matching query.</div>
            ) : (
              <div style={st.tableContainer}>
                <div style={st.tableHeader}>
                  <span style={{ flex: 3 }}>Product Details</span>
                  <span style={{ flex: 1.5, textAlign: "center" }}>Unit</span>
                  <span style={{ flex: 2, textAlign: "right", paddingRight: 40 }}>Min Stock Limit</span>
                </div>
                <div style={st.tableBody}>
                  {filteredProducts.map(p => (
                    <div key={p.id} style={st.tableRow}>
                      <div style={{ flex: 3 }}>
                        <div style={{ fontWeight: 600, color: "#1b3a1d" }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: "#6a8f6c", marginTop: 2 }}>
                          SKU: {p.sku || "N/A"} | Category: {p.categoryName || "Uncategorized"}
                        </div>
                      </div>
                      <span style={{ flex: 1.5, textAlign: "center", color: "#555", fontSize: 13 }}>{p.unit}</span>
                      <div style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
                        <input
                          type="number"
                          defaultValue={p.lowStockLevel || 0}
                          disabled={savingId === p.id}
                          onBlur={(e) => handleUpdateStockThreshold(p, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleUpdateStockThreshold(p, e.target.value);
                              e.target.blur();
                            }
                          }}
                          style={st.thresholdInput}
                        />
                        <div style={{ width: 60, fontSize: 11, fontWeight: 700, textAlign: "center" }}>
                          {savingId === p.id && <span style={{ color: "#666" }}>Saving...</span>}
                          {saveStatus[p.id] === "saved" && <span style={{ color: "#2e7d32", display: "inline-flex", alignItems: "center", gap: "4px" }}><Check size={14} /> Saved</span>}
                          {saveStatus[p.id] === "error" && <span style={{ color: "#c62828", display: "inline-flex", alignItems: "center", gap: "4px" }}><X size={14} /> Fail</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "changePassword" && (
          <ChangePasswordTab userId={user?.id} />
        )}

        {activeTab === "users" && isAdmin && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={st.sectionTitle}>User Management</h3>
                <p style={st.subText}>Create and manage users, roles, and module access control permissions.</p>
              </div>
              <button onClick={handleOpenAdd} style={st.btnPrimary}>
                + Add User
              </button>
            </div>

            {usersLoading ? (
              <div style={st.loadingText}>Loading users list...</div>
            ) : usersList.length === 0 ? (
              <div style={st.loadingText}>No users registered.</div>
            ) : (
              <div style={st.tableContainer}>
                <div style={st.tableHeader}>
                  <span style={{ flex: 2 }}>Username</span>
                  <span style={{ flex: 1.5 }}>Role</span>
                  <span style={{ flex: 1.5 }}>Status</span>
                  <span style={{ flex: 4 }}>Permissions / Module Access</span>
                  <span style={{ flex: 1.5, textAlign: "right" }}>Actions</span>
                </div>
                <div style={st.tableBody}>
                  {usersList.map(u => (
                    <div key={u.id} style={st.tableRow}>
                      <span style={{ flex: 2, fontWeight: 600, color: "var(--text-primary)" }}>{u.username}</span>
                      <span style={{ flex: 1.5, textTransform: "capitalize" }}>{u.role}</span>
                      <span style={{ flex: 1.5 }}>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          background: u.active === 1 ? "rgba(46, 125, 50, 0.15)" : "rgba(198, 40, 40, 0.15)",
                          color: u.active === 1 ? "var(--success)" : "var(--danger)"
                        }}>
                          {u.active === 1 ? "Active" : "Inactive"}
                        </span>
                      </span>
                      <span style={{ flex: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                        {u.permissions && Array.isArray(u.permissions) ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {u.permissions.map(p => {
                              const moduleLabel = ALL_MODULES.find(m => m.id === p)?.label || p;
                              return (
                                <span key={p} style={{
                                  background: "rgba(46, 125, 50, 0.1)",
                                  border: "1px solid var(--border)",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: "var(--accent)"
                                }}>
                                  {moduleLabel}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span style={{ fontStyle: "italic", color: "#888" }}>
                            {u.role === "admin" ? "All Access (Admin Default)" : "Default Access (Staff Default)"}
                          </span>
                        )}
                      </span>
                      <div style={{ flex: 1.5, display: "flex", justifyContent: "flex-end" }}>
                        <button onClick={() => handleOpenEdit(u)} style={st.btnSecondarySmall}>
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Overlay / Form Drawer */}
            {isFormOpen && (
              <div style={st.modalOverlay}>
                <div style={st.modalCard}>
                  <h3 style={st.sectionTitle}>{editingUser ? "Edit User" : "Add User"}</h3>
                  <form onSubmit={handleSaveUser} style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={st.formLabel}>Username</label>
                      <input
                        type="text"
                        value={formUsername}
                        onChange={e => setFormUsername(e.target.value)}
                        style={st.thresholdInputText}
                        required
                        disabled={editingUser && editingUser.username === "admin"}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={st.formLabel}>
                        {editingUser ? "Change Password (Leave blank to keep)" : "Password"}
                      </label>
                      <input
                        type="password"
                        value={formPassword}
                        onChange={e => setFormPassword(e.target.value)}
                        style={st.thresholdInputText}
                        required={!editingUser}
                      />
                    </div>

                    <div style={{ display: "flex", gap: 16 }}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={st.formLabel}>Role</label>
                        <select
                          value={formRole}
                          onChange={e => setFormRole(e.target.value)}
                          style={st.select}
                          disabled={editingUser && editingUser.username === "admin"}
                        >
                          <option value="staff">Staff</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>

                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={st.formLabel}>Status</label>
                        <select
                          value={formActive}
                          onChange={e => setFormActive(Number(e.target.value))}
                          style={st.select}
                          disabled={editingUser && editingUser.username === "admin"}
                        >
                          <option value={1}>Active</option>
                          <option value={0}>Inactive</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid #e8f0e8", paddingTop: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <input
                          type="checkbox"
                          id="custom_perms_checkbox"
                          checked={formUseCustomPerms}
                          onChange={e => setFormUseCustomPerms(e.target.checked)}
                          style={{ width: 16, height: 16, cursor: "pointer" }}
                        />
                        <label htmlFor="custom_perms_checkbox" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", cursor: "pointer" }}>
                          Custom Module Access Control
                        </label>
                      </div>

                      {formUseCustomPerms && (
                        <div style={st.checkboxGrid}>
                          {ALL_MODULES.map(m => (
                            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input
                                type="checkbox"
                                id={`perm_${m.id}`}
                                checked={formPerms.includes(m.id)}
                                onChange={() => handleTogglePerm(m.id)}
                                style={{ width: 14, height: 14, cursor: "pointer" }}
                              />
                              <label htmlFor={`perm_${m.id}`} style={{ fontSize: 12, color: "var(--text-primary)", cursor: "pointer" }}>
                                {m.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12, borderTop: "1px solid #e8f0e8", paddingTop: 12 }}>
                      <button type="button" onClick={() => setIsFormOpen(false)} style={st.btnSecondary}>
                        Cancel
                      </button>
                      <button type="submit" style={st.btnPrimary}>
                        Save User
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "backup" && isAdmin && (
          <div>
            <h3 style={st.sectionTitle}>{t("settings.backup_recovery_title", "Database Backup & Recovery")}</h3>
            <p style={st.subText}>{t("settings.backup_recovery_desc", "Safeguard your application data by exporting backups or restoring previous copies.")}</p>

            {backupMsg && (
              <div style={{
                padding: "12px 16px",
                borderRadius: 8,
                marginBottom: 20,
                fontSize: "13.5px",
                fontWeight: 600,
                background: backupMsg.type === "success" ? "rgba(46, 125, 50, 0.15)" : "rgba(198, 40, 40, 0.15)",
                color: backupMsg.type === "success" ? "var(--success)" : "var(--danger)",
                border: `1.5px solid ${backupMsg.type === "success" ? "var(--success)" : "var(--danger)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <span>{backupMsg.text}</span>
                <button 
                  onClick={() => setBackupMsg(null)}
                  style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 700, fontSize: "16px" }}
                >
                  ×
                </button>
              </div>
            )}

            {/* DB Status and size dashboard */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "16px",
              marginBottom: "24px"
            }}>
              <div style={{
                background: "var(--surface-secondary, #f4faf4)",
                border: "1px solid var(--border, #cde0cd)",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  {t("settings.db_status", "Database Status")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)", display: "inline-block" }}></span>
                  <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                    {t("settings.db_connected", "Connected")}
                  </span>
                  <span style={{
                    fontSize: "11px",
                    background: "rgba(46, 125, 50, 0.15)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    color: "var(--success)",
                    fontWeight: 600
                  }}>
                    {api.usingIpc() ? "Electron IPC" : "HTTP Server"}
                  </span>
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", wordBreak: "break-all", fontFamily: "monospace", marginTop: "4px" }}>
                  {dbInfo?.path || "pos.db"}
                </div>
              </div>

              <div style={{
                background: "var(--surface-secondary, #f4faf4)",
                border: "1px solid var(--border, #cde0cd)",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  {t("settings.db_size", "Database Size")}
                </div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)" }}>
                  {formatBytes(dbInfo?.size)}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  {t("settings.last_backup_date", "Last Backup Date")}: {recentBackups[0]?.time || "N/A"}
                </div>
              </div>
            </div>

            {/* Backup Operations */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px", marginTop: "12px" }}>
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "20px" }}>
                <h4 style={{ margin: "0 0 16px 0", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {t("settings.backup_options_title", "Export / Backup Options")}
                </h4>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* One-click C: Drive Backup */}
                  <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "var(--surface-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "16px",
                    gap: "16px"
                  }}>
                    <div style={{ flex: 1, minWidth: "280px" }}>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "14px" }}>
                        {t("settings.one_click_backup_btn", "One-click Backup to C: Drive")}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                        {t("settings.one_click_backup_desc", "Instantly copies the database to {path} using the naming format {format}.")
                          .replace("{path}", "C:\\CheemaTradersPOS\\Backups\\")
                          .replace("{format}", "cheema_traders_pos_backup_YYYYMMDD_HHMMSS.db")}
                      </div>
                    </div>
                    <button
                      onClick={handleOneClickBackup}
                      disabled={backupLoading}
                      style={{
                        ...st.btnPrimary,
                        padding: "10px 20px",
                        fontSize: "13.5px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        minWidth: "180px",
                        justifyContent: "center"
                      }}
                    >
                      {backupLoading ? "..." : <><Save size={16} /> {t("settings.one_click_backup_btn", "One-click Backup")}</>}
                    </button>
                  </div>

                  {/* Custom Export */}
                  <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "var(--surface-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "16px",
                    gap: "16px"
                  }}>
                    <div style={{ flex: 1, minWidth: "280px" }}>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "14px" }}>
                        {t("settings.custom_backup_btn", "Save to Custom Location...")}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                        {t("settings.custom_backup_desc", "Choose exactly where to export the database copy and customize the filename.")}
                      </div>
                    </div>
                    <button
                      onClick={handleCustomBackup}
                      disabled={backupLoading}
                      style={{
                        ...st.btnSecondary,
                        padding: "10px 20px",
                        fontSize: "13.5px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        minWidth: "180px",
                        borderColor: "var(--accent)",
                        color: "var(--accent)",
                        justifyContent: "center"
                      }}
                    >
                      <Folder size={16} /> {t("settings.custom_backup_btn", "Save As...")}
                    </button>
                  </div>
                </div>
              </div>

              {/* Recovery Operations */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "20px" }}>
                <h4 style={{ margin: "0 0 16px 0", fontSize: "15px", fontWeight: 700, color: "var(--danger)" }}>
                  {t("settings.recovery_options_title", "Recovery / Restore")}
                </h4>
                
                <div style={{
                  background: "var(--surface-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "16px",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px"
                }}>
                  <div style={{ flex: 1, minWidth: "280px" }}>
                    <div style={{ fontWeight: 700, color: "var(--danger)", fontSize: "14px" }}>
                      {t("settings.restore_btn", "Restore from Backup File...")}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--danger)", fontWeight: 600, marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <AlertTriangle size={15} /> {t("settings.restore_warning", "WARNING: Restoring will overwrite all current data. The application will reload/restart upon completion.")}
                    </div>
                  </div>
                  <button
                    onClick={handleRestoreBackup}
                    disabled={backupLoading}
                    style={{
                      background: "var(--danger)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      padding: "10px 20px",
                      fontSize: "13.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      minWidth: "180px",
                      justifyContent: "center",
                      boxShadow: "0 2px 4px rgba(198, 40, 40, 0.15)"
                    }}
                  >
                    <RefreshCw size={16} /> {t("settings.restore_btn", "Restore")}
                  </button>
                </div>
              </div>

              {/* Danger Zone: Reset Data */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "20px" }}>
                <h4 style={{ margin: "0 0 16px 0", fontSize: "15px", fontWeight: 700, color: "var(--danger)" }}>
                  {t("settings.danger_zone_title", "Danger Zone")}
                </h4>
                
                <div style={{
                  background: "var(--surface-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "16px",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px"
                }}>
                  <div style={{ flex: 1, minWidth: "280px" }}>
                    <div style={{ fontWeight: 700, color: "var(--danger)", fontSize: "14px" }}>
                      {t("settings.reset_data_title", "Reset All System Data")}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--danger)", fontWeight: 600, marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <AlertTriangle size={15} /> {t("settings.reset_warning", "WARNING: This will permanently delete all sales, inventory, customers, suppliers, banks, and transactions. A database backup will be automatically saved prior to deletion.")}
                    </div>
                  </div>
                  <button
                    onClick={handleTriggerResetWarning}
                    disabled={backupLoading}
                    style={{
                      background: "var(--danger)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      padding: "10px 20px",
                      fontSize: "13.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      minWidth: "180px",
                      justifyContent: "center",
                      boxShadow: "0 2px 4px rgba(198, 40, 40, 0.15)"
                    }}
                  >
                    <Trash2 size={16} /> {t("settings.reset_btn", "Reset All Data")}
                  </button>
                </div>
              </div>

              {/* Session backup history */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "20px", marginBottom: "10px" }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {t("settings.recent_backups_title", "Recent Backups Created (This Session)")}
                </h4>

                {recentBackups.length === 0 ? (
                  <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", fontStyle: "italic", margin: 0 }}>
                    {t("settings.recent_backups_no_history", "No backups created during this session.")}
                  </p>
                ) : (
                  <div style={{ border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden" }}>
                    <div style={{ display: "flex", background: "var(--surface-secondary)", padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)" }}>
                      <span style={{ flex: 3 }}>{t("settings.recent_backups_path", "Saved Path")}</span>
                      <span style={{ flex: 1, textAlign: "right" }}>{t("settings.recent_backups_time", "Time Created")}</span>
                    </div>
                    <div>
                      {recentBackups.map((b, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: idx === recentBackups.length - 1 ? "none" : "1px solid var(--border)", fontSize: "12.5px", color: "var(--text-primary)" }}>
                          <span style={{ flex: 3, wordBreak: "break-all", fontFamily: "monospace", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
                            {b.path}
                            <button
                              onClick={() => handleCopyPath(b.path, idx)}
                              title={t("settings.copy_path_tooltip", "Copy saved path to clipboard")}
                              style={{
                                background: copiedIndex === idx ? "rgba(46, 125, 50, 0.15)" : "var(--surface-secondary)",
                                color: copiedIndex === idx ? "var(--success)" : "var(--text-primary)",
                                border: "1px solid var(--border)",
                                borderRadius: "4px",
                                padding: "2px 6px",
                                fontSize: "10.5px",
                                fontWeight: 600,
                                cursor: "pointer"
                              }}
                            >
                              {copiedIndex === idx ? t("settings.copied_tooltip", "Copied!") : <Copy size={13} />}
                            </button>
                            <button
                              onClick={() => handleDeleteBackup(b.path, idx)}
                              title={t("settings.delete_backup_tooltip", "Delete this backup file")}
                              style={{
                                background: "rgba(198, 40, 40, 0.15)",
                                color: "var(--danger)",
                                border: "1px solid var(--border)",
                                borderRadius: "4px",
                                padding: "2px 6px",
                                fontSize: "10.5px",
                                fontWeight: 600,
                                cursor: "pointer"
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </span>
                          <span style={{ flex: 1, textAlign: "right", color: "var(--text-secondary)", fontWeight: 600 }}>{b.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "license" && isAdmin && (
          <div>
            <h3 style={st.sectionTitle}>License Key Management</h3>
            <p style={st.subText}>Monitor and activate your software license for {businessName || "Cheema Traders"} POS.</p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "16px" }}>
              <div style={{
                background: "var(--surface-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <div>
                  <div style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: 700, color: "var(--text-secondary)" }}>License Status</div>
                  <strong style={{ fontSize: "18px", color: licenseInfo?.licensed ? "var(--success)" : "var(--danger)" }}>
                    {licenseInfo?.licensed ? "Licensed & Activated" : "Unlicensed / Key Invalid"}
                  </strong>
                  {licenseInfo?.licensed && (
                    <div style={{ fontSize: "13px", color: "var(--text-primary)", marginTop: "6px" }}>
                      Registered to: <strong>{licenseInfo.licensee}</strong>
                    </div>
                  )}
                </div>
                <div style={{
                  background: licenseInfo?.licensed ? "rgba(46, 125, 50, 0.15)" : "rgba(211, 47, 47, 0.15)",
                  color: licenseInfo?.licensed ? "var(--success)" : "var(--danger)",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontWeight: 700,
                  fontSize: "13px"
                }}>
                  {licenseInfo?.licensed ? "ACTIVE" : "INACTIVE"}
                </div>
              </div>

              {/* Grace & Lock Notifications */}
              {licenseInfo?.status === "expired_grace" && (
                <div style={{
                  background: "linear-gradient(90deg, #ffebee 0%, #ffcdd2 100%)",
                  borderLeft: "5px solid #d32f2f",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  color: "#c62828",
                  fontSize: "13.5px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  <AlertTriangle size={18} />
                  <span>
                    Your license expired on {licenseInfo.expiryDate}. You are currently within a 7-day grace period. {licenseInfo.graceDaysRemaining} days remaining before system hard lock.
                  </span>
                </div>
              )}

              {licenseInfo?.status === "unlicensed_grace" && (
                <div style={{
                  background: "linear-gradient(90deg, #fff3e0 0%, #ffe0b2 100%)",
                  borderLeft: "5px solid #ff9800",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  color: "#e65100",
                  fontSize: "13.5px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  <AlertTriangle size={18} />
                  <span>
                    Software is unlicensed. You are currently within a 7-day grace period. {licenseInfo.graceDaysRemaining} days remaining before system hard lock.
                  </span>
                </div>
              )}

              {(licenseInfo?.status === "unlicensed_locked" || licenseInfo?.status === "expired_locked") && (
                <div style={{
                  background: "linear-gradient(90deg, #ffebee 0%, #ffcdd2 100%)",
                  borderLeft: "5px solid #d32f2f",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  color: "#c62828",
                  fontSize: "13.5px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  <AlertTriangle size={18} />
                  <span>
                    SYSTEM LOCKED: The 7-day grace period has expired. Please activate with a valid key.
                  </span>
                </div>
              )}

              {/* License Details Grid */}
              <div style={{
                background: "var(--surface-secondary, #f4faf4)",
                border: "1px solid var(--border, #cde0cd)",
                borderRadius: "12px",
                padding: "20px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px",
              }}>
                <div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                    Licensed To
                  </span>
                  <strong style={{ fontSize: "15px", color: "var(--text-primary)" }}>
                    {licenseInfo?.licensee || "N/A"}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                    License Key
                  </span>
                  <strong style={{ fontSize: "14px", fontFamily: "monospace", color: "var(--text-primary)" }}>
                    {licenseInfo?.key || "N/A"}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                    Expiry Date
                  </span>
                  <strong style={{ fontSize: "15px", color: "var(--text-primary)" }}>
                    {licenseInfo?.expiryDate || "N/A"}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                    Days Remaining
                  </span>
                  <strong style={{ 
                    fontSize: "15px", 
                    color: licenseInfo?.daysRemaining <= 15 ? "#d32f2f" : "var(--text-primary)" 
                  }}>
                    {licenseInfo?.daysRemaining !== undefined ? `${licenseInfo.daysRemaining} days` : "N/A"}
                  </strong>
                </div>
              </div>

              <form onSubmit={handleUpdateLicense} style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "500px" }}>
                <h4 style={{ margin: "10px 0 2px 0", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Activate / Update Key</h4>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>Licensee Name / Business</label>
                  <input
                    type="text"
                    value={newLicensee}
                    onChange={(e) => setNewLicensee(e.target.value)}
                    placeholder="e.g. Cheema Traders"
                    style={{ ...st.thresholdInput, width: "100%", textAlign: "left", fontFamily: "inherit" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>License Activation Key</label>
                  <input
                    type="text"
                    value={newLicenseKey}
                    onChange={(e) => setNewLicenseKey(e.target.value)}
                    placeholder="e.g. CTPOS-2026-..."
                    style={{ ...st.thresholdInput, width: "100%", textAlign: "left", fontFamily: "monospace" }}
                  />
                </div>

                {licensingError && (
                  <div style={{ color: "var(--danger)", fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                    <X size={14} /> {licensingError}
                  </div>
                )}
                {licensingSuccess && (
                  <div style={{ color: "var(--success)", fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                    <Check size={14} /> {licensingSuccess}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={licensingLoading}
                  style={{ ...st.btnPrimary, alignSelf: "flex-start", marginTop: "4px" }}
                >
                  {licensingLoading ? "Validating..." : "Activate Software"}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === "sync" && isAdmin && (
          <div>
            <h3 style={st.sectionTitle}>Cloud Sync & Database Connection</h3>
            <p style={st.subText}>Configure local database connection modes and remote API sync properties.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "16px" }}>
              <div style={{
                background: "rgba(230, 81, 0, 0.05)",
                border: "1.5px dashed #e65100",
                borderRadius: "8px",
                padding: "12px 16px",
                fontSize: "12.5px",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                gap: "10px"
              }}>
                <AlertTriangle size={20} style={{ color: "#e65100", flexShrink: 0 }} />
                <div>
                  <strong>Developer Preview Disclaimer:</strong> Online Database Synchronization is currently in developer-preview. Enabling this toggle saves settings but won't trigger sync transactions in this version.
                </div>
              </div>

              <form onSubmit={handleSaveSyncSettings} style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "600px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>Database Connection Mode</label>
                  <select
                    value={dbMode}
                    onChange={(e) => setDbMode(e.target.value)}
                    style={{ ...st.thresholdInput, width: "100%", textAlign: "left", fontFamily: "inherit" }}
                  >
                    <option value="local">Local SQLite Offline Mode (Default)</option>
                    <option value="cloud">Cloud Sync / Buffer Synchronization Mode</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>Cloud Synchronization URL</label>
                  <input
                    type="url"
                    value={syncUrl}
                    onChange={(e) => setSyncUrl(e.target.value)}
                    placeholder="https://api.cheematraders.com/v1/sync"
                    style={{ ...st.thresholdInput, width: "100%", textAlign: "left", fontFamily: "inherit" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>Synchronizer API Credentials (Key)</label>
                  <input
                    type="password"
                    value={syncApiKey}
                    onChange={(e) => setSyncApiKey(e.target.value)}
                    placeholder="••••••••••••••••••••••••••••••••"
                    style={{ ...st.thresholdInput, width: "100%", textAlign: "left", fontFamily: "monospace" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>Auto Sync Frequency</label>
                  <select
                    value={syncFreq}
                    onChange={(e) => setSyncFreq(e.target.value)}
                    style={{ ...st.thresholdInput, width: "100%", textAlign: "left", fontFamily: "inherit" }}
                  >
                    <option value="5min">Every 5 Minutes</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="manual">Manual Trigger Only</option>
                  </select>
                </div>

                {syncSaveSuccess && (
                  <div style={{ color: "var(--success)", fontSize: "12.5px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                    <Check size={14} /> Synchronization parameters saved successfully!
                  </div>
                )}

                <button
                  type="submit"
                  style={{ ...st.btnPrimary, alignSelf: "flex-start", marginTop: "6px" }}
                >
                  Save Configuration
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
      <WarningNotification
        visible={!!warnData}
        title={warnData?.title}
        lines={warnData?.lines}
        onConfirm={warnData?.onConfirm}
        confirmLabel={warnData?.confirmLabel}
        cancelLabel={warnData?.cancelLabel}
        onClose={() => setWarnData(null)}
      />
      {showSuccessMsg && (
        <SuccessNotification
          message={showSuccessMsg}
          onClose={() => setShowSuccessMsg("")}
        />
      )}
    </div>
  );
}

function ChangePasswordTab({ userId }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState(null); // { type: 'success'|'error', text: '' }
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      setMsg({ type: "error", text: "Please fill all fields" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg({ type: "error", text: "New passwords do not match" });
      return;
    }

    setLoading(true);
    setMsg(null);
    try {
      await api.changePassword(userId, oldPassword, newPassword);
      setMsg({ type: "success", text: "Password changed successfully!" });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Failed to change password" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400 }}>
      <h3 style={st.sectionTitle}>Change Password</h3>
      <p style={st.subText}>Update your credentials to maintain security.</p>
      
      {msg && (
        <div style={{
          padding: "10px 14px",
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 600,
          background: msg.type === "success" ? "rgba(46, 125, 50, 0.15)" : "rgba(198, 40, 40, 0.15)",
          color: msg.type === "success" ? "var(--success)" : "var(--danger)",
          border: `1.5px solid ${msg.type === "success" ? "var(--success)" : "var(--danger)"}`
        }}>
          {msg.text}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Current Password</label>
          <input
            type="password"
            value={oldPassword}
            onChange={e => setOldPassword(e.target.value)}
            style={st.thresholdInputText}
            required
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            style={st.thresholdInputText}
            required
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            style={st.thresholdInputText}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            height: 40,
            background: "var(--success)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            marginTop: 10,
            boxShadow: "0 2px 6px rgba(46, 125, 50, 0.15)"
          }}
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}

const st = {
  container: {
    padding: "4px 0",
  },
  navRow: {
    display: "flex",
    gap: 16,
    borderBottom: "1px solid var(--border)",
    marginBottom: 20,
    paddingBottom: 4,
  },
  navTab: {
    background: "none",
    border: "none",
    borderBottomWidth: "3px",
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    padding: "8px 12px",
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-secondary)",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  navTabActive: {
    color: "var(--text-primary)",
    borderBottomColor: "var(--accent)",
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: 24,
    boxShadow: "0 2px 8px rgba(46, 125, 50, 0.04)",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  subText: {
    margin: "4px 0 16px 0",
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  settingGroup: {
    marginTop: 24,
    borderTop: "1px solid var(--border)",
    paddingTop: 20,
    maxWidth: 600,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-primary)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  formLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  inputNumber: {
    width: 90,
    padding: "8px 12px",
    border: "1px solid var(--border)",
    borderRadius: 4,
    outline: "none",
    fontSize: 14,
    fontWeight: 600,
    textAlign: "center",
    fontFamily: "IBM Plex Mono, monospace",
    background: "var(--input-bg)",
    color: "var(--input-text)",
  },
  thresholdInputText: {
    height: "38px",
    padding: "0 12px",
    border: "1.5px solid var(--border)",
    borderRadius: "8px",
    outline: "none",
    fontSize: 14,
    background: "var(--input-bg)",
    color: "var(--input-text)",
    boxSizing: "border-box",
    width: "100%",
  },
  select: {
    height: "38px",
    padding: "0 10px",
    border: "1.5px solid var(--border)",
    borderRadius: "8px",
    outline: "none",
    fontSize: 14,
    background: "var(--input-bg)",
    color: "var(--input-text)",
    boxSizing: "border-box",
    width: "100%",
    cursor: "pointer",
  },
  helperText: {
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  searchInput: {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid var(--border)",
    borderRadius: 4,
    outline: "none",
    fontSize: 13.5,
    background: "var(--input-bg)",
    color: "var(--input-text)",
  },
  loadingText: {
    textAlign: "center",
    padding: "40px 0",
    color: "var(--text-secondary)",
    fontSize: 14,
  },
  tableContainer: {
    border: "1px solid var(--border)",
    borderRadius: 4,
    overflow: "hidden",
  },
  tableHeader: {
    display: "flex",
    padding: "12px 16px",
    background: "var(--surface-secondary)",
    borderBottom: "1px solid var(--border)",
    fontWeight: 700,
    fontSize: 12,
    color: "var(--text-primary)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  tableBody: {
    display: "flex",
    flexDirection: "column",
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    background: "var(--surface)",
    transition: "background-color 0.1s",
  },
  thresholdInput: {
    width: 80,
    padding: "6px 10px",
    border: "1px solid var(--border)",
    borderRadius: 4,
    textAlign: "center",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "IBM Plex Mono, monospace",
    outline: "none",
    background: "var(--input-bg)",
    color: "var(--input-text)",
  },
  btnPrimary: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 16px",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 2px 4px rgba(46, 125, 50, 0.15)",
  },
  btnSecondary: {
    background: "var(--surface-secondary)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "8px 16px",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnSecondarySmall: {
    background: "var(--surface-secondary)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalCard: {
    background: "var(--surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    padding: 24,
    borderRadius: 16,
    width: "480px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
    maxHeight: "90vh",
    overflowY: "auto",
  },
  checkboxGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "10px",
    background: "var(--surface-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
};
