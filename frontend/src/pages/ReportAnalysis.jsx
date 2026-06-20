import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Upload, Filter, BarChart3, ShieldAlert, Award, Activity, TrendingUp, Info, Download, BookOpen, ChevronDown, ChevronUp, Copy, Check, Trash2, AlertTriangle, Folder } from 'lucide-react';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="card" style={{ 
        padding: '0.75rem 1rem', 
        background: '#151825', 
        border: '1px solid var(--border-color)', 
        borderRadius: '10px',
        fontSize: '0.85rem'
      }}>
        <div style={{ fontWeight: 600, color: 'var(--text-bright)', marginBottom: '0.25rem' }}>
          Operazione #{data.tradeIndex}
        </div>
        <div style={{ color: 'var(--text-muted)' }}>
          Data: <span style={{ color: 'var(--text-bright)', fontFamily: 'var(--font-mono)' }}>{data.date}</span>
        </div>
        <div style={{ color: 'var(--text-muted)' }}>
          Strumento: <span style={{ color: 'var(--text-bright)', fontWeight: 600 }}>{data.symbol}</span>
        </div>
        <div style={{ color: 'var(--text-muted)' }}>
          Risultato: <span style={{ color: data.profit >= 0 ? 'var(--color-ok)' : 'var(--color-crit)', fontWeight: 700 }}>
            {data.profit >= 0 ? '+' : ''}{data.profit.toFixed(2)} €
          </span>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '0.4rem', paddingTop: '0.4rem', color: 'var(--accent-gold)', fontWeight: 700 }}>
          Bilancio: {data.equity.toFixed(2)} €
        </div>
      </div>
    );
  }
  return null;
};

const cleanCommentText = (comment) => {
  if (!comment) return '';
  // Remove trailing [sl], [tp], [so] (case-insensitive) and any trailing spaces
  return comment.replace(/\[(sl|tp|so)\]\s*$/gi, '').trim();
};

/**
 * Normalise broker symbol to canonical form:
 * - Uppercase
 * - Remove broker suffixes: .r .cash .m .n .x #XXX -XXX
 * Examples: "XAUUSD.r" → "XAUUSD", "US100.cash" → "US100", "GBPJPYm" → "GBPJPY"
 */
const normaliseSymbol = (sym) => {
  if (!sym) return '';
  let s = sym.toUpperCase().trim();
  // Remove trailing broker chars: .CASH, .PRO, .R, #..., -...
  s = s.replace(/[.#]?(CASH|PRO|ECN|STP)$/i, '');
  // Remove single-char suffix after dot or just a trailing single letter (common in MT4)
  s = s.replace(/\.[A-Z]$/i, '');
  // Remove trailing non-alphanumeric
  s = s.replace(/[^A-Z0-9]$/, '');
  return s.trim();
};


const getBackendUrl = () => {
  return import.meta.env.VITE_API_URL || '';
};

export default function ReportAnalysis({ onReportUploaded, user }) {
  const [trades, setTrades] = useState([]);
  const [fileName, setFileName] = useState('');
  const [savedReports, setSavedReports] = useState([]);
  const [reportError, setReportError] = useState('');

  // Fallback to localStorage if user prop is missing
  const currentUser = useMemo(() => {
    if (user) return user;
    try {
      const saved = localStorage.getItem('trading_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  }, [user]);

  // Load saved reports on mount
  React.useEffect(() => {
    fetchSavedReports();
  }, [currentUser]);

  const fetchSavedReports = async () => {
    if (!currentUser) return;
    try {
      const response = await fetch(`${getBackendUrl()}/api/reports`, {
        headers: {
          'x-user-email': currentUser.email
        }
      });
      if (response.ok) {
        const data = await response.json();
        setSavedReports(data);
      }
    } catch (err) {
      console.error('Errore nel caricamento dei report salvati:', err);
    }
  };
  
  // Draft filter states (updated immediately on UI interaction)
  const [draftMagicFilter, setDraftMagicFilter] = useState('');
  const [draftMagicMin, setDraftMagicMin] = useState('');
  const [draftMagicMax, setDraftMagicMax] = useState('');
  const [draftSelectedComments, setDraftSelectedComments] = useState([]);
  const [draftSymbolFilter, setDraftSymbolFilter] = useState('');

  // Applied filter states (used for trade filtering and calculations)
  const [appliedMagicFilter, setAppliedMagicFilter] = useState('');
  const [appliedMagicMin, setAppliedMagicMin] = useState('');
  const [appliedMagicMax, setAppliedMagicMax] = useState('');
  const [appliedSelectedComments, setAppliedSelectedComments] = useState([]);
  const [appliedSymbolFilter, setAppliedSymbolFilter] = useState('');

  const [loading, setLoading] = useState(false);
  const [isCommentDropdownOpen, setIsCommentDropdownOpen] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Click outside to close custom comments multi-select dropdown
  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.multi-select-container')) {
        setIsCommentDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleApplyFilters = () => {
    setAppliedMagicFilter(draftMagicFilter);
    setAppliedMagicMin(draftMagicMin);
    setAppliedMagicMax(draftMagicMax);
    setAppliedSelectedComments(draftSelectedComments);
    setAppliedSymbolFilter(draftSymbolFilter);
  };

  const handleResetFilters = () => {
    setDraftMagicFilter('');
    setDraftMagicMin('');
    setDraftMagicMax('');
    setDraftSelectedComments([]);
    setDraftSymbolFilter('');

    setAppliedMagicFilter('');
    setAppliedMagicMin('');
    setAppliedMagicMax('');
    setAppliedSelectedComments([]);
    setAppliedSymbolFilter('');
  };

  const uploadTradesToBackend = async (parsedTrades, name) => {
    if (!currentUser) {
      alert('Utente non autenticato. Impossibile salvare il report.');
      return false;
    }
    
    try {
      const formattedDeals = parsedTrades.map(t => ({
        ticket: t.ticket || Math.random().toString(),
        time: t.closeTime || t.openTime || '',
        symbol: t.symbol || '',
        type: t.type || 'buy',
        volume: parseFloat(t.lots) || 0.01,
        profit: parseFloat(t.profit) || 0.0,
        magic: t.magic ? t.magic.toString() : "0",
        comment: t.comment || ""
      }));
      
      const response = await fetch(`${getBackendUrl()}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': currentUser.email
        },
        body: JSON.stringify({
          name: name,
          deals: formattedDeals
        })
      });
      
      if (response.status === 429) {
        const errData = await response.json();
        alert(`Errore: ${errData.error || 'Limite di 10 report raggiunto.'}`);
        setFileName('');
        setTrades([]);
        return false;
      }
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Impossibile caricare il report sul server.');
      }
      
      console.log(`[Upload Report] Sincronizzati ${formattedDeals.length} trade con il server per Gestione Risk.`);
      await fetchSavedReports();
      return true;
    } catch (err) {
      console.error('Error uploading trades to backend:', err);
      alert('Errore durante il caricamento: ' + err.message);
      setFileName('');
      setTrades([]);
      return false;
    }
  };

  const handleDeleteReport = async (id, name) => {
    if (!currentUser) return;
    if (!window.confirm(`Sei sicuro di voler eliminare definitivamente il report "${name}"? Questa azione rimuoverà le relative transazioni dal portafoglio.`)) {
      return;
    }

    try {
      const response = await fetch(`${getBackendUrl()}/api/reports/${id}`, {
        method: 'DELETE',
        headers: {
          'x-user-email': currentUser.email
        }
      });

      if (!response.ok) {
        throw new Error('Impossibile eliminare il report.');
      }

      await fetchSavedReports();
      
      // Se il report correntemente visualizzato è quello eliminato, puliamo la visualizzazione
      if (fileName === name) {
        setFileName('');
        setTrades([]);
      }

      // Notifica refresh
      if (onReportUploaded) {
        onReportUploaded(0, '');
      }
    } catch (err) {
      console.error('Error deleting report:', err);
      alert('Errore durante l\'eliminazione: ' + err.message);
    }
  };

  const handleClearAllReports = async () => {
    if (!currentUser) return;
    if (!window.confirm(`ATTENZIONE: Sei sicuro di voler cancellare TUTTI i report manuali? Questa azione rimuoverà tutti i trade caricati a mano dal database. I dati live di MT5 non verranno toccati.`)) {
      return;
    }

    try {
      const response = await fetch(`${getBackendUrl()}/api/reports/clear-all`, {
        method: 'POST',
        headers: {
          'x-user-email': currentUser.email
        }
      });

      if (!response.ok) {
        throw new Error('Impossibile rimuovere tutti i report.');
      }

      await fetchSavedReports();
      setFileName('');
      setTrades([]);

      // Notifica refresh
      if (onReportUploaded) {
        onReportUploaded(0, '');
      }
    } catch (err) {
      console.error('Error clearing all reports:', err);
      alert('Errore durante la rimozione totale dei report: ' + err.message);
    }
  };

  // Parse Uploaded HTML / CSV File
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Inibisci l'upload se abbiamo già 10 report
    if (savedReports.length >= 10) {
      alert('Limite massimo di 10 report raggiunto. Si prega di liberare spazio eliminando i report obsoleti prima di effettuarne uno nuovo.');
      e.target.value = null; // reset input
      return;
    }

    setFileName(file.name);
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      try {
        let parsedTrades = [];
        if (file.name.endsWith('.csv')) {
          parsedTrades = parseCSVReport(text);
        } else {
          parsedTrades = parseHTMLReport(text);
        }
        
        if (parsedTrades.length === 0) {
          alert('Nessuna operazione chiusa trovata nel report. Assicurati che sia un report valido esportato da MT4 o MT5.');
        } else {
          setTrades(parsedTrades);
          
          // Auto-compile by uploading parsed trades to the reports store
          const uploadSuccess = await uploadTradesToBackend(parsedTrades, file.name);

          if (uploadSuccess && onReportUploaded) {
            // Notifica App.jsx che c'è un nuovo report caricato → trigger ricalcolo Gestione Risk
            onReportUploaded(parsedTrades.length, file.name);
          }
          
          // Auto-select filters to empty initially
          setDraftMagicFilter('');
          setDraftMagicMin('');
          setDraftMagicMax('');
          setDraftSelectedComments([]);
          setDraftSymbolFilter('');

          setAppliedMagicFilter('');
          setAppliedMagicMin('');
          setAppliedMagicMax('');
          setAppliedSelectedComments([]);
          setAppliedSymbolFilter('');
        }
      } catch (err) {
        console.error(err);
        alert('Errore durante la lettura del file. Verifica che il formato sia corretto.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  // Live Sync with MT5 via Express backend
  const handleLiveSync = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${getBackendUrl()}/api/mt5-deals`, {
        headers: { 'x-user-email': currentUser?.email || '' }
      });
      if (!response.ok) {
        throw new Error('Impossibile connettersi al server per recuperare i dati live.');
      }
      
      const deals = await response.json();
      if (!Array.isArray(deals) || deals.length === 0) {
        alert('Nessun dato live trovato. Assicurati che l\'Expert Advisor "MT5HistorySender" sia attivo nel terminale MT5 in locale.');
        setLoading(false);
        return;
      }
      
      const parsedTrades = deals.map(d => {
        let comment = cleanCommentText(d.comment || '');
        const magicMatch = (d.magic || '').toString().match(/\d+/) || (comment || '').match(/\d+/);
        let magic = magicMatch ? magicMatch[0] : 'N/A';
        if (d.magic && d.magic !== 'N/A' && d.magic !== '0') {
          magic = d.magic.toString();
        }
        
        return {
          ticket: d.ticket || Math.random().toString(),
          openTime: '',
          closeTime: d.time || '',
          type: d.type || 'buy',
          lots: parseFloat(d.volume) || 0,
          symbol: normaliseSymbol(d.symbol || ''),
          profit: parseFloat(d.profit) || 0,
          comment: comment,
          magic: magic,
          source: 'mt5_live'
        };
      });
      
      parsedTrades.sort((a, b) => {
        const timeA = new Date(a.closeTime.replace(/\./g, '/')).getTime() || 0;
        const timeB = new Date(b.closeTime.replace(/\./g, '/')).getTime() || 0;
        return timeA - timeB;
      });

      setTrades(parsedTrades);
      setFileName('Connessione Live MT5 Attiva');

      // Notifica App.jsx della sincronizzazione live
      if (onReportUploaded) {
        onReportUploaded(parsedTrades.length, 'Sincronizzazione Live MT5');
      }
      
      setDraftMagicFilter('');
      setDraftMagicMin('');
      setDraftMagicMax('');
      setDraftSelectedComments([]);
      setDraftSymbolFilter('');
      setAppliedMagicFilter('');
      setAppliedMagicMin('');
      setAppliedMagicMax('');
      setAppliedSelectedComments([]);
      setAppliedSymbolFilter('');
      
    } catch (err) {
      console.error(err);
      alert('Errore durante la sincronizzazione live: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper to extract numeric values from a string
  const cleanNumber = (val) => {
    if (!val) return 0;
    // remove spaces, currency symbols, and convert comma to dot
    const clean = val.replace(/\s/g, '').replace(/[^0-9.-]/g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  };

  // HTML Parser (MT4 / MT5 statements)
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

      // 0. Detect Section Headers
      const headerCell = row.querySelector('th, td[colspan]');
      if (headerCell) {
        const text = headerCell.textContent.trim().toLowerCase();
        if (text.includes('open positions') || text.includes('posizioni aperte')) {
          currentSection = 'open_positions';
          continue;
        } else if (text.includes('positions') || text.includes('posizioni')) {
          currentSection = 'positions';
          positionsColMap = {};
          continue;
        } else if (text.includes('deals') || text.includes('operazioni')) {
          currentSection = 'deals';
          dealsColMap = {};
          continue;
        } else if (text.includes('orders') || text.includes('ordini') || text.includes('working orders')) {
          currentSection = 'orders';
          continue;
        }
      }

      // Check if this is a header row (defines column names)
      const cellsLower = cells.map(c => c.toLowerCase());
      const isHeaderRow = cellsLower.includes('time') || cellsLower.includes('tempo') || cellsLower.includes('orario');
      const isProfitHeader = cellsLower.includes('profit') || cellsLower.includes('profitto') || cellsLower.includes('guadagno');
      if (isHeaderRow && isProfitHeader && cells.length >= 8) {
        const colMap = {};
        cellsLower.forEach((cell, idx) => {
          if (cell === 'time' || cell === 'tempo' || cell === 'orario' || cell === 'data' || cell === 'ora' || cell === 'data/ora') {
            if (colMap['open_time'] === undefined) {
              colMap['open_time'] = idx;
            } else {
              colMap['close_time'] = idx;
            }
          } else if (cell === 'position' || cell === 'posizione' || cell === 'ticket' || cell === 'deal' || cell === 'operazione') {
            colMap['ticket'] = idx;
          } else if (cell === 'symbol' || cell === 'simbolo') {
            colMap['symbol'] = idx;
          } else if (cell === 'type' || cell === 'tipo') {
            colMap['type'] = idx;
          } else if (cell === 'volume' || cell === 'volumi' || cell === 'size') {
            colMap['volume'] = idx;
          } else if (cell === 'direction' || cell === 'direzione') {
            colMap['direction'] = idx;
          } else if (cell === 'commission' || cell === 'commissione' || cell === 'commissioni') {
            colMap['commission'] = idx;
          } else if (cell === 'swap') {
            colMap['swap'] = idx;
          } else if (cell === 'profit' || cell === 'profitto' || cell === 'guadagno') {
            colMap['profit'] = idx;
          } else if (cell === 'comment' || cell === 'commento') {
            colMap['comment'] = idx;
          }
        });
        
        if (currentSection === 'positions') {
          positionsColMap = colMap;
        } else if (currentSection === 'deals') {
          dealsColMap = colMap;
        }
        continue;
      }

      const cell0 = cells[0] || '';
      const cell1 = cells[1] || '';
      const cell2 = cells[2]?.toLowerCase() || '';
      const cell3 = cells[3]?.toLowerCase() || '';
      const cell4 = cells[4]?.toLowerCase() || '';

      // 1. Detect MT4 Closed Trade
      if ((cell2 === 'buy' || cell2 === 'sell') && cells.length >= 13 && cells.length <= 16) {
        const ticket = cell0;
        const openTime = cell1;
        const type = cell2;
        const lots = parseFloat(cells[3]) || 0;
        const symbol = normaliseSymbol(cells[4] || '');
        const closeTime = cells[8] || '';
        
        let profitVal = 0;
        let comment = '';
        let magic = 'N/A';
        
        if (cells.length >= 15) {
          profitVal = cleanNumber(cells[cells.length - 2]);
          const rawComment = cells[cells.length - 1] || '';
          const magicMatch = rawComment.match(/\d{5,9}/) || rawComment.match(/\d+/);
          magic = magicMatch ? magicMatch[0] : 'N/A';
          comment = cleanCommentText(rawComment);
        } else {
          profitVal = cleanNumber(cells[cells.length - 1]);
          
          if (i + 1 < rows.length) {
            const nextRow = rows[i + 1];
            const nextCells = Array.from(nextRow.querySelectorAll('td')).map(c => c.textContent.trim());
            if (nextCells.length > 0 && nextCells.length < 10 && nextCells[0] === '') {
              const nonEmpty = nextCells.filter(c => c !== '');
              if (nonEmpty.length === 1) {
                const val = nonEmpty[0];
                if (/^\d+$/.test(val)) {
                  magic = val;
                } else {
                  comment = cleanCommentText(val);
                }
              } else if (nonEmpty.length >= 2) {
                magic = nonEmpty[0];
                comment = cleanCommentText(nonEmpty[1]);
              }
              i++;
            }
          }
        }
        
        if (closeTime && !isNaN(profitVal)) {
          extracted.push({
            ticket, openTime, closeTime, type, lots, symbol, profit: profitVal, comment, magic, source: 'mt4'
          });
        }
        continue;
      }
      
      // 2. Detect MT5 Deal Row
      let isDealsDataRow = false;
      let ticket = '';
      let openTime = '';
      let symbol = '';
      let type = '';
      let lots = 0;
      let closeTime = '';
      let profitVal = 0;
      let comment = '';
      let magic = 'N/A';

      if (currentSection === 'deals' && dealsColMap && Object.keys(dealsColMap).length > 0) {
        const ticketIdx = dealsColMap['ticket'];
        const typeIdx = dealsColMap['type'];
        const dirIdx = dealsColMap['direction'];
        
        if (ticketIdx !== undefined && typeIdx !== undefined && dirIdx !== undefined) {
          const rowType = cells[typeIdx]?.toLowerCase();
          const rowTicket = cells[ticketIdx];
          const rowDir = cells[dirIdx]?.toLowerCase();
          
          if ((rowType === 'buy' || rowType === 'sell') && (rowDir === 'out' || rowDir === 'in/out') && /^\d+$/.test(rowTicket)) {
            isDealsDataRow = true;
            ticket = rowTicket;
            closeTime = cells[dealsColMap['open_time']] || ''; 
            symbol = normaliseSymbol(cells[dealsColMap['symbol']] || '');
            type = rowType;
            lots = parseFloat(cells[dealsColMap['volume']]) || 0;
            profitVal = cleanNumber(cells[dealsColMap['profit']]);
            
            const commentIdx = dealsColMap['comment'];
            if (commentIdx !== undefined) {
              comment = cleanCommentText(cells[commentIdx]);
            }
          }
        }
      }

      if (!isDealsDataRow && currentSection === 'deals') {
        const cell0 = cells[0] || '';
        const cell1 = cells[1] || '';
        const cell3 = cells[3]?.toLowerCase() || '';
        const cell4 = cells[4]?.toLowerCase() || '';
        
        if ((cell3 === 'buy' || cell3 === 'sell') && (cell4 === 'out' || cell4 === 'in/out') && /^\d+$/.test(cell1) && /^\d{4}\.\d{2}\.\d{2}/.test(cell0)) {
          isDealsDataRow = true;
          ticket = cell1;
          closeTime = cell0;
          symbol = normaliseSymbol(cells[2] || '');
          type = cell3;
          lots = parseFloat(cells[5]) || 0;
          
          comment = cleanCommentText(cells[cells.length - 1]);
          if (cells.length === 15) {
            profitVal = cleanNumber(cells[12]);
          } else if (cells.length === 14) {
            profitVal = cleanNumber(cells[11]);
          } else if (cells.length === 13) {
            profitVal = cleanNumber(cells[10]);
          } else if (cells.length === 12) {
            profitVal = cleanNumber(cells[10]);
          } else {
            profitVal = cleanNumber(cells[cells.length - 3] || cells[cells.length - 2]);
          }
        }
      }

      if (isDealsDataRow && closeTime && !isNaN(profitVal) && profitVal !== 0) {
        const magicMatch = comment.match(/\d{5,9}/) || comment.match(/\d+/);
        magic = magicMatch ? magicMatch[0] : 'N/A';
        extracted.push({
          ticket, openTime: '', closeTime, type, lots, symbol, profit: profitVal, comment, magic, source: 'mt5_deal'
        });
        continue;
      }

      // 3. Detect MT5 Position Row
      let isPositionsDataRow = false;
      
      if (currentSection === 'positions' && positionsColMap && Object.keys(positionsColMap).length > 0) {
        const ticketIdx = positionsColMap['ticket'];
        const typeIdx = positionsColMap['type'];
        const openTimeIdx = positionsColMap['open_time'];
        
        if (ticketIdx !== undefined && typeIdx !== undefined) {
          const rowType = cells[typeIdx]?.toLowerCase();
          const rowTicket = cells[ticketIdx];
          if ((rowType === 'buy' || rowType === 'sell') && /^\d+$/.test(rowTicket)) {
            isPositionsDataRow = true;
            ticket = rowTicket;
            openTime = cells[openTimeIdx] || '';
            symbol = normaliseSymbol(cells[positionsColMap['symbol']] || '');
            type = rowType;
            
            const tds = Array.from(row.querySelectorAll('td'));
            let cellTexts = tds.map(td => td.textContent.trim());
            let hiddenIdx = tds.findIndex(td => td.classList.contains('hidden') || td.getAttribute('colspan') === '8');
            if (hiddenIdx !== -1) {
              comment = cleanCommentText(cellTexts[hiddenIdx]);
              cellTexts.splice(hiddenIdx, 1);
            }
            
            lots = parseFloat(cellTexts[positionsColMap['volume']]) || 0;
            closeTime = cellTexts[positionsColMap['close_time']] || '';
            profitVal = cleanNumber(cellTexts[positionsColMap['profit']]);
          }
        }
      }

      if (!isPositionsDataRow && (currentSection === 'positions' || currentSection === '')) {
        const cell0 = cells[0] || '';
        const cell1 = cells[1] || '';
        const cell3 = cells[3]?.toLowerCase() || '';
        
        if ((cell3 === 'buy' || cell3 === 'sell') && /^\d+$/.test(cell1) && /^\d{4}\.\d{2}\.\d{2}/.test(cell0)) {
          isPositionsDataRow = true;
          ticket = cell1;
          openTime = cell0;
          symbol = normaliseSymbol(cells[2] || '');
          type = cell3;
          
          const tds = Array.from(row.querySelectorAll('td'));
          let cellTexts = tds.map(td => td.textContent.trim());
          let hiddenIdx = tds.findIndex(td => td.classList.contains('hidden') || td.getAttribute('colspan') === '8');
          
          if (hiddenIdx !== -1) {
            comment = cleanCommentText(cellTexts[hiddenIdx]);
            lots = parseFloat(cellTexts[hiddenIdx + 1]) || 0;
            closeTime = cellTexts[hiddenIdx + 5] || '';
            profitVal = cleanNumber(cellTexts[hiddenIdx + 9]);
          } else {
            lots = parseFloat(cells[4]) || 0;
            closeTime = cells[8] || '';
            profitVal = cleanNumber(cells[12]);
          }
        }
      }

      if (isPositionsDataRow && closeTime && !isNaN(profitVal)) {
        const magicMatch = comment.match(/\d{5,9}/) || comment.match(/\d+/);
        magic = magicMatch ? magicMatch[0] : 'N/A';
        extracted.push({
          ticket, openTime, closeTime, type, lots, symbol, profit: profitVal, comment, magic, source: 'mt5_position'
        });
      }
    }

    // Deduplicate MT5 trades if we have both Deals and Positions (prefer Deals since they contain comments)
    const hasDeals = extracted.some(t => t.source === 'mt5_deal');
    const finalTrades = hasDeals ? extracted.filter(t => t.source !== 'mt5_position') : extracted;

    return finalTrades.sort((a, b) => {
      const timeA = new Date(a.closeTime.replace(/\./g, '/')).getTime() || 0;
      const timeB = new Date(b.closeTime.replace(/\./g, '/')).getTime() || 0;
      return timeA - timeB;
    });
  };

  // CSV Parser
  const parseCSVReport = (csvText) => {
    const lines = csvText.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    // Parse header to find index columns
    const headers = lines[0].split(/[;,]/).map(h => h.replace(/["']/g, '').trim().toLowerCase());
    
    const idxTicket = headers.findIndex(h => h.includes('ticket') || h.includes('id') || h.includes('deal'));
    const idxSymbol = headers.findIndex(h => h.includes('symbol') || h.includes('item') || h.includes('mercato'));
    const idxType = headers.findIndex(h => h.includes('type') || h.includes('tipo'));
    const idxLots = headers.findIndex(h => h.includes('size') || h.includes('volume') || h.includes('lots'));
    const idxCloseTime = headers.findIndex(h => h.includes('close time') || h.includes('time') || h.includes('orario'));
    const idxProfit = headers.findIndex(h => h.includes('profit') || h.includes('guadagno') || h.includes('pnl'));
    const idxComment = headers.findIndex(h => h.includes('comment') || h.includes('note'));
    const idxMagic = headers.findIndex(h => h.includes('magic'));

    const extracted = [];
    
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(/[;,]/).map(c => c.replace(/["']/g, '').trim());
      if (cells.length < 5) continue;
      
      const type = idxType !== -1 ? cells[idxType]?.toLowerCase() : '';
      const profitVal = idxProfit !== -1 ? cleanNumber(cells[idxProfit]) : 0;
      const closeTime = idxCloseTime !== -1 ? cells[idxCloseTime] : '';
      
      if ((type.includes('buy') || type.includes('sell')) && closeTime) {
        const rawComment = idxComment !== -1 ? cells[idxComment] : '';
        let magic = 'N/A';
        if (idxMagic !== -1 && cells[idxMagic]) {
          magic = cells[idxMagic];
        } else {
          const magicMatch = rawComment.match(/\d{5,9}/) || rawComment.match(/\d+/);
          magic = magicMatch ? magicMatch[0] : 'N/A';
        }
        const comment = cleanCommentText(rawComment);

        extracted.push({
          ticket: idxTicket !== -1 ? cells[idxTicket] : Math.random().toString(),
          openTime: '',
          closeTime,
          type: type.includes('buy') ? 'buy' : 'sell',
          lots: idxLots !== -1 ? parseFloat(cells[idxLots]) || 0 : 0,
          symbol: idxSymbol !== -1 ? normaliseSymbol(cells[idxSymbol]) : '',
          profit: profitVal,
          comment,
          magic
        });
      }
    }

    return extracted.sort((a, b) => {
      const timeA = new Date(a.closeTime.replace(/\./g, '/')).getTime() || 0;
      const timeB = new Date(b.closeTime.replace(/\./g, '/')).getTime() || 0;
      return timeA - timeB;
    });
  };

  // Get dynamic unique filters list from loaded dataset with cross-filtering support
  const filterOptions = useMemo(() => {
    // 1. Compute magics list: filtered by draftSelectedComments and draftSymbolFilter
    const magics = new Set();
    trades.forEach(t => {
      const matchComment = draftSelectedComments.length > 0 ? draftSelectedComments.includes(t.comment) : true;
      const matchSymbol = draftSymbolFilter ? t.symbol === draftSymbolFilter : true;
      if (matchComment && matchSymbol) {
        if (t.magic && t.magic !== 'N/A') magics.add(t.magic);
      }
    });

    // 2. Compute comments list: filtered by draftMagicFilter/Min/Max and draftSymbolFilter
    const comments = new Set();
    trades.forEach(t => {
      let matchMagic = true;
      if (draftMagicFilter) {
        matchMagic = t.magic === draftMagicFilter;
      } else if (draftMagicMin || draftMagicMax) {
        const numMagic = parseInt(t.magic, 10);
        if (isNaN(numMagic)) {
          matchMagic = false;
        } else {
          const min = draftMagicMin !== '' ? parseInt(draftMagicMin, 10) : -Infinity;
          const max = draftMagicMax !== '' ? parseInt(draftMagicMax, 10) : Infinity;
          matchMagic = numMagic >= min && numMagic <= max;
        }
      }
      const matchSymbol = draftSymbolFilter ? t.symbol === draftSymbolFilter : true;
      
      if (matchMagic && matchSymbol) {
        if (t.comment) comments.add(t.comment);
      }
    });

    // 3. Compute symbols list: filtered by draftMagicFilter/Min/Max and draftSelectedComments
    const symbols = new Set();
    trades.forEach(t => {
      let matchMagic = true;
      if (draftMagicFilter) {
        matchMagic = t.magic === draftMagicFilter;
      } else if (draftMagicMin || draftMagicMax) {
        const numMagic = parseInt(t.magic, 10);
        if (isNaN(numMagic)) {
          matchMagic = false;
        } else {
          const min = draftMagicMin !== '' ? parseInt(draftMagicMin, 10) : -Infinity;
          const max = draftMagicMax !== '' ? parseInt(draftMagicMax, 10) : Infinity;
          matchMagic = numMagic >= min && numMagic <= max;
        }
      }
      const matchComment = draftSelectedComments.length > 0 ? draftSelectedComments.includes(t.comment) : true;
      
      if (matchMagic && matchComment) {
        if (t.symbol) symbols.add(t.symbol);
      }
    });

    return {
      magics: Array.from(magics).sort(),
      comments: Array.from(comments).sort(),
      symbols: Array.from(symbols).sort()
    };
  }, [trades, draftMagicFilter, draftMagicMin, draftMagicMax, draftSelectedComments, draftSymbolFilter]);

  // Sync selected comments with currently available options
  React.useEffect(() => {
    if (draftSelectedComments.length > 0) {
      const validComments = new Set(filterOptions.comments);
      const cleaned = draftSelectedComments.filter(c => validComments.has(c));
      if (cleaned.length !== draftSelectedComments.length) {
        setDraftSelectedComments(cleaned);
      }
    }
  }, [filterOptions.comments]);

  // Filtered trades list (calculated only when applied filters change)
  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      // Magic filter: specific single selection OR min-max range
      let matchMagic = true;
      if (appliedMagicFilter) {
        matchMagic = t.magic === appliedMagicFilter;
      } else if (appliedMagicMin || appliedMagicMax) {
        const numMagic = parseInt(t.magic, 10);
        if (isNaN(numMagic)) {
          matchMagic = false; // Non-numeric or N/A doesn't fit range
        } else {
          const min = appliedMagicMin !== '' ? parseInt(appliedMagicMin, 10) : -Infinity;
          const max = appliedMagicMax !== '' ? parseInt(appliedMagicMax, 10) : Infinity;
          matchMagic = numMagic >= min && numMagic <= max;
        }
      }

      // Comment filter: check if appliedSelectedComments contains comment (empty means all match)
      const matchComment = appliedSelectedComments.length > 0 ? appliedSelectedComments.includes(t.comment) : true;

      // Symbol filter
      const matchSymbol = appliedSymbolFilter ? t.symbol === appliedSymbolFilter : true;

      return matchMagic && matchComment && matchSymbol;
    });
  }, [trades, appliedMagicFilter, appliedMagicMin, appliedMagicMax, appliedSelectedComments, appliedSymbolFilter]);

  // Calculate statistics for filtered trades
  const stats = useMemo(() => {
    if (filteredTrades.length === 0) return null;
    
    let netProfit = 0;
    let maxDrawdown = 0;
    let maxPeak = 0;
    let runningEquity = 0;
    let winCount = 0;
    let buyCount = 0;
    let sellCount = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    
    const equityData = filteredTrades.map((t, idx) => {
      netProfit += t.profit;
      runningEquity = netProfit;
      
      if (t.profit > 0) {
        winCount++;
        grossProfit += t.profit;
      } else {
        grossLoss += Math.abs(t.profit);
      }
      
      if (t.type === 'buy') buyCount++;
      if (t.type === 'sell') sellCount++;
      
      // Drawdown calculation
      if (runningEquity > maxPeak) {
        maxPeak = runningEquity;
      }
      const dd = maxPeak - runningEquity;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }
      
      return {
        tradeIndex: idx + 1,
        date: t.closeTime.split(' ')[0], // only date
        symbol: t.symbol,
        profit: t.profit,
        equity: parseFloat(runningEquity.toFixed(2))
      };
    });

    const winRate = (winCount / filteredTrades.length) * 100;
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : grossProfit;
    const recoveryFactor = maxDrawdown > 0 ? (netProfit / maxDrawdown) : netProfit;

    return {
      netProfit: parseFloat(netProfit.toFixed(2)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      recoveryFactor: parseFloat(recoveryFactor.toFixed(2)),
      winRate: parseFloat(winRate.toFixed(2)),
      totalTrades: filteredTrades.length,
      buyCount,
      sellCount,
      equityData
    };
  }, [filteredTrades]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Report loading choices grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Card 1: Caricamento File */}
        <div className="card" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          border: savedReports.length >= 10 ? '2px dashed rgba(244, 67, 54, 0.3)' : '2px dashed var(--border-color)',
          borderRadius: '16px',
          textAlign: 'center',
          cursor: savedReports.length >= 10 ? 'not-allowed' : 'pointer',
          background: savedReports.length >= 10 ? 'rgba(244, 67, 54, 0.02)' : 'var(--bg-surface)',
          minHeight: '180px',
          transition: 'all 0.2s',
          opacity: savedReports.length >= 10 ? 0.85 : 1
        }}>
          <input 
            type="file" 
            accept=".html,.htm,.csv" 
            onChange={handleFileUpload} 
            style={{ display: 'none' }} 
            id="report-uploader" 
            disabled={savedReports.length >= 10}
          />
          <label 
            htmlFor={savedReports.length >= 10 ? "" : "report-uploader"} 
            style={{ 
              cursor: savedReports.length >= 10 ? 'not-allowed' : 'pointer', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: '0.75rem', 
              width: '100%' 
            }}
          >
            <Upload size={32} color={savedReports.length >= 10 ? 'rgba(244, 67, 54, 0.6)' : 'var(--accent-gold)'} />
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: savedReports.length >= 10 ? '#ff5252' : 'var(--text-bright)' }}>
                {savedReports.length >= 10 ? 'Limite Report Raggiunto' : 'Carica Report MT4 o MT5'}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {savedReports.length >= 10 ? 'Spazio esaurito. Elimina un vecchio report per caricare.' : 'Trascina o seleziona un file HTML o CSV'}
              </p>
            </div>
            {fileName && !fileName.includes('Live') && (
              <span style={{ 
                fontSize: '0.8rem', 
                color: 'var(--accent-gold)', 
                fontWeight: 600, 
                padding: '0.2rem 0.6rem', 
                background: 'rgba(226, 194, 125, 0.1)', 
                borderRadius: '6px',
                border: '1px solid rgba(226, 194, 125, 0.2)'
              }}>
                📁 {fileName}
              </span>
            )}
          </label>
          
          {/* UI Warning message (exact phrase required by user) */}
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              marginTop: '1.25rem',
              padding: '0.75rem 1rem',
              background: 'rgba(244, 67, 54, 0.07)',
              border: '1px solid rgba(244, 67, 54, 0.2)',
              borderRadius: '10px',
              fontSize: '0.73rem',
              color: '#ff5252',
              fontWeight: 500,
              textAlign: 'left',
              maxWidth: '420px',
              lineHeight: '1.4',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              cursor: 'default',
              boxShadow: '0 2px 10px rgba(244, 67, 54, 0.05)'
            }}
          >
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '0.1rem', color: '#ff5252' }} />
            <span>
              Attenzione: ogni volta che si desidera aggiornare un report, si devono cancellare i doppioni (le versioni precedenti) per non creare sovrapposizioni dei dati.
            </span>
          </div>

          {/* Limit Alert */}
          {savedReports.length >= 10 && (
            <div 
              onClick={(e) => e.stopPropagation()}
              style={{
                marginTop: '0.75rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(244, 67, 54, 0.15)',
                border: '1px solid #f44336',
                borderRadius: '8px',
                fontSize: '0.72rem',
                color: '#ff5252',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: 'default'
              }}
            >
              ⚠️ Spazio esaurito (10/10 report). Elimina i report precedenti per caricare.
            </div>
          )}
        </div>

        {/* Card 2: Sincronizzazione Live */}
        <div className="card" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          border: '2px solid rgba(226, 194, 125, 0.15)',
          borderRadius: '16px',
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(226,194,125,0.03) 0%, rgba(21,24,37,0.8) 100%)',
          minHeight: '180px'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
            <Activity size={32} color="var(--color-ok)" style={{ filter: 'drop-shadow(0 0 8px rgba(76, 175, 80, 0.4))' }} />
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
                Sincronizzazione Live MT5 (macOS Bridge)
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem', maxWidth: '280px' }}>
                Aggiorna le statistiche in tempo reale ricevendo i dati dall'Expert Advisor locale.
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.25rem' }}>
              <button 
                onClick={handleLiveSync}
                className="btn btn-primary"
                style={{ 
                  padding: '0.5rem 1rem', 
                  fontSize: '0.8rem', 
                  background: 'var(--color-ok)', 
                  borderColor: 'var(--color-ok)',
                  boxShadow: '0 0 15px rgba(76, 175, 80, 0.2)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <Activity size={14} />
                Connetti e Sincronizza
              </button>
              
              <a 
                href={`${getBackendUrl()}/api/mt5-ea/download`}
                download
                className="btn btn-secondary"
                style={{ 
                  padding: '0.5rem 1rem', 
                  fontSize: '0.8rem', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  textDecoration: 'none'
                }}
              >
                <Download size={14} />
                Scarica EA (.mq5)
              </a>

              <button 
                onClick={() => setShowInstructions(!showInstructions)}
                className="btn btn-secondary"
                style={{ 
                  padding: '0.5rem 1rem', 
                  fontSize: '0.8rem', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  borderColor: showInstructions ? 'var(--accent-gold)' : 'var(--border-color)'
                }}
              >
                <BookOpen size={14} />
                {showInstructions ? 'Nascondi Guida' : 'Come installare?'}
                {showInstructions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {fileName && fileName.includes('Live') && (
              <span style={{ 
                fontSize: '0.8rem', 
                color: 'var(--color-ok)', 
                fontWeight: 600, 
                padding: '0.2rem 0.6rem', 
                background: 'rgba(76, 175, 80, 0.1)', 
                borderRadius: '6px',
                border: '1px solid rgba(76, 175, 80, 0.2)',
                marginTop: '0.25rem'
              }}>
                🟢 Live MT5 Connesso
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sezione Report Caricati Manualmente */}
      <div className="card" style={{
        padding: '1.5rem',
        borderRadius: '16px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Folder size={18} color="var(--accent-gold)" />
              Archivio Report Caricati Manualmente
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Memoria permanente dei report importati. Limite massimo: 10 report contemporanei.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ 
              fontSize: '0.75rem', 
              fontWeight: 600, 
              padding: '0.3rem 0.75rem', 
              borderRadius: '20px', 
              background: savedReports.length >= 10 ? 'rgba(244, 67, 54, 0.15)' : 'rgba(226, 194, 125, 0.1)',
              border: savedReports.length >= 10 ? '1px solid rgba(244, 67, 54, 0.3)' : '1px solid rgba(226, 194, 125, 0.2)',
              color: savedReports.length >= 10 ? '#ff5252' : 'var(--accent-gold)'
            }}>
              Slot Utilizzati: {savedReports.length} / 10
            </span>
            {savedReports.length > 0 && (
              <button
                onClick={handleClearAllReports}
                className="btn"
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.75rem',
                  background: 'rgba(244, 67, 54, 0.1)',
                  border: '1px solid rgba(244, 67, 54, 0.25)',
                  color: '#ff5252',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  transition: 'all 0.2s'
                }}
              >
                <Trash2 size={13} />
                Svuota Tutto
              </button>
            )}
          </div>
        </div>

        {savedReports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <Folder size={32} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: '0.8rem' }}>Nessun report caricato manualmente in memoria.</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {savedReports.map((report) => (
              <div 
                key={report.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.01)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '0.9rem 1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'transform 0.2s, background 0.2s',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflow: 'hidden', marginRight: '0.5rem' }}>
                  <span 
                    style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-bright)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}
                    title={report.name}
                  >
                    {report.name}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Operazioni: <strong style={{ color: 'var(--accent-gold)' }}>{report.tradeCount}</strong>
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>
                    {new Date(report.uploadedAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteReport(report.id, report.name)}
                  style={{
                    background: 'rgba(244, 67, 54, 0.08)',
                    border: '1px solid rgba(244, 67, 54, 0.2)',
                    borderRadius: '8px',
                    padding: '0.45rem',
                    cursor: 'pointer',
                    color: '#ff5252',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.2s'
                  }}
                  title="Elimina questo report"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>


      {/* MT5 Installation Guide Accordion Panel */}
      {showInstructions && (
        <div className="card" style={{
          padding: '1.5rem 2rem',
          border: '1px solid rgba(226, 194, 125, 0.3)',
          borderRadius: '16px',
          background: 'linear-gradient(180deg, rgba(21, 24, 37, 0.95) 0%, rgba(15, 17, 26, 0.98) 100%)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          animation: 'fadeIn 0.3s ease-in-out',
          color: 'var(--text-bright)',
          marginTop: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
            <BookOpen size={24} color="var(--accent-gold)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.5px' }}>
              GUIDA DETTAGLIATA: Installazione & Configurazione in MT5
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontSize: '0.85rem', lineHeight: '1.5' }}>
            
            {/* Step 1 */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{
                minWidth: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'rgba(226, 194, 125, 0.15)',
                border: '1px solid var(--accent-gold)',
                color: 'var(--accent-gold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '0.8rem'
              }}>1</div>
              <div>
                <strong style={{ color: 'var(--accent-gold)', display: 'block', marginBottom: '0.25rem' }}>1. Scarica l'Expert Advisor</strong>
                <span>Clicca sul pulsante <strong style={{ color: 'var(--text-bright)' }}>"Scarica EA (.mq5)"</strong> qui sopra per scaricare il file <code>MT5HistorySender.mq5</code>.</span>
              </div>
            </div>

            {/* Step 2 */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{
                minWidth: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'rgba(226, 194, 125, 0.15)',
                border: '1px solid var(--accent-gold)',
                color: 'var(--accent-gold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '0.8rem'
              }}>2</div>
              <div>
                <strong style={{ color: 'var(--accent-gold)', display: 'block', marginBottom: '0.25rem' }}>2. Copia il file in MetaTrader 5</strong>
                <span>Apri il tuo terminale <strong style={{ color: 'var(--text-bright)' }}>MetaTrader 5</strong>, clicca sul menu <strong style={{ color: 'var(--text-bright)' }}>File</strong> in alto e seleziona <strong style={{ color: 'var(--text-bright)' }}>Apri scheda dati</strong> (o <em>Open Data Folder</em>). Nella finestra del Finder/Esplora Risorse, naviga nella cartella <code>MQL5</code> &rarr; <code>Experts</code> e incolla qui il file <code>MT5HistorySender.mq5</code>.</span>
              </div>
            </div>

            {/* Step 3 */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{
                minWidth: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'rgba(226, 194, 125, 0.15)',
                border: '1px solid var(--accent-gold)',
                color: 'var(--accent-gold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '0.8rem'
              }}>3</div>
              <div style={{ width: '100%' }}>
                <strong style={{ color: 'var(--accent-gold)', display: 'block', marginBottom: '0.25rem' }}>3. Configura le Connessioni di Rete (WebRequest)</strong>
                <span>Per consentire a MetaTrader 5 di trasmettere i dati della cronologia alla dashboard, devi abilitare i permessi di rete:</span>
                <ul style={{ margin: '0.5rem 0 0.5rem 1.25rem', padding: 0, listStyleType: 'disc', color: 'var(--text-muted)' }}>
                  <li>Vai su <strong style={{ color: 'var(--text-bright)' }}>Strumenti &rarr; Opzioni</strong> (o premi <code>Ctrl+O</code>).</li>
                  <li>Seleziona la scheda <strong style={{ color: 'var(--text-bright)' }}>Consiglieri esperti</strong> (o <em>Expert Advisors</em>).</li>
                  <li>Spunta la casella <strong style={{ color: 'var(--text-bright)' }}>"Consenti WebRequest per gli URL elencati:"</strong>.</li>
                  <li>Fai doppio clic sul pulsante <strong style={{ color: 'var(--text-bright)' }}>"+"</strong> o sulla riga vuota e inserisci esattamente questo URL:</li>
                </ul>
                
                {/* URL Copy box */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  color: 'var(--accent-gold)',
                  margin: '0.5rem 0',
                  maxWidth: '400px'
                }}>
                  <span>{getBackendUrl()}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(getBackendUrl());
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 2000);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: copiedUrl ? 'var(--color-ok)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
                    <span style={{ fontSize: '0.75rem' }}>{copiedUrl ? 'Copiato!' : 'Copia'}</span>
                  </button>
                </div>
                <span style={{ color: 'var(--text-muted)' }}>Spunta anche la casella <strong>"Consenti trading algoritmico"</strong> se non è già spuntata (necessaria affinché MT5 esegua l'Expert Advisor).</span>
              </div>
            </div>

            {/* Step 4 */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{
                minWidth: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'rgba(226, 194, 125, 0.15)',
                border: '1px solid var(--accent-gold)',
                color: 'var(--accent-gold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '0.8rem'
              }}>4</div>
              <div style={{ width: '100%' }}>
                <strong style={{ color: 'var(--accent-gold)', display: 'block', marginBottom: '0.25rem' }}>4. Avvia e Configura l'Expert Advisor sul Grafico</strong>
                <ul style={{ margin: '0.5rem 0 0.5rem 1.25rem', padding: 0, listStyleType: 'disc', color: 'var(--text-muted)' }}>
                  <li>Nel pannello <strong style={{ color: 'var(--text-bright)' }}>Navigatore</strong> a sinistra di MT5, fai clic destro su <strong style={{ color: 'var(--text-bright)' }}>Consiglieri esperti</strong> (Expert Advisors) e premi <strong style={{ color: 'var(--text-bright)' }}>Aggiorna</strong> (Refresh).</li>
                  <li>Trascina <code>MT5HistorySender</code> su un <strong style={{ color: 'var(--text-bright)' }}>qualsiasi grafico aperto</strong> (es. EURUSD, qualsiasi timeframe).</li>
                  <li>Nella finestra popup delle impostazioni dell'EA, seleziona la scheda <strong style={{ color: 'var(--text-bright)' }}>Comuni</strong> (Common) e spunta la casella <strong style={{ color: 'var(--text-bright)' }}>"Consenti trading algoritmico"</strong> (Allow Algorithmic Trading).</li>
                  <li>Seleziona la scheda <strong style={{ color: 'var(--text-bright)' }}>Valori di input</strong> (Inputs) e verifica che il parametro <strong style={{ color: 'var(--text-bright)' }}>InpServerURL</strong> corrisponda esattamente all'URL del tuo endpoint:</li>
                </ul>

                {/* Endpoint URL Copy box */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  color: 'var(--accent-gold)',
                  margin: '0.5rem 0',
                  maxWidth: '450px'
                }}>
                  <span>{getBackendUrl()}/api/mt5-deals</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${getBackendUrl()}/api/mt5-deals`);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 2000);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: copiedUrl ? 'var(--color-ok)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
                    <span style={{ fontSize: '0.75rem' }}>{copiedUrl ? 'Copiato!' : 'Copia'}</span>
                  </button>
                </div>

                <ul style={{ margin: '0.5rem 0 0.5rem 1.25rem', padding: 0, listStyleType: 'disc', color: 'var(--text-muted)' }}>
                  <li>Clicca su <strong style={{ color: 'var(--text-bright)' }}>OK</strong>.</li>
                  <li><strong style={{ color: 'var(--color-warn)' }}>IMPORTANTE</strong>: Assicurati che il pulsante globale <strong style={{ color: 'var(--text-bright)' }}>"Trading algoritmico"</strong> (Algo Trading) nella barra degli strumenti in alto su MT5 sia **attivo** (deve mostrare un'icona **verde di play**, non rossa). Se è spento, l'EA rimarrà inattivo.</li>
                  <li>A conferma dell'avvio corretto, l'icona con il cappello in alto a destra sul grafico diventerà **blu/attiva** (se rimane grigia o con una x rossa, il trading algoritmico globale è disattivato o non hai dato i permessi nella scheda Comuni).</li>
                </ul>
              </div>
            </div>

            {/* Step 5 */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{
                minWidth: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'rgba(226, 194, 125, 0.15)',
                border: '1px solid var(--accent-gold)',
                color: 'var(--accent-gold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '0.8rem'
              }}>5</div>
              <div>
                <strong style={{ color: 'var(--accent-gold)', display: 'block', marginBottom: '0.25rem' }}>5. Sincronizzazione ed Equity Curve</strong>
                <span>Una volta avviato, l'EA monitora lo storico delle transazioni e invia i dati al server locale ad ogni nuova operazione chiusa. Fai clic su <strong style={{ color: 'var(--color-ok)' }}>"Connetti e Sincronizza"</strong> nella sezione soprastante per aggiornare istantaneamente tutti i grafici e le metriche di analisi della dashboard con le transazioni reali del tuo conto.</span>
              </div>
            </div>

          </div>
        </div>
      )}

      {loading && (
        <div className="state-container">
          <div className="loading-spinner"></div>
          <p>Analisi ed estrazione delle operazioni in corso...</p>
        </div>
      )}

      {/* If trades loaded, show filters and charts */}
      {trades.length > 0 && !loading && (
        <>
          {/* Filters Bar */}
          <div className="card" style={{ padding: '1rem 1.5rem', position: 'relative', zIndex: 100 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-gold)', fontWeight: 600, fontSize: '0.85rem' }}>
                <Filter size={16} />
                <span>FILTRI DI ANALISI:</span>
              </div>

              {/* Magic single selection filter */}
              <select 
                value={draftMagicFilter} 
                onChange={(e) => {
                  setDraftMagicFilter(e.target.value);
                  setDraftMagicMin(''); // Clear range if single selected
                  setDraftMagicMax('');
                }} 
                className="select-input"
              >
                <option value="">Magic Singolo</option>
                {filterOptions.magics.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              {/* Magic range fields: "Da" to "A" */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Range Magic: da</span>
                <input 
                  type="number" 
                  placeholder="Min" 
                  value={draftMagicMin} 
                  onChange={(e) => {
                    setDraftMagicMin(e.target.value);
                    setDraftMagicFilter(''); // Clear single magic selection
                  }} 
                  className="search-input"
                  style={{ width: '80px', padding: '0.45rem 0.5rem', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>a</span>
                <input 
                  type="number" 
                  placeholder="Max" 
                  value={draftMagicMax} 
                  onChange={(e) => {
                    setDraftMagicMax(e.target.value);
                    setDraftMagicFilter(''); // Clear single magic selection
                  }} 
                  className="search-input"
                  style={{ width: '80px', padding: '0.45rem 0.5rem', textAlign: 'center' }}
                />
              </div>

              {/* Custom multi-select Comments Dropdown */}
              <div className="multi-select-container" style={{ position: 'relative' }}>
                <button 
                  type="button"
                  onClick={() => setIsCommentDropdownOpen(!isCommentDropdownOpen)}
                  className="select-input"
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    gap: '0.5rem',
                    minWidth: '200px',
                    textAlign: 'left'
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                    {draftSelectedComments.length === 0 
                      ? 'Tutti i Commenti' 
                      : draftSelectedComments.length === 1 
                      ? draftSelectedComments[0] 
                      : `${draftSelectedComments.length} Commenti Selezionati`}
                  </span>
                  <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>▼</span>
                </button>
                
                {isCommentDropdownOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '0.25rem',
                    width: '320px',
                    background: '#151825',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5), var(--shadow-glow)',
                    zIndex: 150, // Higher than card relative container
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}>
                    {/* Action links */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
                      <button 
                        type="button" 
                        onClick={() => setDraftSelectedComments([])}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Deseleziona Tutti
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setDraftSelectedComments([...filterOptions.comments])}
                        style={{ background: 'transparent', border: 'none', color: 'var(--accent-gold)', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Seleziona Tutti
                      </button>
                    </div>
                    
                    {/* List of comment checkboxes */}
                    <div style={{ 
                      maxHeight: '200px', 
                      overflowY: 'auto', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.35rem',
                      paddingRight: '0.25rem'
                    }}>
                      {filterOptions.comments.map(c => {
                        const isChecked = draftSelectedComments.includes(c);
                        return (
                          <label 
                            key={c} 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.5rem', 
                              fontSize: '0.8rem', 
                              cursor: 'pointer', 
                              color: isChecked ? 'var(--text-bright)' : 'var(--text-muted)',
                              padding: '0.25rem 0.4rem',
                              borderRadius: '6px',
                              background: isChecked ? 'rgba(255,255,255,0.03)' : 'transparent',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setDraftSelectedComments(draftSelectedComments.filter(item => item !== c));
                                } else {
                                  setDraftSelectedComments([...draftSelectedComments, c]);
                                }
                              }}
                              style={{ 
                                accentColor: 'var(--accent-gold)', 
                                width: '14px', 
                                height: '14px', 
                                cursor: 'pointer' 
                              }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Symbol filter */}
              <select 
                value={draftSymbolFilter} 
                onChange={(e) => setDraftSymbolFilter(e.target.value)} 
                className="select-input"
              >
                <option value="">Tutti i Simboli</option>
                {filterOptions.symbols.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {/* Action Buttons: Apply & Reset */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                <button 
                  onClick={handleApplyFilters}
                  className="btn btn-primary"
                  style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem' }}
                >
                  Applica Filtri
                </button>
                <button 
                  onClick={handleResetFilters}
                  className="btn btn-secondary"
                  style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem' }}
                >
                  Resetta Filtri
                </button>
              </div>
            </div>
          </div>

          {stats ? (
            <>
              {/* KPIs Panels */}
              <div className="dashboard-grid">
                {/* Net Profit */}
                <div className="card">
                  <div className="stat-label">
                    <TrendingUp size={16} color="var(--color-ok)" />
                    Profitto Netto
                  </div>
                  <div className="stat-value mono" style={{ color: stats.netProfit >= 0 ? 'var(--color-ok)' : 'var(--color-crit)' }}>
                    {stats.netProfit >= 0 ? '+' : ''}{stats.netProfit} €
                  </div>
                  <div className="stat-detail">Risultato netto delle operazioni</div>
                </div>

                {/* Max DD */}
                <div className="card">
                  <div className="stat-label">
                    <ShieldAlert size={16} color="var(--color-crit)" />
                    Max Drawdown (DD)
                  </div>
                  <div className="stat-value mono" style={{ color: 'var(--color-crit)' }}>
                    -{stats.maxDrawdown} €
                  </div>
                  <div className="stat-detail">Massima perdita registrata dal picco</div>
                </div>

                {/* Profit Factor */}
                <div className="card">
                  <div className="stat-label">
                    <Award size={16} color="var(--accent-gold)" />
                    Profit Factor
                  </div>
                  <div className="stat-value mono">
                    {stats.profitFactor}
                  </div>
                  <div className="stat-detail">Rapporto profitti lordi / perdite lorde</div>
                </div>

                {/* Recovery Factor */}
                <div className="card">
                  <div className="stat-label">
                    <Activity size={16} color="var(--accent-blue)" />
                    Recovery Factor (Return/DD)
                  </div>
                  <div className="stat-value mono">
                    {stats.recoveryFactor}
                  </div>
                  <div className="stat-detail">Rapporto guadagno / max drawdown</div>
                </div>

                {/* Win Rate & Trades */}
                <div className="card">
                  <div className="stat-label">
                    <ShieldCheck size={16} color="var(--color-ok)" />
                    Win Rate
                  </div>
                  <div className="stat-value mono" style={{ color: 'var(--color-ok)' }}>
                    {stats.winRate}%
                  </div>
                  <div className="stat-detail">
                    {stats.totalTrades} Op. ({stats.buyCount} Buy / {stats.sellCount} Sell)
                  </div>
                </div>
              </div>

              {/* Equity Curve Chart */}
              <div className="card chart-card" style={{ minHeight: '380px' }}>
                <div className="chart-title">
                  <TrendingUp size={18} color="var(--accent-gold)" />
                  Andamento Equity Line (Profitto Cumulativo)
                </div>
                <div className="chart-container" style={{ height: '320px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.equityData}>
                      <defs>
                        <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent-gold)" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="var(--accent-gold)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="tradeIndex" stroke="var(--text-muted)" fontSize={11} tickLine={false} label={{ value: 'Numero Operazione', position: 'insideBottom', offset: -5, fill: 'var(--text-muted)' }} />
                      <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} label={{ value: 'Equity (€)', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)' }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area 
                        type="monotone" 
                        dataKey="equity" 
                        stroke="var(--accent-gold)" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorEquity)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Trades List Table */}
              <div className="card workspace-card">
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Elenco Operazioni Storiche Filtrate</h3>
                <div className="table-wrapper">
                  <table className="table-main">
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        <th>Close Time</th>
                        <th>Simbolo</th>
                        <th style={{ textAlign: 'center' }}>Tipo</th>
                        <th style={{ textAlign: 'center' }}>Lotti</th>
                        <th style={{ textAlign: 'right' }}>Profitto (€)</th>
                        <th>Magic Number</th>
                        <th>Commento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrades.slice().reverse().map((t) => (
                        <tr key={t.ticket}>
                          <td>{t.ticket}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{t.closeTime}</td>
                          <td style={{ fontWeight: 700 }}>{t.symbol}</td>
                          <td style={{ textAlign: 'center', textTransform: 'uppercase', fontWeight: 600, color: t.type === 'buy' ? 'var(--accent-blue)' : 'var(--color-warn)' }}>
                            {t.type}
                          </td>
                          <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{t.lots}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: t.profit >= 0 ? 'var(--color-ok)' : 'var(--color-crit)' }}>
                            {t.profit >= 0 ? '+' : ''}{t.profit.toFixed(2)} €
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{t.magic}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t.comment}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="state-container">
              <Info size={36} color="var(--accent-blue)" />
              <p>Nessuna operazione corrisponde ai filtri selezionati.</p>
            </div>
          )}
        </>
      )}

      {/* Empty State */}
      {trades.length === 0 && !loading && (
        <div className="state-container" style={{ padding: '4rem 2rem' }}>
          <BarChart3 size={48} color="var(--text-muted)" style={{ opacity: 0.5 }} />
          <h3>Nessun Report Caricato</h3>
          <p style={{ maxWidth: '400px', marginTop: '0.5rem' }}>
            Carica un report delle operazioni chiuse in formato HTML o CSV generato da MetaTrader 4 o MetaTrader 5 per analizzarne l'equity line e le metriche principali.
          </p>
        </div>
      )}
    </div>
  );
}

// Small helper to define checkmark icon if missing in lucide
const ShieldCheck = ({ size, color }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shield-check">
    <path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c3 0 5-2 6-3a1 1 0 0 1 1 0c1 1 3 3 6 3a1 1 0 0 1 1 1v7Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
