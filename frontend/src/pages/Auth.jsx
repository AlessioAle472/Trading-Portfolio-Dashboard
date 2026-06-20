import React, { useState } from 'react';
import { Mail, Lock, ShieldCheck, CreditCard, Sparkles, AlertCircle, ArrowRight, Check } from 'lucide-react';

export default function Auth({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Registration steps: 'account' -> 'plan' -> 'checkout'
  const [signupStep, setSignupStep] = useState('account');
  const [selectedPlan, setSelectedPlan] = useState('standard'); // 'standard' or 'premium'
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Check if email is admin (BYPASS PAYWALL: restituisce sempre true per saltare il pagamento)
  const isAdminEmail = (emailStr) => {
    return true; // Bypass del paywall attivato per l'amministratore
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        // Login flow
        const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Errore nel login');
        
        onAuthSuccess(data.user);
      } else {
        // Sign Up step 1 flow: Account Details
        if (!email.trim() || !password.trim()) {
          throw new Error('Inserire email e password');
        }
        
        // If email is admin, skip payment and register immediately
        if (isAdminEmail(email)) {
          completeRegistration('Admin (Gratuito)');
        } else {
          // Go to plan selection step
          setSignupStep('plan');
          setLoading(false);
        }
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const completeRegistration = async (subPlan) => {
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, subscription: subPlan })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Errore nella registrazione');
      
      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      setSignupStep('account'); // fallback to start
    }
  };

  const handlePlanSelectionSubmit = (e) => {
    e.preventDefault();
    setSignupStep('checkout');
  };

  const handleCheckoutSubmit = (e) => {
    e.preventDefault();
    if (!cardName.trim() || cardNumber.length < 16 || !cardExpiry.trim() || cardCvv.length < 3) {
      setError('Inserisci dettagli di pagamento validi');
      return;
    }

    setLoading(true);
    setError('');
    
    // Simulate payment processing animation
    setTimeout(() => {
      setPaymentSuccess(true);
      setTimeout(() => {
        const planText = selectedPlan === 'standard' ? 'Standard (3.99€/mese)' : 'Premium (9.99€/mese)';
        completeRegistration(planText);
      }, 1500);
    }, 2000);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      padding: '1rem'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: signupStep === 'plan' ? '720px' : '440px',
        padding: '2.5rem',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5), var(--shadow-glow)',
        border: '1px solid rgba(226, 194, 125, 0.15)',
        transition: 'all 0.3s ease'
      }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span style={{ fontSize: '3rem' }}>📈</span>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem' }}>
            Trading Portfolio Manager
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            {isLogin ? 'Accedi al tuo pannello quantitativo' : 'Registra il tuo account di trading'}
          </p>
        </div>

        {error && (
          <div style={{
            background: 'var(--color-crit-bg)',
            color: 'var(--color-crit)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1.5rem'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: LOGIN OR ACCOUNT REGISTER */}
        {isLogin || signupStep === 'account' ? (
          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label>Indirizzo Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="email" 
                  placeholder="nome@esempio.it" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', paddingLeft: '2.5rem' }}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', paddingLeft: '2.5rem' }}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem', height: '42px' }} disabled={loading}>
              {loading ? (
                <div className="loading-spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>
              ) : (
                <>
                  {isLogin ? 'Accedi' : 'Continua'} 
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                {isLogin ? 'Non hai un account?' : 'Hai già un account?'} 
              </span>
              <button 
                type="button" 
                onClick={() => {
                  setIsLogin(!isLogin);
                  setSignupStep('account');
                  setError('');
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent-gold)', fontWeight: 600, marginLeft: '0.35rem', cursor: 'pointer' }}
              >
                {isLogin ? 'Registrati' : 'Accedi'}
              </button>
            </div>
          </form>
        ) : null}

        {/* STEP 2: PLAN SELECTOR (Normal Users Only) */}
        {!isLogin && signupStep === 'plan' && (
          <form onSubmit={handlePlanSelectionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, textAlign: 'center' }}>
              Scegli il tuo piano di abbonamento
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginTop: '0.5rem' }}>
              {/* Standard Card */}
              <div 
                onClick={() => setSelectedPlan('standard')}
                className={`card ${selectedPlan === 'standard' ? 'active-plan' : ''}`}
                style={{
                  cursor: 'pointer',
                  border: selectedPlan === 'standard' ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                  background: selectedPlan === 'standard' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(255,255,255,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  padding: '1.5rem',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Standard</span>
                  {selectedPlan === 'standard' && <Check size={16} color="var(--accent-blue)" />}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                  3,99€ <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>/ mese</span>
                </div>
                <ul style={{ fontSize: '0.8rem', color: 'var(--text-muted)', paddingLeft: '1.1rem', lineHeight: 1.6 }}>
                  <li>Max 6 sezioni di strategie</li>
                  <li>Esportazione Excel base</li>
                  <li>Statistiche e KPI in tempo reale</li>
                </ul>
              </div>

              {/* Premium Card */}
              <div 
                onClick={() => setSelectedPlan('premium')}
                className={`card ${selectedPlan === 'premium' ? 'active-plan' : ''}`}
                style={{
                  cursor: 'pointer',
                  border: selectedPlan === 'premium' ? '2px solid var(--accent-gold)' : '1px solid var(--border-color)',
                  background: selectedPlan === 'premium' ? 'rgba(226, 194, 125, 0.05)' : 'rgba(255,255,255,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  padding: '1.5rem',
                  position: 'relative',
                  boxShadow: selectedPlan === 'premium' ? 'var(--shadow-glow)' : 'none'
                }}
              >
                <div style={{ position: 'absolute', top: '-10px', right: '15px', background: 'var(--accent-gold)', color: '#1a1a2e', fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Consigliato
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    Premium <Sparkles size={12} color="var(--accent-gold)" />
                  </span>
                  {selectedPlan === 'premium' && <Check size={16} color="var(--accent-gold)" />}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                  9,99€ <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>/ mese</span>
                </div>
                <ul style={{ fontSize: '0.8rem', color: 'var(--text-muted)', paddingLeft: '1.1rem', lineHeight: 1.6 }}>
                  <li>Aggiungi infinite sezioni</li>
                  <li>Esportazione Excel illimitata</li>
                  <li>Grafici interattivi avanzati</li>
                  <li>Backup dati cloud</li>
                </ul>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
              <button type="button" onClick={() => setSignupStep('account')} className="btn btn-secondary">
                Indietro
              </button>
              <button type="submit" className="btn btn-primary">
                Procedi al Pagamento
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: MOCK CHECKOUT */}
        {!isLogin && signupStep === 'checkout' && (
          <form onSubmit={handleCheckoutSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <CreditCard size={18} color="var(--accent-gold)" />
              Dettagli di Pagamento
            </h3>
            
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '0.5rem' }}>
              Stai sottoscrivendo il piano <strong>{selectedPlan === 'standard' ? 'Standard (3,99€/mese)' : 'Premium (9,99€/mese)'}</strong>.
            </p>

            {paymentSuccess ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem 1rem',
                gap: '0.75rem',
                animation: 'float 3s ease-in-out infinite'
              }}>
                <div style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  background: 'var(--color-ok-bg)',
                  border: '2px solid var(--color-ok)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Check size={28} color="var(--color-ok)" />
                </div>
                <h4 style={{ color: 'var(--color-ok)' }}>Pagamento Riuscito!</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Creazione del portafoglio quantitativo...</p>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label>Titolare della Carta</label>
                  <input 
                    type="text" 
                    placeholder="Mario Rossi" 
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    className="form-input"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Numero Carta</label>
                  <div style={{ position: 'relative' }}>
                    <CreditCard size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input 
                      type="text" 
                      maxLength="16"
                      placeholder="1234 5678 1234 5678" 
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, ''))}
                      className="form-input"
                      style={{ width: '100%', paddingLeft: '2.5rem', fontFamily: 'var(--font-mono)' }}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Scadenza</label>
                    <input 
                      type="text" 
                      placeholder="MM/AA" 
                      maxLength="5"
                      value={cardExpiry}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (val.length === 2 && !val.includes('/')) val += '/';
                        setCardExpiry(val);
                      }}
                      className="form-input"
                      style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>CVC / CVV</label>
                    <input 
                      type="password" 
                      maxLength="3"
                      placeholder="123" 
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                      className="form-input"
                      style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                  <button type="button" onClick={() => setSignupStep('plan')} className="btn btn-secondary" disabled={loading}>
                    Indietro
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? (
                      <div className="loading-spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>
                    ) : (
                      `Paga ${selectedPlan === 'standard' ? '3,99€' : '9,99€'}`
                    )}
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
