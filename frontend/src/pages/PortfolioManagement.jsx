import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Folder, Check, ThumbsUp, ThumbsDown, AlertTriangle, Power, Edit3, RotateCcw, Shield, Trash2, Filter } from 'lucide-react';

export default function PortfolioManagement({ 
  portfolioData, 
  onUpdateStrategy, 
  user, 
  pendingRefresh, 
  lastUploadedTradesCount, 
  lastUploadedFileName, 
  onRefreshAcknowledged,
  managementData,
  loadingManagement: loading,
  onReloadManagementData,
  onDeleteStrategy
}) {
  const [activeTab, setActiveTab] = useState('TUTTE');
  const [editCell, setEditCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerMessage, setBannerMessage] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  
  // Advanced filters state
  const [statusFilter, setStatusFilter] = useState('TUTTI');
  const [searchQuery, setSearchQuery] = useState('');
  const [magicQuery, setMagicQuery] = useState('');

  useEffect(() => {
    if (!managementData) {
      onReloadManagementData();
    }
  }, []);

  // Auto-ricalcolo quando arriva un nuovo report dall'Analisi Report
  useEffect(() => {
    if (pendingRefresh) {
      const msg = lastUploadedFileName
        ? `${lastUploadedTradesCount} trade da "${lastUploadedFileName}" rilevati. Ricalcolo in corso...`
        : `${lastUploadedTradesCount} nuovi trade rilevati. Ricalcolo in corso...`;
      setBannerMessage(msg);
      setBannerVisible(true);

      // Piccolo delay per permettere al backend di processare i dati
      const timer = setTimeout(async () => {
        await onReloadManagementData(true);
        if (onRefreshAcknowledged) onRefreshAcknowledged();
        // Mantieni il banner visibile per 5s dopo il completamento
        setTimeout(() => setBannerVisible(false), 5000);
      }, 800);

      return () => clearTimeout(timer);
    }
  }, [pendingRefresh]);

  // Reset: svuota mt5_deals.json, preserva mc_dd e mc_dd_currency
  const handleResetDeals = async () => {
    setResetting(true);
    try {
      const response = await fetch('/api/portfolio-management/reset-deals', {
        method: 'POST',
        headers: { 'x-user-email': user.email }
      });
      if (!response.ok) throw new Error('Reset fallito');
      setShowResetModal(false);
      setBannerMessage('Dati live azzerati. I parametri Monte Carlo DD sono stati preservati.');
      setBannerVisible(true);
      setTimeout(() => setBannerVisible(false), 6000);
      // Reload stats to reflect the empty state
      await onReloadManagementData(true);
    } catch (err) {
      console.error(err);
      alert('Errore durante il reset: ' + err.message);
    } finally {
      setResetting(false);
    }
  };

  // Filter strategies based on activeTab, statusFilter, searchQuery, magicQuery
  const filteredStrategies = useMemo(() => {
    if (!managementData) return [];
    
    let baseList = [];
    if (activeTab === 'TUTTE') {
      // Flatten all tabs
      Object.keys(managementData).forEach(section => {
        managementData[section].forEach(strat => {
          baseList.push({ ...strat, section });
        });
      });
    } else {
      baseList = (managementData[activeTab] || []).map(strat => ({ ...strat, section: activeTab }));
    }

    // Apply status filter (Verde, Giallo, Rosso)
    if (statusFilter !== 'TUTTI') {
      baseList = baseList.filter(strat => strat.status_code === statusFilter);
    }

    // Apply name query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      baseList = baseList.filter(strat => 
        (strat.nome_strategia || '').toLowerCase().includes(q)
      );
    }

    // Apply magic query
    if (magicQuery.trim() !== '') {
      const q = magicQuery.trim();
      baseList = baseList.filter(strat => 
        (strat.magic_number || '').toString().includes(q)
      );
    }

    return baseList;
  }, [managementData, activeTab, statusFilter, searchQuery, magicQuery]);

  // Summary counts
  const summary = useMemo(() => {
    const stats = {
      total: 0,
      ok: 0,
      monitor: 0,
      kill: 0,
      totalTrades: 0,
      totalProfit: 0
    };

    if (!managementData) return stats;

    Object.keys(managementData).forEach(section => {
      managementData[section].forEach(strat => {
        stats.total++;
        stats.totalTrades += strat.total_live_trades || 0;
        stats.totalProfit += strat.live_net_profit_currency || 0;
        
        if (strat.status_code === 'ROSSO') stats.kill++;
        else if (strat.status_code === 'GIALLO') stats.monitor++;
        else stats.ok++;
      });
    });

    return stats;
  }, [managementData]);

  // Inline editing functions
  const startEdit = (id, field, value) => {
    setEditCell({ id, field });
    setEditValue(value !== null && value !== undefined ? value.toString() : '');
  };

  const handleKeyDown = (e, id, field, section) => {
    if (e.key === 'Enter') {
      saveEdit(id, field, section);
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  const saveEdit = async (id, field, section) => {
    let finalVal = editValue.trim();
    
    // Validate number input
    if (field === 'mc_dd' || field === 'mc_dd_currency') {
      if (finalVal === '') {
        finalVal = null;
      } else {
        const parsed = parseFloat(finalVal);
        if (isNaN(parsed) || parsed < 0) {
          alert('Inserire un valore numerico valido (positivo o lasciare vuoto)');
          cancelEdit();
          return;
        }
        finalVal = parsed;
      }
    }

    // Map frontend field to portfolio schema fields if needed
    // mc_dd_currency and mc_dd are identical in both databases
    onUpdateStrategy(section, id, field, finalVal);
    cancelEdit();
    
    // Refresh calculations locally
    setTimeout(() => {
      onReloadManagementData();
    }, 300);
  };

  const cancelEdit = () => {
    setEditCell(null);
    setEditValue('');
  };

  // Helper to render health status badges (Semafori)
  const renderStatusBadge = (statusCode, text) => {
    let colorClass = 'badge-ok';
    let glowColor = 'rgba(76, 175, 80, 0.4)';
    
    if (statusCode === 'ROSSO') {
      colorClass = 'badge-crit';
      glowColor = 'rgba(244, 67, 54, 0.4)';
    } else if (statusCode === 'GIALLO') {
      colorClass = 'badge-warn';
      glowColor = 'rgba(255, 152, 0, 0.4)';
    }

    return (
      <span className={`badge ${colorClass}`} style={{
        boxShadow: `0 0 10px ${glowColor}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.3rem 0.75rem',
        borderRadius: '20px',
        fontWeight: 700,
        fontSize: '0.75rem',
        textTransform: 'uppercase'
      }}>
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: statusCode === 'ROSSO' ? '#f44336' : statusCode === 'GIALLO' ? '#ff9800' : '#4caf50',
          display: 'inline-block'
        }}></span>
        {text}
      </span>
    );
  };

  // Helper to render action thumbs
  const renderActionBadge = (actionText) => {
    let style = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.4rem',
      padding: '0.3rem 0.75rem',
      borderRadius: '8px',
      fontSize: '0.8rem',
      fontWeight: 600,
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.06)'
    };

    if (actionText.includes('👍')) {
      return (
        <span style={{ 
          ...style, 
          color: 'var(--color-ok)', 
          background: 'rgba(76, 175, 80, 0.1)', 
          borderColor: 'rgba(76, 175, 80, 0.2)',
          boxShadow: '0 0 8px rgba(76, 175, 80, 0.1)' 
        }}>
          <ThumbsUp size={14} />
          {actionText.replace('👍 ', '')}
        </span>
      );
    } else if (actionText.includes('👎')) {
      return (
        <span style={{ 
          ...style, 
          color: 'var(--color-warn)', 
          background: 'rgba(255, 152, 0, 0.1)', 
          borderColor: 'rgba(255, 152, 0, 0.2)' 
        }}>
          <ThumbsDown size={14} />
          {actionText.replace('👎 ', '')}
        </span>
      );
    } else if (actionText.includes('⚠️')) {
      return (
        <span style={{ 
          ...style, 
          color: 'var(--accent-gold)', 
          background: 'rgba(226, 194, 125, 0.1)', 
          borderColor: 'rgba(226, 194, 125, 0.2)' 
        }}>
          <AlertTriangle size={14} />
          {actionText.replace('⚠️ ', '')}
        </span>
      );
    } else if (actionText.includes('❌')) {
      return (
        <span style={{ 
          ...style, 
          color: 'var(--color-crit)', 
          background: 'rgba(244, 67, 54, 0.1)', 
          borderColor: 'rgba(244, 67, 54, 0.2)',
          boxShadow: '0 0 8px rgba(244, 67, 54, 0.1)' 
        }}>
          <Power size={14} />
          {actionText.replace('❌ ', '')}
        </span>
      );
    }

    return (
      <span style={{ ...style, color: 'var(--text-muted)' }}>
        {actionText}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── RESET CONFIRMATION MODAL ────────────────────────────────────── */}
      {showResetModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #151825, #1a1f2e)',
            border: '1px solid rgba(244, 67, 54, 0.3)',
            borderRadius: '20px',
            padding: '2rem',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(244,67,54,0.1)',
            animation: 'slideDown 0.3s ease'
          }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.5rem' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: 'rgba(244, 67, 54, 0.15)',
                border: '1px solid rgba(244, 67, 54, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <RotateCcw size={20} color="#f44336" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-bright)', margin: 0 }}>
                  Reset Dati Live
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.15rem 0 0' }}>
                  Conferma l'operazione di azzeramento
                </p>
              </div>
            </div>

            {/* What gets reset */}
            <div style={{
              background: 'rgba(244, 67, 54, 0.06)',
              border: '1px solid rgba(244, 67, 54, 0.15)',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '0.75rem'
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f44336', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Trash2 size={11} /> Cosa viene azzerato
              </div>
              {[
                'Numero di trade live (total_live_trades)',
                'Drawdown % registrato in live (live_dd_percent)',
                'Profitto netto live (live_net_profit)',
                'Semafori e azioni di Money Management',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span style={{ color: '#f44336', fontWeight: 700, fontSize: '0.7rem' }}>✕</span>
                  {item}
                </div>
              ))}
            </div>

            {/* What is preserved */}
            <div style={{
              background: 'rgba(76, 175, 80, 0.06)',
              border: '1px solid rgba(76, 175, 80, 0.15)',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4caf50', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Shield size={11} /> Cosa viene preservato
              </div>
              {[
                'Max Drawdown % teorico Monte Carlo (mc_dd)',
                'Max Drawdown € teorico Monte Carlo (mc_dd_currency)',
                'Tutte le strategie e sezioni del portafoglio',
                'Lotti, Magic Number, configurazioni EA',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span style={{ color: '#4caf50', fontWeight: 700, fontSize: '0.7rem' }}>✓</span>
                  {item}
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setShowResetModal(false)}
                disabled={resetting}
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Annulla
              </button>
              <button
                onClick={handleResetDeals}
                disabled={resetting}
                className="btn"
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  background: resetting ? 'rgba(244,67,54,0.3)' : 'rgba(244, 67, 54, 0.15)',
                  border: '1px solid rgba(244, 67, 54, 0.4)',
                  color: '#f44336',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {resetting
                  ? <><RefreshCw size={14} className="spin-animation" /> Azzerando...</>
                  : <><RotateCcw size={14} /> Conferma Reset</>
                }
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Auto-refresh Banner */}
      {bannerVisible && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.9rem 1.25rem',
          background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.12), rgba(33, 150, 243, 0.08))',
          border: '1px solid rgba(76, 175, 80, 0.3)',
          borderRadius: '14px',
          animation: 'slideDown 0.35s ease',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 20px rgba(76, 175, 80, 0.08)'
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'rgba(76, 175, 80, 0.15)',
            border: '1px solid rgba(76, 175, 80, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {loading
              ? <RefreshCw size={16} color="#4caf50" className="spin-animation" />
              : <Check size={16} color="#4caf50" />
            }
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#4caf50' }}>
              {loading ? '🔄 Ricalcolo Gestione Risk in corso...' : '✅ Gestione Risk aggiornata automaticamente'}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              {bannerMessage}
            </div>
          </div>
          <button
            onClick={() => setBannerVisible(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem', borderRadius: '6px', fontSize: '1rem', lineHeight: 1 }}
            title="Chiudi"
          >✕</button>
        </div>
      )}

      {/* Top Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        
        {/* Total Active */}
        <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Strategie Attive
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.4rem', color: 'var(--text-bright)' }}>
            {summary.total}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            <span>Live Trades: <strong>{summary.totalTrades}</strong></span>
          </div>
        </div>

        {/* OK green */}
        <div className="card" style={{ padding: '1.25rem', borderLeft: '3px solid var(--color-ok)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Salute OK (Verde)
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.4rem', color: 'var(--color-ok)', textShadow: '0 0 10px rgba(76, 175, 80, 0.1)' }}>
            {summary.ok}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Stato di salute operativo normale.
          </div>
        </div>

        {/* Monitor yellow */}
        <div className="card" style={{ padding: '1.25rem', borderLeft: '3px solid var(--color-warn)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Monitorare (Giallo)
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.4rem', color: 'var(--color-warn)', textShadow: '0 0 10px rgba(255, 152, 0, 0.1)' }}>
            {summary.monitor}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Size da dimezzare per prudenza.
          </div>
        </div>

        {/* Kill switch red */}
        <div className="card" style={{ padding: '1.25rem', borderLeft: '3px solid var(--color-crit)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Da Spegnere (Rosso)
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.4rem', color: 'var(--color-crit)', textShadow: '0 0 10px rgba(244, 67, 54, 0.1)' }}>
            {summary.kill}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Drawdown limite superato. Kill switch.
          </div>
        </div>

        {/* Net Profit */}
        <div className="card" style={{ padding: '1.25rem', borderLeft: '3px solid var(--accent-gold)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Profitto Live Totale
          </div>
          <div style={{ 
            fontSize: '1.5rem', 
            fontWeight: 800, 
            marginTop: '0.4rem', 
            color: summary.totalProfit >= 0 ? 'var(--color-ok)' : 'var(--color-crit)',
            textShadow: summary.totalProfit >= 0 ? '0 0 10px rgba(76, 175, 80, 0.1)' : '0 0 10px rgba(244, 67, 54, 0.1)'
          }}>
            {summary.totalProfit >= 0 ? '+' : ''}{summary.totalProfit.toFixed(2)} €
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Rilevato dai deal storici chiusi.
          </div>
        </div>

      </div>

      {/* Tabs navigation & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', flexWrap: 'wrap' }}>
        <nav className="tabs-container" style={{ flex: 1 }}>
          <button
            onClick={() => setActiveTab('TUTTE')}
            className={`tab-btn ${activeTab === 'TUTTE' ? 'active' : ''}`}
          >
            <span>TUTTE LE STRATEGIE</span>
          </button>
          {portfolioData && Object.keys(portfolioData).map((sheetName) => (
            <button
              key={sheetName}
              onClick={() => setActiveTab(sheetName)}
              className={`tab-btn ${activeTab === sheetName ? 'active' : ''}`}
            >
              <span>{sheetName}</span>
            </button>
          ))}
        </nav>

        {/* Ricalcola */}
        <button
          onClick={() => onReloadManagementData(true)}
          className="btn btn-secondary"
          style={{ height: '46px', borderRadius: '14px' }}
          disabled={loading}
          title="Ricalcola Statistiche"
        >
          <RefreshCw size={16} className={loading ? 'spin-animation' : ''} />
          Ricalcola
        </button>

        {/* Separatore visivo */}
        <div style={{ width: '1px', height: '32px', background: 'var(--border-color)', alignSelf: 'center' }} />

        {/* Reset Live Data */}
        <button
          onClick={() => setShowResetModal(true)}
          className="btn"
          style={{
            height: '46px',
            borderRadius: '14px',
            background: 'rgba(244, 67, 54, 0.08)',
            border: '1px solid rgba(244, 67, 54, 0.25)',
            color: '#f44336',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 600,
          }}
          disabled={loading || resetting}
          title="Azzera dati live. I parametri Monte Carlo vengono preservati."
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {/* Advanced Filters Panel */}
      <div className="card" style={{
        padding: '1rem 1.25rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '1rem',
        borderRadius: '14px',
        border: '1px solid var(--border-color)',
        background: 'rgba(255, 255, 255, 0.01)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-gold)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <Filter size={14} />
          Filtri:
        </div>

        {/* Cerca Strategia */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '180px' }}>
          <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Cerca Strategia</label>
          <input
            type="text"
            placeholder="Es: OCEAN AUDCAD..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '0.55rem 0.75rem',
              fontSize: '0.78rem',
              background: '#0f111a',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-bright)',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
          />
        </div>

        {/* Cerca Magic */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '120px', minWidth: '100px' }}>
          <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Cerca Magic</label>
          <input
            type="text"
            placeholder="Es: 25000..."
            value={magicQuery}
            onChange={(e) => setMagicQuery(e.target.value)}
            style={{
              padding: '0.55rem 0.75rem',
              fontSize: '0.78rem',
              background: '#0f111a',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-bright)',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
          />
        </div>

        {/* Filtra per Stato Salute */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '160px' }}>
          <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Stato Salute</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '0.55rem 0.75rem',
              fontSize: '0.78rem',
              background: '#0f111a',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-bright)',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="TUTTI">Tutti gli stati</option>
            <option value="VERDE" style={{ color: 'var(--color-ok)' }}>🟢 OK (Verde)</option>
            <option value="GIALLO" style={{ color: '#ffb300' }}>🟡 MONITORARE (Giallo)</option>
            <option value="ROSSO" style={{ color: '#f44336' }}>🔴 DA SPEGNERE (Rosso)</option>
          </select>
        </div>

        {/* Reset Filtri */}
        {(statusFilter !== 'TUTTI' || searchQuery !== '' || magicQuery !== '') && (
          <button
            onClick={() => {
              setStatusFilter('TUTTI');
              setSearchQuery('');
              setMagicQuery('');
            }}
            className="btn btn-secondary"
            style={{
              height: '35px',
              padding: '0 0.75rem',
              fontSize: '0.75rem',
              marginTop: '1.1rem',
              borderRadius: '8px',
              borderColor: 'rgba(255,255,255,0.08)'
            }}
          >
            Azzera
          </button>
        )}
      </div>

      {/* Tables Grid */}
      <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Gestione Rischio e Money Management Meccanico</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              I parametri teorici Monte Carlo sono modificabili in linea per aggiornare le regole all'istante.
            </p>
          </div>
        </div>

        {loading && !managementData ? (
          <div style={{ padding: '4rem 0', textAlign: 'center' }}>
            <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
            <p style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Elaborazione del portafoglio in Pandas in corso...
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table-main">
              <thead>
                <tr>
                  {activeTab === 'TUTTE' && <th style={{ width: '7%' }}>Sezione</th>}
                  <th style={{ width: '7%', textAlign: 'center' }}>Mercato</th>
                  <th style={{ width: '16%' }}>Strategia</th>
                  <th style={{ width: '11%' }}>Magic + Cross</th>
                  <th style={{ width: '5%', textAlign: 'center' }}>Size</th>
                  <th style={{ width: '7%', textAlign: 'center' }}>Trade Live</th>
                  <th style={{ width: '8%', textAlign: 'center' }}>Teorico DD %</th>
                  <th style={{ width: '8%', textAlign: 'center' }}>Teorico DD €</th>
                  <th style={{ width: '8%', textAlign: 'center' }}>Live DD %</th>
                  <th style={{ width: '8%', textAlign: 'center' }}>Live Profit €</th>
                  <th style={{ width: '10%', textAlign: 'center' }}>Salute</th>
                  <th style={{ width: '12%', textAlign: 'center' }}>Azione MM</th>
                  <th style={{ width: '3%', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredStrategies.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === 'TUTTE' ? 13 : 12} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      Nessun dato calcolato. Assicurati che il tuo portafoglio abbia strategie inserite e che siano caricate le transazioni live.
                    </td>
                  </tr>
                ) : (
                  filteredStrategies.map((strat) => {
                    const statusClass = strat.status_code === 'ROSSO' ? 'color-crit' : strat.status_code === 'GIALLO' ? 'color-warn' : 'color-ok';
                    return (
                      <tr key={strat.id}>
                        {/* Sezione */}
                        {activeTab === 'TUTTE' && (
                          <td style={{ fontWeight: 600, color: 'var(--accent-gold)', fontSize: '0.8rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Folder size={12} />
                              {strat.section}
                            </span>
                          </td>
                        )}

                        {/* Mercato / Cross badge */}
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                            background: 'rgba(226, 194, 125, 0.1)',
                            border: '1px solid rgba(226, 194, 125, 0.2)',
                            color: 'var(--accent-gold)',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.03em'
                          }}>
                            {strat.mercato || '-'}
                          </span>
                        </td>

                        {/* Nome Strategia */}
                        <td style={{ fontWeight: 600, color: 'var(--text-bright)' }}>
                          {strat.nome_strategia}
                        </td>

                        {/* Magic Number + Cross (tooltip con symbols matchati) */}
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <span style={{ color: 'var(--text-bright)', fontWeight: 600 }}>
                              {strat.magic_number || '-'}
                            </span>
                            {strat.symbols_found && strat.symbols_found.length > 0 ? (
                              <span
                                style={{ color: 'var(--color-ok)', fontSize: '0.68rem', fontWeight: 500 }}
                                title={`Deal trovati su: ${strat.symbols_found.join(', ')}`}
                              >
                                ✓ {strat.symbols_found.join(' · ')}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--color-crit)', fontSize: '0.68rem', opacity: 0.7 }}>
                                ✗ no deal su {strat.mercato || '?'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Size */}
                        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {parseFloat(strat.current_lots).toFixed(2)}
                        </td>

                        {/* Trade Live */}
                        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                          {strat.total_live_trades}
                        </td>

                        {/* Teorico DD % (Editable in-line) */}
                        <td className="cell-editable cell-percent" onClick={() => startEdit(strat.id, 'mc_dd', strat.max_dd_percent_teorico)}>
                          {editCell?.id === strat.id && editCell?.field === 'mc_dd' ? (
                            <input
                              autoFocus
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(strat.id, 'mc_dd', strat.section)}
                              onKeyDown={(e) => handleKeyDown(e, strat.id, 'mc_dd', strat.section)}
                              className="cell-input"
                            />
                          ) : (
                            strat.max_dd_percent_teorico > 0 ? `${strat.max_dd_percent_teorico.toFixed(2)}%` : <span style={{ opacity: 0.3, fontStyle: 'italic' }}>-</span>
                          )}
                        </td>

                        {/* Teorico DD Valuta (Editable in-line) */}
                        <td className="cell-editable cell-percent" onClick={() => startEdit(strat.id, 'mc_dd_currency', strat.max_dd_currency_teorico)}>
                          {editCell?.id === strat.id && editCell?.field === 'mc_dd_currency' ? (
                            <input
                              autoFocus
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(strat.id, 'mc_dd_currency', strat.section)}
                              onKeyDown={(e) => handleKeyDown(e, strat.id, 'mc_dd_currency', strat.section)}
                              className="cell-input"
                            />
                          ) : (
                            strat.max_dd_currency_teorico > 0 ? `${strat.max_dd_currency_teorico.toFixed(2)} €` : <span style={{ opacity: 0.3, fontStyle: 'italic' }}>-</span>
                          )}
                        </td>

                        {/* Live DD % */}
                        <td style={{ 
                          textAlign: 'center', 
                          fontFamily: 'var(--font-mono)', 
                          fontWeight: 700,
                          color: strat.status_code === 'ROSSO' ? 'var(--color-crit)' : strat.status_code === 'GIALLO' ? 'var(--color-warn)' : 'inherit'
                        }}>
                          {strat.live_dd_percent.toFixed(2)}%
                        </td>

                        {/* Live Profit */}
                        <td style={{ 
                          textAlign: 'center', 
                          fontFamily: 'var(--font-mono)', 
                          fontWeight: 700, 
                          color: strat.live_net_profit_currency >= 0 ? 'var(--color-ok)' : 'var(--color-crit)' 
                        }}>
                          {strat.live_net_profit_currency >= 0 ? '+' : ''}{strat.live_net_profit_currency.toFixed(2)} €
                        </td>

                        {/* Salute (Semaforo) */}
                        <td style={{ textAlign: 'center' }}>
                          {renderStatusBadge(strat.status_code, strat.status_text)}
                        </td>

                        {/* MM Action */}
                        <td style={{ textAlign: 'center' }}>
                          {renderActionBadge(strat.action_text || 'ND')}
                        </td>
                        
                        {/* Delete Action */}
                        <td style={{ textAlign: 'center' }}>
                          <button 
                            onClick={() => {
                              if (confirm('Vuoi davvero eliminare questa strategia e i suoi dati live?')) {
                                onDeleteStrategy(strat.section, strat.id);
                                setTimeout(() => onReloadManagementData(true), 300);
                              }
                            }}
                            className="btn btn-secondary btn-icon-only btn-danger"
                            style={{ padding: '0.4rem', borderRadius: '8px' }}
                            title="Elimina strategia"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
