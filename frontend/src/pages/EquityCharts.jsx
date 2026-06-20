import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine
} from 'recharts';
import {
  BarChart2, Plus, Trash2, RefreshCw, Users, TrendingUp, Search,
  Check, X, ChevronRight, Layers, Activity, AlertCircle, Info, Edit3
} from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────────
   EQUITY TOOLTIP (top chart)
   ────────────────────────────────────────────────────────────────────────── */
const EquityTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const isNegTrade = d.profit < 0;
  const isBigDD = d.cumulative < 0;
  return (
    <div style={{
      background: 'linear-gradient(145deg, #151825, #1a1f2e)',
      border: `1px solid ${isNegTrade ? 'rgba(244,67,54,0.4)' : 'rgba(226,194,125,0.3)'}`,
      borderRadius: '12px',
      padding: '0.85rem 1.1rem',
      boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${isNegTrade ? 'rgba(244,67,54,0.1)' : 'rgba(226,194,125,0.1)'}`,
      fontSize: '0.8rem',
      minWidth: '210px'
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {d.date}
      </div>
      {d.symbol && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Strumento</span>
          <span style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>{d.symbol}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>Trade</span>
        <span style={{ color: isNegTrade ? 'var(--color-crit)' : 'var(--color-ok)', fontWeight: 700 }}>
          {d.profit >= 0 ? '+' : ''}{d.profit.toFixed(2)} €
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>High Water Mark</span>
        <span style={{ color: 'var(--accent-gold)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
          +{(d.high_water_mark ?? 0).toFixed(2)} €
        </span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingTop: '0.4rem', marginTop: '0.3rem'
      }}>
        <span style={{ color: 'var(--text-muted)' }}>Equity Cumulativa</span>
        <span style={{
          color: isBigDD ? 'var(--color-crit)' : 'var(--accent-gold)',
          fontWeight: 800, fontFamily: 'var(--font-mono)'
        }}>
          {d.cumulative >= 0 ? '+' : ''}{d.cumulative.toFixed(2)} €
        </span>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
   DRAWDOWN TOOLTIP (bottom chart)
   ────────────────────────────────────────────────────────────────────────── */
const DrawdownTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const dd = d.drawdown ?? 0;
  const ddPct = d.high_water_mark && d.high_water_mark !== 0
    ? Math.abs((dd / d.high_water_mark) * 100)
    : 0;
  if (dd === 0) return null;
  return (
    <div style={{
      background: 'linear-gradient(145deg, #1a1018, #1f1520)',
      border: '1px solid rgba(244,67,54,0.35)',
      borderRadius: '12px',
      padding: '0.85rem 1.1rem',
      boxShadow: '0 8px 32px rgba(244,67,54,0.15)',
      fontSize: '0.8rem',
      minWidth: '200px'
    }}>
      <div style={{ color: 'rgba(244,67,54,0.6)', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {d.date}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <span style={{ color: 'rgba(244,67,54,0.7)' }}>HWM</span>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
          +{(d.high_water_mark ?? 0).toFixed(2)} €
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <span style={{ color: 'rgba(244,67,54,0.7)' }}>Equity</span>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
          {d.cumulative >= 0 ? '+' : ''}{(d.cumulative ?? 0).toFixed(2)} €
        </span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        borderTop: '1px solid rgba(244,67,54,0.15)',
        paddingTop: '0.4rem', marginTop: '0.3rem'
      }}>
        <span style={{ color: '#f44336', fontWeight: 700 }}>Drawdown</span>
        <span style={{ color: '#f44336', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
          {dd.toFixed(2)} € ({ddPct.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
   EQUITY + DRAWDOWN CHART DISPLAY
   Two synchronized AreaCharts stacked vertically, sharing syncId='equity_sync'.
   ────────────────────────────────────────────────────────────────────────── */
const EquityLineChart = ({ data, title, subtitle, loading, error }) => {
  const isEmpty = !data || data.length === 0;
  const finalProfit = isEmpty ? 0 : data[data.length - 1].cumulative;
  const maxValue = isEmpty ? 0 : Math.max(...data.map(d => d.cumulative));
  const minValue = isEmpty ? 0 : Math.min(...data.map(d => d.cumulative));
  const maxDrawdown = isEmpty ? 0 : Math.min(...data.map(d => d.drawdown ?? 0));
  const maxDrawdownPct = isEmpty || maxValue <= 0 ? 0 : Math.abs((maxDrawdown / maxValue) * 100);

  // Downsample for performance if > 500 points
  const chartData = useMemo(() => {
    if (!data || data.length <= 500) return data || [];
    const step = Math.ceil(data.length / 500);
    return data.filter((_, i) => i % step === 0 || i === data.length - 1);
  }, [data]);

  const gradientId = `equityGrad_${title?.replace(/\s/g, '')}`;
  const ddGradientId = `ddGrad_${title?.replace(/\s/g, '')}`;
  const isPositive = finalProfit >= 0;

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '460px', gap: '1rem' }}>
      <div className="loading-spinner" />
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Calcolo curva equity e drawdown in corso...</p>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '460px', gap: '1rem' }}>
      <AlertCircle size={32} color="var(--color-crit)" />
      <p style={{ color: 'var(--color-crit)', fontSize: '0.85rem' }}>{error}</p>
    </div>
  );

  if (isEmpty) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '460px', gap: '1rem' }}>
      <Activity size={32} color="var(--text-muted)" style={{ opacity: 0.3 }} />
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nessun deal trovato per questa strategia/gruppo.</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', opacity: 0.6 }}>Verifica che il Magic Number corrisponda ai deal caricati.</p>
    </div>
  );

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Profit Netto</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: isPositive ? 'var(--color-ok)' : 'var(--color-crit)', fontFamily: 'var(--font-mono)' }}>
            {isPositive ? '+' : ''}{finalProfit.toFixed(2)} €
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Trade Totali</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-bright)' }}>{data.length}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Picco (HWM)</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)' }}>+{maxValue.toFixed(2)} €</div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Max Drawdown</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: maxDrawdown < 0 ? 'var(--color-crit)' : 'var(--color-ok)', fontFamily: 'var(--font-mono)' }}>
            {maxDrawdown.toFixed(2)} €
            {maxDrawdownPct > 0 && (
              <span style={{ fontSize: '0.75rem', marginLeft: '0.35rem', opacity: 0.75 }}>
                ({maxDrawdownPct.toFixed(1)}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Chart 1: Equity Line ──────────────────────────────────────── */}
      <div style={{ marginBottom: '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isPositive ? '#4caf50' : '#f44336', boxShadow: `0 0 6px ${isPositive ? '#4caf5066' : '#f4433666'}` }} />
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Equity Cumulativa</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} syncId="equity_sync" margin={{ top: 8, right: 20, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? '#4caf50' : '#f44336'} stopOpacity={0.25} />
                <stop offset="95%" stopColor={isPositive ? '#4caf50' : '#f44336'} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => v.slice(0, 10)}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}`}
              width={64}
            />
            <Tooltip content={<EquityTooltip />} />
            {minValue < 0 && <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />}
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke={isPositive ? '#4caf50' : '#f44336'}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: isPositive ? '#4caf50' : '#f44336', stroke: 'var(--bg-dark)', strokeWidth: 2 }}
            />
            {/* High Water Mark line */}
            <Area
              type="monotone"
              dataKey="high_water_mark"
              stroke="rgba(226,194,125,0.35)"
              strokeWidth={1}
              strokeDasharray="5 3"
              fill="none"
              dot={false}
              activeDot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Divider with label ──────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        margin: '0.6rem 0',
        paddingLeft: '64px' // align with chart left margin
      }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(244,67,54,0.15)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f44336', opacity: 0.7 }} />
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(244,67,54,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Drawdown</span>
        </div>
        <div style={{ flex: 1, height: '1px', background: 'rgba(244,67,54,0.15)' }} />
      </div>

      {/* ── Chart 2: Drawdown (inverted area, synced with equity) ──── */}
      <ResponsiveContainer width="100%" height={130}>
        <AreaChart data={chartData} syncId="equity_sync" margin={{ top: 0, right: 20, left: 10, bottom: 4 }}>
          <defs>
            <linearGradient id={ddGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f44336" stopOpacity={0.0} />
              <stop offset="95%" stopColor="#f44336" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => v.slice(0, 10)}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'rgba(244,67,54,0.5)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v.toFixed(0)}`}
            width={64}
            domain={[Math.min(maxDrawdown * 1.1, -1), 0]}
          />
          <Tooltip content={<DrawdownTooltip />} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
          <Area
            type="monotone"
            dataKey="drawdown"
            stroke="#f44336"
            strokeWidth={1.5}
            fill={`url(#${ddGradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: '#f44336', stroke: '#1a1018', strokeWidth: 2 }}
            baseValue={0}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
   GROUP CREATION MODAL
   ────────────────────────────────────────────────────────────────────────── */
const CreateGroupModal = ({ isOpen, onClose, onSave, allStrategies, editingGroup }) => {
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingGroup) {
        setGroupName(editingGroup.name);
        setDescription(editingGroup.description || '');
        setSelectedIds(editingGroup.strategy_ids || []);
      } else {
        setGroupName('');
        setDescription('');
        setSelectedIds([]);
      }
      setSearchTerm('');
    }
  }, [isOpen, editingGroup]);

  const filteredStrategies = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return allStrategies.filter(s =>
      !q || s.nome.toLowerCase().includes(q) || s.magic.toString().includes(q) || s.mercato.toLowerCase().includes(q)
    );
  }, [allStrategies, searchTerm]);

  const toggleId = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    if (!groupName.trim() || selectedIds.length === 0) return;
    setSaving(true);
    try {
      await onSave({ name: groupName.trim(), description, strategy_ids: selectedIds, editId: editingGroup?.id });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', animation: 'fadeIn 0.2s ease'
    }}>
      <div style={{
        background: 'linear-gradient(145deg, #151825, #1a1f2e)',
        border: '1px solid rgba(226,194,125,0.2)',
        borderRadius: '20px', padding: '2rem',
        width: '100%', maxWidth: '600px', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', gap: '1.25rem',
        boxShadow: '0 40px 100px rgba(0,0,0,0.7)',
        animation: 'slideDown 0.3s ease'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(226,194,125,0.12)', border: '1px solid rgba(226,194,125,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={18} color="var(--accent-gold)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-bright)', margin: 0 }}>
                {editingGroup ? 'Modifica Gruppo' : 'Crea Gruppo Strategie'}
              </h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.1rem 0 0' }}>
                Aggrega più strategie in un unico grafico combinato
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.35rem', borderRadius: '8px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Group Name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Nome Gruppo *
          </label>
          <input
            type="text"
            placeholder="Es: Forex + Gold Portfolio"
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            style={{ padding: '0.7rem 0.9rem', background: '#0f111a', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-bright)', fontSize: '0.9rem', outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Descrizione (opzionale)
          </label>
          <input
            type="text"
            placeholder="Es: Core strategies con bassa correlazione"
            value={description}
            onChange={e => setDescription(e.target.value)}
            style={{ padding: '0.7rem 0.9rem', background: '#0f111a', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-bright)', fontSize: '0.85rem', outline: 'none' }}
          />
        </div>

        {/* Strategy picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Seleziona Strategie ({selectedIds.length} selezionate)
            </label>
            {selectedIds.length > 0 && (
              <button onClick={() => setSelectedIds([])} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Deseleziona tutto
              </button>
            )}
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Cerca per nome, magic, mercato..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.25rem', background: '#0f111a', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-bright)', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Strategy list */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '260px', paddingRight: '0.25rem' }}>
            {filteredStrategies.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Nessuna strategia trovata
              </div>
            ) : filteredStrategies.map(s => {
              const isSelected = selectedIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleId(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.6rem 0.85rem',
                    background: isSelected ? 'rgba(226,194,125,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isSelected ? 'rgba(226,194,125,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                    border: `2px solid ${isSelected ? 'var(--accent-gold)' : 'rgba(255,255,255,0.2)'}`,
                    background: isSelected ? 'var(--accent-gold)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}>
                    {isSelected && <Check size={11} color="#0f111a" strokeWidth={3} />}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: isSelected ? 'var(--text-bright)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.nome}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                      Magic: <span style={{ color: 'var(--accent-gold)' }}>{s.magic}</span> · {s.mercato}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>{s._tab}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
          <button onClick={onClose} disabled={saving} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !groupName.trim() || selectedIds.length === 0}
            className="btn btn-primary"
            style={{
              flex: 2, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.5rem',
              opacity: (!groupName.trim() || selectedIds.length === 0) ? 0.4 : 1
            }}
          >
            {saving ? <><RefreshCw size={14} className="spin-animation" /> Salvataggio...</> : <><Check size={14} /> {editingGroup ? 'Salva Modifiche' : 'Crea Gruppo'}</>}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
   MAIN PAGE
   ────────────────────────────────────────────────────────────────────────── */
export default function EquityCharts({ portfolioData, user }) {
  const [groups, setGroups] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null); // { type: 'single'|'group', id, name }
  const [chartData, setChartData] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [searchStrategy, setSearchStrategy] = useState('');

  // Flatten all strategies from all portfolio tabs
  const allStrategies = useMemo(() => {
    if (!portfolioData) return [];
    const result = [];
    Object.entries(portfolioData).forEach(([tabName, strats]) => {
      strats.forEach(s => {
        result.push({
          ...s,
          _tab: tabName,
          nome: s.nome || s.nome_strategia || 'Senza nome',
          magic: s.magic || s.magic_number || '',
          mercato: s.mercato || ''
        });
      });
    });
    return result;
  }, [portfolioData]);

  const filteredStrategies = useMemo(() => {
    const q = searchStrategy.toLowerCase();
    if (!q) return allStrategies;
    return allStrategies.filter(s =>
      s.nome.toLowerCase().includes(q) ||
      s.magic.toString().includes(q) ||
      s.mercato.toLowerCase().includes(q) ||
      (s._tab || '').toLowerCase().includes(q)
    );
  }, [allStrategies, searchStrategy]);

  // Load groups on mount
  useEffect(() => {
    fetchGroups();
  }, [user]);

  const fetchGroups = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/groups`, { headers: { 'x-user-email': user.email } });
      if (res.ok) setGroups(await res.json());
    } catch (e) { console.error('Error loading groups:', e); }
  };

  const loadChart = useCallback(async (type, ids, itemName, groupId, force = false) => {
    setChartLoading(true);
    setChartError(null);
    setChartData(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/equity-chart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user.email },
        body: JSON.stringify({ mode: type, strategy_ids: ids, group_id: groupId, forceRefresh: force })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Calcolo fallito');
      }
      setChartData(await res.json());
    } catch (e) {
      setChartError(e.message);
    } finally {
      setChartLoading(false);
    }
  }, [user]);

  const handleSelectStrategy = (strat) => {
    const item = { type: 'single', id: strat.id, name: strat.nome, ids: [strat.id] };
    setSelectedItem(item);
    loadChart('single', [strat.id], strat.nome, null);
  };

  const handleSelectGroup = (group) => {
    const item = { type: 'group', id: group.id, name: group.name, ids: group.strategy_ids };
    setSelectedItem(item);
    loadChart('group', group.strategy_ids, group.name, group.id);
  };

  const handleSaveGroup = async ({ name, description, strategy_ids, editId }) => {
    if (editId) {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/groups/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user.email },
        body: JSON.stringify({ name, description, strategy_ids })
      });
      if (res.ok) await fetchGroups();
    } else {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user.email },
        body: JSON.stringify({ name, description, strategy_ids })
      });
      if (res.ok) await fetchGroups();
    }
  };

  const handleDeleteGroup = async (groupId, groupName) => {
    if (!window.confirm(`Elimina il gruppo "${groupName}"?`)) return;
    const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/groups/${groupId}`, {
      method: 'DELETE',
      headers: { 'x-user-email': user.email }
    });
    if (res.ok) {
      await fetchGroups();
      if (selectedItem?.id === groupId) { setSelectedItem(null); setChartData(null); }
    }
  };

  const chartTitle = selectedItem ? selectedItem.name : '';
  const chartSubtitle = selectedItem?.type === 'group'
    ? `Gruppo aggregato · ${selectedItem.ids.length} strategie`
    : selectedItem?.type === 'single' ? 'Strategia singola' : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-bright)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <BarChart2 size={20} color="var(--accent-gold)" /> Grafici Equity &amp; Gruppi Strategie
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Seleziona una strategia o un gruppo per visualizzare la curva di equity cumulativa interattiva.
          </p>
        </div>
        <button
          onClick={() => { setEditingGroup(null); setIsModalOpen(true); }}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus size={16} /> Crea Gruppo
        </button>
      </div>

      {/* ── Main layout: sidebar + chart ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── LEFT: Selector panel ──────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Groups section */}
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={14} color="var(--accent-gold)" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-gold)' }}>
                Gruppi Personalizzati
              </span>
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.5rem', borderRadius: '20px' }}>
                {groups.length}
              </span>
            </div>

            {groups.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                <Users size={24} color="var(--text-muted)" style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                  Nessun gruppo. Clicca "Crea Gruppo" per iniziare.
                </p>
              </div>
            ) : (
              <div style={{ padding: '0.5rem' }}>
                {groups.map(g => {
                  const isActive = selectedItem?.id === g.id;
                  return (
                    <div key={g.id} style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '10px',
                      background: isActive ? 'rgba(226,194,125,0.08)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(226,194,125,0.25)' : 'transparent'}`,
                      marginBottom: '0.25rem',
                      transition: 'all 0.15s ease'
                    }}>
                      <button
                        onClick={() => handleSelectGroup(g)}
                        style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                      >
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: isActive ? 'var(--accent-gold)' : 'var(--text-bright)' }}>
                          {g.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                          {g.strategy_ids.length} strategie
                          {g.description && ` · ${g.description}`}
                        </div>
                      </button>
                      <button
                        onClick={() => { setEditingGroup(g); setIsModalOpen(true); }}
                        title="Modifica gruppo"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.2rem', borderRadius: '6px', opacity: 0.6 }}
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(g.id, g.name)}
                        title="Elimina gruppo"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-crit)', padding: '0.2rem', borderRadius: '6px', opacity: 0.6 }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Single strategies section */}
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={14} color="var(--accent-blue)" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-blue)' }}>
                Strategie Singole
              </span>
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.5rem', borderRadius: '20px' }}>
                {allStrategies.length}
              </span>
            </div>

            {/* Search */}
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Cerca nome, magic, mercato..."
                  value={searchStrategy}
                  onChange={e => setSearchStrategy(e.target.value)}
                  style={{ width: '100%', padding: '0.45rem 0.65rem 0.45rem 2rem', background: '#0f111a', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-bright)', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '0.5rem' }}>
              {filteredStrategies.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  Nessuna strategia trovata.
                </div>
              ) : filteredStrategies.map(s => {
                const isActive = selectedItem?.type === 'single' && selectedItem?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => handleSelectStrategy(s)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px', border: 'none',
                      background: isActive ? 'rgba(33,150,243,0.08)' : 'transparent',
                      cursor: 'pointer', textAlign: 'left',
                      marginBottom: '0.2rem',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: isActive ? 'rgba(33,150,243,0.2)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isActive ? 'rgba(33,150,243,0.35)' : 'rgba(255,255,255,0.06)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <TrendingUp size={13} color={isActive ? 'var(--accent-blue)' : 'var(--text-muted)'} />
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: isActive ? 'var(--accent-blue)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.nome}
                      </div>
                      <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>
                        {s.magic} · {s.mercato}
                      </div>
                    </div>
                    {isActive && <ChevronRight size={14} color="var(--accent-blue)" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Chart panel ────────────────────────────────────────── */}
        <div className="card" style={{ padding: '0', overflow: 'hidden', position: 'sticky', top: '1rem' }}>
          {!selectedItem ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '500px', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
              <div style={{
                width: '72px', height: '72px', borderRadius: '20px',
                background: 'rgba(226,194,125,0.08)',
                border: '1px solid rgba(226,194,125,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <BarChart2 size={32} color="var(--accent-gold)" style={{ opacity: 0.5 }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-bright)', marginBottom: '0.5rem' }}>
                  Seleziona una strategia o un gruppo
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '320px' }}>
                  Scegli un elemento dalla barra laterale per visualizzare la curva di equity cumulativa interattiva. Passa il mouse sui punti per vedere i dettagli di ogni operazione.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1rem', background: 'rgba(33,150,243,0.06)', border: '1px solid rgba(33,150,243,0.15)', borderRadius: '10px' }}>
                <Info size={13} color="var(--accent-blue)" />
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-blue)' }}>
                  I grafici vengono calcolati in Python con Pandas (.cumsum())
                </span>
              </div>
            </div>
          ) : (
            <>
              {/* Chart header */}
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: selectedItem.type === 'group' ? 'rgba(226,194,125,0.12)' : 'rgba(33,150,243,0.12)',
                      border: `1px solid ${selectedItem.type === 'group' ? 'rgba(226,194,125,0.25)' : 'rgba(33,150,243,0.25)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {selectedItem.type === 'group' ? <Layers size={14} color="var(--accent-gold)" /> : <TrendingUp size={14} color="var(--accent-blue)" />}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-bright)', margin: 0 }}>
                        {chartTitle}
                      </h3>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.1rem 0 0' }}>
                        {chartSubtitle}
                        {chartData && ` · ${chartData.total_deals || chartData.series?.length || 0} operazioni totali`}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => loadChart(selectedItem.type, selectedItem.ids, selectedItem.name, selectedItem.id, true)}
                  className="btn btn-secondary"
                  disabled={chartLoading}
                  title="Ricalcola"
                  style={{ padding: '0.5rem 0.85rem', height: '36px', fontSize: '0.78rem' }}
                >
                  <RefreshCw size={14} className={chartLoading ? 'spin-animation' : ''} />
                  Ricalcola
                </button>
              </div>

              {/* Group details */}
              {selectedItem.type === 'group' && chartData?.strategies && chartData.strategies.length > 0 && (
                <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {chartData.strategies.map((s, i) => (
                    <span key={i} style={{
                      padding: '0.2rem 0.65rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600,
                      background: 'rgba(226,194,125,0.08)', border: '1px solid rgba(226,194,125,0.2)', color: 'var(--accent-gold)'
                    }}>
                      {s.nome} · {s.deal_count} trade
                    </span>
                  ))}
                </div>
              )}

              {/* Chart body */}
              <div style={{ padding: '1.5rem' }}>
                <EquityLineChart
                  data={chartData?.series}
                  title={chartTitle}
                  subtitle={chartSubtitle}
                  loading={chartLoading}
                  error={chartError}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Group Creation/Edit Modal ──────────────────────────────────── */}
      <CreateGroupModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingGroup(null); }}
        onSave={handleSaveGroup}
        allStrategies={allStrategies}
        editingGroup={editingGroup}
      />
    </div>
  );
}
