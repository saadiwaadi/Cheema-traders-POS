import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, ChevronDown, ChevronRight, Printer } from 'lucide-react';
import { fmtPKR, drcr } from '../lib/money';

const ipc = window.ipc;
const BUSINESS_NAME = "Cheema Traders";

// Normal side mapping
const getNormalSide = (type) => {
  return (type === 'asset' || type === 'expense') ? 'Dr' : 'Cr';
};

const typeLabel = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses'
};

const formatBalance = (paisa) => {
  const absVal = Math.abs(paisa);
  const suffix = drcr(paisa);
  return `${fmtPKR(absVal)} ${suffix}`.trim();
};

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState(null);

  // Collapse states for the 5 categories
  const [collapsed, setCollapsed] = useState({
    asset: false,
    liability: false,
    equity: false,
    revenue: false,
    expense: false,
  });

  // Panel state (for Create/Edit)
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  // Form fields
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('asset');
  const [formParentId, setFormParentId] = useState('');
  const [formIsControl, setFormIsControl] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);

  // Load accounts from database
  const loadAccounts = useCallback(async () => {
    if (!ipc) return;
    setLoading(true);
    try {
      const list = await ipc.invoke('coa:list');
      setAccounts(list || []);
    } catch (err) {
      showMsg(err.message || 'Failed to load accounts', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const showMsg = (text, type) => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 5000);
  };

  const toggleCollapse = (type) => {
    setCollapsed(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const handleAddClick = () => {
    setEditingAccount(null);
    setFormCode('');
    setFormName('');
    setFormType('asset');
    setFormParentId('');
    setFormIsControl(false);
    setFormIsActive(true);
    setPanelOpen(true);
  };

  const handleEditClick = (acc) => {
    setEditingAccount(acc);
    setFormCode(acc.code || '');
    setFormName(acc.name || '');
    setFormType(acc.type || 'asset');
    setFormParentId(acc.parent_id || '');
    setFormIsControl(acc.is_control === 1);
    setFormIsActive(acc.is_active === 1);
    setPanelOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formCode.trim()) return showMsg('Account code is required', 'error');
    if (!formName.trim()) return showMsg('Account name is required', 'error');

    try {
      if (editingAccount) {
        // Update account
        await ipc.invoke('coa:update', {
          id: editingAccount.id,
          code: formCode,
          name: formName,
          type: formType,
          parentId: formParentId ? Number(formParentId) : null,
          isControl: formIsControl ? 1 : 0,
          isActive: formIsActive ? 1 : 0,
        });
        showMsg('Account updated successfully', 'success');
      } else {
        // Create account
        await ipc.invoke('coa:create', {
          code: formCode,
          name: formName,
          type: formType,
          parentId: formParentId ? Number(formParentId) : null,
          isControl: formIsControl ? 1 : 0,
        });
        showMsg('Account created successfully', 'success');
      }
      setPanelOpen(false);
      loadAccounts();
    } catch (err) {
      showMsg(err.message || 'Operation failed', 'error');
    }
  };

  const handleDeleteClick = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete or deactivate account "${name}"?`)) return;

    try {
      const res = await ipc.invoke('coa:deactivate', { id });
      if (res.action === 'deleted') {
        showMsg('Account deleted successfully', 'success');
      } else {
        showMsg('Account has journal dependencies; deactivated instead', 'success');
      }
      loadAccounts();
    } catch (err) {
      showMsg(err.message || 'Operation failed', 'error');
    }
  };

  // Filter accounts
  const filteredAccounts = accounts.filter(a => {
    const term = search.toLowerCase();
    return (a.code || '').toLowerCase().includes(term) || (a.name || '').toLowerCase().includes(term);
  });

  const typeOrder = ['asset', 'liability', 'equity', 'revenue', 'expense'];
  
  // Group by type
  const groupedAccounts = typeOrder.reduce((acc, type) => {
    acc[type] = filteredAccounts.filter(a => a.type === type);
    return acc;
  }, {});

  // Group subtotals
  const categorySubtotals = typeOrder.reduce((acc, type) => {
    const list = accounts.filter(a => a.type === type);
    const totalPaisa = list.reduce((sum, a) => sum + (a.balance || 0), 0);
    acc[type] = totalPaisa;
    return acc;
  }, {});

  return (
    <div style={styles.page}>
      {/* Header Row */}
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Chart of Accounts</h1>
          <p style={styles.subtitle}>Define, organize, and manage the financial accounts of the business.</p>
        </div>
        <button style={styles.btnPrimary} onClick={handleAddClick}>
          <Plus size={16} /> Add Account
        </button>
      </div>

      {/* Message Banner */}
      {msg && (
        <div style={{
          ...styles.messageBanner,
          background: msg.type === 'success' ? '#e8f5e9' : '#ffebee',
          borderColor: msg.type === 'success' ? '#a5d6a7' : '#ffcdd2',
          color: msg.type === 'success' ? '#2e7d32' : '#c62828',
        }}>
          {msg.text}
        </div>
      )}

      {/* Search Bar */}
      <div style={styles.searchBar}>
        <div style={styles.searchWrapper}>
          <Search size={16} style={styles.searchIcon} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search accounts by code or name..."
            style={styles.searchInput}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Total Assets</span>
          <strong style={{ ...styles.summaryValue, color: '#2e7d32' }}>
            {formatBalance(categorySubtotals['asset'] || 0)}
          </strong>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Total Liabilities</span>
          <strong style={{ ...styles.summaryValue, color: '#b45309' }}>
            {formatBalance(categorySubtotals['liability'] || 0)}
          </strong>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Total Equity</span>
          <strong style={{ ...styles.summaryValue, color: '#7c3aed' }}>
            {formatBalance(categorySubtotals['equity'] || 0)}
          </strong>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Net Profit / Loss</span>
          <strong style={{ 
            ...styles.summaryValue, 
            color: (categorySubtotals['revenue'] || 0) + (categorySubtotals['expense'] || 0) <= 0 ? '#2e7d32' : '#c62828' 
          }}>
            {formatBalance((categorySubtotals['revenue'] || 0) + (categorySubtotals['expense'] || 0))}
          </strong>
        </div>
      </div>

      {/* Collapsible Accounts Lists */}
      <div style={styles.listContainer}>
        {loading && accounts.length === 0 ? (
          <div style={styles.loadingText}>Loading Chart of Accounts...</div>
        ) : (
          typeOrder.map(type => {
            const list = groupedAccounts[type] || [];
            const subtotalPaisa = categorySubtotals[type] || 0;
            const isCollapsed = collapsed[type];

            return (
              <div key={type} style={styles.sectionCard}>
                {/* Section Header */}
                <div style={styles.sectionHeader} onClick={() => toggleCollapse(type)}>
                  <div style={styles.sectionHeaderLeft}>
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    <span style={styles.sectionTitle}>{typeLabel[type]}</span>
                    <span style={styles.sectionBadge}>{list.length} accounts</span>
                  </div>
                  <div style={styles.sectionHeaderRight}>
                    <span style={styles.subtotalLabel}>Subtotal:</span>
                    <span style={styles.subtotalValue}>{formatBalance(subtotalPaisa)}</span>
                  </div>
                </div>

                {/* Section Table Body */}
                {!isCollapsed && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={{ ...styles.th, width: '10%' }}>Code</th>
                          <th style={{ ...styles.th, width: '40%' }}>Account Name</th>
                          <th style={{ ...styles.th, width: '15%' }}>Type</th>
                          <th style={{ ...styles.th, width: '10%', textAlign: 'center' }}>Normal Side</th>
                          <th style={{ ...styles.th, width: '15%', textAlign: 'right' }}>Current Balance</th>
                          <th style={{ ...styles.th, width: '10%', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={styles.emptyRow}>No accounts found in this category.</td>
                          </tr>
                        ) : (
                          list.map(acc => (
                            <tr key={acc.id} style={{ ...styles.tr, opacity: acc.is_active === 1 ? 1 : 0.5 }}>
                              <td style={styles.tdCode}>{acc.code}</td>
                              <td style={styles.td}>
                                <div style={styles.nameWrapper}>
                                  <span style={styles.accountName}>{acc.name}</span>
                                  {acc.is_control === 1 && (
                                    <span style={styles.controlBadge}>Control Account</span>
                                  )}
                                </div>
                              </td>
                              <td style={styles.tdType}>{acc.type}</td>
                              <td style={styles.tdNormalSide}>{getNormalSide(acc.type)}</td>
                              <td style={styles.tdBalance}>{formatBalance(acc.balance || 0)}</td>
                              <td style={styles.tdActions}>
                                <div style={styles.actionGroup}>
                                  <button style={styles.actionBtn} title="Edit Account" onClick={() => handleEditClick(acc)}>
                                    <Edit2 size={13} />
                                  </button>
                                  <button style={{ ...styles.actionBtn, color: '#c62828' }} title="Delete/Deactivate" onClick={() => handleDeleteClick(acc.id, acc.name)}>
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Slide-over Side Panel Form */}
      {panelOpen && (
        <>
          <div style={styles.backdrop} onClick={() => setPanelOpen(false)} />
          <div style={styles.sidePanel}>
            <div style={styles.panelHeader}>
              <h3 style={styles.panelTitle}>{editingAccount ? 'Edit Account' : 'Add New Account'}</h3>
              <button style={styles.panelCloseBtn} onClick={() => setPanelOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleFormSubmit} style={styles.panelForm}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Account Code *</label>
                <input
                  value={formCode}
                  onChange={e => setFormCode(e.target.value)}
                  placeholder="e.g. 1010"
                  required
                  style={styles.input}
                />
                <span style={styles.helpText}>Must be unique across all accounts.</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Account Name *</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. HBL Bank Account"
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Account Type *</label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value)}
                  disabled={!!editingAccount}
                  style={styles.select}
                >
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </select>
                {editingAccount && <span style={styles.helpText}>Account type cannot be modified on edit.</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Parent Account (Optional)</label>
                <select
                  value={formParentId}
                  onChange={e => setFormParentId(e.target.value)}
                  style={styles.select}
                >
                  <option value="">No Parent (Root level)</option>
                  {accounts
                    .filter(a => a.type === formType && (!editingAccount || a.id !== editingAccount.id))
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                </select>
              </div>

              <div style={styles.checkboxGroup}>
                <input
                  type="checkbox"
                  id="formIsControl"
                  checked={formIsControl}
                  onChange={e => setFormIsControl(e.target.checked)}
                  style={styles.checkbox}
                />
                <label htmlFor="formIsControl" style={styles.checkboxLabel}>
                  Control Account? (e.g. Accounts Receivable / Payable)
                </label>
              </div>

              {editingAccount && (
                <div style={styles.checkboxGroup}>
                  <input
                    type="checkbox"
                    id="formIsActive"
                    checked={formIsActive}
                    onChange={e => setFormIsActive(e.target.checked)}
                    style={styles.checkbox}
                  />
                  <label htmlFor="formIsActive" style={styles.checkboxLabel}>
                    Account Active?
                  </label>
                </div>
              )}

              <div style={styles.panelButtons}>
                <button type="button" style={styles.btnSecondary} onClick={() => setPanelOpen(false)}>
                  Cancel
                </button>
                <button type="submit" style={styles.btnPrimarySubmit}>
                  {editingAccount ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    boxSizing: 'border-box',
    background: '#edf4ed',
    color: '#214026',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    flexShrink: 0
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    margin: 0,
    color: '#2e7d32',
    letterSpacing: '-0.02em'
  },
  subtitle: {
    fontSize: 13,
    color: '#558f57',
    margin: '4px 0 0'
  },
  btnPrimary: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: '#2e7d32',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  btnPrimarySubmit: {
    flex: 1,
    background: '#2e7d32',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  btnSecondary: {
    flex: 1,
    background: '#fff',
    color: '#555',
    border: '1px solid #cde0cd',
    borderRadius: 4,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  messageBanner: {
    padding: '10px 16px',
    borderRadius: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderStyle: 'solid',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0
  },
  searchBar: {
    background: '#fff',
    border: '1px solid #cde0cd',
    borderRadius: 4,
    padding: '12px 16px',
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0
  },
  searchWrapper: {
    position: 'relative',
    flex: 1
  },
  searchIcon: {
    position: 'absolute',
    left: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#558f57',
    pointerEvents: 'none'
  },
  searchInput: {
    paddingLeft: 32,
    width: '100%',
    boxSizing: 'border-box',
    height: 36,
    fontSize: 13,
    border: '1px solid #cde0cd',
    borderRadius: 4,
    outline: 'none',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 16,
    marginBottom: 16,
    flexShrink: 0
  },
  summaryCard: {
    background: '#fff',
    padding: '16px 20px',
    borderRadius: 4,
    border: '1px solid #cde0cd',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#558f57',
    marginBottom: 6
  },
  summaryValue: {
    fontSize: 18,
    fontFamily: 'Courier New, monospace',
    fontWeight: 700
  },
  listContainer: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    paddingBottom: 20
  },
  loadingText: {
    textAlign: 'center',
    padding: 40,
    color: '#558f57',
    fontSize: 14
  },
  sectionCard: {
    background: '#fff',
    border: '1px solid #cde0cd',
    borderRadius: 4,
    overflow: 'hidden',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: '#f1f8e9',
    borderBottom: '1px solid #cde0cd',
    cursor: 'pointer',
    userSelect: 'none'
  },
  sectionHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#2e7d32'
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontFamily: 'Courier New, monospace'
  },
  sectionBadge: {
    fontSize: 11,
    color: '#558f57',
    background: '#fff',
    border: '1px solid #cde0cd',
    padding: '1px 6px',
    borderRadius: 4
  },
  sectionHeaderRight: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    fontSize: 13,
    fontFamily: 'Courier New, monospace'
  },
  subtotalLabel: {
    color: '#558f57'
  },
  subtotalValue: {
    fontWeight: 700,
    color: '#2e7d32'
  },
  table: {
    margin: 0,
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    padding: '10px 12px',
    borderBottom: '2px solid #cde0cd',
    background: '#f9fcf8',
    color: '#558f57',
    fontWeight: 700,
    fontSize: 12,
    textAlign: 'left',
  },
  tr: {
    borderBottom: '1px solid #f1f8e9',
    transition: 'background-color 0.2s',
  },
  td: {
    padding: '12px',
    color: '#214026',
  },
  tdCode: {
    padding: '12px',
    fontFamily: 'Courier New, monospace',
    fontSize: '12.5px',
    fontWeight: 600,
    color: '#214026',
  },
  nameWrapper: {
    display: 'flex',
    flexDirection: 'column'
  },
  accountName: {
    fontSize: '13px',
    fontWeight: 500,
  },
  controlBadge: {
    fontSize: '9.5px',
    color: '#b45309',
    background: '#fffbeb',
    border: '1px solid #fde68a',
    padding: '1px 5px',
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 3,
    fontWeight: 600
  },
  tdType: {
    padding: '12px',
    fontSize: '12px',
    textTransform: 'capitalize',
    color: '#558f57',
  },
  tdNormalSide: {
    padding: '12px',
    textAlign: 'center',
    fontFamily: 'Courier New, monospace',
    fontSize: '12px',
    color: '#214026',
  },
  tdBalance: {
    padding: '12px',
    textAlign: 'right',
    fontFamily: 'Courier New, monospace',
    fontSize: '12.5px',
    fontWeight: 700,
  },
  tdActions: {
    padding: '12px',
    textAlign: 'right',
  },
  actionGroup: {
    display: 'flex',
    gap: 6,
    justifyContent: 'flex-end'
  },
  actionBtn: {
    padding: 6,
    border: '1px solid #cde0cd',
    background: '#fff',
    borderRadius: 4,
    cursor: 'pointer',
    color: '#558f57',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.4)',
    zIndex: 99,
  },
  sidePanel: {
    position: 'fixed',
    right: 0,
    top: 0,
    bottom: 0,
    width: 380,
    background: '#fff',
    borderLeft: '1px solid #cde0cd',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
  },
  panelHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #cde0cd',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  panelTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#2e7d32'
  },
  panelCloseBtn: {
    border: 'none',
    background: 'none',
    fontSize: 16,
    cursor: 'pointer',
    color: '#558f57'
  },
  panelForm: {
    padding: 20,
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 14
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: '#2e7d32'
  },
  input: {
    width: '100%',
    height: 36,
    padding: '0 10px',
    border: '1px solid #cde0cd',
    borderRadius: 4,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    height: 36,
    padding: '0 8px',
    border: '1px solid #cde0cd',
    borderRadius: 4,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    background: '#fff',
  },
  helpText: {
    fontSize: 10.5,
    color: '#558f57',
  },
  checkboxGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 4
  },
  checkbox: {
    width: 16,
    height: 16,
    cursor: 'pointer',
  },
  checkboxLabel: {
    margin: 0,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    color: '#2e7d32'
  },
  panelButtons: {
    display: 'flex',
    gap: 10,
    marginTop: 20
  }
};
