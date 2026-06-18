import React, { useState, useEffect } from 'react';
import { X, FolderPlus, Edit3 } from 'lucide-react';

export default function SectionModal({ isOpen, onClose, onSubmit, mode = 'add', initialName = '' }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(mode === 'edit' ? initialName : '');
    }
  }, [isOpen, mode, initialName]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      alert('Il nome della sezione non può essere vuoto.');
      return;
    }
    
    // Check if sheet name is safe (no special characters that break excel sheets)
    if (cleanName.length > 31) {
      alert('Il nome della sezione non può superare i 31 caratteri (limite di Excel).');
      return;
    }
    if (/[\\\/\?\*\[\]]/.test(cleanName)) {
      alert('Il nome non può contenere caratteri speciali non validi per Excel: \\ / ? * [ ]');
      return;
    }

    onSubmit(cleanName);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button className="modal-close-btn" onClick={onClose}>
          <X size={20} />
        </button>
        
        <h3 className="modal-title">
          {mode === 'add' ? (
            <>
              <FolderPlus size={18} color="var(--accent-gold)" />
              Aggiungi Nuova Sezione
            </>
          ) : (
            <>
              <Edit3 size={18} color="var(--accent-gold)" />
              Modifica Nome Sezione
            </>
          )}
        </h3>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label>Nome Sezione</label>
            <input 
              type="text" 
              placeholder="es. STRATEGIE GOLD" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              className="form-input"
              autoFocus
              maxLength={31}
              required
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Massimo 31 caratteri. Evitare caratteri speciali.
            </span>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Annulla
            </button>
            <button type="submit" className="btn btn-primary">
              {mode === 'add' ? 'Crea Sezione' : 'Salva Modifica'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
