import React from 'react';
import { Lock, CreditCard, ExternalLink } from 'lucide-react';

export default function Paywall({ user, onManageSubscription, onSubscribe }) {
  const isTrial = user?.subscriptionStatus === 'trialing';
  const hasExpired = new Date() > new Date(user?.trialEndsAt);

  return (
    <div className="state-container" style={{ borderColor: 'var(--accent-gold)', padding: '3rem', maxWidth: '600px', margin: '4rem auto' }}>
      <Lock size={48} color="var(--accent-gold)" style={{ marginBottom: '1rem' }} />
      <h2 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>Accesso Bloccato</h2>
      
      {isTrial && hasExpired ? (
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
          Il tuo periodo di prova di 7 giorni è scaduto. Per continuare a utilizzare Trading Portfolio Manager e analizzare le tue performance, attiva un abbonamento.
        </p>
      ) : (
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
          Il tuo abbonamento risulta inattivo ({user?.subscriptionStatus || 'Nessuno'}). Riattivalo per accedere nuovamente alla dashboard.
        </p>
      )}

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        {(!user?.subscriptionStatus || user?.subscriptionStatus === 'trialing' || user?.subscriptionStatus === 'none') ? (
          <button onClick={onSubscribe} className="btn btn-primary" style={{ padding: '0.8rem 1.5rem', fontSize: '1rem' }}>
            <CreditCard size={18} />
            Abbonati Ora
          </button>
        ) : (
          <button onClick={onManageSubscription} className="btn btn-primary" style={{ padding: '0.8rem 1.5rem', fontSize: '1rem' }}>
            <ExternalLink size={18} />
            Gestisci Abbonamento
          </button>
        )}
      </div>
    </div>
  );
}
