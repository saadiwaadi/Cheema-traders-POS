export const st = {
  pageWrapper: { padding: '32px 28px', overflowY: 'auto', fontSize: 14, lineHeight: 1.6, background: 'var(--surface-secondary)', height: '100%' },
  pageTitle: { fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 8 },
  cardWrapper: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 20 },
  cardLabel: { fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'monospace', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' },
  cardValue: { fontSize: 23, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' },
  valueGreen: { color: 'var(--success)' },
  valueAmber: { color: 'var(--warning)' },
  valueRed: { color: 'var(--danger)' },
  valueNeutral: { color: 'var(--text-primary)' },
  thStyle: { textAlign: 'left', padding: '10px 20px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', background: 'var(--surface-secondary)' },
  tdStyle: { padding: '10px 20px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' },
  totalsRow: { background: 'rgba(46, 125, 50, 0.15)', fontWeight: 700, fontFamily: 'monospace', borderTop: '2px solid var(--border)', color: 'var(--text-primary)' },
  filterBar: { display: 'flex', gap: 12, alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', background: 'var(--surface)' },
  input: { border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, background: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none' },
  btnPrimary: { background: 'var(--success)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
  btnSecondary: { background: 'var(--surface)', color: 'var(--success)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
  
  // Aging badges
  badgeCurrent: { background: 'rgba(46, 125, 50, 0.15)', color: 'var(--success)', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, display: 'inline-block' },
  badge1_30: { background: '#fff8e1', color: '#f57f17', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, display: 'inline-block' },
  badge31_60: { background: '#fff3e0', color: '#e65100', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, display: 'inline-block' },
  badge61_90: { background: '#fbe9e7', color: '#bf360c', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, display: 'inline-block' },
  badge90Plus: { background: '#ffebee', color: '#c62828', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, display: 'inline-block' },

  emptyState: { textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, padding: 40 },
  errorState: { textAlign: 'center', color: 'var(--danger)', fontSize: 13, padding: 40 },
};
