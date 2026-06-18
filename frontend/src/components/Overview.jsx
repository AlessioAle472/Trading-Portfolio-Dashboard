import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { ShieldCheck, AlertTriangle, ShieldAlert, BarChart3, TrendingUp } from 'lucide-react';

export default function Overview({ data, activeTab }) {
  // Get strategies for active tab, or all if TUTTE
  const strategies = activeTab === 'TUTTE'
    ? Object.values(data).flat()
    : (data[activeTab] || []);
  
  // Calculate statistics
  const totalStrategies = strategies.length;
  
  const totalLots = strategies.reduce((acc, curr) => {
    const val = parseFloat(curr.lotti);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  // Helper to determine state dynamically
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

  const alertCounts = strategies.reduce((acc, curr) => {
    const state = getAlertState(curr);
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, { OK: 0, ATTENZIONE: 0, CRITICO: 0 });

  // Prepare chart data 1: Strategies per Market
  const marketCounts = strategies.reduce((acc, curr) => {
    const m = curr.mercato || 'UNKNOWN';
    acc[m] = (acc[m] || 0) + 1;
    return acc;
  }, {});

  const marketChartData = Object.keys(marketCounts).map(key => ({
    name: key,
    value: marketCounts[key]
  })).sort((a, b) => b.value - a.value).slice(0, 10); // top 10

  // Prepare chart data 2: Lots per Market
  const marketLots = strategies.reduce((acc, curr) => {
    const m = curr.mercato || 'UNKNOWN';
    const lots = parseFloat(curr.lotti) || 0;
    acc[m] = (acc[m] || 0) + lots;
    return acc;
  }, {});

  const lotsChartData = Object.keys(marketLots).map(key => ({
    name: key,
    lots: parseFloat(marketLots[key].toFixed(2))
  })).sort((a, b) => b.lots - a.lots).slice(0, 10);

  const COLORS = ['#e2c27d', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Cards Row */}
      <div className="dashboard-grid">
        <div className="card">
          <div className="stat-label">
            <TrendingUp size={16} color="var(--accent-gold)" />
            Strategie Totali ({activeTab})
          </div>
          <div className="stat-value">{totalStrategies}</div>
          <div className="stat-detail">Configurazioni attive nel portfolio</div>
        </div>
        
        <div className="card">
          <div className="stat-label">
            <BarChart3 size={16} color="var(--accent-blue)" />
            Esposizione Lotti
          </div>
          <div className="stat-value mono">{totalLots.toFixed(2)}</div>
          <div className="stat-detail">Somma dei lotti attualmente a mercato</div>
        </div>
        
        <div className="card card-ok">
          <div className="stat-label">
            <ShieldCheck size={16} color="var(--color-ok)" />
            Stato Regolare
          </div>
          <div className="stat-value mono" style={{ color: 'var(--color-ok)' }}>{alertCounts.OK}</div>
          <div className="stat-detail">Strategie con DD nella norma</div>
        </div>

        <div className="card card-warn">
          <div className="stat-label">
            <AlertTriangle size={16} color="var(--color-warn)" />
            In Attenzione
          </div>
          <div className="stat-value mono" style={{ color: 'var(--color-warn)' }}>{alertCounts.ATTENZIONE}</div>
          <div className="stat-detail">Live DD &gt; 80% del Monte Carlo DD</div>
        </div>

        <div className="card card-crit">
          <div className="stat-label">
            <ShieldAlert size={16} color="var(--color-crit)" />
            Stato Critico
          </div>
          <div className="stat-value mono" style={{ color: 'var(--color-crit)' }}>{alertCounts.CRITICO}</div>
          <div className="stat-detail">Live DD superato Monte Carlo DD!</div>
        </div>
      </div>

      {/* Charts Row */}
      {totalStrategies > 0 && (
        <div className="charts-row">
          <div className="chart-card">
            <div className="chart-title">
              <BarChart3 size={18} color="var(--accent-gold)" />
              Lotti Attuali per Mercato (Top 10)
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lotsChartData}>
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#151825', borderColor: 'var(--border-color)', borderRadius: '10px' }}
                    labelStyle={{ color: 'var(--text-bright)', fontWeight: 600 }}
                  />
                  <Bar dataKey="lots" fill="var(--color-ok)">
                    {lotsChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">
              <ShieldCheck size={18} color="var(--accent-blue)" />
              Distribuzione Mercati (Top 10)
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={marketChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {marketChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#151825', borderColor: 'var(--border-color)', borderRadius: '10px' }}
                    labelStyle={{ color: 'var(--text-bright)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
