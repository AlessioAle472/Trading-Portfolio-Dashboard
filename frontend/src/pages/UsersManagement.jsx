import React, { useState, useEffect } from 'react';
import { Users, Search, Shield, User, Star, MoreVertical, RefreshCw, AlertCircle } from 'lucide-react';

export default function UsersManagement({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editUser, setEditUser] = useState(null); // The user being edited
  const [editRole, setEditRole] = useState('');
  const [editSub, setEditSub] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/admin/users`, {
        headers: { 'x-user-email': user.email }
      });
      if (!res.ok) {
        throw new Error('Errore nel caricamento degli utenti');
      }
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (u) => {
    setEditUser(u);
    setEditRole(u.role);
    setEditSub(u.subscription);
  };

  const closeEditModal = () => {
    setEditUser(null);
  };

  const handleUpdateUser = async () => {
    setUpdating(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/admin/users/${encodeURIComponent(editUser.email)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': user.email
        },
        body: JSON.stringify({ role: editRole, subscription: editSub })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Errore durante l\'aggiornamento');
      }
      closeEditModal();
      await fetchUsers();
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const filteredUsers = users.filter(u => u.email.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s ease' }}>
      
      {/* HEADER CARD */}
      <div className="card" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(145deg, rgba(236, 72, 153, 0.05), rgba(0,0,0,0))', borderLeft: '3px solid #ec4899' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-bright)' }}>
            <Users size={24} color="#ec4899" />
            Gestione Membri
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            Amministra gli iscritti alla piattaforma. Modifica i ruoli e i piani di abbonamento.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={fetchUsers} disabled={loading} className="btn btn-secondary" title="Aggiorna lista">
            <RefreshCw size={16} className={loading ? 'spin-animation' : ''} />
            {loading ? 'Caricamento...' : 'Aggiorna'}
          </button>
        </div>
      </div>

      {/* FILTER & STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Utenti Totali</span>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-bright)' }}>{users.length}</span>
        </div>
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Utenti Pro (Premium)</span>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent-gold)' }}>
            {users.filter(u => u.subscription === 'Premium').length}
          </span>
        </div>
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: '2' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Ricerca</span>
          <div className="search-input-wrapper" style={{ marginTop: '0.2rem' }}>
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Cerca per indirizzo email..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
      </div>

      {/* USERS TABLE */}
      {error ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', borderColor: 'var(--color-crit)' }}>
          <AlertCircle size={32} color="var(--color-crit)" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ color: 'var(--color-crit)' }}>Errore</h3>
          <p>{error}</p>
        </div>
      ) : (
        <div className="card workspace-card" style={{ padding: '0' }}>
          <div className="table-wrapper">
            <table className="table-main">
              <thead>
                <tr>
                  <th>Utente (Email)</th>
                  <th style={{ width: '15%', textAlign: 'center' }}>Ruolo</th>
                  <th style={{ width: '15%', textAlign: 'center' }}>Abbonamento</th>
                  <th style={{ width: '20%', textAlign: 'center' }}>Stato Stripe</th>
                  <th style={{ width: '10%', textAlign: 'center' }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '3rem' }}>
                      <RefreshCw className="spin-animation" style={{ opacity: 0.5 }} />
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      Nessun utente trovato.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(u => (
                    <tr key={u.email}>
                      <td style={{ fontWeight: 600, color: 'var(--text-bright)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <User size={14} color="var(--text-muted)" />
                          </div>
                          {u.email}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {u.role === 'admin' ? (
                          <span className="badge" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', borderColor: 'rgba(139, 92, 246, 0.3)' }}>
                            <Shield size={12} /> Admin
                          </span>
                        ) : (
                          <span className="badge badge-neutral">User</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {u.subscription === 'Premium' ? (
                          <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fcd34d', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                            <Star size={12} /> Premium
                          </span>
                        ) : (
                          <span className="badge badge-neutral">Free</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', opacity: 0.7 }}>
                          {u.subscriptionStatus}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          onClick={() => openEditModal(u)}
                          className="btn btn-secondary btn-icon-only" 
                          style={{ padding: '0.4rem' }}
                          title="Modifica Utente"
                        >
                          <MoreVertical size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editUser && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem', animation: 'fadeIn 0.2s ease'
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '2rem', borderTop: '3px solid #ec4899', animation: 'slideDown 0.3s ease' }}>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1.2rem', color: 'var(--text-bright)' }}>Modifica Utente</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{editUser.email}</p>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Ruolo</label>
              <select value={editRole} onChange={e => setEditRole(e.target.value)} className="select-input" style={{ width: '100%' }}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label>Abbonamento</label>
              <select value={editSub} onChange={e => setEditSub(e.target.value)} className="select-input" style={{ width: '100%' }}>
                <option value="Free">Free</option>
                <option value="Premium">Premium</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={closeEditModal} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} disabled={updating}>
                Annulla
              </button>
              <button onClick={handleUpdateUser} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', background: '#ec4899', borderColor: '#ec4899', color: 'white' }} disabled={updating}>
                {updating ? 'Salvataggio...' : 'Salva Modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
