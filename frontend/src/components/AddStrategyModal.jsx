import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';

export default function AddStrategyModal({ isOpen, onClose, onAddStrategy, sheetName, portfolioData }) {
  const [mercato, setMercato] = useState('');
  const [nome, setNome] = useState('');
  const [tf, setTf] = useState('H1');
  const [magic, setMagic] = useState('');
  const [note, setNote] = useState('');
  const [lotti, setLotti] = useState('0.01');
  const [mcDd, setMcDd] = useState('');
  const [mcDdCurrency, setMcDdCurrency] = useState('');
  const [realDd, setRealDd] = useState('');
  
  // Section select state when in TUTTE view
  const [selectedSection, setSelectedSection] = useState('');

  // Sync selectedSection when portfolioData or sheetName changes
  useEffect(() => {
    if (portfolioData) {
      const keys = Object.keys(portfolioData);
      if (keys.length > 0) {
        setSelectedSection(sheetName === 'TUTTE' ? keys[0] : sheetName);
      }
    }
  }, [sheetName, portfolioData]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!mercato.trim() || !nome.trim()) {
      alert('I campi Mercato e Nome sono obbligatori.');
      return;
    }

    const targetSheet = sheetName === 'TUTTE' ? selectedSection : sheetName;
    if (!targetSheet) {
      alert('Selezionare una sezione valida.');
      return;
    }

    const newStrat = {
      mercato: mercato.trim().toUpperCase(),
      nome: nome.trim(),
      tf: tf,
      magic: magic.trim(),
      note: note.trim(),
      lotti: parseFloat(lotti) || 0.01,
      mc_dd: mcDd.trim() !== '' ? parseFloat(mcDd) : null,
      mc_dd_currency: mcDdCurrency.trim() !== '' ? parseFloat(mcDdCurrency) : null,
      real_dd: realDd.trim() !== '' ? parseFloat(realDd) : null
    };

    onAddStrategy(targetSheet, newStrat);
    
    // Reset form
    setMercato('');
    setNome('');
    setTf('H1');
    setMagic('');
    setNote('');
    setLotti('0.01');
    setMcDd('');
    setMcDdCurrency('');
    setRealDd('');
    onClose();
  };

  const sectionsList = portfolioData ? Object.keys(portfolioData) : [];

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="modal-close-btn" onClick={onClose}>
          <X size={20} />
        </button>
        
        <h3 className="modal-title">
          <Plus size={18} color="var(--accent-gold)" />
          Aggiungi Strategia {sheetName === 'TUTTE' ? '' : `(${sheetName})`}
        </h3>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Section dropdown if in TUTTE mode */}
          {sheetName === 'TUTTE' && (
            <div className="form-group">
              <label>Sezione Destinazione *</label>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="select-input"
                style={{ width: '100%' }}
                required
              >
                {sectionsList.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Mercato *</label>
              <input 
                type="text" 
                placeholder="es. EURUSD" 
                value={mercato} 
                onChange={(e) => setMercato(e.target.value)}
                className="form-input"
                required
              />
            </div>
            <div className="form-group">
              <label>TimeFrame</label>
              <select 
                value={tf} 
                onChange={(e) => setTf(e.target.value)}
                className="select-input"
                style={{ width: '100%', height: '39px' }}
              >
                <option value="M1">M1</option>
                <option value="M5">M5</option>
                <option value="M15">M15</option>
                <option value="M30">M30</option>
                <option value="H1">H1</option>
                <option value="H4">H4</option>
                <option value="D1">D1</option>
                <option value="W1">W1</option>
                <option value="">Nessuno</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Nome Strategia / Portafoglio *</label>
            <input 
              type="text" 
              placeholder="es. Gold EA v1.2" 
              value={nome} 
              onChange={(e) => setNome(e.target.value)}
              className="form-input"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>MagicNumber</label>
              <input 
                type="text" 
                placeholder="es. 2000512" 
                value={magic} 
                onChange={(e) => setMagic(e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Lotti Attuali</label>
              <input 
                type="number" 
                step="0.01" 
                min="0"
                value={lotti} 
                onChange={(e) => setLotti(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Monte Carlo DD (%)</label>
              <input 
                type="number" 
                step="0.01" 
                min="0"
                placeholder="es. 15.5" 
                value={mcDd} 
                onChange={(e) => setMcDd(e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Max DD Valuta (€)</label>
              <input 
                type="number" 
                step="0.01" 
                min="0"
                placeholder="es. 300" 
                value={mcDdCurrency} 
                onChange={(e) => setMcDdCurrency(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>DD Reale Live (%)</label>
              <input 
                type="number" 
                step="0.01" 
                min="0"
                placeholder="es. 12.2" 
                value={realDd} 
                onChange={(e) => setRealDd(e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              {/* Empty slot for spacing consistency */}
            </div>
          </div>

          <div className="form-group">
            <label>Note</label>
            <textarea 
              placeholder="Inserisci note aggiuntive..." 
              value={note} 
              onChange={(e) => setNote(e.target.value)}
              className="form-input"
              style={{ minHeight: '60px', resize: 'vertical' }}
            />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Annulla
            </button>
            <button type="submit" className="btn btn-primary">
              Aggiungi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
