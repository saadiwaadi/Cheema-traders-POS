import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, MoreVertical, Edit2, Trash2, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import { fmtPKR, drcr } from '../lib/money';
import { listCoaAccounts, createCoaAccount, updateCoaAccount, deactivateCoaAccount } from '../lib/posApi';
import AccountLedgerPanel from '../components/AccountLedgerPanel';

const getNormalSide = (type) => {
  return (type === 'asset' || type === 'expense') ? 'Dr' : 'Cr';
};

const formatBalance = (paisa) => {
  const absVal = Math.abs(paisa || 0);
  const suffix = drcr(paisa || 0);
  return `${fmtPKR(absVal)} ${suffix}`.trim();
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ChartOfAccounts Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red', fontFamily: 'monospace' }}>
          <h2>Something went wrong in Chart of Accounts.</h2>
          <pre>{this.state.error?.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ChartOfAccountsPage() {
  return (
    <ErrorBoundary>
      <ChartOfAccountsContent />
    </ErrorBoundary>
  );
}

function ChartOfAccountsContent() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  
  // Filters
  const [filterType, setFilterType] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterHierarchy, setFilterHierarchy] = useState('All');

  const [msg, setMsg] = useState(null);

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  
  // Tree collapse states
  const [collapsedNodes, setCollapsedNodes] = useState(new Set());

  // Overflow menu state
  const [openMenuId, setOpenMenuId] = useState(null);

  // Form fields
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('asset');
  const [formParentId, setFormParentId] = useState('');
  const [formIsControl, setFormIsControl] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);
  const [expandedLedgerId, setExpandedLedgerId] = useState(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClick = () => setOpenMenuId(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCoaAccounts();
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

  const toggleNode = (id) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        await updateCoaAccount({
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
        await createCoaAccount({
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
      const res = await deactivateCoaAccount(id);
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

  // KPI Calculations
  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter(a => a.is_active === 1).length;
  const inactiveAccounts = totalAccounts - activeAccounts;
  const controlAccounts = accounts.filter(a => a.is_control === 1).length;

  // Flatten tree for rendering
  const flattenTree = useCallback((accountsList, parentId = null, depth = 0) => {
    let result = [];
    const children = accountsList
      .filter(a => a.parent_id === parentId)
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
      
    for (const child of children) {
      const hasChildren = accountsList.some(a => a.parent_id === child.id);
      result.push({ ...child, depth, hasChildren });
      
      // If not collapsed and has children, recurse
      if (!collapsedNodes.has(child.id)) {
        result = result.concat(flattenTree(accountsList, child.id, depth + 1));
      }
    }
    return result;
  }, [collapsedNodes]);

  const typeOrder = ['asset', 'liability', 'equity', 'revenue', 'expense'];
  
  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      // Search
      if (search && !a.code?.toLowerCase().includes(search.toLowerCase()) && !a.name?.toLowerCase().includes(search.toLowerCase())) return false;
      // Type
      if (filterType !== 'All' && a.type !== filterType.toLowerCase()) return false;
      // Status
      if (filterStatus === 'Active' && a.is_active !== 1) return false;
      if (filterStatus === 'Inactive' && a.is_active === 1) return false;
      // Hierarchy
      const hasChildren = accounts.some(child => child.parent_id === a.id);
      if (filterHierarchy === 'Parent' && !hasChildren) return false;
      if (filterHierarchy === 'Child' && hasChildren) return false;
      return true;
    });
  }, [accounts, search, filterType, filterStatus, filterHierarchy]);

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Chart of Accounts</h1>
          <p style={s.subtitle}>Financial ledger configuration and hierarchy</p>
        </div>
        <button style={s.btnPrimary} onClick={handleAddClick}>
          <Plus size={16} /> New Account
        </button>
      </div>

      {msg && (
        <div style={{
          ...s.msg,
          background: msg.type === 'error' ? 'rgba(198, 40, 40, 0.15)' : 'rgba(46, 125, 50, 0.15)',
          color: msg.type === 'error' ? 'var(--danger)' : 'var(--success)',
          border: `1.5px solid ${msg.type === 'error' ? 'var(--danger)' : 'var(--success)'}`
        }}>
          {msg.text}
        </div>
      )}

      {/* KPI Strip */}
      <div style={s.kpiStrip}>
        <div style={s.kpiItem}>
          <div style={s.kpiLabel}>Total Accounts</div>
          <div style={s.kpiValue}>{totalAccounts}</div>
        </div>
        <div style={s.kpiDivider} />
        <div style={s.kpiItem}>
          <div style={s.kpiLabel}>Active</div>
          <div style={{...s.kpiValue, color: 'var(--success)'}}>{activeAccounts}</div>
        </div>
        <div style={s.kpiDivider} />
        <div style={s.kpiItem}>
          <div style={s.kpiLabel}>Inactive</div>
          <div style={{...s.kpiValue, color: 'var(--text-secondary)'}}>{inactiveAccounts}</div>
        </div>
        <div style={s.kpiDivider} />
        <div style={s.kpiItem}>
          <div style={s.kpiLabel}>Control Accounts</div>
          <div style={{...s.kpiValue, color: 'var(--accent)'}}>{controlAccounts}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={s.toolbar}>
        <div style={s.searchWrap}>
          <Search size={14} style={s.searchIcon} />
          <input 
            style={s.searchInput} 
            placeholder="Search code or name..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={s.filterGroup}>
          <select style={s.select} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option>All</option>
            <option>Asset</option>
            <option>Liability</option>
            <option>Equity</option>
            <option>Revenue</option>
            <option>Expense</option>
          </select>
          <select style={s.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option>All</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
          <select style={s.select} value={filterHierarchy} onChange={e => setFilterHierarchy(e.target.value)}>
            <option>All</option>
            <option>Parent</option>
            <option>Child</option>
          </select>
        </div>
      </div>

      {/* Tree Table */}
      <div style={s.tableContainer}>
        {loading ? (
          <div style={s.loading}>Loading accounts...</div>
        ) : (
          <table style={s.table}>
            <thead style={s.thead}>
              <tr>
                <th style={{...s.th, width: 140}}>Account Code</th>
                <th style={s.th}>Account Name</th>
                <th style={{...s.th, width: 120}}>Type</th>
                <th style={{...s.th, width: 100, textAlign: 'center'}}>Normal Side</th>
                <th style={{...s.th, width: 220}}>Status</th>
                <th style={{...s.th, width: 150, textAlign: 'right'}}>Current Balance</th>
                <th style={{...s.th, width: 60, textAlign: 'center'}}></th>
              </tr>
            </thead>
            <tbody>
              {typeOrder.map(type => {
                const typeAccounts = filteredAccounts.filter(a => a.type === type);
                if (typeAccounts.length === 0) return null;
                
                // If filters are active, we might just want to show a flat list to avoid broken trees, 
                // but if we show the tree, we only flatten based on visible items.
                // For simplicity, if searching/filtering, we render flat. If no filters, we render tree.
                const isFiltered = search || filterType !== 'All' || filterStatus !== 'All' || filterHierarchy !== 'All';
                
                const rows = isFiltered 
                  ? typeAccounts.map(a => ({...a, depth: 0, hasChildren: false}))
                  : flattenTree(typeAccounts);

                const totalBalance = typeAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);

                return (
                  <React.Fragment key={type}>
                    {/* Category Header Row */}
                    <tr style={s.categoryRow}>
                      <td colSpan={5} style={s.categoryName}>
                        {type.toUpperCase()}
                      </td>
                      <td style={s.categoryTotal}>
                        {formatBalance(totalBalance)}
                      </td>
                      <td></td>
                    </tr>
                    
                    {/* Data Rows */}
                     {rows.map(acc => (
                      <React.Fragment key={acc.id}>
                        <tr style={s.tr}>
                          <td style={s.td}>
                            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: acc.depth * 20 }}>
                              {acc.hasChildren ? (
                                <div onClick={() => toggleNode(acc.id)} style={s.treeToggle}>
                                  {collapsedNodes.has(acc.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                </div>
                              ) : (
                                <div style={s.treeLeafSpacer} />
                              )}
                              <span style={s.codeText}>{acc.code}</span>
                            </div>
                          </td>
                          <td style={{...s.td, color: acc.hasChildren ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: acc.hasChildren ? 600 : 400}}>
                            {acc.name}
                          </td>
                          <td style={s.td}>
                            <span style={s.typeLabel}>{acc.type}</span>
                          </td>
                          <td style={{...s.td, textAlign: 'center', color: 'var(--text-secondary)'}}>
                            {getNormalSide(acc.type)}
                          </td>
                          <td style={s.td}>
                            <div style={s.badgeWrap}>
                              {acc.is_active === 1 ? (
                                <span style={s.badgeActive}>ACTIVE</span>
                              ) : (
                                <span style={s.badgeInactive}>INACTIVE</span>
                              )}
                              {acc.is_control === 1 && (
                                <span style={s.badgeControl}>CONTROL</span>
                              )}
                              {acc.hasChildren ? (
                                <span style={s.badgeHeader}>HEADER</span>
                              ) : (
                                <span style={s.badgePostable}>POSTABLE</span>
                              )}
                            </div>
                          </td>
                          <td style={{...s.td, textAlign: 'right', fontWeight: 600, fontFamily: 'monospace'}}>
                            {formatBalance(acc.balance || 0)}
                          </td>
                          <td style={{...s.td, textAlign: 'center'}}>
                            <div style={{position: 'relative'}}>
                              <button 
                                style={s.menuBtn} 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(openMenuId === acc.id ? null : acc.id);
                                }}
                              >
                                <MoreVertical size={16} />
                              </button>
                              {openMenuId === acc.id && (
                                <div style={s.dropdown}>
                                  <div style={s.dropdownItem} onClick={(e) => { e.stopPropagation(); setExpandedLedgerId(expandedLedgerId === acc.id ? null : acc.id); setOpenMenuId(null); }}>
                                    <BookOpen size={14} /> View Ledger
                                  </div>
                                  <div style={s.dropdownItem} onClick={(e) => { e.stopPropagation(); handleEditClick(acc); setOpenMenuId(null); }}>
                                    <Edit2 size={14} /> Edit Account
                                  </div>
                                  <div style={{...s.dropdownItem, color: 'var(--danger)'}} onClick={(e) => { e.stopPropagation(); handleDeleteClick(acc.id, acc.name); setOpenMenuId(null); }}>
                                    <Trash2 size={14} /> Deactivate
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expandedLedgerId === acc.id && (
                          <tr>
                            <td colSpan={7} style={{ padding: '8px 16px 16px 16px', background: 'var(--bg, #F8FAFC)' }}>
                              <AccountLedgerPanel 
                                account={acc} 
                                onClose={() => setExpandedLedgerId(null)} 
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                );
              })}
              {filteredAccounts.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} style={s.empty}>No accounts match the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Panel */}
      {panelOpen && (
        <>
          <div style={s.backdrop} onClick={() => setPanelOpen(false)} />
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h2 style={s.panelTitle}>{editingAccount ? 'Edit Account' : 'Account Setup'}</h2>
              <button style={s.closeBtn} onClick={() => setPanelOpen(false)}>✕</button>
            </div>
            
            <form onSubmit={handleFormSubmit} style={s.panelForm}>
              
              <div style={s.sectionTitle}>Account Information</div>
              <div style={s.formGrid}>
                <div style={s.field}>
                  <label style={s.label}>Account Code *</label>
                  <input style={s.input} value={formCode} onChange={e => setFormCode(e.target.value)} required placeholder="e.g. 1000" />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Account Type *</label>
                  <select style={s.input} value={formType} onChange={e => setFormType(e.target.value)} disabled={!!editingAccount}>
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                    <option value="equity">Equity</option>
                    <option value="revenue">Revenue</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>
              </div>
              <div style={s.field}>
                <label style={s.label}>Account Name *</label>
                <input style={s.input} value={formName} onChange={e => setFormName(e.target.value)} required placeholder="e.g. Cash in Hand" />
              </div>

              <div style={s.divider} />
              
              <div style={s.sectionTitle}>Hierarchy</div>
              <div style={s.field}>
                <label style={s.label}>Parent Account</label>
                <select style={s.input} value={formParentId} onChange={e => setFormParentId(e.target.value)}>
                  <option value="">No Parent (Top Level)</option>
                  {accounts
                    .filter(a => a.type === formType && a.is_control === 1 && (!editingAccount || a.id !== editingAccount.id))
                    .map(a => (
                      <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                </select>
              </div>

              <div style={s.divider} />

              <div style={s.sectionTitle}>Account Settings</div>
              <div style={s.checkboxWrap}>
                <input type="checkbox" id="ctrl" checked={formIsControl} onChange={e => setFormIsControl(e.target.checked)} />
                <label htmlFor="ctrl" style={s.checkLabel}>Control Account (Summarizes sub-ledgers)</label>
              </div>
              {editingAccount && (
                <div style={s.checkboxWrap}>
                  <input type="checkbox" id="actv" checked={formIsActive} onChange={e => setFormIsActive(e.target.checked)} />
                  <label htmlFor="actv" style={s.checkLabel}>Active Account (Available for posting)</label>
                </div>
              )}

              <div style={{flex: 1}} />
              
              <div style={s.panelActions}>
                <button type="button" style={s.btnSecondary} onClick={() => setPanelOpen(false)}>Cancel</button>
                <button type="submit" style={s.btnPrimary}>{editingAccount ? 'Save Changes' : 'Create Account'}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

const s = {
  page: { background: 'var(--bg, #F8FAFC)', minHeight: '100%', padding: '24px 32px', fontFamily: 'Inter, system-ui, sans-serif', color: 'var(--text-primary, #0F172A)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--text-primary, #0F172A)', letterSpacing: '-0.02em' },
  subtitle: { margin: '4px 0 0', fontSize: 14, color: 'var(--text-secondary, #64748B)' },
  btnPrimary: { background: 'var(--accent, #15803D)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
  msg: { padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 },
  
  kpiStrip: { display: 'flex', background: 'var(--surface, #FFFFFF)', border: '1px solid var(--border, #E2E8F0)', borderRadius: 8, padding: '12px 24px', marginBottom: 16, alignItems: 'center', gap: 24 },
  kpiItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  kpiLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary, #64748B)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  kpiValue: { fontSize: 18, fontWeight: 700, color: 'var(--text-primary, #0F172A)', fontFamily: 'monospace' },
  kpiDivider: { width: 1, height: 24, background: 'var(--border, #E2E8F0)' },

  toolbar: { display: 'flex', gap: 12, marginBottom: 16 },
  searchWrap: { position: 'relative', width: 280 },
  searchIcon: { position: 'absolute', left: 10, top: 9, color: 'var(--text-secondary, #94A3B8)' },
  searchInput: { width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 32px', border: '1px solid var(--border, #E2E8F0)', borderRadius: 6, fontSize: 13, outline: 'none', background: 'var(--input-bg, #fff)', color: 'var(--input-text, #0F172A)' },
  filterGroup: { display: 'flex', gap: 8 },
  select: { padding: '8px 12px', border: '1px solid var(--border, #E2E8F0)', borderRadius: 6, fontSize: 13, background: 'var(--input-bg, #fff)', color: 'var(--input-text, #0F172A)', outline: 'none', minWidth: 120 },

  tableContainer: { flex: 1, background: 'var(--surface, #FFFFFF)', border: '1px solid var(--border, #E2E8F0)', borderRadius: 8, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  thead: { position: 'sticky', top: 0, background: 'var(--surface-secondary, #F8FAFC)', zIndex: 10, boxShadow: '0 1px 0 var(--border, #E2E8F0)' },
  th: { padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary, #475569)', borderBottom: '1px solid var(--border, #E2E8F0)', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid var(--border, #F1F5F9)' },
  td: { padding: '8px 16px', verticalAlign: 'middle' },
  
  categoryRow: { background: 'var(--surface-secondary, #F1F5F9)' },
  categoryName: { padding: '10px 16px', fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #334155)', letterSpacing: '0.05em' },
  categoryTotal: { padding: '10px 16px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary, #0F172A)', borderBottom: '1px solid var(--border, #E2E8F0)' },

  treeToggle: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, cursor: 'pointer', color: 'var(--text-secondary, #64748B)', marginRight: 4, borderRadius: 4 },
  treeLeafSpacer: { width: 24 },
  codeText: { fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary, #0F172A)' },
  typeLabel: { textTransform: 'capitalize', color: 'var(--text-secondary, #64748B)' },
  
  badgeWrap: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  badgeActive: { fontSize: 10, fontWeight: 600, background: 'rgba(21, 128, 61, 0.15)', color: 'var(--success, #15803D)', padding: '2px 6px', borderRadius: 4 },
  badgeInactive: { fontSize: 10, fontWeight: 600, background: 'var(--surface-secondary, #F1F5F9)', color: 'var(--text-secondary, #64748B)', padding: '2px 6px', borderRadius: 4 },
  badgeControl: { fontSize: 10, fontWeight: 600, background: 'rgba(217, 119, 6, 0.15)', color: 'var(--accent, #D97706)', padding: '2px 6px', borderRadius: 4 },
  badgeHeader: { fontSize: 10, fontWeight: 600, background: 'rgba(67, 56, 202, 0.15)', color: '#4338CA', padding: '2px 6px', borderRadius: 4 },
  badgePostable: { fontSize: 10, fontWeight: 600, border: '1px solid var(--border, #E2E8F0)', color: 'var(--text-secondary, #64748B)', padding: '1px 5px', borderRadius: 4 },

  menuBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary, #94A3B8)', padding: 4, borderRadius: 4 },
  dropdown: { position: 'absolute', right: 0, top: '100%', background: 'var(--surface, #fff)', border: '1px solid var(--border, #E2E8F0)', borderRadius: 6, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', zIndex: 20, minWidth: 140, padding: 4 },
  dropdownItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text-primary, #334155)', cursor: 'pointer', borderRadius: 4 },

  loading: { padding: 40, textAlign: 'center', color: 'var(--text-secondary, #64748B)', fontSize: 14 },
  empty: { padding: 40, textAlign: 'center', color: 'var(--text-secondary, #64748B)' },

  backdrop: { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', zIndex: 100 },
  panel: { position: 'fixed', right: 0, top: 0, bottom: 0, width: 440, background: 'var(--surface, #fff)', borderLeft: '1px solid var(--border)', zIndex: 110, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)' },
  panelHeader: { padding: '20px 24px', borderBottom: '1px solid var(--border, #E2E8F0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { margin: 0, fontSize: 18, fontWeight: 600 },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary, #64748B)' },
  panelForm: { padding: 24, display: 'flex', flexDirection: 'column', gap: 16, flex: 1, overflowY: 'auto' },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary, #64748B)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary, #334155)' },
  input: { padding: '8px 12px', border: '1px solid var(--border, #CBD5E1)', background: 'var(--input-bg, #fff)', color: 'var(--input-text, #0F172A)', borderRadius: 6, fontSize: 13, outline: 'none' },
  divider: { height: 1, background: 'var(--border, #E2E8F0)', margin: '8px 0' },
  checkboxWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  checkLabel: { fontSize: 13, color: 'var(--text-primary, #334155)' },
  panelActions: { display: 'flex', gap: 12, paddingTop: 16, borderTop: '1px solid var(--border, #E2E8F0)' },
  btnSecondary: { flex: 1, padding: '8px 16px', background: 'var(--surface-secondary, #fff)', border: '1px solid var(--border, #CBD5E1)', color: 'var(--text-primary, #334155)', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
};
