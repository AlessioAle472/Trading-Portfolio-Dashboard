import React, { useState, useEffect } from 'react';
import Overview from './components/Overview';
import StrategyTable from './components/StrategyTable';
import AddStrategyModal from './components/AddStrategyModal';
import SectionModal from './components/SectionModal';
import Auth from './pages/Auth';
import ReportAnalysis from './pages/ReportAnalysis';
import PortfolioManagement from './pages/PortfolioManagement';
import EquityCharts from './pages/EquityCharts';
import TasseTrading from './pages/TasseTrading';
import AccountSettings from './pages/AccountSettings';
import UsersManagement from './pages/UsersManagement';
import Paywall from './components/Paywall';
import { Download, RefreshCw, Plus, Save, AlertCircle, FileSpreadsheet, Edit3, Trash2, LogOut, User, Sparkles, LayoutDashboard, TrendingUp, BarChart2, Receipt, ExternalLink, Settings, Users } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('trading_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [portfolioData, setPortfolioData] = useState(null);
  const [activeTab, setActiveTab] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentView, setCurrentView] = useState('portfolio'); // 'portfolio' | 'analysis' | 'management' | 'charts' | 'taxes'
  const [impersonateMode, setImpersonateMode] = useState(null); // null | 'free' | 'premium'
  const [pendingRiskRefresh, setPendingRiskRefresh] = useState(false);
  const [lastUploadedTradesCount, setLastUploadedTradesCount] = useState(0);
  const [lastUploadedFileName, setLastUploadedFileName] = useState('');
  const [managementData, setManagementData] = useState(null);
  const [loadingManagement, setLoadingManagement] = useState(false);
  
  // Modals state
  const [isAddStratModalOpen, setIsAddStratModalOpen] = useState(false);
  const [sectionModal, setSectionModal] = useState({ isOpen: false, mode: 'add', initialName: '' });
  
  const [toast, setToast] = useState(null);

  // Load portfolio data for the authenticated user
  const loadPortfolio = async (isReset = false) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const url = isReset ? '/api/portfolio/reset' : '/api/portfolio';
      const method = isReset ? 'POST' : 'GET';
      
      const response = await fetch(url, { 
        method,
        headers: {
          'x-user-email': user.email
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to load portfolio: ${response.statusText}`);
      }
      
      const resData = await response.json();
      const actualData = isReset ? resData.data : resData;
      
      setPortfolioData(actualData);
      
      // Select active tab
      const keys = Object.keys(actualData);
      if (keys.length > 0) {
        if (!activeTab) {
          setActiveTab('TUTTE');
        }
      } else {
        setActiveTab('');
      }
      
      showToast(isReset ? 'Resettato con successo da Numbers' : 'Dati caricati con successo!');
      if (isReset) {
        loadManagementStats(false);
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadManagementStats = async (force = false) => {
    if (!user) return;
    setLoadingManagement(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/portfolio-management/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': user.email
        },
        body: JSON.stringify({ forceRefresh: force })
      });
      if (!response.ok) {
        throw new Error('Failed to load portfolio management stats');
      }
      const data = await response.json();
      setManagementData(data);
    } catch (err) {
      console.error(err);
      alert('Errore durante il calcolo dello stato di salute del portafoglio.');
    } finally {
      setLoadingManagement(false);
    }
  };

  const loadUserRefresh = async (currentUser) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/me`, { headers: { 'x-user-email': currentUser.email } });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        localStorage.setItem('trading_user', JSON.stringify(data.user));
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (user) {
      loadUserRefresh(user);
      loadPortfolio();
      loadManagementStats();
    }
  }, []); // Only run once on mount for the refresh

  const effectiveUser = React.useMemo(() => {
    if (!user) return null;
    if (user.role !== 'admin' || !impersonateMode) return user;
    if (impersonateMode === 'free') {
      return { ...user, role: 'user', subscription: 'Free', trialEndsAt: new Date(Date.now() - 1000).toISOString(), subscriptionStatus: 'none' };
    }
    if (impersonateMode === 'premium') {
      return { ...user, role: 'user', subscription: 'Premium', subscriptionStatus: 'active' };
    }
    return user;
  }, [user, impersonateMode]);

  const effectivePortfolioData = React.useMemo(() => {
    if (!portfolioData) return null;
    if (impersonateMode) {
      const empty = {};
      for (const key of Object.keys(portfolioData)) {
        empty[key] = [];
      }
      return empty;
    }
    return portfolioData;
  }, [portfolioData, impersonateMode]);

  const effectiveManagementData = React.useMemo(() => {
    if (!managementData) return null;
    if (impersonateMode) {
      return {
        ...managementData,
        strategies: [],
        totals: {
          total_profit: 0,
          total_dd: 0,
          total_trades: 0,
          total_live_strategies: 0
        }
      };
    }
    return managementData;
  }, [managementData, impersonateMode]);

  useEffect(() => {
    if ((currentView === 'taxes' || currentView === 'users') && effectiveUser?.role !== 'admin') {
      setCurrentView('portfolio');
      showToast('Accesso negato. Permessi di amministratore richiesti.');
    }
  }, [currentView, effectiveUser]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const handleAuthSuccess = (authenticatedUser) => {
    localStorage.setItem('trading_user', JSON.stringify(authenticatedUser));
    setUser(authenticatedUser);
    loadUserRefresh(authenticatedUser); // Refresh per prendere i campi Stripe
    loadPortfolio();
    loadManagementStats();
  };

  const handleLogout = () => {
    localStorage.removeItem('trading_user');
    setUser(null);
    setPortfolioData(null);
    setActiveTab('');
    setManagementData(null);
  };

  // Helper to save whole portfolio to database
  const savePortfolioToBackend = async (data) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/portfolio`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-email': user.email
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        throw new Error('Failed to save portfolio');
      }
      return true;
    } catch (err) {
      console.error(err);
      showToast('Errore durante il salvataggio dei dati');
      return false;
    }
  };

  // Update a single field on a strategy
  const handleUpdateStrategy = async (sheetName, id, field, value) => {
    if (!portfolioData) return;
    
    const updatedData = { ...portfolioData };
    updatedData[sheetName] = updatedData[sheetName].map(strat => {
      if (strat.id === id) {
        return { ...strat, [field]: value };
      }
      return strat;
    });
    
    setPortfolioData(updatedData);
    const success = await savePortfolioToBackend(updatedData);
    if (success) {
      showToast('Cella modificata e salvata!');
      loadManagementStats(false);
    }
  };

  // Add a new strategy
  const handleAddStrategy = async (sheetName, newStrat) => {
    if (!portfolioData) return;
    
    const randomId = Math.random().toString(36).substring(2, 9);
    const id = `${sheetName.toLowerCase().replace(' ', '_')}_${newStrat.mercato.toLowerCase()}_${newStrat.magic}_${randomId}`;
    
    const strategyWithId = { id, ...newStrat };
    
    const updatedData = { ...portfolioData };
    updatedData[sheetName] = [strategyWithId, ...updatedData[sheetName]];
    
    setPortfolioData(updatedData);
    const success = await savePortfolioToBackend(updatedData);
    if (success) {
      showToast('Nuova strategia aggiunta!');
      loadManagementStats(false);
    }
  };

  // Delete a strategy
  const handleDeleteStrategy = async (sheetName, id) => {
    if (!portfolioData) return;
    
    const updatedData = { ...portfolioData };
    updatedData[sheetName] = updatedData[sheetName].filter(strat => strat.id !== id);
    
    setPortfolioData(updatedData);
    const success = await savePortfolioToBackend(updatedData);
    if (success) {
      showToast('Strategia eliminata!');
      loadManagementStats(false);
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     SECTION (TAB) MANAGEMENT
     ───────────────────────────────────────────────────────────────────────────── */

  const handleAddSection = async (name) => {
    if (!portfolioData) return;
    
    // Check pricing restrictions: Standard is restricted to 6 tabs
    const currentTabsCount = Object.keys(portfolioData).length;
    const isStandard = user.subscription && user.subscription.includes('Standard');
    if (isStandard && currentTabsCount >= 6) {
      alert('Il piano Standard è limitato a un massimo di 6 sezioni di trading. Effettua l\'upgrade a Premium per aggiungere sezioni illimitate!');
      return;
    }

    if (portfolioData[name]) {
      alert('Esiste già una sezione con questo nome.');
      return;
    }

    const updatedData = { ...portfolioData, [name]: [] };
    setPortfolioData(updatedData);
    setActiveTab(name);
    
    const success = await savePortfolioToBackend(updatedData);
    if (success) {
      showToast(`Sezione "${name}" creata!`);
      loadManagementStats(false);
    }
  };

  const handleRenameSection = async (newName) => {
    if (!portfolioData || !activeTab) return;
    if (activeTab === newName) return;

    if (portfolioData[newName]) {
      alert('Esiste già una sezione con questo nome.');
      return;
    }

    // Map object to rename the key preserving order
    const updatedData = {};
    Object.keys(portfolioData).forEach(key => {
      if (key === activeTab) {
        updatedData[newName] = portfolioData[activeTab];
      } else {
        updatedData[key] = portfolioData[key];
      }
    });

    setPortfolioData(updatedData);
    setActiveTab(newName);
    
    const success = await savePortfolioToBackend(updatedData);
    if (success) {
      showToast(`Sezione rinominata in "${newName}"!`);
      loadManagementStats(false);
    }
  };

  const handleDeleteSection = async () => {
    if (!portfolioData || !activeTab) return;
    
    if (confirm(`Sei sicuro di voler eliminare l'intera sezione "${activeTab}" e tutte le sue strategie?`)) {
      const updatedData = { ...portfolioData };
      delete updatedData[activeTab];
      
      setPortfolioData(updatedData);
      
      const keys = Object.keys(updatedData);
      if (keys.length > 0) {
        setActiveTab(keys[0]);
      } else {
        setActiveTab('');
      }
      
      const success = await savePortfolioToBackend(updatedData);
      if (success) {
        showToast('Sezione eliminata!');
        loadManagementStats(false);
      }
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     EXCEL EXPORT
     ───────────────────────────────────────────────────────────────────────────── */

  const handleExportExcel = async () => {
    if (!portfolioData) return;
    showToast('Generazione Excel in corso...');
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/export`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-email': user.email
        },
        body: JSON.stringify(portfolioData)
      });
      
      if (!response.ok) {
        throw new Error('Export failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Portafoglio_Trading_Punto0.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Excel scaricato con successo!');
    } catch (err) {
      console.error(err);
      alert('Errore durante la generazione del file Excel.');
    }
  };

  const handleResetConfirm = () => {
    if (confirm('Vuoi davvero ripristinare i dati di partenza dal file Numbers originale? Attenzione: tutte le modifiche salvate andranno perse.')) {
      loadPortfolio(true);
    }
  };

  // If user is not authenticated, show Auth Page
  if (!user) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  // Stripe Handlers
  const handleSubscribe = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'x-user-email': user.email }
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Errore durante l'apertura del checkout.");
    } catch (e) {
      alert("Errore di connessione a Stripe.");
    }
  };

  const handleManageSubscription = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/stripe/create-portal-session`, {
        method: 'POST',
        headers: { 'x-user-email': user.email }
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Errore durante l'apertura del portale.");
    } catch (e) {
      alert("Errore di connessione a Stripe.");
    }
  };

  const isBlocked = () => {
    if (!effectiveUser) return false;
    if (effectiveUser.role === 'admin') return false;
    const isTrialExpired = new Date() > new Date(effectiveUser.trialEndsAt);
    const isSubActive = effectiveUser.subscriptionStatus === 'active';
    return isTrialExpired && !isSubActive;
  };

  // Get style color for subscription badge
  const getSubColor = () => {
    if (effectiveUser.subscription.includes('Admin')) return 'var(--accent-gold)';
    if (effectiveUser.subscription.includes('Premium')) return '#8b5cf6'; // Violet
    return 'var(--accent-blue)';
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-icon">📈</div>
          <div>
            <h1 className="brand-title">Trading Portfolio Manager</h1>
            <p className="brand-subtitle">Controllo drawdown &amp; alert live</p>
          </div>
        </div>

        {/* User profile & controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div 
            onClick={() => setCurrentView('settings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              padding: '0.5rem 1rem',
              background: currentView === 'settings' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${currentView === 'settings' ? 'rgba(139, 92, 246, 0.5)' : 'var(--border-color)'}`,
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            className="user-profile-badge hover-lift"
            title="Impostazioni Account"
          >
            <Settings size={16} color={currentView === 'settings' ? '#8b5cf6' : 'var(--text-muted)'} />
            <div style={{ fontSize: '0.85rem' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-bright)' }}>{effectiveUser.email}</div>
              <div style={{ 
                fontSize: '0.7rem', 
                color: getSubColor(), 
                fontWeight: 700, 
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
                marginTop: '0.05rem'
              }}>
                {(effectiveUser.subscription.includes('Premium') || effectiveUser.subscription.includes('Admin')) && <Sparkles size={8} />}
                {effectiveUser.subscription}
              </div>
            </div>
          </div>
          
          <div className="header-actions">
            <button 
              onClick={() => setCurrentView('portfolio')} 
              className={`btn ${currentView === 'portfolio' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              title="Portafoglio trading"
            >
              <LayoutDashboard size={16} />
              Portafoglio
            </button>

            <button 
              onClick={() => setCurrentView('management')} 
              className={`btn ${currentView === 'management' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'var(--accent-gold)', color: currentView === 'management' ? 'var(--bg-dark)' : 'var(--accent-gold)', position: 'relative' }}
              title="Salute e Money Management"
            >
              <Sparkles size={16} />
              Gestione Risk
              {pendingRiskRefresh && (
                <span style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-5px',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#ff9800',
                  border: '2px solid var(--bg-dark)',
                  animation: 'pulse 1.5s infinite'
                }} title="Nuovi dati disponibili!" />
              )}
            </button>

            <button 
              onClick={() => setCurrentView('analysis')} 
              className={`btn ${currentView === 'analysis' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              title="Carica e analizza report MT4/MT5"
            >
              <TrendingUp size={16} />
              Analisi Report
            </button>

            <button 
              onClick={() => setCurrentView('charts')} 
              className={`btn ${currentView === 'charts' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: currentView === 'charts' ? undefined : 'rgba(139,92,246,0.5)', color: currentView !== 'charts' ? '#8b5cf6' : undefined }}
              title="Grafici Equity e Gruppi Strategie"
            >
              <BarChart2 size={16} />
              Grafici Equity
            </button>

            {effectiveUser?.role === 'admin' && (
              <>
                <button 
                  onClick={() => setCurrentView('taxes')} 
                  className={`btn ${currentView === 'taxes' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: currentView === 'taxes' ? undefined : 'rgba(251,146,60,0.5)', color: currentView !== 'taxes' ? '#fb923c' : undefined }}
                  title="Calcolo imposta sostitutiva 26%"
                >
                  <Receipt size={16} />
                  Tasse Trading
                </button>
                <button 
                  onClick={() => setCurrentView('users')} 
                  className={`btn ${currentView === 'users' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: currentView === 'users' ? undefined : 'rgba(236,72,153,0.5)', color: currentView !== 'users' ? '#ec4899' : undefined }}
                  title="Gestione Utenti e Abbonamenti"
                >
                  <Users size={16} />
                  Gestione Utenti
                </button>
              </>
            )}

            {currentView === 'portfolio' && !isBlocked() && (
              <>
                <button onClick={handleExportExcel} className="btn btn-primary" title="Esporta in Excel">
                  <Download size={16} />
                  Esporta Excel
                </button>
                
                <button onClick={() => loadPortfolio(false)} className="btn btn-secondary" title="Aggiorna dati">
                  <RefreshCw size={16} />
                </button>

                <button onClick={handleResetConfirm} className="btn btn-secondary btn-danger" title="Reset completo da Numbers">
                  Reset
                </button>
              </>
            )}

            {!isBlocked() && effectiveUser?.role !== 'admin' && (
              <button onClick={handleManageSubscription} className="btn btn-secondary" style={{ borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }} title="Gestisci Abbonamento">
                <ExternalLink size={16} />
              </button>
            )}

            <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.6rem' }} title="Esci">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        
        {/* Impersonation Admin Bar */}
        {user?.role === 'admin' && (
          <div style={{ 
            marginTop: '1rem', 
            padding: '0.5rem 1rem', 
            background: 'rgba(245, 158, 11, 0.1)', 
            border: '1px solid rgba(245, 158, 11, 0.3)', 
            borderRadius: '10px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '1rem' 
          }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-warn)', fontWeight: 600, textTransform: 'uppercase' }}>Visualizza Come:</span>
            <select 
              value={impersonateMode || ''} 
              onChange={e => setImpersonateMode(e.target.value || null)}
              className="select-input"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', minWidth: '150px' }}
            >
              <option value="">Admin (Predefinito)</option>
              <option value="free">Utente Base (Free)</option>
              <option value="premium">Utente Pro (Premium)</option>
            </select>
          </div>
        )}
      </header>

      {/* Main Content */}
      {isBlocked() ? (
        <Paywall 
          user={effectiveUser} 
          onSubscribe={handleSubscribe} 
          onManageSubscription={handleManageSubscription} 
        />
      ) : currentView === 'analysis' ? (
        <ReportAnalysis
          user={effectiveUser}
          onReportUploaded={(count, fileName) => {
            setPendingRiskRefresh(true);
            setLastUploadedTradesCount(count);
            setLastUploadedFileName(fileName);
          }}
        />
      ) : currentView === 'management' ? (
        <PortfolioManagement 
          portfolioData={effectivePortfolioData}
          onUpdateStrategy={handleUpdateStrategy}
          user={effectiveUser}
          pendingRefresh={pendingRiskRefresh}
          lastUploadedTradesCount={lastUploadedTradesCount}
          lastUploadedFileName={lastUploadedFileName}
          onRefreshAcknowledged={() => setPendingRiskRefresh(false)}
          managementData={effectiveManagementData}
          loadingManagement={loadingManagement}
          onReloadManagementData={loadManagementStats}
          onDeleteStrategy={handleDeleteStrategy}
        />
      ) : currentView === 'charts' ? (
        <EquityCharts
          portfolioData={effectivePortfolioData}
          user={effectiveUser}
        />
      ) : currentView === 'taxes' ? (
        <TasseTrading user={effectiveUser} />
      ) : currentView === 'users' ? (
        <UsersManagement user={effectiveUser} />
      ) : currentView === 'settings' ? (
        <AccountSettings user={effectiveUser} onUserUpdated={loadUserRefresh} />
      ) : loading ? (
        <div className="state-container">
          <div className="loading-spinner"></div>
          <p>Caricamento del portafoglio quantitativo...</p>
        </div>
) : error ? (
        <div className="state-container" style={{ borderColor: 'var(--color-crit)' }}>
          <AlertCircle size={40} color="var(--color-crit)" />
          <h2>Impossibile caricare il portafoglio</h2>
          <p>{error}</p>
          <button onClick={() => loadPortfolio(false)} className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Riprova
          </button>
        </div>
      ) : effectivePortfolioData ? (
        <>
          {/* Navigation with dynamic sections */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
            <nav className="tabs-container" style={{ flex: 1 }}>
              <button
                key="TUTTE"
                onClick={() => setActiveTab('TUTTE')}
                className={`tab-btn ${activeTab === 'TUTTE' ? 'active' : ''}`}
              >
                <span>TUTTE LE SEZIONI</span>
                <span className="tab-count">
                  {Object.values(effectivePortfolioData).reduce((acc, curr) => acc + curr.length, 0)}
                </span>
              </button>
              {Object.keys(effectivePortfolioData).map((sheetName) => (
                <button
                  key={sheetName}
                  onClick={() => setActiveTab(sheetName)}
                  className={`tab-btn ${activeTab === sheetName ? 'active' : ''}`}
                >
                  <span>{sheetName}</span>
                  <span className="tab-count">{effectivePortfolioData[sheetName].length}</span>
                </button>
              ))}
            </nav>
            
            {/* Add Section trigger */}
            <button 
              onClick={() => setSectionModal({ isOpen: true, mode: 'add', initialName: '' })} 
              className="btn btn-secondary" 
              style={{ padding: '0.7rem 0.9rem', borderRadius: '14px', height: '46px' }}
              title="Aggiungi Nuova Sezione"
            >
              <Plus size={16} />
              Sezione
            </button>
          </div>

          {/* Active Tab actions (Rename / Delete Tab) */}
          {activeTab && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  {activeTab === 'TUTTE' ? 'Tutte le Sezioni Combined' : activeTab}
                </h2>
                {activeTab !== 'TUTTE' && (
                  <>
                    <button 
                      onClick={() => setSectionModal({ isOpen: true, mode: 'edit', initialName: activeTab })}
                      className="btn btn-secondary btn-icon-only" 
                      style={{ padding: '0.25rem', borderRadius: '6px', height: '24px', border: 'none', background: 'transparent' }}
                      title="Rinomina Sezione"
                    >
                      <Edit3 size={14} color="var(--text-muted)" />
                    </button>
                    <button 
                      onClick={handleDeleteSection}
                      className="btn btn-secondary btn-icon-only btn-danger" 
                      style={{ padding: '0.25rem', borderRadius: '6px', height: '24px', border: 'none', background: 'transparent' }}
                      title="Elimina Sezione"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>

              <button onClick={() => setIsAddStratModalOpen(true)} className="btn btn-primary" style={{ padding: '0.5rem 1.1rem' }}>
                <Plus size={16} />
                Aggiungi Strategia
              </button>
            </div>
          )}

          {/* Overview Dashboard for Active Tab */}
          {activeTab ? (
            <Overview data={effectivePortfolioData} activeTab={activeTab} />
          ) : (
            <div className="state-container">
              <h3>Nessuna Sezione Disponibile</h3>
              <p>Clicca su "+ Sezione" per creare una nuova sezione di trading.</p>
            </div>
          )}

          {/* Strategy table */}
          {activeTab && (
            <StrategyTable
              portfolioData={effectivePortfolioData}
              activeTab={activeTab}
              onUpdateStrategy={handleUpdateStrategy}
              onDeleteStrategy={handleDeleteStrategy}
              onTabChange={(tabName) => setActiveTab(tabName)}
            />
          )}
        </>
      ) : (
        <div className="state-container">
          <p>Nessun dato del portafoglio disponibile.</p>
        </div>
      )}

      {/* Add Strategy Modal */}
      <AddStrategyModal
        isOpen={isAddStratModalOpen}
        onClose={() => setIsAddStratModalOpen(false)}
        onAddStrategy={handleAddStrategy}
        sheetName={activeTab}
        portfolioData={effectivePortfolioData}
      />

      {/* Section tab management modal */}
      <SectionModal
        isOpen={sectionModal.isOpen}
        mode={sectionModal.mode}
        initialName={sectionModal.initialName}
        onClose={() => setSectionModal({ isOpen: false, mode: 'add', initialName: '' })}
        onSubmit={(name) => {
          if (sectionModal.mode === 'add') {
            handleAddSection(name);
          } else {
            handleRenameSection(name);
          }
        }}
      />

      {/* Toast notifications */}
      {toast && (
        <div className="toast">
          <FileSpreadsheet size={16} color="var(--accent-gold)" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
