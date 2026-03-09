import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { AlertCircle, ShieldAlert, Target, PlayCircle, TrendingUp, Database, ArrowUpCircle, ArrowDownCircle, X, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import MetricsPanel from './MetricsPanel';
import { SkeletonMetricsPanel, SkeletonChart, SkeletonTable } from './SkeletonLoader';
import API_BASE from '../api';

const DashboardTab = () => {
    const [positions, setPositions] = useState([]);
    const [profitTarget, setProfitTarget] = useState(1);
    const [stopLossTarget, setStopLossTarget] = useState(30);
    const [equityHistory, setEquityHistory] = useState([]);
    const [accountData, setAccountData] = useState({ balance: 0, balance_total: 0, equity: 0, initial_balance_today: 0, initial_deposit: 0 });
    const [monitorActive, setMonitorActive] = useState(false);
    const [slMonitorActive, setSlMonitorActive] = useState(false);
    const [timeframe, setTimeframe] = useState('M1');
    const [historyLoading, setHistoryLoading] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const monitorRef = useRef(null);
    const isFirstLoad = useRef(true);
    // Rastreo de alertas de drawdown ya disparadas para no repetir cada 3s
    const lastDrawdownAlertRef = useRef({ level: 0, ts: 0 });

    useEffect(() => {
        const accInterval = setInterval(fetchAll, 3000); // Polling cada 3s
        const histInterval = setInterval(() => fetchHistory(timeframe), 45000); // Historial cada 45s

        fetchAll();
        fetchHistory(timeframe);

        return () => {
            clearInterval(accInterval);
            clearInterval(histInterval);
            if (monitorRef.current) clearInterval(monitorRef.current);
        };
    }, [timeframe]);

    const checkDrawdownAlerts = (accData, settingsData) => {
        if (!accData || !settingsData || accData.balance_total <= 0) return;
        const drawdownPct = ((accData.balance_total - accData.equity) / accData.balance_total) * 100;
        const limit = parseFloat(settingsData.max_drawdown_percent || 5);
        if (limit <= 0) return;
        const ratio = drawdownPct / limit; // 0-1+

        // Niveles: 0.5 → amarillo, 0.75 → naranja, 0.9 → rojo
        let level = 0;
        if (ratio >= 0.9) level = 3;
        else if (ratio >= 0.75) level = 2;
        else if (ratio >= 0.5) level = 1;
        if (level === 0) return;

        const now = Date.now();
        const prev = lastDrawdownAlertRef.current;
        // No repetir el mismo nivel en menos de 5 minutos
        if (prev.level === level && now - prev.ts < 5 * 60 * 1000) return;
        lastDrawdownAlertRef.current = { level, ts: now };

        const pct = drawdownPct.toFixed(1);
        const limitPct = limit.toFixed(1);
        if (level === 3) {
            toast.error(`⛔ DRAWDOWN CRÍTICO: ${pct}% de ${limitPct}% límite — Cerrar posiciones inmediatamente`, { duration: 10000, id: 'dd-alert' });
        } else if (level === 2) {
            toast(`⚠️ Drawdown al 75%: ${pct}% de ${limitPct}% límite. Precaución.`, { icon: '🔶', duration: 7000, id: 'dd-alert' });
        } else {
            toast(`📊 Drawdown al 50%: ${pct}% de ${limitPct}% límite. Monitorear.`, { icon: '🟡', duration: 5000, id: 'dd-alert' });
        }
    };

    const fetchAll = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/dashboard-data/`);
            setPositions(res.data.positions);
            setAccountData(res.data.account);

            const isActive = res.data.settings.is_profit_monitor_active;
            const isSLActive = res.data.settings.is_stop_loss_monitor_active;
            setMonitorActive(isActive);
            setSlMonitorActive(isSLActive);

            if (isActive || isFirstLoad.current) {
                setProfitTarget(res.data.settings.profit_target_percent);
            }
            if (isSLActive || isFirstLoad.current) {
                setStopLossTarget(res.data.settings.global_stop_loss_percent);
            }
            if (isFirstLoad.current) {
                isFirstLoad.current = false;
                setIsInitialLoading(false);
            }

            // Alertas progresivas de drawdown (sólo si la cuenta tiene saldo)
            if (res.data.account && res.data.account.balance_total > 0) {
                checkDrawdownAlerts(res.data.account, res.data.settings);
            }
        } catch (e) {
            console.error("Error fetching metrics", e);
            if (isFirstLoad.current) {
                isFirstLoad.current = false;
                setIsInitialLoading(false);
            }
        }
    };

    const fetchHistory = async (tf) => {
        setHistoryLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/api/equity-history/?tf=${tf}`);
            // Limitar a 500 puntos para evitar OOM en el navegador
            const data = res.data;
            setEquityHistory(data.length > 500 ? data.slice(-500) : data);
        } catch (e) {
            console.error("Error fetching history", e);
        } finally {
            setHistoryLoading(false);
        }
    };

    // La meta de Profit y Equidad objetivo se basan en el Balance Total disponible para operar
    // (A menos que se solicite cambiar también esta base)
    const targetEquity = accountData.balance_total * (1 + parseFloat(profitTarget || 0) / 100);
    const remaining = targetEquity - accountData.equity;
    const progressPercent = accountData.balance_total > 0
        ? Math.min(100, Math.max(0, ((accountData.equity - accountData.balance_total) / (targetEquity - accountData.balance_total)) * 100))
        : 0;

    const targetSLEquity = accountData.balance_total * (1 - parseFloat(stopLossTarget || 0) / 100);
    const slRemaining = accountData.equity - targetSLEquity;
    const slProgressPercent = accountData.balance_total > 0
        ? Math.min(100, Math.max(0, ((accountData.equity - targetSLEquity) / (accountData.balance_total - targetSLEquity)) * 100))
        : 0;

    const handleActivateMonitor = async () => {
        const newState = !monitorActive;
        try {
            toast.loading(newState ? "Activando Monitor Persistente..." : "Desactivando Monitor...", { id: 'monitor' });
            await axios.put(`${API_BASE}/api/settings/`, {
                is_profit_monitor_active: newState,
                profit_target_percent: parseFloat(profitTarget)
            });
            setMonitorActive(newState);
            if (newState) {
                toast.success(`Monitor activado en el Servidor. Meta alcanzada: Liquidación total.`, { id: 'monitor', duration: 4000 });
            } else {
                toast("Monitor desactivado correctamente.", { id: 'monitor', icon: '⏹️' });
            }
        } catch (e) {
            toast.error("Error al sincronizar monitor con el servidor", { id: 'monitor' });
            console.error(e);
        }
    };

    const handleActivateSLMonitor = async () => {
        const newState = !slMonitorActive;
        try {
            toast.loading(newState ? "Activando SL Global..." : "Desactivando SL Global...", { id: 'sl-monitor' });
            await axios.put(`${API_BASE}/api/settings/`, {
                is_stop_loss_monitor_active: newState,
                global_stop_loss_percent: parseFloat(stopLossTarget)
            });
            setSlMonitorActive(newState);
            if (newState) {
                toast.success(`Stop Loss Global activado (${stopLossTarget}%).`, { id: 'sl-monitor', duration: 4000 });
            } else {
                toast("Stop Loss Global desactivado.", { id: 'sl-monitor', icon: '⏹️' });
            }
        } catch (e) {
            toast.error("Error al sincronizar monitor con el servidor", { id: 'sl-monitor' });
            console.error(e);
        }
    };

    const handleBreakEven = async () => {
        if (!window.confirm("¿Aplicar BreakEven a TODAS las posiciones ganadoras?")) return;
        try {
            toast.loading("Aplicando BreakEven Global...", { id: 'be' });
            const res = await axios.post(`${API_BASE}/api/actions/breakeven/`);
            if (res.data.success) {
                toast.success(res.data.message, { id: 'be' });
            } else {
                toast.error(res.data.error || "Fallo al aplicar BreakEven", { id: 'be' });
            }
            fetchAll();
        } catch (e) {
            console.error("Error en handleBreakEven:", e);
            toast.error("Error de conexión al aplicar BreakEven", { id: 'be' });
        }
    };

    const handleCloseAll = async () => {
        if (!confirm("¿Seguro que deseas LIQUIDAR TODAS las posiciones abiertas?")) return;
        try {
            toast.loading("Liquidando todo...", { id: 'closeall' });
            const res = await axios.post(`${API_BASE}/api/actions/close_all/`);
            toast.success(res.data.message, { id: 'closeall' });
            fetchAll();
        } catch (e) {
            toast.error("Error al liquidar posiciones", { id: 'closeall' });
        }
    };

    const handleCloseSymbol = async (symbol) => {
        if (!confirm(`¿Cerrar todas las posiciones de ${symbol}?`)) return;
        try {
            toast.loading(`Liquidando ${symbol}...`, { id: 'closesym' });
            const res = await axios.post(`${API_BASE}/api/actions/close_symbol/`, { symbol });
            toast.success(res.data.message, { id: 'closesym' });
            fetchAll();
        } catch (e) {
            toast.error(`Error al cerrar ${symbol}`, { id: 'closesym' });
        }
    };

    const handleCloseWinningSymbol = async (symbol) => {
        if (!confirm(`¿Cerrar SOLO LAS POSICIONES GANADORAS de ${symbol}?`)) return;
        try {
            toast.loading(`Cerrando ganancias de ${symbol}...`, { id: 'closewinsym' });
            const res = await axios.post(`${API_BASE}/api/actions/close_winning_symbol/`, { symbol });
            toast.success(res.data.message, { id: 'closewinsym' });
            fetchAll();
        } catch (e) {
            toast.error(`Error al cerrar ganancias de ${symbol}`, { id: 'closewinsym' });
        }
    };

    const handleBreakevenSymbol = async (symbol) => {
        if (!confirm(`¿Aplicar BreakEven a las POSICIONES GANADORAS de ${symbol}?`)) return;
        try {
            toast.loading(`Aplicando BreakEven a ${symbol}...`, { id: 'breakessym' });
            const res = await axios.post(`${API_BASE}/api/actions/breakeven_symbol/`, { symbol });
            toast.success(res.data.message, { id: 'breakessym' });
            fetchAll();
        } catch (e) {
            toast.error(`Error al aplicar BreakEven a ${symbol}`, { id: 'breakessym' });
        }
    };

    const handleCloseDirection = async (symbol, direction) => {
        const label = direction === 'BUY' ? 'BUYS' : 'SELLS';
        if (!confirm(`¿Cerrar todas las posiciones ${label} de ${symbol}?`)) return;
        try {
            toast.loading(`Cerrando ${label} de ${symbol}...`, { id: 'closedir' });
            const res = await axios.post(`${API_BASE}/api/actions/close_direction/`, { symbol, direction });
            toast.success(res.data.message, { id: 'closedir' });
            fetchAll();
        } catch (e) {
            toast.error(`Error al cerrar ${label} de ${symbol}`, { id: 'closedir' });
        }
    };

    const handleSetSymbolTarget = async (symbol, fields) => {
        try {
            toast.loading("Sincronizando meta...", { id: 'symtarget' });
            await axios.post(`${API_BASE}/api/symbol-targets/`, { symbol, ...fields });
            toast.success("Meta configurada en el servidor", { id: 'symtarget' });
            fetchAll();
        } catch (e) {
            toast.error("Error al guardar meta", { id: 'symtarget' });
        }
    };

    const lastEquity = equityHistory.length > 0 ? equityHistory[equityHistory.length - 1] : null;
    const isPositive = (lastEquity && lastEquity.floating !== undefined) ? lastEquity.floating >= 0 : true;

    const displayChartData = React.useMemo(() => [
        ...equityHistory,
        {
            time: 'Ahora',
            equity: accountData.equity,
            balance: accountData.balance_total,
            floating: accountData.equity - accountData.balance_total
        }
    ], [equityHistory, accountData.equity, accountData.balance_total]);

    if (isInitialLoading) {
        return (
            <div className="space-y-3 sm:space-y-4 max-w-full overflow-x-hidden">
                <SkeletonMetricsPanel />
                <SkeletonChart />
                <SkeletonTable rows={3} cols={6} />
            </div>
        );
    }

    return (
        <div className="space-y-3 sm:space-y-4 max-w-full overflow-x-hidden">

            <>
                <MetricsPanel data={accountData} />

                <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4 lg:p-6 shadow-xl relative overflow-hidden">
                    {historyLoading && (
                        <div className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-[2px] z-10 flex items-center justify-center">
                            <TrendingUp className="w-8 h-8 text-blue-500 animate-pulse" />
                        </div>
                    )}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <h2 className="text-lg lg:text-xl font-bold text-white flex items-center gap-2">
                            <TrendingUp className="w-4 lg:w-5 h-4 lg:h-5 text-emerald-400" />
                            Equidad
                        </h2>

                        <div className="flex bg-[#0f172a] p-1 rounded-lg border border-[#334155]">
                            {['M1', 'M5', 'H1'].map(tf => (
                                <button
                                    key={tf}
                                    onClick={() => setTimeframe(tf)}
                                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${timeframe === tf
                                        ? 'bg-blue-600 text-white shadow-lg'
                                        : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                >
                                    {tf}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="h-48 lg:h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={displayChartData}>
                                <defs>
                                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                                <YAxis
                                    domain={[
                                        (dataMin) => Math.min(dataMin, accountData.balance_total * 0.99, accountData.initial_deposit * 0.99),
                                        (dataMax) => Math.max(dataMax, monitorActive ? targetEquity * 1.01 : dataMax, accountData.initial_deposit * 1.01)
                                    ]}
                                    stroke="#64748b"
                                    fontSize={11}
                                    tickLine={false}
                                    tickFormatter={(val) => `$${val.toFixed(0)}`}
                                />
                                <Tooltip
                                    isAnimationActive={false}
                                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
                                    labelStyle={{ color: '#94a3b8' }}
                                />
                                <ReferenceLine y={accountData.initial_deposit || 0} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "Depósito Inicial", fill: "#f59e0b", fontSize: 10, position: 'right' }} />
                                <ReferenceLine y={accountData.balance_total || 0} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: "Cap. Total", fill: "#3b82f6", fontSize: 12 }} />
                                {monitorActive && (
                                    <ReferenceLine
                                        y={targetEquity}
                                        stroke="#f59e0b"
                                        strokeWidth={2}
                                        strokeDasharray="3 3"
                                        label={{
                                            value: `META: $${(targetEquity || 0).toFixed(2)}`,
                                            fill: "#f59e0b",
                                            fontSize: 14,
                                            fontWeight: 'bold',
                                            position: 'top'
                                        }}
                                    />
                                )}
                                <Area type="monotone" dataKey="equity" stroke={isPositive ? "#10b981" : "#ef4444"} strokeWidth={2} fill="url(#equityGradient)" name="Equidad" isAnimationActive={false} />
                            </AreaChart>

                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4 lg:p-6 shadow-xl">
                    <h2 className="text-lg lg:text-xl font-bold mb-3 lg:mb-4 text-white flex items-center gap-2">
                        <PlayCircle className="w-4 lg:w-5 h-4 lg:h-5 text-blue-400" />
                        Acciones Globales
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <button onClick={handleBreakEven} className="w-full bg-blue-500/20 border border-blue-500/40 text-blue-400 rounded-xl py-3 text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 h-full">
                            <ShieldAlert className="w-5 h-5" />
                            <span>BreakEven Global</span>
                        </button>

                        <div className={`rounded-xl border p-3 lg:p-4 space-y-2 lg:space-y-3 transition-colors ${monitorActive ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-slate-800/40 border-slate-700'}`}>
                            <div className="flex items-center gap-2">
                                <TrendingUp className={`w-5 h-5 ${monitorActive ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                                <span className="font-bold text-white text-sm">TP Global (%)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={profitTarget}
                                    onChange={e => setProfitTarget(e.target.value)}
                                    className="w-16 bg-[#0f172a] text-white text-center text-lg font-bold py-1.5 rounded outline-none border border-[#334155]"
                                    step="0.1"
                                    disabled={monitorActive}
                                />
                                <button
                                    onClick={handleActivateMonitor}
                                    className={`flex-1 py-1.5 rounded-lg font-bold text-sm active:scale-95 transition-all ${monitorActive ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                >
                                    {monitorActive ? 'ON' : 'OFF'}
                                </button>
                            </div>
                            <div className="text-[10px] space-y-1 text-slate-400 border-t border-[#334155] pt-2">
                                <div className="flex justify-between">
                                    <span>Meta:</span>
                                    <span className="text-emerald-400 font-bold font-mono">${(targetEquity || 0).toFixed(2)}</span>
                                </div>
                                <div className="w-full bg-[#0f172a] rounded-full h-1.5 mt-1">
                                    <div
                                        className={`h-1.5 rounded-full transition-all ${remaining <= 0 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-emerald-500/30'}`}
                                        style={{ width: `${Math.max(0, progressPercent)}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={`rounded-xl border p-3 lg:p-4 space-y-2 lg:space-y-3 transition-colors ${slMonitorActive ? 'bg-rose-500/10 border-rose-500/40' : 'bg-slate-800/40 border-slate-700'}`}>
                            <div className="flex items-center gap-2">
                                <ShieldAlert className={`w-5 h-5 ${slMonitorActive ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
                                <span className="font-bold text-white text-sm">SL Global (%)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={stopLossTarget}
                                    onChange={e => setStopLossTarget(e.target.value)}
                                    className="w-16 bg-[#0f172a] text-white text-center text-lg font-bold py-1.5 rounded outline-none border border-[#334155]"
                                    step="1"
                                    disabled={slMonitorActive}
                                />
                                <button
                                    onClick={handleActivateSLMonitor}
                                    className={`flex-1 py-1.5 rounded-lg font-bold text-sm active:scale-95 transition-all ${slMonitorActive ? 'bg-rose-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                >
                                    {slMonitorActive ? 'ON' : 'OFF'}
                                </button>
                            </div>
                            <div className="text-[10px] space-y-1 text-slate-400 border-t border-[#334155] pt-2">
                                <div className="flex justify-between">
                                    <span>Límite Equidad:</span>
                                    <span className="text-rose-400 font-bold font-mono">${(targetSLEquity || 0).toFixed(2)}</span>
                                </div>
                                <div className="w-full bg-[#0f172a] rounded-full h-1.5 mt-1">
                                    <div
                                        className={`h-1.5 rounded-full transition-all ${slProgressPercent < 20 ? 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-rose-500/30'}`}
                                        style={{ width: `${Math.max(0, slProgressPercent)}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        <button onClick={handleCloseAll} className="w-full bg-red-500/20 border border-red-500/40 text-red-400 rounded-xl py-3 text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 h-full">
                            <AlertCircle className="w-5 h-5" />
                            <span>LIQUIDAR TODO</span>
                        </button>
                    </div>
                </div>

                <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4 lg:p-6 shadow-xl">
                    <h2 className="text-lg lg:text-xl font-bold mb-3 lg:mb-4 text-white flex items-center gap-2">
                        <Target className="w-4 lg:w-5 h-4 lg:h-5 text-slate-400" />
                        Posiciones Abiertas
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="text-sm text-slate-400 border-b border-[#334155]">
                                <tr>
                                    <th className="pb-3 px-3">Activo</th>
                                    <th className="pb-3 px-3 text-center">Buys</th>
                                    <th className="pb-3 px-3 text-center">Sells</th>
                                    <th className="pb-3 px-3 text-right">P&L</th>
                                    <th className="pb-3 px-3 text-right">Meta / SL</th>
                                    <th className="pb-3 px-3 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#334155]">
                                {positions.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="text-center py-8 text-slate-500">No hay posiciones activas en MT5.</td>
                                    </tr>
                                ) : (
                                    positions.map((pos) => (
                                        <tr key={pos.symbol} className="group hover:bg-slate-800/50 transition-colors">
                                            <td className="py-3 px-3">
                                                <div className="font-bold text-sky-400 text-sm">{pos.symbol}</div>
                                                <div className="text-[10px] text-slate-500 font-mono">{pos.count} ops · {pos.volume.toFixed(2)} lot</div>
                                            </td>
                                            <td className="py-3 px-3 text-center">
                                                {pos.buy_count > 0 ? (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-400" />
                                                            <span className="text-emerald-400 font-bold font-mono text-sm">{pos.buy_volume.toFixed(2)}</span>
                                                        </div>
                                                        <div className="text-[10px] text-slate-500">{pos.buy_count} ops</div>
                                                        <div className={`text-xs font-mono font-bold ${pos.buy_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                            ${pos.buy_profit.toFixed(2)}
                                                        </div>
                                                        <button onClick={() => handleCloseDirection(pos.symbol, 'BUY')} className="mt-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white px-2 py-1 rounded text-[10px] font-bold transition-all w-full">
                                                            ✕ Buys
                                                        </button>
                                                    </div>
                                                ) : <span className="text-slate-600 text-xs">—</span>}
                                            </td>
                                            <td className="py-3 px-3 text-center">
                                                {pos.sell_count > 0 ? (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <ArrowDownCircle className="w-3.5 h-3.5 text-rose-400" />
                                                            <span className="text-rose-400 font-bold font-mono text-sm">{pos.sell_volume.toFixed(2)}</span>
                                                        </div>
                                                        <div className="text-[10px] text-slate-500">{pos.sell_count} ops</div>
                                                        <div className={`text-xs font-mono font-bold ${pos.sell_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                            ${pos.sell_profit.toFixed(2)}
                                                        </div>
                                                        <button onClick={() => handleCloseDirection(pos.symbol, 'SELL')} className="mt-1 bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white px-2 py-1 rounded text-[10px] font-bold transition-all w-full">
                                                            ✕ Sells
                                                        </button>
                                                    </div>
                                                ) : <span className="text-slate-600 text-xs">—</span>}
                                            </td>
                                            <td className={`py-3 px-3 text-right font-mono font-bold text-lg ${pos.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                ${pos.profit.toFixed(2)}
                                            </td>
                                            <td className="py-3 px-3 text-right">
                                                <div className="flex items-center justify-end gap-2 mb-2">
                                                    <span className="text-[10px] text-emerald-500 font-bold">TP $</span>
                                                    <input
                                                        type="number"
                                                        placeholder="Profit $"
                                                        className="w-16 bg-[#0f172a] border border-[#334155] rounded px-2 py-1 text-xs font-mono text-white text-center outline-none focus:border-emerald-500/50"
                                                        defaultValue={pos.symbol_target_usd || 0}
                                                        onBlur={(e) => handleSetSymbolTarget(pos.symbol, { target_profit_usd: parseFloat(e.target.value) })}
                                                    />
                                                    <button onClick={() => handleSetSymbolTarget(pos.symbol, { is_profit_active: !pos.symbol_target_active })} className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${pos.symbol_target_active ? 'bg-emerald-500 text-black' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                                                        {pos.symbol_target_active ? 'ON' : 'OFF'}
                                                    </button>
                                                </div>
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-[10px] text-rose-500 font-bold">SL $</span>
                                                    <input
                                                        type="number"
                                                        placeholder="Loss $"
                                                        className="w-16 bg-[#0f172a] border border-[#334155] rounded px-2 py-1 text-xs font-mono text-white text-center outline-none focus:border-rose-500/50"
                                                        defaultValue={pos.symbol_loss_usd || 0}
                                                        onBlur={(e) => handleSetSymbolTarget(pos.symbol, { target_loss_usd: parseFloat(e.target.value) })}
                                                    />
                                                    <button onClick={() => handleSetSymbolTarget(pos.symbol, { is_loss_active: !pos.symbol_loss_active })} className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${pos.symbol_loss_active ? 'bg-rose-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                                                        {pos.symbol_loss_active ? 'ON' : 'OFF'}
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="py-3 px-3 text-center">
                                                <div className="flex flex-col gap-2 items-center justify-center">
                                                    <button onClick={() => handleCloseSymbol(pos.symbol)} className="bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white px-3 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 w-full max-w-[100px] mx-auto">
                                                        <X className="w-3 h-3" /> LIQUIDAR
                                                    </button>
                                                    <button onClick={() => handleCloseWinningSymbol(pos.symbol)} className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white px-3 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 w-full max-w-[100px] mx-auto">
                                                        <X className="w-3 h-3" /> GANANCIAS
                                                    </button>
                                                    <button onClick={() => handleBreakevenSymbol(pos.symbol)} className="bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500 hover:text-white px-3 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 w-full max-w-[100px] mx-auto">
                                                        <ShieldAlert className="w-3 h-3" /> BREAKEVEN
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </>
        </div>
    );
};

export default DashboardTab;
