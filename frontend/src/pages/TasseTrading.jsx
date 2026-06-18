import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Receipt, RefreshCw, AlertTriangle, TrendingDown, TrendingUp, PlusCircle, Trash2, Info, CheckCircle, Calendar, Upload, FileText, X } from 'lucide-react';

const API = 'http://localhost:5001';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val, decimals = 2) {
  if (val === null || val === undefined) return '—';
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
}

function fmtEur(val) {
  if (val === null || val === undefined) return '—';
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(val);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DisclaimerBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(251,146,60,0.12), rgba(234,88,12,0.08))',
      border: '1px solid rgba(251,146,60,0.4)',
      borderRadius: '16px',
      padding: '1rem 1.25rem',
      display: 'flex',
      gap: '0.9rem',
      alignItems: 'flex-start',
    }}>
      <AlertTriangle size={20} color="#fb923c" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <p style={{ fontWeight: 700, color: '#fb923c', fontSize: '0.9rem', margin: 0 }}>
            ⚠️ QUESTO STRUMENTO NON È UNA CONSULENZA FISCALE
          </p>
          <button
            onClick={() => setOpen(o => !o)}
            style={{ background: 'none', border: 'none', color: '#fb923c', cursor: 'pointer', fontSize: '0.78rem', textDecoration: 'underline', padding: 0, flexShrink: 0 }}
          >
            {open ? 'Nascondi dettagli' : 'Leggi tutto'}
          </button>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'rgba(251,146,60,0.85)', margin: '0.3rem 0 0' }}>
          Calcoli pensati come supporto operativo per il Quadro RT del Modello Redditi PF (o Quadro T del 730/2025).
          Fai verificare il risultato a un commercialista prima di compilare la dichiarazione.
        </p>
        {open && (
          <ul style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', margin: '0.6rem 0 0', paddingLeft: '1.2rem', lineHeight: 1.7 }}>
            <li><strong style={{ color: 'rgba(251,146,60,0.9)' }}>Valuta:</strong> questo modulo NON fa conversione valutaria. Assume che tutti i valori siano già in EUR.</li>
            <li><strong style={{ color: 'rgba(251,146,60,0.9)' }}>Monitoraggio estero:</strong> se il conto è su broker estero verifica gli obblighi Quadro RW / IVAFE.</li>
            <li><strong style={{ color: 'rgba(251,146,60,0.9)' }}>Anno fiscale:</strong> l'anno di competenza è quello di CHIUSURA del trade, non di apertura.</li>
            <li><strong style={{ color: 'rgba(251,146,60,0.9)' }}>Profit netto:</strong> nei report MT4/MT5 la colonna "Profit" esclude commission e swap — il modulo li somma correttamente.</li>
            <li><strong style={{ color: 'rgba(251,146,60,0.9)' }}>Casi limite:</strong> rebate, bonus broker, rollover particolari — richiedono verifica manuale.</li>
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color = 'var(--text-bright)', icon }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: '16px',
      padding: '1.1rem 1.3rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.3rem',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
        {icon}
        <span>{label}</span>
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

function AnnoRow({ r }) {
  const isPositivo = r.risultato_netto_anno > 0;
  const isPerdita  = r.risultato_netto_anno < 0;
  const hasImposta = r.imposta_dovuta > 0;

  const statusColor = hasImposta
    ? '#22c55e'   // verde — tasse da pagare (guadagno)
    : isPerdita
      ? '#ef4444'  // rosso — perdita anno
      : '#6b7280'; // grigio — in pari

  const statusLabel = hasImposta
    ? `Imposta: ${fmtEur(r.imposta_dovuta)}`
    : isPerdita
      ? 'Perdita — nessuna imposta'
      : 'Pareggio — nessuna imposta';

  return (
    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
      {/* Anno */}
      <td style={{ padding: '0.9rem 1rem', fontWeight: 700, fontSize: '1rem', color: 'var(--text-bright)' }}>
        {r.anno}
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: '0.1rem' }}>
          {r.numero_trade} trade
        </div>
      </td>

      {/* Plusvalenze lorde */}
      <td style={{ padding: '0.9rem 1rem', color: '#4ade80', textAlign: 'right', fontWeight: 600 }}>
        {fmtEur(r.plusvalenze_lorde)}
      </td>

      {/* Minusvalenze lorde */}
      <td style={{ padding: '0.9rem 1rem', color: '#f87171', textAlign: 'right', fontWeight: 600 }}>
        {r.minusvalenze_lorde > 0 ? `−${fmtEur(r.minusvalenze_lorde)}` : '—'}
      </td>

      {/* Risultato netto anno */}
      <td style={{ padding: '0.9rem 1rem', textAlign: 'right', fontWeight: 700, color: isPositivo ? '#4ade80' : isPerdita ? '#f87171' : 'var(--text-muted)' }}>
        {isPositivo ? '+' : ''}{fmtEur(r.risultato_netto_anno)}
      </td>

      {/* Minus pregresse usate */}
      <td style={{ padding: '0.9rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>
        {r.minusvalenze_pregresse_usate > 0 ? `−${fmtEur(r.minusvalenze_pregresse_usate)}` : '—'}
      </td>

      {/* Base imponibile */}
      <td style={{ padding: '0.9rem 1rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-bright)' }}>
        {fmtEur(r.base_imponibile)}
      </td>

      {/* Imposta dovuta 26% */}
      <td style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>
        <span style={{
          display: 'inline-block',
          padding: '0.35rem 0.75rem',
          borderRadius: '20px',
          background: hasImposta ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
          color: statusColor,
          fontWeight: 800,
          fontSize: '0.92rem',
        }}>
          {hasImposta ? fmtEur(r.imposta_dovuta) : '€ 0,00'}
        </span>
      </td>

      {/* Minus residua da riportare */}
      <td style={{ padding: '0.9rem 1rem', textAlign: 'right', color: r.minusvalenza_residua_da_riportare > 0 ? '#fb923c' : 'var(--text-muted)' }}>
        {r.minusvalenza_residua_da_riportare > 0 ? fmtEur(r.minusvalenza_residua_da_riportare) : '—'}
      </td>
    </tr>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TasseTrading({ user }) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  // form minusvalenze pregresse
  const [formAnno, setFormAnno]       = useState('');
  const [formImporto, setFormImporto] = useState('');
  const [minusvalenzeSalvate, setMinusvalenzeSalvate] = useState({});
  const [formLoading, setFormLoading] = useState(false);

  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadStatus, setUploadStatus]   = useState(null); // { type: 'ok'|'err', msg: string }
  const [savedReports, setSavedReports]   = useState([]);

  // filtri
  const [selectedAnno, setSelectedAnno] = useState('Tutti');
  const [zainoFiscale, setZainoFiscale] = useState('');

  // ── Parse helpers (mirror of ReportAnalysis) ────────────────────────────────

  const cleanNumber = (val) => {
    if (!val) return 0;
    const clean = val.replace(/\s/g, '').replace(/[^0-9.-]/g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  };

  const normaliseSymbol = (sym) => {
    if (!sym) return '';
    let s = sym.toUpperCase().trim();
    s = s.replace(/[.#]?(CASH|PRO|ECN|STP)$/i, '');
    s = s.replace(/\.[A-Z]$/i, '');
    s = s.replace(/[^A-Z0-9]$/, '');
    return s.trim();
  };

  const cleanCommentText = (comment) => {
    if (!comment) return '';
    return comment.replace(/\[(sl|tp|so)\]\s*$/gi, '').trim();
  };

  const parseHTMLReport = (htmlText) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const rows = Array.from(doc.querySelectorAll('tr'));
    const extracted = [];
    let currentSection = '';
    let positionsColMap = {};
    let dealsColMap = {};

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.textContent.trim());
      if (cells.length === 0) continue;

      const headerCell = row.querySelector('th, td[colspan]');
      if (headerCell) {
        const text = headerCell.textContent.trim().toLowerCase();
        if (text.includes('open positions') || text.includes('posizioni aperte')) { currentSection = 'open_positions'; continue; }
        else if (text.includes('positions') || text.includes('posizioni')) { currentSection = 'positions'; positionsColMap = {}; continue; }
        else if (text.includes('deals') || text.includes('operazioni')) { currentSection = 'deals'; dealsColMap = {}; continue; }
        else if (text.includes('orders') || text.includes('ordini') || text.includes('working orders')) { currentSection = 'orders'; continue; }
      }

      const cellsLower = cells.map(c => c.toLowerCase());
      const isHeaderRow = cellsLower.includes('time') || cellsLower.includes('tempo') || cellsLower.includes('orario');
      const isProfitHeader = cellsLower.includes('profit') || cellsLower.includes('profitto') || cellsLower.includes('guadagno');
      if (isHeaderRow && isProfitHeader && cells.length >= 8) {
        const colMap = {};
        cellsLower.forEach((cell, idx) => {
          if (['time','tempo','orario','data','ora','data/ora'].includes(cell)) { if (colMap['open_time'] === undefined) colMap['open_time'] = idx; else colMap['close_time'] = idx; }
          else if (['position','posizione','ticket','deal','operazione'].includes(cell)) colMap['ticket'] = idx;
          else if (['symbol','simbolo'].includes(cell)) colMap['symbol'] = idx;
          else if (['type','tipo'].includes(cell)) colMap['type'] = idx;
          else if (['volume','volumi','size'].includes(cell)) colMap['volume'] = idx;
          else if (['direction','direzione'].includes(cell)) colMap['direction'] = idx;
          else if (['commission','commissione','commissioni'].includes(cell)) colMap['commission'] = idx;
          else if (cell === 'swap') colMap['swap'] = idx;
          else if (['profit','profitto','guadagno'].includes(cell)) colMap['profit'] = idx;
          else if (['comment','commento'].includes(cell)) colMap['comment'] = idx;
        });
        if (currentSection === 'positions') positionsColMap = colMap;
        else if (currentSection === 'deals') dealsColMap = colMap;
        continue;
      }

      const cell2 = cells[2]?.toLowerCase() || '';
      if ((cell2 === 'buy' || cell2 === 'sell' || cell2 === 'balance' || cell2 === 'deposit' || cell2 === 'withdrawal') && cells.length >= 13 && cells.length <= 16) {
        const closeTime = cells[8] || '';
        let profitVal = 0, comment = '', magic = 'N/A', commissionVal = 0, swapVal = 0;
        // Layout MT4 standard: 14 col = Ticket|OpenTime|Type|Size|Symbol|OpenPx|SL|TP|CloseTime|ClosePx|Commission|Taxes|Swap|Profit
        // Layout MT4 con Magic (15 col): stessa struttura + Magic in ultima posizione
        // Layout MT4 con Magic+Comment (16 col)
        if (cells.length === 14) {
          commissionVal = cleanNumber(cells[10]);
          swapVal       = cleanNumber(cells[12]);
          profitVal     = cleanNumber(cells[13]);
        } else if (cells.length === 15) {
          // colonna extra in fondo (Magic o Comment)
          commissionVal = cleanNumber(cells[10]);
          swapVal       = cleanNumber(cells[12]);
          profitVal     = cleanNumber(cells[13]);
          const rm = (cells[14]||'').match(/\d{5,9}/) || (cells[14]||'').match(/\d+/);
          magic = rm ? rm[0] : 'N/A';
          comment = cleanCommentText(cells[14]||'');
        } else if (cells.length === 16) {
          commissionVal = cleanNumber(cells[10]);
          swapVal       = cleanNumber(cells[12]);
          profitVal     = cleanNumber(cells[13]);
          const rm = (cells[14]||'').match(/\d{5,9}/) || (cells[14]||'').match(/\d+/);
          magic = rm ? rm[0] : 'N/A';
          comment = cleanCommentText(cells[15]||'');
        } else {
          // fallback generico per colonne non standard (13 col, ecc.)
          profitVal = cleanNumber(cells[cells.length - 1]);
        }
        if (closeTime) extracted.push({ ticket: cells[0], openTime: cells[1], closeTime, type: cell2, lots: parseFloat(cells[3])||0, symbol: normaliseSymbol(cells[4]||''), profit: profitVal, commission: commissionVal, swap: swapVal, comment, magic, source: 'mt4' });
        continue;
      }

      let isDeal = false, ticket='', openTime='', symbol='', type='', lots=0, closeTime='', profitVal=0, comment='', magic='N/A', commission=0, swap=0;
      if (currentSection === 'deals' && dealsColMap && Object.keys(dealsColMap).length > 0) {
        const tIdx = dealsColMap['ticket'], tyIdx = dealsColMap['type'], dirIdx = dealsColMap['direction'];
        if (tIdx !== undefined && tyIdx !== undefined && dirIdx !== undefined) {
          const rType = cells[tyIdx]?.toLowerCase(), rDir = cells[dirIdx]?.toLowerCase();
          if ((rType==='buy'||rType==='sell'||rType==='balance') && (rDir==='out'||rDir==='in/out'||rDir==='in') && /^\d+$/.test(cells[tIdx])) {
            isDeal=true; ticket=cells[tIdx]; closeTime=cells[dealsColMap['open_time']]||''; symbol=normaliseSymbol(cells[dealsColMap['symbol']]||''); type=rType; lots=parseFloat(cells[dealsColMap['volume']])||0; profitVal=cleanNumber(cells[dealsColMap['profit']]); const ci=dealsColMap['comment']; if(ci!==undefined) comment=cleanCommentText(cells[ci]);
            const comIdx = dealsColMap['commission']; const swapIdx = dealsColMap['swap'];
            if(comIdx !== undefined) commission = cleanNumber(cells[comIdx]);
            if(swapIdx !== undefined) swap = cleanNumber(cells[swapIdx]);
          }
        }
      }
      if (!isDeal && currentSection === 'deals') {
        const c0=cells[0]||'', c1=cells[1]||'', c3=cells[3]?.toLowerCase()||'', c4=cells[4]?.toLowerCase()||'';
        if ((c3==='buy'||c3==='sell'||c3==='balance') && (c4==='out'||c4==='in/out'||c4==='in') && /^\d+$/.test(c1) && /^\d{4}\.\d{2}\.\d{2}/.test(c0)) {
          isDeal=true; ticket=c1; closeTime=c0; symbol=normaliseSymbol(cells[2]||''); type=c3; lots=parseFloat(cells[5])||0; comment=cleanCommentText(cells[cells.length-1]);
          if(cells.length===15) { profitVal=cleanNumber(cells[12]); commission=cleanNumber(cells[10]); swap=cleanNumber(cells[11]); } 
          else if(cells.length===14) { profitVal=cleanNumber(cells[11]); commission=cleanNumber(cells[9]); swap=cleanNumber(cells[10]); } 
          else if(cells.length===13) profitVal=cleanNumber(cells[10]); 
          else profitVal=cleanNumber(cells[cells.length-3]||cells[cells.length-2]);
        }
      }
      if (isDeal && closeTime && !isNaN(profitVal) && profitVal !== 0) {
        const mm = comment.match(/\d{5,9}/)||comment.match(/\d+/); magic=mm?mm[0]:'N/A';
        extracted.push({ ticket, openTime:'', closeTime, type, lots, symbol, profit: profitVal, comment, magic, commission, swap, source:'mt5_deal' }); continue;
      }

      let isPos=false;
      if (currentSection==='positions' && positionsColMap && Object.keys(positionsColMap).length>0) {
        const tIdx=positionsColMap['ticket'], tyIdx=positionsColMap['type'], otIdx=positionsColMap['open_time'];
        if (tIdx!==undefined && tyIdx!==undefined) {
          const rType=cells[tyIdx]?.toLowerCase();
          if ((rType==='buy'||rType==='sell') && /^\d+$/.test(cells[tIdx])) {
            isPos=true; ticket=cells[tIdx]; openTime=cells[otIdx]||''; symbol=normaliseSymbol(cells[positionsColMap['symbol']]||''); type=rType;
            const tds=Array.from(row.querySelectorAll('td')); let ct=tds.map(t=>t.textContent.trim()); let hi=tds.findIndex(t=>t.classList.contains('hidden')||t.getAttribute('colspan')==='8');
            if(hi!==-1){comment=cleanCommentText(ct[hi]);ct.splice(hi,1);}
            lots=parseFloat(ct[positionsColMap['volume']])||0; closeTime=ct[positionsColMap['close_time']]||''; profitVal=cleanNumber(ct[positionsColMap['profit']]);
          }
        }
      }
      if (!isPos && (currentSection==='positions'||currentSection==='')) {
        const c0=cells[0]||'',c1=cells[1]||'',c3=cells[3]?.toLowerCase()||'';
        if ((c3==='buy'||c3==='sell'||c3==='balance') && /^\d+$/.test(c1) && /^\d{4}\.\d{2}\.\d{2}/.test(c0)) {
          isPos=true; ticket=c1; openTime=c0; symbol=normaliseSymbol(cells[2]||''); type=c3;
          const tds=Array.from(row.querySelectorAll('td')); let ct=tds.map(t=>t.textContent.trim()); let hi=tds.findIndex(t=>t.classList.contains('hidden')||t.getAttribute('colspan')==='8');
          if(hi!==-1){comment=cleanCommentText(ct[hi]);lots=parseFloat(ct[hi+1])||0;closeTime=ct[hi+5]||'';profitVal=cleanNumber(ct[hi+9]);}
          else{lots=parseFloat(cells[4])||0;closeTime=cells[8]||'';profitVal=cleanNumber(cells[12]);}
        }
      }
      if (isPos && closeTime && !isNaN(profitVal)) {
        const mm=comment.match(/\d{5,9}/)||comment.match(/\d+/); magic=mm?mm[0]:'N/A';
        // Posizioni MT5: commission e swap vengono estratte solo se il colMap le ha trovate
        const pos_comm = positionsColMap['commission'] !== undefined ? cleanNumber(cells[positionsColMap['commission']]||'0') : 0;
        const pos_swap = positionsColMap['swap'] !== undefined ? cleanNumber(cells[positionsColMap['swap']]||'0') : 0;
        extracted.push({ ticket, openTime, closeTime, type, lots, symbol, profit: profitVal, comment, magic, commission: pos_comm, swap: pos_swap, source:'mt5_position' });
      }
    }

    const hasDeals = extracted.some(t => t.source === 'mt5_deal');
    const final = hasDeals ? extracted.filter(t => t.source !== 'mt5_position') : extracted;
    return final.sort((a,b) => { const ta=new Date(a.closeTime.replace(/\./g,'/')).getTime()||0, tb=new Date(b.closeTime.replace(/\./g,'/')).getTime()||0; return ta-tb; });
  };

  const parseCSVReport = (csvText) => {
    const lines = csvText.split('\n').map(l=>l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(/[;,]/).map(h=>h.replace(/["']/g,'').trim().toLowerCase());
    const idxTicket = headers.findIndex(h=>h.includes('ticket')||h.includes('id')||h.includes('deal'));
    const idxSymbol = headers.findIndex(h=>h.includes('symbol')||h.includes('item')||h.includes('mercato'));
    const idxType   = headers.findIndex(h=>h.includes('type')||h.includes('tipo'));
    const idxLots   = headers.findIndex(h=>h.includes('size')||h.includes('volume')||h.includes('lots'));
    const idxClose  = headers.findIndex(h=>h.includes('close time')||h.includes('time')||h.includes('orario'));
    const idxProfit = headers.findIndex(h=>h.includes('profit')||h.includes('guadagno')||h.includes('pnl'));
    const idxComment= headers.findIndex(h=>h.includes('comment')||h.includes('note'));
    const idxMagic  = headers.findIndex(h=>h.includes('magic'));
    const extracted = [];
    for (let i=1;i<lines.length;i++) {
      const cells=lines[i].split(/[;,]/).map(c=>c.replace(/["']/g,'').trim());
      if (cells.length<5) continue;
      const type=idxType!==-1?cells[idxType]?.toLowerCase():'';
      const profitVal=idxProfit!==-1?cleanNumber(cells[idxProfit]):0;
      const closeTime=idxClose!==-1?cells[idxClose]:'';
      if ((type.includes('buy')||type.includes('sell')||type.includes('balance')||type.includes('deposit')) && closeTime) {
        const rawComment=idxComment!==-1?cells[idxComment]:'';
        let magic='N/A';
        if(idxMagic!==-1&&cells[idxMagic]) magic=cells[idxMagic];
        else { const mm=rawComment.match(/\d{5,9}/)||rawComment.match(/\d+/); magic=mm?mm[0]:'N/A'; }
        extracted.push({ ticket:idxTicket!==-1?cells[idxTicket]:Math.random().toString(), openTime:'', closeTime, type:type.includes('buy')?'buy':'sell', lots:idxLots!==-1?parseFloat(cells[idxLots])||0:0, symbol:idxSymbol!==-1?normaliseSymbol(cells[idxSymbol]):'', profit:profitVal, comment:cleanCommentText(rawComment), magic });
      }
    }
    return extracted.sort((a,b)=>{const ta=new Date(a.closeTime.replace(/\./g,'/')).getTime()||0,tb=new Date(b.closeTime.replace(/\./g,'/')).getTime()||0;return ta-tb;});
  };

  const fetchSavedReports = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API}/api/reports`, { headers });
      if (res.ok) setSavedReports(await res.json());
    } catch {}
  }, [user]);

  const uploadTradesToBackend = async (parsedTrades, name) => {
    const formattedDeals = parsedTrades.map(t => ({
      ticket: t.ticket || Math.random().toString(),
      time: t.closeTime || t.openTime || '',
      symbol: t.symbol || '',
      type: t.type || 'buy',
      volume: parseFloat(t.lots) || 0.01,
      profit: parseFloat(t.profit) || 0.0,
      magic: t.magic ? t.magic.toString() : '0',
      comment: t.comment || '',
      commission: parseFloat(t.commission) || 0.0,
      swap: parseFloat(t.swap) || 0.0
    }));
    const res = await fetch(`${API}/api/reports`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, deals: formattedDeals })
    });
    if (res.status === 429) { const d=await res.json(); throw new Error(d.error||'Limite 10 report raggiunto.'); }
    if (!res.ok) { const d=await res.json(); throw new Error(d.error||'Errore caricamento.'); }
    await fetchSavedReports();
    return true;
  };

  const handleFileUpload = async (e, replace = false) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Se non sto rimpiazzando e ho raggiunto il limite
    if (!replace && savedReports.length >= 10) {
      setUploadStatus({ type: 'err', msg: 'Limite 10 report raggiunto. Usa "Sostituisci Report" o elimina un report.' });
      e.target.value = null;
      return;
    }
    
    setUploadLoading(true);
    setUploadStatus(null);
    e.target.value = null;
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target.result;
        let parsed = file.name.endsWith('.csv') ? parseCSVReport(text) : parseHTMLReport(text);
        if (parsed.length === 0) {
          setUploadStatus({ type: 'err', msg: 'Nessuna operazione chiusa trovata. Verifica che il file sia un report MT4/MT5 valido.' });
          return;
        }
        
        if (replace) {
          // Clear all existing reports first
          const clearRes = await fetch(`${API}/api/reports/clear-all`, { method: 'POST', headers });
          if (!clearRes.ok) throw new Error('Errore durante la pulizia dei report esistenti.');
        }
        
        await uploadTradesToBackend(parsed, file.name);
        setUploadStatus({ type: 'ok', msg: `✓ ${file.name} — ${parsed.length} trade caricati. Calcolo fiscale aggiornato.` });
        await calcola();
      } catch (err) {
        setUploadStatus({ type: 'err', msg: err.message });
      } finally {
        setUploadLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const displayedAnni = useMemo(() => {
    if (!data || data.nessun_dato) return [];
    if (selectedAnno === 'Tutti') return data.anni;
    return data.anni.filter(a => a.anno === parseInt(selectedAnno));
  }, [data, selectedAnno]);

  const processedAnni = useMemo(() => {
    let currentZaino = parseFloat(zainoFiscale) || 0;
    return displayedAnni.map(a => {
      let netto_puro = a.risultato_netto_anno; 
      let minus_usate = 0;
      
      if (netto_puro > 0 && currentZaino > 0) {
        minus_usate = Math.min(netto_puro, currentZaino);
        currentZaino -= minus_usate;
      }
      if (netto_puro < 0) {
        currentZaino += Math.abs(netto_puro);
      }

      let base_imp = Math.max(0, netto_puro - minus_usate);
      let imp_op = base_imp * 0.26;
      let imp_tot = imp_op + (a.imposta_su_interessi || 0);

      return {
        ...a,
        minusvalenze_pregresse_usate: minus_usate,
        base_imponibile: base_imp,
        imposta_su_operazioni: imp_op,
        imposta_dovuta: imp_tot,
        minusvalenza_residua_da_riportare: currentZaino,
      };
    });
  }, [displayedAnni, zainoFiscale]);

  const headers = { 'x-user-email': user?.email };

  const calcola = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/tasse/calcola`, { method: 'POST', headers });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadMinusvalenze = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API}/api/tasse/minusvalenze`, { headers });
      if (res.ok) setMinusvalenzeSalvate(await res.json());
    } catch {}
  }, [user]);

  useEffect(() => {
    loadMinusvalenze();
    fetchSavedReports();
    calcola();
  }, []);

  const handleAddMinusvalenza = async (e) => {
    e.preventDefault();
    if (!formAnno || !formImporto) return;
    setFormLoading(true);
    try {
      const res = await fetch(`${API}/api/tasse/minusvalenze`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ anno: parseInt(formAnno), importo: parseFloat(formImporto) }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const json = await res.json();
      setMinusvalenzeSalvate(json.minusvalenze);
      setFormAnno('');
      setFormImporto('');
      // Ricalcola dopo aggiunta
      await calcola();
    } catch (e) {
      alert('Errore: ' + e.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteMinusvalenza = async (anno) => {
    if (!confirm(`Rimuovere la minusvalenza pregressa del ${anno}?`)) return;
    try {
      await fetch(`${API}/api/tasse/minusvalenze/${anno}`, { method: 'DELETE', headers });
      const updated = { ...minusvalenzeSalvate };
      delete updated[anno];
      setMinusvalenzeSalvate(updated);
      await calcola();
    } catch (e) {
      alert('Errore: ' + e.message);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '100%' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 42, height: 42,
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #fb923c, #ea580c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Receipt size={20} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-bright)' }}>Tasse Trading</h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Imposta sostitutiva 26% — Regime dichiarativo (art. 67 TUIR)
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          {/* Replace button */}
          <input
            type="file"
            id="tasse-file-replace"
            accept=".html,.htm,.csv"
            style={{ display: 'none' }}
            onChange={(e) => handleFileUpload(e, true)}
          />
          <label
            htmlFor={uploadLoading ? '' : 'tasse-file-replace'}
            className="btn btn-secondary"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              cursor: uploadLoading ? 'not-allowed' : 'pointer',
              opacity: uploadLoading ? 0.7 : 1,
            }}
            title="Sostituisci i report esistenti con uno nuovo"
          >
            {uploadLoading
              ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : <Trash2 size={15} />}
            {uploadLoading ? 'Sostituzione...' : 'Sostituisci Report'}
          </label>

          {/* Upload button */}
          <input
            type="file"
            id="tasse-file-upload"
            accept=".html,.htm,.csv"
            style={{ display: 'none' }}
            onChange={(e) => handleFileUpload(e, false)}
          />
          <label
            htmlFor={uploadLoading ? '' : 'tasse-file-upload'}
            className="btn btn-primary"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              cursor: uploadLoading ? 'not-allowed' : 'pointer',
              opacity: uploadLoading ? 0.7 : 1,
              background: 'linear-gradient(135deg, #fb923c, #ea580c)',
              borderColor: '#ea580c',
              color: 'white',
            }}
            title="Aggiungi un altro report MT4/MT5"
          >
            {uploadLoading
              ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : <Upload size={15} />}
            {uploadLoading ? 'Caricamento...' : 'Aggiungi Report'}
          </label>

          {/* Ricalcola */}
          <button
            onClick={calcola}
            disabled={loading}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Calcolo...' : 'Ricalcola'}
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <DisclaimerBanner />

      {/* Upload status feedback */}
      {uploadStatus && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          background: uploadStatus.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${uploadStatus.type === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          borderRadius: '12px', padding: '0.85rem 1.1rem', fontSize: '0.86rem',
          color: uploadStatus.type === 'ok' ? '#4ade80' : '#f87171',
        }}>
          <FileText size={16} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{uploadStatus.msg}</span>
          <button onClick={() => setUploadStatus(null)} style={{ background:'none',border:'none',cursor:'pointer',color:'inherit',padding:'0.1rem',display:'flex' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '1rem 1.25rem', color: '#f87171', fontSize: '0.87rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 60, borderRadius: 12, background: 'var(--bg-card)', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      )}

      {/* No data state */}
      {!loading && data?.nessun_dato && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '3rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}>
          <Receipt size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <h3 style={{ color: 'var(--text-bright)', margin: '0 0 0.5rem' }}>Nessun trade da analizzare</h3>
          <p style={{ fontSize: '0.87rem', margin: '0 0 1.5rem' }}>
            Carica un report MT4/MT5 per visualizzare il riepilogo fiscale, oppure sincronizza il tuo EA MT5.
          </p>
          <label
            htmlFor={uploadLoading ? '' : 'tasse-file-upload'}
            className="btn btn-primary"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              cursor: uploadLoading ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg, #fb923c, #ea580c)',
              borderColor: '#ea580c', color: 'white',
              padding: '0.75rem 1.5rem', fontSize: '0.95rem',
            }}
          >
            <Upload size={18} />
            Carica Report MT4 / MT5
          </label>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.75rem 0 0' }}>Formati supportati: HTML, CSV</p>
        </div>
      )}

      {/* Main content */}
      {data && !data.nessun_dato && (
        <>
          {/* Anno Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', background: 'var(--bg-card)', padding: '1rem 1.25rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-bright)', fontSize: '0.9rem' }}>Filtra per Anno Fiscale:</span>
            <select
              value={selectedAnno}
              onChange={(e) => setSelectedAnno(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                color: 'var(--text-bright)',
                fontSize: '0.9rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="Tutti">Tutti gli anni (Storico completo)</option>
              {data.anni.map(a => (
                <option key={a.anno} value={a.anno}>{a.anno}</option>
              ))}
            </select>
            {selectedAnno !== 'Tutti' && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Mostrando i totali solo per il {selectedAnno}. Il riporto delle minusvalenze dagli anni precedenti è comunque applicato automaticamente.
              </span>
            )}
          </div>

          {/* Zaino Fiscale Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-bright)' }}>
              Minusvalenze residue anni precedenti (Zaino Fiscale)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={zainoFiscale}
              onChange={(e) => setZainoFiscale(e.target.value)}
              style={{
                width: '100%', maxWidth: '300px',
                padding: '0.6rem 0.8rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'white',
                outline: 'none'
              }}
              placeholder="Es. 1500.50"
            />
          </div>

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <StatCard
              label="P&L Operazioni (CFD)"
              value={fmtEur(displayedAnni.reduce((s, r) => s + r.pnl_puro_operazioni, 0))}
              sub="Profit + Commission"
              color="#4ade80"
              icon={<TrendingUp size={13} />}
            />
            <StatCard
              label="Swap Negativi (Oneri)"
              value={fmtEur(displayedAnni.reduce((s, r) => s + r.swap_negativi, 0))}
              sub="Oneri deducibili"
              color="#f87171"
              icon={<TrendingDown size={13} />}
            />
            <StatCard
              label="Base Imponibile"
              value={fmtEur(displayedAnni.reduce((s, r) => s + r.base_imponibile, 0))}
              sub="Netto dopo compensazione"
              color="var(--text-bright)"
              icon={<Receipt size={13} />}
            />
            <StatCard
              label="Imposta Sostitutiva"
              value={fmtEur(displayedAnni.reduce((s, r) => s + r.imposta_dovuta, 0))}
              sub="Aliquota 26% (da versare)"
              color={displayedAnni.reduce((s, r) => s + r.imposta_dovuta, 0) > 0 ? '#22c55e' : 'var(--text-muted)'}
              icon={<Receipt size={13} />}
            />
          </div>

          {/* Table */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={16} color="#22c55e" />
              <span style={{ fontWeight: 700, color: 'var(--text-bright)' }}>Riepilogo per anno fiscale</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                Aliquota: 26% — Riporto minusvalenze: 4 anni (FIFO)
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                    {['Anno', 'P&L Op.', 'Swap Neg.', 'Depositi', 'Prelievi', 'Netto', 'Minus Preg.', 'Base Imp.', 'Imp. Op.', 'Imp. Swap', 'Tot. Imp.', 'Minus da Riportare'].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: h === 'Anno' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {processedAnni.map(a => (
                    <tr key={a.anno} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-bright)' }}>{a.anno}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: '#4ade80' }}>{fmtEur(a.pnl_puro_operazioni)}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: '#f87171' }}>{fmtEur(a.swap_negativi)}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: '#60a5fa' }}>{fmtEur(a.totale_depositi)}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: '#fb923c' }}>{fmtEur(a.totale_prelievi)}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-bright)' }}>{fmtEur(a.risultato_netto_anno)}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-muted)' }}>{fmtEur(a.minusvalenze_pregresse_usate)}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-bright)' }}>{fmtEur(a.base_imponibile)}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-bright)' }}>{fmtEur(a.imposta_su_operazioni || 0)}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-bright)' }}>{fmtEur(a.imposta_su_interessi || 0)}</td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        {a.imposta_dovuta > 0
                          ? <span style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>{fmtEur(a.imposta_dovuta)}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-muted)' }}>{a.minusvalenza_residua_da_riportare > 0 ? fmtEur(a.minusvalenza_residua_da_riportare) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border-color)', background: 'rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '0.9rem 1rem', fontWeight: 800, color: 'var(--text-bright)', fontSize: '0.85rem' }}>TOTALE</td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'right', color: '#4ade80', fontWeight: 700 }}>
                      {fmtEur(processedAnni.reduce((s, r) => s + r.pnl_puro_operazioni, 0))}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'right', color: '#f87171', fontWeight: 700 }}>
                      {fmtEur(processedAnni.reduce((s, r) => s + r.swap_negativi, 0))}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'right', color: '#60a5fa', fontWeight: 700 }}>
                      {fmtEur(processedAnni.reduce((s, r) => s + (r.totale_depositi || 0), 0))}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'right', color: '#fb923c', fontWeight: 700 }}>
                      {fmtEur(processedAnni.reduce((s, r) => s + (r.totale_prelievi || 0), 0))}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-bright)' }}>
                      {fmtEur(processedAnni.reduce((s, r) => s + r.risultato_netto_anno, 0))}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {fmtEur(processedAnni.reduce((s, r) => s + r.minusvalenze_pregresse_usate, 0))}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-bright)' }}>
                      {fmtEur(processedAnni.reduce((s, r) => s + r.base_imponibile, 0))}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-bright)' }}>
                      {fmtEur(processedAnni.reduce((s, r) => s + (r.imposta_su_operazioni || 0), 0))}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-bright)' }}>
                      {fmtEur(processedAnni.reduce((s, r) => s + (r.imposta_su_interessi || 0), 0))}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>
                      <span style={{ fontWeight: 900, fontSize: '1rem', color: processedAnni.reduce((s, r) => s + r.imposta_dovuta, 0) > 0 ? '#22c55e' : 'var(--text-muted)' }}>
                        {fmtEur(processedAnni.reduce((s, r) => s + r.imposta_dovuta, 0))}
                      </span>
                    </td>
                    <td style={{ padding: '0.9rem 1rem' }} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Minusvalenze residue detail */}
          {Object.keys(data.minusvalenze_residue || {}).length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: '16px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <TrendingDown size={16} color="#fb923c" />
                <span style={{ fontWeight: 700, color: 'var(--text-bright)' }}>Minusvalenze residue da riportare</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  Compensabili nei 4 anni successivi all'anno di realizzo
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {Object.entries(data.minusvalenze_residue).sort().map(([anno, importo]) => {
                  const scadenza = parseInt(anno) + 4;
                  const scaduta = scadenza < data.anno_riferimento;
                  return (
                    <div key={anno} style={{
                      background: scaduta ? 'rgba(107,114,128,0.1)' : 'rgba(251,146,60,0.08)',
                      border: `1px solid ${scaduta ? 'rgba(107,114,128,0.2)' : 'rgba(251,146,60,0.25)'}`,
                      borderRadius: '12px',
                      padding: '0.65rem 1rem',
                      minWidth: 160,
                    }}>
                      <div style={{ fontWeight: 700, color: scaduta ? 'var(--text-muted)' : '#fb923c', fontSize: '0.85rem' }}>
                        Anno {anno}
                        {scaduta && <span style={{ fontSize: '0.7rem', marginLeft: '0.4rem' }}>⚠️ scaduta</span>}
                      </div>
                      <div style={{ fontWeight: 800, color: 'var(--text-bright)', fontSize: '1.05rem', marginTop: '0.2rem' }}>
                        {fmtEur(importo)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Scade entro: {scadenza}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Minusvalenze pregresse manuali ─────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <PlusCircle size={16} color="var(--accent-blue)" />
          <span style={{ fontWeight: 700, color: 'var(--text-bright)' }}>Minusvalenze pregresse manuali</span>
        </div>
        <div style={{ padding: '1.25rem' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Inserisci perdite di anni precedenti non ancora tracciate in questa app (es. da anni prima dell'installazione).
            Verranno applicate automaticamente in ordine FIFO nel calcolo fiscale.
          </p>

          <form onSubmit={handleAddMinusvalenza} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Anno di realizzo</label>
              <input
                type="number"
                min="2000"
                max={new Date().getFullYear()}
                value={formAnno}
                onChange={e => setFormAnno(e.target.value)}
                placeholder={String(new Date().getFullYear() - 1)}
                required
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '0.6rem 0.85rem',
                  color: 'var(--text-bright)',
                  fontSize: '0.88rem',
                  width: 130,
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Importo (€)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={formImporto}
                onChange={e => setFormImporto(e.target.value)}
                placeholder="es. 1500.00"
                required
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '0.6rem 0.85rem',
                  color: 'var(--text-bright)',
                  fontSize: '0.88rem',
                  width: 160,
                }}
              />
            </div>
            <button
              type="submit"
              disabled={formLoading}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: 40 }}
            >
              <PlusCircle size={15} />
              {formLoading ? 'Salvataggio...' : 'Aggiungi e Ricalcola'}
            </button>
          </form>

          {/* Lista minusvalenze salvate */}
          {Object.keys(minusvalenzeSalvate).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.5rem', fontWeight: 600 }}>Minusvalenze inserite manualmente:</p>
              {Object.entries(minusvalenzeSalvate).sort().map(([anno, importo]) => (
                <div key={anno} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '0.6rem 0.9rem',
                }}>
                  <div>
                    <span style={{ fontWeight: 700, color: 'var(--text-bright)', fontSize: '0.87rem' }}>Anno {anno}</span>
                    <span style={{ color: '#f87171', fontWeight: 700, marginLeft: '1rem' }}>{fmtEur(importo)}</span>
                    <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginLeft: '0.75rem' }}>
                      Scade entro {parseInt(anno) + 4}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteMinusvalenza(anno)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: '0.25rem', borderRadius: '6px', display: 'flex' }}
                    title="Rimuovi"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Info size={13} />
              Nessuna minusvalenza pregressa manuale inserita.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
