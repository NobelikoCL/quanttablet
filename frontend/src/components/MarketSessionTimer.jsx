import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, X, Volume2, VolumeX, Globe } from 'lucide-react';
import API_BASE from '../api';

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || 'quant-admin-supersecret-token-777';

// ═══ SESIONES BASE (se sobrescriben con localStorage) ═══
const DEFAULT_SESSIONS = [
    {
        id: 'asia',
        name: 'Asia (Tokyo)',
        flag: '🌏',
        openHourUTC: 0,
        openMinuteUTC: 0,
        assets: ['USDJPY', 'AUDUSD', 'NZDUSD'],
        color: 'from-violet-500 to-purple-600',
        borderColor: 'border-violet-500/30',
        textColor: 'text-violet-400',
        bgColor: 'bg-violet-500/10'
    },
    {
        id: 'germany',
        name: 'Alemania (Frankfurt)',
        flag: '🇩🇪',
        openHourUTC: 7,
        openMinuteUTC: 0,
        assets: ['GER40', 'EURUSD', 'EURGBP'],
        color: 'from-amber-500 to-yellow-600',
        borderColor: 'border-amber-500/30',
        textColor: 'text-amber-400',
        bgColor: 'bg-amber-500/10'
    },
    {
        id: 'spain',
        name: 'España (Madrid)',
        flag: '🇪🇸',
        openHourUTC: 8,
        openMinuteUTC: 0,
        assets: ['ESP35', 'EURUSD', 'GBPUSD'],
        color: 'from-red-500 to-orange-600',
        borderColor: 'border-red-500/30',
        textColor: 'text-red-400',
        bgColor: 'bg-red-500/10'
    },
    {
        id: 'us',
        name: 'Estados Unidos (NYSE)',
        flag: '🇺🇸',
        openHourUTC: 14,
        openMinuteUTC: 30,
        assets: ['US30', 'NAS100', 'SPX500', 'XAUUSD'],
        color: 'from-blue-500 to-cyan-600',
        borderColor: 'border-blue-500/30',
        textColor: 'text-blue-400',
        bgColor: 'bg-blue-500/10'
    }
];

// Leer horarios personalizados del localStorage
const getMarketSessions = () => {
    try {
        const custom = JSON.parse(localStorage.getItem('market_session_times') || '{}');
        return DEFAULT_SESSIONS.map(s => ({
            ...s,
            openHourUTC: custom[s.id]?.hour ?? s.openHourUTC,
            openMinuteUTC: custom[s.id]?.minute ?? s.openMinuteUTC
        }));
    } catch {
        return DEFAULT_SESSIONS;
    }
};

// ═══ UTILIDADES ═══
const isWeekend = () => {
    const day = new Date().getUTCDay();
    return day === 0 || day === 6;
};

const getNextOpenTime = (session) => {
    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(session.openHourUTC, session.openMinuteUTC, 0, 0);

    // Si ya pasó hoy, moverlo a mañana
    if (target <= now) {
        target.setUTCDate(target.getUTCDate() + 1);
    }

    // Saltar fines de semana
    while (target.getUTCDay() === 0 || target.getUTCDay() === 6) {
        target.setUTCDate(target.getUTCDate() + 1);
    }

    return target;
};

const getTimeRemaining = (targetDate) => {
    const now = new Date();
    const diff = targetDate - now;
    if (diff <= 0) return { total: 0, hours: 0, minutes: 0, seconds: 0 };

    return {
        total: diff,
        hours: Math.floor(diff / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000)
    };
};

const formatCountdown = (time) => {
    const pad = (n) => String(n).padStart(2, '0');
    if (time.hours > 0) return `${pad(time.hours)}:${pad(time.minutes)}:${pad(time.seconds)}`;
    return `${pad(time.minutes)}:${pad(time.seconds)}`;
};

// ═══ SONIDO DE CAMPANA DE APERTURA (singleton AudioContext) ═══
let bellAudioCtx = null;
const playMarketBell = () => {
    try {
        if (!bellAudioCtx || bellAudioCtx.state === 'closed') {
            bellAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (bellAudioCtx.state === 'suspended') bellAudioCtx.resume();
        const ctx = bellAudioCtx;
        const now = ctx.currentTime;

        // Campana: 3 golpes con decay
        const bellFreqs = [830, 830, 830];
        bellFreqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const start = now + (i * 0.35);
            gain.gain.setValueAtTime(0.25, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
            osc.start(start);
            osc.stop(start + 0.35);
        });
    } catch (e) {
        console.error('Error reproduciendo campana:', e);
    }
};

// ═══ COMPONENTE PRINCIPAL ═══
const MarketSessionTimer = () => {
    const [countdowns, setCountdowns] = useState({});
    const [sessions, setSessions] = useState(getMarketSessions);
    const [popupSession, setPopupSession] = useState(null);
    const [popupAssets, setPopupAssets] = useState([]);
    const [popupCountdown, setPopupCountdown] = useState(null);
    const [localTime, setLocalTime] = useState('');
    const [serverTime, setServerTime] = useState('');
    const [soundEnabled, setSoundEnabled] = useState(() => {
        try { return localStorage.getItem('market_bell_enabled') !== 'false'; } catch { return true; }
    });

    const triggeredPopupsRef = useRef(new Set());
    const triggeredBellsRef = useRef(new Set());

    // Guardar preferencia de sonido
    useEffect(() => {
        try { localStorage.setItem('market_bell_enabled', soundEnabled); } catch { }
    }, [soundEnabled]);

    // Relojes digitales
    useEffect(() => {
        const updateClocks = () => {
            const now = new Date();
            // Hora local configurable
            const tz = localStorage.getItem('qt_local_timezone') || 'America/Santiago';
            try {
                setLocalTime(now.toLocaleTimeString('es-CL', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
            } catch {
                setLocalTime(now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
            }
            // Servidor MT5 (UTC+2 por defecto, configurable)
            const mt5tz = localStorage.getItem('qt_mt5_timezone') || 'Europe/Helsinki';
            try {
                setServerTime(now.toLocaleTimeString('es-CL', { timeZone: mt5tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
            } catch {
                setServerTime(now.toLocaleTimeString('es-CL', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
            }
        };
        updateClocks();
        const clockInterval = setInterval(updateClocks, 1000);
        return () => clearInterval(clockInterval);
    }, []);


    // Fetch precios de activos para el popup
    const fetchSessionAssets = useCallback(async (session) => {
        try {
            const res = await fetch(`${API_BASE}/api/session-assets/?symbols=${session.assets.join(',')}`, {
                headers: { 'X-API-KEY': API_KEY }
            });
            if (res.ok) {
                const data = await res.json();
                setPopupAssets(data);
            }
        } catch (e) {
            console.error('Error fetching session assets:', e);
            setPopupAssets(session.assets.map(s => ({ symbol: s, bid: 0, ask: 0 })));
        }
    }, []);

    // Countdown principal
    useEffect(() => {
        if (isWeekend()) return;

        const tick = () => {
            const newCountdowns = {};
            const todayKey = new Date().toISOString().split('T')[0];
            const currentSessions = getMarketSessions();

            currentSessions.forEach(session => {
                const target = getNextOpenTime(session);
                const remaining = getTimeRemaining(target);
                newCountdowns[session.id] = { ...remaining, target };

                const popupKey = `${todayKey}-${session.id}`;

                // Popup a T-5min
                if (remaining.total > 0 && remaining.total <= 5 * 60 * 1000 && !triggeredPopupsRef.current.has(popupKey)) {
                    triggeredPopupsRef.current.add(popupKey);
                    setPopupSession(session);
                    fetchSessionAssets(session);
                }

                // Campana a T-0
                if (remaining.total <= 0 && !triggeredBellsRef.current.has(popupKey)) {
                    triggeredBellsRef.current.add(popupKey);
                    if (soundEnabled) playMarketBell();
                    // Cerrar popup si estaba abierto
                    setPopupSession(prev => prev?.id === session.id ? null : prev);
                }
            });

            setCountdowns(newCountdowns);

            // Actualizar countdown del popup si está abierto
            if (popupSession) {
                const target = getNextOpenTime(popupSession);
                setPopupCountdown(getTimeRemaining(target));
            }
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [soundEnabled, popupSession, fetchSessionAssets]);

    // Encontrar la sesión más cercana
    const currentSessions = getMarketSessions();
    const nextSession = currentSessions
        .map(s => ({ ...s, remaining: countdowns[s.id] }))
        .filter(s => s.remaining && s.remaining.total > 0)
        .sort((a, b) => a.remaining.total - b.remaining.total)[0];

    if (isWeekend()) {
        return (
            <div className="mx-2 lg:mx-4 mt-2 space-y-2">
                <div className="glass rounded-xl px-3 py-2 flex items-center justify-center gap-2 text-slate-500 text-xs">
                    <Globe className="w-3.5 h-3.5" />
                    <span className="font-bold">Mercados cerrados — Fin de semana</span>
                </div>
                {/* Relojes */}
                <div className="glass rounded-xl px-3 py-2 flex items-center justify-center gap-6">
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] text-slate-500 uppercase font-bold">Local</span>
                        <span className="font-mono text-sm font-black text-brand-accent">{localTime}</span>
                    </div>
                    <div className="w-px h-4 bg-slate-700"></div>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] text-slate-500 uppercase font-bold">MT5</span>
                        <span className="font-mono text-sm font-black text-amber-400">{serverTime}</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* ═══ Barra compacta de countdown ═══ */}
            <div className="glass mx-2 lg:mx-4 mt-2 rounded-xl px-3 py-2">
                <div className="flex items-center justify-between">
                    {/* Próxima sesión */}
                    <div className="flex items-center gap-3 flex-1">
                        <Clock className="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
                        {nextSession ? (
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-slate-500 uppercase font-bold">Próxima:</span>
                                <span className="text-xs font-bold text-white">{nextSession.flag} {nextSession.name}</span>
                                <span className={`font-mono font-black text-sm ${nextSession.remaining.total <= 5 * 60 * 1000 ? 'text-red-400 animate-pulse' : 'text-brand-accent'}`}>
                                    {formatCountdown(nextSession.remaining)}
                                </span>
                            </div>
                        ) : (
                            <span className="text-xs text-slate-500">Todas las sesiones abiertas</span>
                        )}
                    </div>

                    {/* Mini countdowns de todas las sesiones */}
                    <div className="hidden lg:flex items-center gap-3">
                        {currentSessions.map(session => {
                            const cd = countdowns[session.id];
                            if (!cd || cd.total <= 0) return null;
                            return (
                                <div key={session.id} className="flex items-center gap-1.5">
                                    <span className="text-xs">{session.flag}</span>
                                    <span className={`font-mono text-[10px] font-bold ${cd.total <= 5 * 60 * 1000 ? 'text-red-400' : 'text-slate-400'}`}>
                                        {formatCountdown(cd)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Toggle sonido */}
                    <button
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`p-1.5 rounded-lg transition-all ml-2 ${soundEnabled ? 'text-brand-accent bg-brand-accent/10' : 'text-slate-600 bg-slate-800'}`}
                        title={soundEnabled ? 'Sonido activado' : 'Sonido desactivado'}
                    >
                        {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>

            {/* ═══ Relojes digitales ═══ */}
            <div className="glass mx-2 lg:mx-4 mt-1 rounded-xl px-3 py-2 flex items-center justify-center gap-6">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-500 uppercase font-bold">Local</span>
                    <span className="font-mono text-sm font-black text-brand-accent">{localTime}</span>
                </div>
                <div className="w-px h-4 bg-slate-700"></div>
                <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-500 uppercase font-bold">MT5</span>
                    <span className="font-mono text-sm font-black text-amber-400">{serverTime}</span>
                </div>
            </div>

            {/* ═══ Popup de Pre-Apertura (T-5min) ═══ */}
            {popupSession && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80] flex items-center justify-center p-4" onClick={() => setPopupSession(null)}>
                    <div
                        className={`bg-[#1e293b] border ${popupSession.borderColor} rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header con gradiente */}
                        <div className={`bg-gradient-to-r ${popupSession.color} p-5`}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-white/80 text-xs font-bold uppercase tracking-widest mb-1">⏰ Apertura Inminente</p>
                                    <h2 className="text-2xl font-black text-white flex items-center gap-2">
                                        <span className="text-3xl">{popupSession.flag}</span>
                                        {popupSession.name}
                                    </h2>
                                </div>
                                <button onClick={() => setPopupSession(null)} className="text-white/60 hover:text-white p-1">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Contador grande */}
                            {popupCountdown && (
                                <div className="mt-4 text-center">
                                    <p className="text-white/60 text-[10px] uppercase font-bold tracking-widest mb-1">Tiempo Restante</p>
                                    <div className="text-5xl font-black text-white font-mono tracking-wider">
                                        {formatCountdown(popupCountdown)}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Activos */}
                        <div className="p-5">
                            <p className={`text-[10px] uppercase font-bold tracking-widest mb-3 ${popupSession.textColor}`}>
                                Activos Principales de la Sesión
                            </p>
                            <div className="space-y-2">
                                {popupAssets.length > 0 ? popupAssets.map(asset => (
                                    <div key={asset.symbol} className="flex items-center justify-between bg-black/20 border border-slate-700 rounded-xl px-4 py-3">
                                        <span className="text-sm font-black text-white">{asset.symbol}</span>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="text-[9px] text-slate-500 uppercase">Bid</p>
                                                <p className="text-sm font-mono font-bold text-emerald-400">
                                                    {asset.bid > 0 ? asset.bid.toFixed(asset.bid > 100 ? 2 : 5) : '---'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] text-slate-500 uppercase">Ask</p>
                                                <p className="text-sm font-mono font-bold text-rose-400">
                                                    {asset.ask > 0 ? asset.ask.toFixed(asset.ask > 100 ? 2 : 5) : '---'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] text-slate-500 uppercase">Spread</p>
                                                <p className="text-xs font-mono text-slate-400">
                                                    {asset.spread ? asset.spread.toFixed(asset.spread > 1 ? 1 : 4) : '---'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    popupSession.assets.map(sym => (
                                        <div key={sym} className="flex items-center justify-between bg-black/20 border border-slate-700 rounded-xl px-4 py-3 animate-pulse">
                                            <span className="text-sm font-black text-white">{sym}</span>
                                            <span className="text-xs text-slate-500">Cargando...</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-5 pb-4">
                            <button
                                onClick={() => setPopupSession(null)}
                                className={`w-full py-2.5 rounded-xl bg-gradient-to-r ${popupSession.color} text-white font-bold text-sm active:scale-95 transition-all`}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default MarketSessionTimer;
