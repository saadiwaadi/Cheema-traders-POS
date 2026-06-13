import React, { useState, useEffect, useCallback } from 'react'
import { Landmark, RefreshCw, Printer, Plus, X, Building2, FileDown } from 'lucide-react'
import { listBanks, saveBank, saveBankTransfer, getCashBook } from '../lib/posApi'
import * as XLSX from "xlsx"

function exportExcelFile({ fileName, sheetName, title, subtitle, meta, headers, rows, numericColumns }) {
    const ws = XLSX.utils.aoa_to_sheet([
        [title],
        [subtitle],
        ...meta.map(m => [m]),
        [],
        headers,
        ...rows
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${fileName}.xlsx`);
}

export default function BanksPage() {
  const now = new Date()
  const [activeTab, setActiveTab] = useState('ctb')
  const [cashBalance, setCashBalance] = useState(0)
  const [bankBalance, setBankBalance] = useState(0)
  
  const [banks, setBanks] = useState([])
  const [loadingBanks, setLoadingBanks] = useState(true)
  
  const [showAddBank, setShowAddBank] = useState(false)
  const [newBankName, setNewBankName] = useState('')
  const [newAccountNumber, setNewAccountNumber] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [newIban, setNewIban] = useState('')
  const [addingBank, setAddingBank] = useState(false)
  const [addBankMsg, setAddBankMsg] = useState(null)
  
  const [ctbDate, setCtbDate] = useState(now.toISOString().split('T')[0])
  const [ctbAmount, setCtbAmount] = useState('')
  const [ctbBankId, setCtbBankId] = useState(null)
  const [ctbNotes, setCtbNotes] = useState('')
  const [ctbSaving, setCtbSaving] = useState(false)
  const [ctbMsg, setCtbMsg] = useState(null)

  const [btcDate, setBtcDate] = useState(now.toISOString().split('T')[0])
  const [btcAmount, setBtcAmount] = useState('')
  const [btcBankId, setBtcBankId] = useState(null)
  const [btcMode, setBtcMode] = useState('cheque')
  const [btcChequeNo, setBtcChequeNo] = useState('')
  const [btcPurpose, setBtcPurpose] = useState('')
  const [btcNotes, setBtcNotes] = useState('')
  const [btcSaving, setBtcSaving] = useState(false)
  const [btcMsg, setBtcMsg] = useState(null)

  const [historyFrom, setHistoryFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0])
  const [historyTo, setHistoryTo] = useState(now.toISOString().split('T')[0])
  const [historyRows, setHistoryRows] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)
  const [historyMsg, setHistoryMsg] = useState(null)

  const loadBanks = useCallback(async (preferredBankId) => {
    setLoadingBanks(true)
    try {
      const data = await listBanks()
      const bankList = data.banks || []
      setBanks(bankList)

      if (preferredBankId && bankList.some(b => b.id === preferredBankId)) {
        setCtbBankId(preferredBankId)
        setBtcBankId(preferredBankId)
        return
      }
      
      if (bankList.length > 0) {
        if (!ctbBankId) setCtbBankId(bankList[0].id)
        if (!btcBankId) setBtcBankId(bankList[0].id)
      }
    } catch (e) {
      console.error('Failed to load banks:', e)
    } finally {
      setLoadingBanks(false)
    }
  }, [ctbBankId, btcBankId])

  const loadBalances = useCallback(async () => {
    try {
      const res = await getCashBook({})
      const entries = res.entries || []
      const totalCashIn = entries.reduce((s, e) => s + (e.cash_in || 0), 0);
      const totalCashOut = entries.reduce((s, e) => s + (e.cash_out || 0), 0);
      setCashBalance(totalCashIn - totalCashOut)

      const totalBankIn = entries.reduce((s, e) => s + (e.bank_in || 0), 0);
      const totalBankOut = entries.reduce((s, e) => s + (e.bank_out || 0), 0);
      setBankBalance(totalBankIn - totalBankOut)
    } catch (e) {
      console.error('Failed to load balances:', e)
    }
  }, [])

  const loadTransferHistory = useCallback(async () => {
    if (historyFrom && historyTo && historyFrom > historyTo) {
      setHistoryRows([])
      setHistoryError('From date cannot be after To date')
      return
    }
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const cashbookRes = await getCashBook({
        fromDate: historyFrom,
        toDate: historyTo,
      })

      const mapped = (cashbookRes.entries || [])
        .filter(r => (
          (Number(r.cash_out) > 0 && Number(r.bank_in) > 0)
          || (Number(r.cash_in) > 0 && Number(r.bank_out) > 0)
        ))
        .map(r => {
          const type = Number(r.cash_out) > 0 && Number(r.bank_in) > 0 ? 'cash_to_bank' : 'bank_to_cash';
          let bName = '';
          if (r.description) {
            const match = r.description.match(/Bank Accounts? - (.+)/)
            if (match) bName = match[1]
          }
          return {
            id: Number(r.id),
            entry_date: r.entry_date || '',
            description: r.description || '',
            transfer_type: type,
            amount: type === 'cash_to_bank' ? Number(r.bank_in || 0) : Number(r.cash_in || 0),
            bank_name: bName,
          }
        })

      setHistoryRows(mapped)
    } catch (e) {
      setHistoryError(e?.message || 'Failed to load transfer history')
    } finally {
      setHistoryLoading(false)
    }
  }, [historyFrom, historyTo])

  useEffect(() => { 
    loadBalances()
    loadBanks()
    loadTransferHistory()
  }, [loadBalances, loadBanks, loadTransferHistory])

  const handleAddBank = async () => {
    if (!newBankName.trim()) {
      setAddBankMsg({ text: 'Bank name is required', ok: false })
      return
    }
    setAddingBank(true)
    setAddBankMsg(null)
    try {
      await saveBank({
        name: newBankName.trim(),
        openingBalance: 0
      })
      setAddBankMsg({ text: 'Bank added successfully!', ok: true })
      setNewBankName('')
      setNewAccountNumber('')
      setNewBranchName('')
      setNewIban('')
      await loadBanks()
      setTimeout(() => setShowAddBank(false), 1000)
    } catch (e) {
      setAddBankMsg({ text: e.message, ok: false })
    } finally {
      setAddingBank(false)
    }
  }

  const handleCashToBank = async () => {
    const amount = parseFloat(ctbAmount)
    if (!amount || amount <= 0) { setCtbMsg({ text: 'Enter a valid amount', ok: false }); return }
    if (!ctbBankId) { setCtbMsg({ text: 'Please select a bank', ok: false }); return }
    setCtbSaving(true); setCtbMsg(null)
    try {
      await saveBankTransfer({ 
        date: ctbDate, 
        amount, 
        reference: ctbNotes || undefined,
        fromAccount: 'cih',
        toAccount: ctbBankId
      })
      const bankName = banks.find(b => b.id === ctbBankId)?.name || 'bank'
      setCtbMsg({ text: `Rs. ${amount.toLocaleString()} transferred to ${bankName}`, ok: true })
      setCtbAmount(''); setCtbNotes('')
      loadBalances()
      loadBanks()
      loadTransferHistory()
    } catch (e) { setCtbMsg({ text: e.message, ok: false }) }
    finally { setCtbSaving(false) }
  }

  const handleBankToCash = async () => {
    const amount = parseFloat(btcAmount)
    if (!amount || amount <= 0) { setBtcMsg({ text: 'Enter a valid amount', ok: false }); return }
    if (!btcBankId) { setBtcMsg({ text: 'Please select a bank', ok: false }); return }
    if (!btcPurpose.trim()) { setBtcMsg({ text: 'Purpose is required', ok: false }); return }
    if (btcMode === 'cheque' && !btcChequeNo.trim()) {
      setBtcMsg({ text: 'Cheque number is required for cheque cashing', ok: false }); return
    }

    setBtcSaving(true); setBtcMsg(null)
    try {
      const fullReference = `${btcPurpose} ${btcMode === 'cheque' ? '(Chq: ' + btcChequeNo + ')' : '(Online)'} ${btcNotes ? '- ' + btcNotes : ''}`.trim()
      await saveBankTransfer({
        date: btcDate,
        amount,
        reference: fullReference,
        fromAccount: btcBankId,
        toAccount: 'cih'
      })
      const bankName = banks.find(b => b.id === btcBankId)?.name || 'bank'
      setBtcMsg({ text: `Rs. ${amount.toLocaleString()} transferred from ${bankName} to cash`, ok: true })
      setBtcAmount('')
      setBtcChequeNo('')
      setBtcPurpose('')
      setBtcNotes('')
      loadBalances()
      loadBanks()
      loadTransferHistory()
    } catch (e) { setBtcMsg({ text: e.message, ok: false }) }
    finally { setBtcSaving(false) }
  }

  const filteredHistoryRows = historyRows.filter(row => 
    activeTab === 'ctb' ? row.transfer_type === 'cash_to_bank' : row.transfer_type === 'bank_to_cash'
  );

  const exportTransferHistoryExcel = async () => {
    if (!filteredHistoryRows.length) return

    const totalAmount = filteredHistoryRows.reduce((s, r) => s + Number(r.amount || 0), 0)

    const rows = filteredHistoryRows.map((row, index) => ([
      index + 1,
      row.entry_date || '',
      row.transfer_type === 'cash_to_bank' ? 'Cash to Bank' : 'Bank to Cash',
      row.bank_name || '',
      row.description || '',
      Number(row.amount) || 0,
    ]))

    rows.push([])
    rows.push(['', '', '', '', 'Total Amount', totalAmount])

    await exportExcelFile({
      fileName: `cash-bank-transfer-history-${activeTab}-${historyFrom}-to-${historyTo}`,
      sheetName: activeTab === 'ctb' ? 'Cash to Bank' : 'Bank to Cash',
      title: activeTab === 'ctb' ? 'Cash to Bank Transfer History' : 'Bank to Cash Transfer History',
      subtitle: `Transfer History - ${historyFrom} to ${historyTo}`,
      meta: [`Generated: ${new Date().toLocaleDateString('en-PK')} | Entries: ${filteredHistoryRows.length}`],
      headers: ['Sr', 'Date', 'Type', 'Bank', 'Description', 'Amount (Rs.)'],
      rows,
      numericColumns: [1, 6],
    })
  }

  return (
    <div style={{ padding: '32px 28px', overflowY: 'auto', fontSize: 14, lineHeight: 1.6, background: '#f5f8f5', height: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1b3a1d', letterSpacing: '-0.01em' }}>
          Cash to Bank Transfer
        </div>
        <div style={{ fontSize: 13, color: '#6a8f6c', marginTop: 4 }}>
          Transfer cash in hand to bank account and print transfer slips.
        </div>
      </div>

      <div style={{ maxWidth: 900 }}>
        <div style={{ display: 'inline-flex', gap: 6, marginBottom: 12, padding: 4, background: '#e8f0e8', borderRadius: 999 }}>
          <button
            style={activeTab === 'ctb' ? btnPrimaryPill : btnGhostPill}
            onClick={() => setActiveTab('ctb')}
          >
            Cash to Bank
          </button>
          <button
            style={activeTab === 'btc' ? btnPrimaryPill : btnGhostPill}
            onClick={() => setActiveTab('btc')}
          >
            Bank to Cash
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #c8d8c8', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #c8d8c8', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Landmark size={17} style={{ color: '#2e7d32' }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1b3a1d' }}>
                {activeTab === 'ctb' ? 'Cash to Bank Transfer' : 'Bank to Cash Transfer'}
              </div>
              <div style={{ fontSize: 11.5, color: '#6a8f6c' }}>
                {activeTab === 'ctb'
                  ? 'Transfer cash in hand to bank account'
                  : 'Transfer bank amount to cash with cheque/online details'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ background: '#fff', padding: '20px', borderRight: '1px solid #c8d8c8' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6a8f6c', letterSpacing: '0.06em', fontFamily: 'monospace', marginBottom: 4 }}>CASH IN HAND</div>
              <div style={{ fontSize: 23, fontWeight: 700, fontFamily: 'monospace', color: '#b45309' }}>Rs. {cashBalance.toLocaleString()}</div>
            </div>
            <div style={{ background: '#fff', padding: '20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6a8f6c', letterSpacing: '0.06em', fontFamily: 'monospace', marginBottom: 4 }}>BANK BALANCE</div>
              <div style={{ fontSize: 23, fontWeight: 700, fontFamily: 'monospace', color: '#2e7d32' }}>Rs. {bankBalance.toLocaleString()}</div>
            </div>
          </div>

          {activeTab === 'ctb' && (
            <>
              <div style={{ padding: '20px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid #c8d8c8' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6a8f6c' }}>Date</label>
                  <input type="date" value={ctbDate} onChange={e => setCtbDate(e.target.value)} style={{ height: 34, fontSize: 13, border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 8px', width: 145 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6a8f6c' }}>Amount (Rs.)</label>
                  <input type="number" value={ctbAmount} onChange={e => setCtbAmount(e.target.value)} placeholder="0" min="0" style={{ height: 34, fontSize: 13, fontFamily: 'monospace', fontWeight: 600, border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 8px', width: 140 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6a8f6c' }}>Bank</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <select value={ctbBankId || ''} onChange={e => setCtbBankId(Number(e.target.value))} disabled={loadingBanks} style={{ height: 34, fontSize: 13, border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 8px', width: 200, outline: 'none' }}>
                      {loadingBanks ? <option>Loading...</option> : banks.length === 0 ? <option value="">No banks - Add one</option> : banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button style={btnGhostSquare} onClick={() => setShowAddBank(true)} title="Add new bank"><Plus size={16} /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 150 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6a8f6c' }}>Notes <span style={{ fontWeight: 400 }}>(optional)</span></label>
                  <input type="text" value={ctbNotes} onChange={e => setCtbNotes(e.target.value)} placeholder="e.g. deposit" style={{ height: 34, fontSize: 13, border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 8px' }} />
                </div>
                <button style={{ ...btnPrimary, marginLeft: 'auto' }} onClick={handleCashToBank} disabled={ctbSaving}>
                  {ctbSaving ? 'Saving...' : 'Transfer'}
                </button>
              </div>
              {ctbMsg && (
                <div style={{ padding: '8px 20px', fontSize: 12.5, background: ctbMsg.ok ? '#f0fdf4' : '#fef2f2', color: ctbMsg.ok ? '#15803d' : '#b91c1c', borderTop: '1px solid #c8d8c8' }}>
                  {ctbMsg.text}
                </div>
              )}
            </>
          )}

          {activeTab === 'btc' && (
            <>
              <div style={{ padding: '20px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid #c8d8c8' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6a8f6c' }}>Date</label>
                  <input type="date" value={btcDate} onChange={e => setBtcDate(e.target.value)} style={{ height: 34, fontSize: 13, border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 8px', width: 145 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6a8f6c' }}>Amount (Rs.)</label>
                  <input type="number" value={btcAmount} onChange={e => setBtcAmount(e.target.value)} placeholder="0" min="0" style={{ height: 34, fontSize: 13, fontFamily: 'monospace', fontWeight: 600, border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 8px', width: 140 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6a8f6c' }}>Bank</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <select value={btcBankId || ''} onChange={e => setBtcBankId(Number(e.target.value))} disabled={loadingBanks} style={{ height: 34, fontSize: 13, border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 8px', width: 200, outline: 'none' }}>
                      {loadingBanks ? <option>Loading...</option> : banks.length === 0 ? <option value="">No banks - Add one</option> : banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button style={btnGhostSquare} onClick={() => setShowAddBank(true)} title="Add new bank"><Plus size={16} /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6a8f6c' }}>Mode</label>
                  <select value={btcMode} onChange={e => setBtcMode(e.target.value)} style={{ height: 34, fontSize: 13, border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 8px', width: 150 }}>
                    <option value="cheque">Cheque</option>
                    <option value="online">Online</option>
                  </select>
                </div>
                {btcMode === 'cheque' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: '#6a8f6c' }}>Cheque No.</label>
                    <input type="text" value={btcChequeNo} onChange={e => setBtcChequeNo(e.target.value)} placeholder="Enter cheque" style={{ height: 34, fontSize: 13, border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 8px', width: 160 }} />
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 170 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6a8f6c' }}>Purpose</label>
                  <input type="text" value={btcPurpose} onChange={e => setBtcPurpose(e.target.value)} placeholder="e.g. office expenses" style={{ height: 34, fontSize: 13, border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 8px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 150 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6a8f6c' }}>Notes <span style={{ fontWeight: 400 }}>(opt)</span></label>
                  <input type="text" value={btcNotes} onChange={e => setBtcNotes(e.target.value)} placeholder="Detail" style={{ height: 34, fontSize: 13, border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 8px' }} />
                </div>
                <button style={{ ...btnPrimary, marginLeft: 'auto' }} onClick={handleBankToCash} disabled={btcSaving}>
                  {btcSaving ? 'Saving...' : 'Transfer'}
                </button>
              </div>
              {btcMsg && (
                <div style={{ padding: '8px 20px', fontSize: 12.5, background: btcMsg.ok ? '#f0fdf4' : '#fef2f2', color: btcMsg.ok ? '#15803d' : '#b91c1c', borderTop: '1px solid #c8d8c8' }}>
                  {btcMsg.text}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ background: '#fff', border: '1px solid #c8d8c8', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #c8d8c8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1b3a1d' }}>Transfer History</div>
              <div style={{ fontSize: 11.5, color: '#6a8f6c' }}>Cash to bank and bank to cash transactions</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#6a8f6c' }}>From</label>
                <input type="date" value={historyFrom} onChange={e => setHistoryFrom(e.target.value)} style={{ height: 32, fontSize: 12, border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 8px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#6a8f6c' }}>To</label>
                <input type="date" value={historyTo} onChange={e => setHistoryTo(e.target.value)} style={{ height: 32, fontSize: 12, border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 8px' }} />
              </div>
              <button style={btnGhost} onClick={loadTransferHistory}>
                <RefreshCw size={13} /> Refresh
              </button>
              <button style={btnGhost} onClick={exportTransferHistoryExcel} disabled={historyLoading || filteredHistoryRows.length === 0}>
                <FileDown size={13} /> Export Excel
              </button>
            </div>
          </div>

          {historyMsg && (
            <div style={{ padding: '8px 20px', fontSize: 12.5, background: historyMsg.ok ? '#f0fdf4' : '#fef2f2', color: historyMsg.ok ? '#15803d' : '#b91c1c', borderBottom: '1px solid #c8d8c8' }}>
              {historyMsg.text}
            </div>
          )}

          <div style={{ overflowX: 'auto', borderTop: '1px solid #c8d8c8' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Bank</th>
                  <th style={thStyle}>Description</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Amount (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading && <tr><td colSpan={5} style={{ padding: '12px 20px', color: '#6a8f6c' }}>Loading...</td></tr>}
                {!historyLoading && historyError && <tr><td colSpan={5} style={{ padding: '12px 20px', color: '#b91c1c' }}>{historyError}</td></tr>}
                {!historyLoading && !historyError && filteredHistoryRows.length === 0 && <tr><td colSpan={5} style={{ padding: '12px 20px', color: '#6a8f6c' }}>No transactions found.</td></tr>}
                {!historyLoading && !historyError && filteredHistoryRows.map((row, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e8f0e8' }}>
                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{row.entry_date}</td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                        color: row.transfer_type === 'cash_to_bank' ? '#1d4ed8' : '#b45309',
                        background: row.transfer_type === 'cash_to_bank' ? '#eff6ff' : '#fffbeb',
                        border: `1px solid ${row.transfer_type === 'cash_to_bank' ? '#bfdbfe' : '#fde68a'}`,
                      }}>
                        {row.transfer_type === 'cash_to_bank' ? 'Cash to Bank' : 'Bank to Cash'}
                      </span>
                    </td>
                    <td style={tdStyle}>{row.bank_name || '-'}</td>
                    <td style={{ ...tdStyle, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.description || '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#2e7d32' }}>
                      {Number(row.amount || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAddBank && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setShowAddBank(false) }}>
          <div style={modalContent}>
            <div style={modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Building2 size={17} style={{ color: '#2e7d32' }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1b3a1d' }}>Add New Bank</div>
                  <div style={{ fontSize: 11, color: '#6a8f6c' }}>Create a new account in the ledger</div>
                </div>
              </div>
              <button style={btnGhostSquare} onClick={() => setShowAddBank(false)}><X size={16} /></button>
            </div>

            <div style={modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6a8f6c' }}>Bank Name *</label>
                <input type="text" value={newBankName} onChange={e => setNewBankName(e.target.value)} placeholder="e.g. Habib Bank Ltd" style={inputStyle} autoFocus />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6a8f6c' }}>Account Number</label>
                <input type="text" value={newAccountNumber} onChange={e => setNewAccountNumber(e.target.value)} placeholder="e.g. 1234567890" style={inputStyle} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6a8f6c' }}>Branch Name</label>
                <input type="text" value={newBranchName} onChange={e => setNewBranchName(e.target.value)} placeholder="e.g. Main Branch" style={inputStyle} />
              </div>

              {addBankMsg && (
                <div style={{ padding: '8px 12px', fontSize: 12, borderRadius: 6, background: addBankMsg.ok ? '#f0fdf4' : '#fef2f2', color: addBankMsg.ok ? '#15803d' : '#b91c1c' }}>
                  {addBankMsg.text}
                </div>
              )}
            </div>

            <div style={modalFooter}>
              <button style={btnGhost} onClick={() => setShowAddBank(false)}>Cancel</button>
              <button style={btnPrimary} onClick={handleAddBank} disabled={addingBank || !newBankName.trim()}>
                {addingBank ? 'Adding...' : 'Add Bank'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Inline styles replacing CSS classes for green theme
const btnPrimary = { background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 6, padding: '0 16px', height: 34, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 };
const btnGhost = { background: '#fff', color: '#1b3a1d', border: '1px solid #c8d8c8', borderRadius: 6, padding: '0 12px', height: 34, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 };
const btnGhostSquare = { background: 'transparent', border: 'none', color: '#6a8f6c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 6 };
const btnPrimaryPill = { ...btnPrimary, borderRadius: 999, height: 32, boxShadow: '0 1px 2px rgba(0,0,0,0.12)' };
const btnGhostPill = { ...btnGhost, borderRadius: 999, height: 32, border: 'none', background: 'transparent' };

const thStyle = { textAlign: 'left', padding: '10px 20px', borderBottom: '1px solid #c8d8c8', borderRight: '1px solid #c8d8c8', fontSize: 11, color: '#6a8f6c', letterSpacing: '0.04em', textTransform: 'uppercase' };
const tdStyle = { padding: '10px 20px', borderRight: '1px solid #c8d8c8' };

const modalOverlay = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalContent = { background: '#fff', borderRadius: 12, width: 420, maxWidth: '90vw', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' };
const modalHeader = { padding: '16px 20px', borderBottom: '1px solid #c8d8c8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const modalBody = { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 };
const modalFooter = { padding: '12px 20px', borderTop: '1px solid #c8d8c8', display: 'flex', justifyContent: 'flex-end', gap: 8 };
const inputStyle = { padding: '0 12px', height: 36, border: '1px solid #c8d8c8', borderRadius: 6, fontSize: 13, outline: 'none' };
