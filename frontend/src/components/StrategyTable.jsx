import React, { useState } from 'react';
import { Search, Trash2, AlertCircle, CheckCircle, HelpCircle, Folder } from 'lucide-react';

export default function StrategyTable({ portfolioData, activeTab, onUpdateStrategy, onDeleteStrategy, onTabChange }) {
  const [search, setSearch] = useState('');
  const [marketFilter, setMarketFilter] = useState('');
  const [tfFilter, setTfFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState(activeTab === 'TUTTE' ? '' : activeTab);
  
  // State for inline edit
  const [editCell, setEditCell] = useState(null); // { id: string, field: string, section: string }
  const [editValue, setEditValue] = useState('');

  // Sync sectionFilter when activeTab changes from parent
  React.useEffect(() => {
    setSectionFilter(activeTab === 'TUTTE' ? '' : activeTab);
  }, [activeTab]);

  // Combine strategies from selected sections
  const getCombinedStrategies = () => {
    const combined = [];
    Object.keys(portfolioData).forEach(sheetName => {
      // If we filtered by a specific section (and not TUTTE), skip other sections
      if (sectionFilter && sheetName !== sectionFilter) {
        return;
      }
      
      portfolioData[sheetName].forEach(strat => {
        combined.push({
          ...strat,
          section: sheetName // track original section for updates
        });
      });
    });
    return combined;
  };

  const strategies = getCombinedStrategies();

  // Unique lists for dropdowns based on filtered subset
  const uniqueMarkets = Array.from(new Set(strategies.map(s => s.mercato).filter(Boolean))).sort();
  const uniqueTfs = Array.from(new Set(strategies.map(s => s.tf).filter(Boolean))).sort();
  const sectionsList = Object.keys(portfolioData);

  // Helper to determine status dynamically
  const getAlertState = (strat) => {
    const mc = parseFloat(strat.mc_dd);
    const real = parseFloat(strat.real_dd);
    
    if (isNaN(mc) || isNaN(real) || mc === null || real === null) {
      return 'OK';
    }
    if (real > mc) return 'CRITICO';
    if (real > mc * 0.8) return 'ATTENZIONE';
    return 'OK';
  };

  // Filter strategies based on search, market, tf, status
  const filteredStrategies = strategies.filter(strat => {
    const matchesSearch = 
      strat.nome.toLowerCase().includes(search.toLowerCase()) ||
      strat.magic.toLowerCase().includes(search.toLowerCase()) ||
      strat.note.toLowerCase().includes(search.toLowerCase());
      
    const matchesMarket = marketFilter ? strat.mercato === marketFilter : true;
    const matchesTf = tfFilter ? strat.tf === tfFilter : true;
    
    const state = getAlertState(strat);
    const matchesStatus = statusFilter ? state === statusFilter : true;
    
    return matchesSearch && matchesMarket && matchesTf && matchesStatus;
  });

  const startEdit = (id, field, value, section) => {
    setEditCell({ id, field, section });
    setEditValue(value === null ? '' : String(value));
  };

  const saveEdit = (id, field, section) => {
    let finalVal = editValue.trim();
    
    // Validate inputs
    if (field === 'lotti') {
      const parsed = parseFloat(finalVal);
      if (isNaN(parsed) || parsed < 0) {
        alert('Inserire un numero di lotti valido (maggiore o uguale a 0)');
        cancelEdit();
        return;
      }
      finalVal = parsed;
    } else if (field === 'mc_dd' || field === 'real_dd' || field === 'mc_dd_currency') {
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
    
    onUpdateStrategy(section, id, field, finalVal);
    cancelEdit();
  };

  const cancelEdit = () => {
    setEditCell(null);
    setEditValue('');
  };

  const handleKeyDown = (e, id, field, section) => {
    if (e.key === 'Enter') {
      saveEdit(id, field, section);
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  const handleSectionFilterChange = (val) => {
    setSectionFilter(val);
    if (val === '') {
      onTabChange('TUTTE');
    } else {
      onTabChange(val);
    }
  };

  const renderBadge = (state) => {
    switch (state) {
      case 'CRITICO':
        return <span className="badge-alert badge-crit"><AlertCircle size={12} /> CRITICO</span>;
      case 'ATTENZIONE':
        return <span className="badge-alert badge-warn"><AlertCircle size={12} /> ATTENZIONE</span>;
      default:
        return <span className="badge-alert badge-ok"><CheckCircle size={12} /> OK</span>;
    }
  };

  return (
    <div className="card workspace-card">
      {/* Filters Toolbar */}
      <div className="table-filters">
        <div className="filter-group">
          {/* Section Filter Dropdown */}
          <select
            value={sectionFilter}
            onChange={(e) => handleSectionFilterChange(e.target.value)}
            className="select-input"
            style={{ borderColor: 'var(--accent-gold)', fontWeight: 600 }}
          >
            <option value="">Tutte le Sezioni</option>
            {sectionsList.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <div className="search-input-wrapper">
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Cerca per nome, magic o note..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
          
          <select 
            value={marketFilter} 
            onChange={(e) => setMarketFilter(e.target.value)}
            className="select-input"
          >
            <option value="">Tutti i Mercati</option>
            {uniqueMarkets.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select 
            value={tfFilter} 
            onChange={(e) => setTfFilter(e.target.value)}
            className="select-input"
          >
            <option value="">Tutti i TimeFrame</option>
            {uniqueTfs.map(tf => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>

          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="select-input"
          >
            <option value="">Tutti gli Stati</option>
            <option value="OK">Stato OK</option>
            <option value="ATTENZIONE">ATTENZIONE</option>
            <option value="CRITICO">CRITICO</option>
          </select>
        </div>

        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Trovate: <strong>{filteredStrategies.length}</strong> su {strategies.length}
        </div>
      </div>

      {/* Table grid */}
      <div className="table-wrapper">
        <table className="table-main">
          <thead>
            <tr>
              {activeTab === 'TUTTE' && <th style={{ width: '8%' }}>Sezione</th>}
              <th style={{ width: '8%', textAlign: 'center' }}>Mercato</th>
              <th style={{ width: '20%' }}>Nome Strategia / Portafoglio</th>
              <th style={{ width: '6%', textAlign: 'center' }}>TF</th>
              <th style={{ width: '10%' }}>MagicNumber</th>
              <th style={{ width: '16%' }}>Note</th>
              <th style={{ width: '7%', textAlign: 'center' }}>Lotti</th>
              <th style={{ width: '8%', textAlign: 'center' }}>Monte Carlo DD %</th>
              <th style={{ width: '8%', textAlign: 'center' }}>Max DD Valuta (€)</th>
              <th style={{ width: '8%', textAlign: 'center' }}>Live DD %</th>
              <th style={{ width: '10%', textAlign: 'center' }}>Stato Allerta</th>
              <th style={{ width: '4%', textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredStrategies.length === 0 ? (
              <tr>
                <td colSpan={activeTab === 'TUTTE' ? 12 : 11} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  Nessuna strategia trovata con i filtri correnti.
                </td>
              </tr>
            ) : (
              filteredStrategies.map((strat) => {
                const state = getAlertState(strat);
                return (
                  <tr key={strat.id}>
                    {/* Sezione (only shown in TUTTE view) */}
                    {activeTab === 'TUTTE' && (
                      <td style={{ fontWeight: 600, color: 'var(--accent-gold)', fontSize: '0.8rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Folder size={12} />
                          {strat.section}
                        </span>
                      </td>
                    )}

                    {/* Mercato (Editable) */}
                    <td className="cell-editable cell-market" onClick={() => startEdit(strat.id, 'mercato', strat.mercato, strat.section)}>
                      {editCell?.id === strat.id && editCell?.field === 'mercato' ? (
                        <input
                          autoFocus
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(strat.id, 'mercato', strat.section)}
                          onKeyDown={(e) => handleKeyDown(e, strat.id, 'mercato', strat.section)}
                          className="cell-input"
                        />
                      ) : (
                        strat.mercato || <span style={{ fontStyle: 'italic', opacity: 0.3 }}>-</span>
                      )}
                    </td>
                    
                    {/* Nome (Editable) */}
                    <td className="cell-editable" style={{ fontWeight: 500 }} onClick={() => startEdit(strat.id, 'nome', strat.nome, strat.section)}>
                      {editCell?.id === strat.id && editCell?.field === 'nome' ? (
                        <input
                          autoFocus
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(strat.id, 'nome', strat.section)}
                          onKeyDown={(e) => handleKeyDown(e, strat.id, 'nome', strat.section)}
                          className="cell-input"
                          style={{ textAlign: 'left' }}
                        />
                      ) : (
                        strat.nome
                      )}
                    </td>
                    
                    {/* TimeFrame (Editable) */}
                    <td className="cell-editable cell-tf" onClick={() => startEdit(strat.id, 'tf', strat.tf, strat.section)}>
                      {editCell?.id === strat.id && editCell?.field === 'tf' ? (
                        <input
                          autoFocus
                          type="text"
                          placeholder="es. H1"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(strat.id, 'tf', strat.section)}
                          onKeyDown={(e) => handleKeyDown(e, strat.id, 'tf', strat.section)}
                          className="cell-input"
                        />
                      ) : (
                        strat.tf || <span style={{ fontStyle: 'italic', opacity: 0.3 }}>-</span>
                      )}
                    </td>
                    
                    {/* MagicNumber (Editable) */}
                    <td className="cell-editable cell-magic" title={strat.magic} onClick={() => startEdit(strat.id, 'magic', strat.magic, strat.section)}>
                      {editCell?.id === strat.id && editCell?.field === 'magic' ? (
                        <input
                          autoFocus
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(strat.id, 'magic', strat.section)}
                          onKeyDown={(e) => handleKeyDown(e, strat.id, 'magic', strat.section)}
                          className="cell-input"
                          style={{ textAlign: 'left' }}
                        />
                      ) : (
                        strat.magic || <span style={{ fontStyle: 'italic', opacity: 0.3 }}>-</span>
                      )}
                    </td>
                    
                    {/* Note */}
                    <td className="cell-editable cell-note" onClick={() => startEdit(strat.id, 'note', strat.note, strat.section)}>
                      {editCell?.id === strat.id && editCell?.field === 'note' ? (
                        <input
                          autoFocus
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(strat.id, 'note', strat.section)}
                          onKeyDown={(e) => handleKeyDown(e, strat.id, 'note', strat.section)}
                          className="cell-input"
                          style={{ textAlign: 'left' }}
                        />
                      ) : (
                        strat.note || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Aggiungi note</span>
                      )}
                    </td>
                    
                    {/* Lotti */}
                    <td className="cell-editable cell-lotti" onClick={() => startEdit(strat.id, 'lotti', strat.lotti, strat.section)}>
                      {editCell?.id === strat.id && editCell?.field === 'lotti' ? (
                        <input
                          autoFocus
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(strat.id, 'lotti', strat.section)}
                          onKeyDown={(e) => handleKeyDown(e, strat.id, 'lotti', strat.section)}
                          className="cell-input"
                        />
                      ) : (
                        parseFloat(strat.lotti).toFixed(2)
                      )}
                    </td>
                    
                    {/* Monte Carlo DD */}
                    <td className="cell-editable cell-percent" onClick={() => startEdit(strat.id, 'mc_dd', strat.mc_dd, strat.section)}>
                      {editCell?.id === strat.id && editCell?.field === 'mc_dd' ? (
                        <input
                          autoFocus
                          type="text"
                          placeholder="es. 15.5"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(strat.id, 'mc_dd', strat.section)}
                          onKeyDown={(e) => handleKeyDown(e, strat.id, 'mc_dd', strat.section)}
                          className="cell-input"
                        />
                      ) : (
                        strat.mc_dd !== null && strat.mc_dd !== undefined && strat.mc_dd !== '' ? 
                          `${parseFloat(strat.mc_dd).toFixed(2)}%` : 
                          <span style={{ fontStyle: 'italic', opacity: 0.3 }}>-</span>
                      )}
                    </td>
                    
                    {/* Max DD Valuta */}
                    <td className="cell-editable cell-lotti" onClick={() => startEdit(strat.id, 'mc_dd_currency', strat.mc_dd_currency, strat.section)}>
                      {editCell?.id === strat.id && editCell?.field === 'mc_dd_currency' ? (
                        <input
                          autoFocus
                          type="text"
                          placeholder="es. 300"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(strat.id, 'mc_dd_currency', strat.section)}
                          onKeyDown={(e) => handleKeyDown(e, strat.id, 'mc_dd_currency', strat.section)}
                          className="cell-input"
                        />
                      ) : (
                        strat.mc_dd_currency !== null && strat.mc_dd_currency !== undefined && strat.mc_dd_currency !== '' ? 
                          `${parseFloat(strat.mc_dd_currency).toFixed(2)} €` : 
                          <span style={{ fontStyle: 'italic', opacity: 0.3 }}>-</span>
                      )}
                    </td>

                    {/* Live DD */}
                    <td className="cell-editable cell-percent" 
                        style={{ 
                          color: state === 'CRITICO' ? 'var(--color-crit)' : state === 'ATTENZIONE' ? 'var(--color-warn)' : 'inherit',
                          fontWeight: state !== 'OK' ? 700 : 'normal'
                        }}
                        onClick={() => startEdit(strat.id, 'real_dd', strat.real_dd, strat.section)}>
                      {editCell?.id === strat.id && editCell?.field === 'real_dd' ? (
                        <input
                          autoFocus
                          type="text"
                          placeholder="es. 12.2"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveEdit(strat.id, 'real_dd', strat.section)}
                          onKeyDown={(e) => handleKeyDown(e, strat.id, 'real_dd', strat.section)}
                          className="cell-input"
                        />
                      ) : (
                        strat.real_dd !== null && strat.real_dd !== undefined && strat.real_dd !== '' ? 
                          `${parseFloat(strat.real_dd).toFixed(2)}%` : 
                          <span style={{ fontStyle: 'italic', opacity: 0.3 }}>-</span>
                      )}
                    </td>
                    
                    {/* Stato Allerta */}
                    <td style={{ textAlign: 'center' }}>{renderBadge(state)}</td>
                    
                    {/* Azioni */}
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        onClick={() => {
                          if (confirm('Eliminare questa strategia?')) {
                            onDeleteStrategy(strat.section, strat.id);
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
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <HelpCircle size={12} />
        <span>Info: Fai click / doppio click su <strong>qualsiasi cella di testo o numero</strong> per modificarla istantaneamente in tempo reale.</span>
      </div>
    </div>
  );
}
