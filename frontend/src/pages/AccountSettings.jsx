import React, { useState } from 'react';
import { User, Lock, Mail, Shield, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AccountSettings({ user, onUserUpdated }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const getSubColor = () => {
    if (user.subscription.includes('Admin')) return 'var(--accent-gold)';
    if (user.subscription.includes('Premium')) return '#8b5cf6';
    return 'var(--accent-blue)';
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("Le nuove password non corrispondono.");
      return;
    }
    if (newPassword.length < 6) {
      setError("La nuova password deve contenere almeno 6 caratteri.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': user.email
        },
        body: JSON.stringify({ oldPassword, newPassword })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Errore durante l\'aggiornamento della password');
      }

      setSuccess(true);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
        <User size={32} color="var(--accent-blue)" />
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>Impostazioni Profilo</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Profile Card */}
        <div className="state-container" style={{ textAlign: 'left', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={18} color="var(--text-muted)" />
            Dati Account
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                Indirizzo Email
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <Mail size={16} color="var(--text-muted)" />
                <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-bright)' }}>{user.email}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                  Ruolo Utente
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <User size={16} color={user.role === 'admin' ? 'var(--accent-gold)' : 'var(--text-muted)'} />
                  <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-bright)', textTransform: 'capitalize' }}>{user.role}</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                  Piano di Abbonamento
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <Sparkles size={16} color={getSubColor()} />
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: getSubColor() }}>{user.subscription}</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Change Password Card */}
        <div className="state-container" style={{ textAlign: 'left', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lock size={18} color="var(--text-muted)" />
            Sicurezza e Accesso
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Aggiorna regolarmente la tua password per mantenere sicuro il tuo account.
          </p>

          <form onSubmit={handlePasswordChange} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-crit)', padding: '0.75rem 1rem', borderRadius: '8px', color: 'var(--color-crit)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', padding: '0.75rem 1rem', borderRadius: '8px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <CheckCircle2 size={16} />
                <span>Password aggiornata con successo!</span>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Vecchia Password</label>
              <input 
                type="password" 
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                placeholder="Inserisci la password attuale"
                required
                style={{ width: '100%', maxWidth: '400px' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Nuova Password</label>
              <input 
                type="password" 
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Almeno 6 caratteri"
                required
                minLength={6}
                style={{ width: '100%', maxWidth: '400px' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Conferma Nuova Password</label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Ripeti la nuova password"
                required
                minLength={6}
                style={{ width: '100%', maxWidth: '400px' }}
              />
            </div>

            <div>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ padding: '0.75rem 2rem', fontWeight: 600 }}>
                {loading ? 'Salvataggio...' : 'Aggiorna Password'}
              </button>
            </div>

          </form>
        </div>

      </div>
    </div>
  );
}
